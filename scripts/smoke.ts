/**
 * End-to-end smoke check against the two running dev servers and, since HAN-7, against
 * Caddy as well. It assumes the dev servers are already up
 * (`monoceros-ctl start handout-app`); it does not only observe them any more, either — it
 * places a fixture publication in the data directory before the checks run and removes it
 * again afterwards. It still imports no application code.
 */
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const SERVICE_ORIGIN = 'http://127.0.0.1:3000';
const WEB_ORIGIN = 'http://127.0.0.1:5173';

/**
 * Mirrors `readDataDir` in `service/src/config.ts`. Smoke does not read `.env` — so a
 * `HANDOUT_DATA_DIR` set only there makes the fixture checks fail loudly, which is the
 * honest outcome, not a silent skip. (Verified: `.env` sets no `HANDOUT_DATA_DIR`, so both
 * agree on `<repo>/var/data`.)
 */
const DATA_DIR = process.env.HANDOUT_DATA_DIR ?? path.resolve(import.meta.dirname, '../var/data');
const PROXY_ORIGIN = process.env.CADDY_URL ?? 'http://caddy:81';

/** Same alphabet as `service/src/slug.ts` — this script imports no application code. */
const SLUG_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

function randomSlug(): string {
  let slug = '';
  for (let index = 0; index < 8; index += 1) {
    slug += SLUG_ALPHABET[Math.floor(Math.random() * SLUG_ALPHABET.length)];
  }
  return slug;
}

interface CheckResult {
  name: string;
  ok: boolean;
  reason?: string;
}

const results: CheckResult[] = [];

async function check(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
    results.push({ name, ok: true });
    console.log(`ok  ${name}`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, reason });
    console.log(`FAIL ${name}: ${reason}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function contentType(response: Response): string {
  return response.headers.get('content-type') ?? '';
}

/**
 * Status of a request sent with an explicit `Host` header. Not `fetch`: undici treats
 * `Host` as a forbidden header and silently replaces it, which would make the two
 * host-check probes pass against any `allowedHosts` setting.
 */
function statusWithHost(
  port: number,
  path: string,
  host: string,
  targetHost = '127.0.0.1',
): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: targetHost, port, path, method: 'GET', headers: { Host: host } },
      (response) => {
        response.resume();
        response.on('end', () => {
          resolve(response.statusCode ?? 0);
        });
      },
    );
    request.on('error', reject);
    request.end();
  });
}

/**
 * Performs a raw WebSocket handshake against `pathname` on `targetHost`/`port` and
 * resolves with the response's status and headers, then closes the connection right
 * after — this only proves the handshake completes, nothing here speaks vite-hmr's
 * message protocol. Node's `fetch` cannot send an `Upgrade` request, so this goes
 * through `http.request` directly, the same reason `statusWithHost` does.
 */
function websocketUpgrade(
  targetHost: string,
  port: number,
  pathname: string,
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: targetHost,
      port,
      path: pathname,
      method: 'GET',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
        'Sec-WebSocket-Protocol': 'vite-hmr',
      },
    });
    request.on('upgrade', (response, socket) => {
      socket.end();
      resolve({ statusCode: response.statusCode ?? 0, headers: response.headers });
    });
    request.on('response', (response) => {
      // No upgrade happened at all — still resolve, so the check reports a status
      // instead of hanging.
      response.resume();
      resolve({ statusCode: response.statusCode ?? 0, headers: response.headers });
    });
    request.on('error', reject);
    request.end();
  });
}

/** The container's LAN address, as Traefik and `monoceros share` see it. */
function lanIpv4(): string {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }
  throw new Error('no non-internal IPv4 address found on this container');
}

/** Every `src=` / `href=` in a document that points at this origin. */
function localReferences(html: string): string[] {
  const references: string[] = [];
  const pattern = /(?:src|href)\s*=\s*["']([^"']+)["']/g;
  for (const match of html.matchAll(pattern)) {
    const value = match[1];
    if (value !== undefined && (value.startsWith('/') || value.startsWith('./'))) {
      references.push(value);
    }
  }
  return references;
}

/** The `src` of the first `<script type="module">` in a document. */
function moduleScriptSrc(html: string): string | undefined {
  const pattern = /<script\b[^>]*\btype\s*=\s*["']module["'][^>]*>/g;
  for (const tag of html.matchAll(pattern)) {
    const src = /\bsrc\s*=\s*["']([^"']+)["']/.exec(tag[0]);
    if (src?.[1] !== undefined) return src[1];
  }
  return undefined;
}

/** Relative specifiers a module imports, capped so a large bundle cannot stall the run. */
function importedSpecifiers(source: string, cap = 30): string[] {
  const specifiers: string[] = [];
  const pattern = /(?:\bfrom\s*|\bimport\s*)["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    const value = match[1];
    if (value !== undefined && (value.startsWith('/') || value.startsWith('./'))) {
      specifiers.push(value);
      if (specifiers.length === cap) break;
    }
  }
  return specifiers;
}

const lanIp = lanIpv4();
let serviceHealthBody: unknown;
let indexHtml = '';
let entryModule = '';

// One slug used for a real fixture, one that stays unused for the not-found checks.
const fixtureSlug = randomSlug();
const unusedSlug = randomSlug();
const fixtureDir = path.join(DATA_DIR, 'handouts', fixtureSlug);
const fixtureHtml =
  '<!doctype html><html><head><link rel="stylesheet" href="style.css">' +
  '<script src="assets/app.js"></script></head><body>smoke fixture</body></html>';

mkdirSync(path.join(fixtureDir, 'assets'), { recursive: true });
writeFileSync(path.join(fixtureDir, 'index.html'), fixtureHtml);
writeFileSync(path.join(fixtureDir, 'style.css'), 'body { color: teal; }');
writeFileSync(path.join(fixtureDir, 'assets', 'app.js'), 'console.log("smoke fixture")');

try {
  await check('service-health', async () => {
    const response = await fetch(`${SERVICE_ORIGIN}/_handout/api/health`);
    assert(response.status === 200, `expected 200, got ${response.status}`);
    assert(
      contentType(response).includes('application/json'),
      `expected JSON, got "${contentType(response)}"`,
    );
    const body = (await response.json()) as { status?: string };
    assert(body.status === 'ok', `expected status "ok", got ${JSON.stringify(body.status)}`);
    serviceHealthBody = body;
  });

  await check('service-database', async () => {
    // The end-to-end proof that the migrations ran at start: health reports the schema, not
    // merely a socket that answered.
    const response = await fetch(`${SERVICE_ORIGIN}/_handout/api/health`);
    const body = (await response.json()) as { database?: string };
    assert(
      body.database === 'ok',
      `expected database "ok", got ${JSON.stringify(body.database)} — did the migrations run?`,
    );
  });

  await check('service-bind', async () => {
    const response = await fetch(`http://${lanIp}:3000/_handout/api/health`);
    assert(response.status === 200, `expected 200 on ${lanIp}:3000, got ${response.status}`);
  });

  await check('service-publication', async () => {
    const response = await fetch(`${SERVICE_ORIGIN}/${fixtureSlug}/`);
    assert(response.status === 200, `expected 200, got ${response.status}`);
    assert(
      contentType(response).includes('text/html'),
      `expected HTML, got "${contentType(response)}"`,
    );
    const body = await response.text();
    assert(body === fixtureHtml, 'the served body differs from what was written');

    for (const reference of localReferences(body)) {
      const referenced = await fetch(new URL(reference, `${SERVICE_ORIGIN}/${fixtureSlug}/`));
      assert(referenced.status === 200, `${reference} answered ${referenced.status}`);
      const expectedType = reference.endsWith('.css') ? 'text/css' : 'javascript';
      assert(
        contentType(referenced).includes(expectedType),
        `${reference} served as "${contentType(referenced)}", not ${expectedType}`,
      );
    }
  });

  await check('service-publication-index', async () => {
    const response = await fetch(`${SERVICE_ORIGIN}/${fixtureSlug}`);
    assert(response.status === 200, `expected 200, got ${response.status}`);
    const body = await response.text();
    assert(body === fixtureHtml, 'the served body differs from what was written');
  });

  await check('service-404-publication', async () => {
    const response = await fetch(`${SERVICE_ORIGIN}/${unusedSlug}/`);
    assert(response.status === 404, `expected 404, got ${response.status}`);
    assert(
      contentType(response).includes('text/html'),
      `expected HTML, got "${contentType(response)}"`,
    );
    const body = await response.text();
    assert(body.includes('Diese Adresse gibt es nicht'), 'the not-found page has changed');
  });

  await check('service-404-not-an-address', async () => {
    const response = await fetch(`${SERVICE_ORIGIN}/nope`);
    assert(response.status === 404, `expected 404, got ${response.status}`);
    assert(
      contentType(response).includes('text/html'),
      `expected HTML, got "${contentType(response)}" — /nope is publication space`,
    );
  });

  await check('service-404-api', async () => {
    const response = await fetch(`${SERVICE_ORIGIN}/_handout/api/nope`);
    assert(response.status === 404, `expected 404, got ${response.status}`);
    assert(
      contentType(response).includes('application/json'),
      `expected JSON, got "${contentType(response)}" — the API contract must not change`,
    );
  });

  await check('service-404-reserved-lookalike', async () => {
    const response = await fetch(`${SERVICE_ORIGIN}/_handoutx/api/health`);
    assert(response.status === 404, `expected 404, got ${response.status}`);
    assert(
      contentType(response).includes('text/html'),
      `expected HTML, got "${contentType(response)}" — /_handoutx is publication space`,
    );
  });

  await check('service-traversal', async () => {
    const response = await fetch(`${SERVICE_ORIGIN}/${fixtureSlug}/..%2f..%2f..%2fetc%2fpasswd`);
    assert(response.status === 404, `expected 404, got ${response.status}`);
    const body = await response.text();
    assert(!body.includes('root:'), 'the response body leaked /etc/passwd');
  });

  await check('web-index', async () => {
    const response = await fetch(`${WEB_ORIGIN}/`, { redirect: 'follow' });
    assert(response.status === 200, `expected 200, got ${response.status}`);
    assert(
      contentType(response).includes('text/html'),
      `expected HTML, got "${contentType(response)}"`,
    );
    indexHtml = await response.text();
  });

  await check('web-assets', async () => {
    const entry = moduleScriptSrc(indexHtml);
    assert(entry !== undefined, 'no <script type="module"> found in the served page');

    for (const reference of localReferences(indexHtml)) {
      const response = await fetch(new URL(reference, `${WEB_ORIGIN}/`));
      assert(response.status === 200, `${reference} answered ${response.status}`);
      if (reference === entry) {
        assert(
          contentType(response).includes('javascript'),
          `${reference} served as "${contentType(response)}", not JavaScript`,
        );
        entryModule = await response.text();
      }
    }
  });

  await check('web-entry-imports', async () => {
    const specifiers = importedSpecifiers(entryModule);
    assert(specifiers.length > 0, 'the entry module imports nothing under this origin');

    for (const specifier of specifiers) {
      const response = await fetch(new URL(specifier, `${WEB_ORIGIN}/`));
      assert(response.status === 200, `${specifier} answered ${response.status}`);
      assert(
        contentType(response).includes('javascript'),
        `${specifier} served as "${contentType(response)}", not JavaScript`,
      );
    }
  });

  await check('web-api-proxy', async () => {
    const response = await fetch(`${WEB_ORIGIN}/_handout/api/health`);
    assert(response.status === 200, `expected 200, got ${response.status}`);
    assert(
      contentType(response).includes('application/json'),
      `expected JSON, got "${contentType(response)}" — the proxy is missing`,
    );
    const body: unknown = await response.json();
    assert(
      JSON.stringify(body) === JSON.stringify(serviceHealthBody),
      'the proxied body differs from the service body',
    );
  });

  await check('web-host-proxy', async () => {
    const status = await statusWithHost(5173, '/', 'handout-5173.localhost');
    assert(status === 200, `expected 200, got ${status} — allowedHosts blocks the proxy URL`);
  });

  await check('web-host-lan', async () => {
    const status = await statusWithHost(5173, '/', 'handout.local');
    assert(status === 200, `expected 200, got ${status} — allowedHosts blocks the LAN name`);
  });

  await check('web-bind', async () => {
    const response = await fetch(`http://${lanIp}:5173/`);
    assert(response.status === 200, `expected 200 on ${lanIp}:5173, got ${response.status}`);
  });

  let tokensCss = '';

  await check('design-tokens', async () => {
    const response = await fetch(`${WEB_ORIGIN}/_handout/design/tokens.css`);
    assert(response.status === 200, `expected 200, got ${response.status}`);
    // Not the SPA fallback: a dev server answering HTML here would 200 and look fine.
    assert(
      contentType(response).includes('text/css') && !contentType(response).includes('text/html'),
      `expected CSS, got "${contentType(response)}"`,
    );

    tokensCss = await response.text();
    for (const needle of [
      '--ho-accent',
      '--ho-bg',
      'prefers-color-scheme: dark',
      "[data-theme='dark']",
    ]) {
      assert(tokensCss.includes(needle), `the served tokens.css has lost ${needle}`);
    }
  });

  await check('design-fonts', async () => {
    const faces = [...tokensCss.matchAll(/@font-face\s*\{/g)].length;
    assert(faces === 5, `expected 5 @font-face blocks, found ${faces} — a weight went missing`);

    // The design's promise: no request to a third party when a page is opened.
    assert(!tokensCss.includes('fonts.googleapis.com'), 'tokens.css still loads from Google');
    assert(!tokensCss.includes('fonts.gstatic.com'), 'tokens.css still loads from gstatic');

    const urls = [...tokensCss.matchAll(/url\(['"]?([^'")]+\.woff2)['"]?\)/g)].map(
      (match) => match[1] ?? '',
    );
    assert(urls.length === 5, `expected 5 woff2 URLs, found ${urls.length}`);

    for (const url of urls) {
      const response = await fetch(new URL(url, `${WEB_ORIGIN}/`));
      assert(response.status === 200, `${url} answered ${response.status}`);
      // A wrong path is invisible in a screenshot, because the fallback stack hides it —
      // so the type is asserted, never just the status.
      const type = contentType(response);
      assert(
        type.includes('font') || type.includes('woff'),
        `${url} served as "${type}", not a font`,
      );
      const body = await response.arrayBuffer();
      assert(body.byteLength > 0, `${url} served an empty body`);
    }
  });

  await check('design-no-react-page', async () => {
    const response = await fetch(`${WEB_ORIGIN}/_handout/design/no-react.html`);
    assert(response.status === 200, `expected 200, got ${response.status}`);
    assert(
      contentType(response).includes('text/html'),
      `expected HTML, got "${contentType(response)}"`,
    );

    const html = await response.text();
    assert(!/<script\b[^>]*\btype\s*=\s*["']module["']/.test(html), 'the page loads a module');
    // Comments stripped first: the page's own comment says what it is, and the check is
    // about what the page loads, not about what it says about itself.
    const markup = html.replace(/<!--[\s\S]*?-->/g, '');
    assert(!/react/i.test(markup), 'the page mentions React');

    // The mark has to be inline. A referenced SVG is a document of its own: it follows the
    // operating system's prefers-color-scheme and cannot see the page's data-theme, so on a
    // dark system with the page light it stands in its dark colours and vanishes. That was
    // observed in the browser, which is why it is asserted here rather than remembered.
    assert(!/<img\b/i.test(markup), 'the page embeds an <img>, which cannot follow its theme');
    assert(/<svg\b/i.test(markup), 'the page has no inline SVG — the mark is missing');
    for (const brandFile of ['brand/wordmark.svg', 'brand/mark.svg']) {
      assert(
        !markup.includes(brandFile),
        `the page references ${brandFile} instead of inlining it`,
      );
    }

    // Criterion 5 of HAN-26: no application frame on a page for recipients, where nobody is
    // signed in. What this proves is that the recipient-shaped page carries none of the
    // account markup; what it does not prove is HAN-20's real password page, which re-proves
    // it on itself. The page keeps its own plain brand header — a wordmark, no session — and
    // the application header cannot reach it by construction: it is a React component mounted
    // at the application root, and this page loads no module at all, which is asserted above.
    const accountMarkup: [string, string][] = [
      ['aria-haspopup="menu"', 'the profile mark'],
      ['role="menu"', 'the account menu'],
      ['radiogroup', 'the appearance switcher'],
      ['Erscheinungsbild', 'the appearance switcher'],
      ['Abmelden', 'the sign-out'],
    ];
    for (const [needle, what] of accountMarkup) {
      assert(
        !markup.includes(needle),
        `the recipient page carries ${what} (${needle}) — criterion 5 of HAN-26`,
      );
    }

    for (const reference of localReferences(html)) {
      const referenced = await fetch(new URL(reference, `${WEB_ORIGIN}/`));
      assert(referenced.status === 200, `${reference} answered ${referenced.status}`);
      if (reference.endsWith('.css')) {
        assert(
          contentType(referenced).includes('text/css'),
          `${reference} served as "${contentType(referenced)}", not CSS`,
        );
      }
      if (reference.endsWith('theme-init.js')) {
        assert(
          contentType(referenced).includes('javascript'),
          `${reference} served as "${contentType(referenced)}", not JavaScript`,
        );
      }
    }
  });

  await check('design-sample-route', async () => {
    // This only proves Vite's SPA fallback answers the path. What the page *contains* is
    // proven by web/src/pages/DesignSystemPage.test.tsx, not here.
    const response = await fetch(`${WEB_ORIGIN}/_handout/design-system`);
    assert(response.status === 200, `expected 200, got ${response.status}`);
    assert(
      contentType(response).includes('text/html'),
      `expected HTML, got "${contentType(response)}"`,
    );
  });

  /**
   * Turns a fetch or connection failure against the proxy into a message that names the
   * outstanding host step, so a missing bind-mount fails loudly instead of looking like an
   * ordinary assertion failure. No skip, no soft pass.
   */
  async function proxyFetch(url: string | URL, init?: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (error) {
      const cause = error instanceof Error ? error.message : String(error);
      throw new Error(
        `caddy did not answer at ${PROXY_ORIGIN}: ${cause} — has the caddy volume mount been ` +
          'added to the container yml and `monoceros apply handout` been run? See README, ' +
          '"The proxy in front"',
      );
    }
  }

  await check('caddyfile-shape', async () => {
    const caddyfile = readFileSync(path.resolve(import.meta.dirname, '../caddy/Caddyfile'), 'utf8');
    assert(
      caddyfile.includes('trusted_proxies static private_ranges'),
      'the global options block is missing trusted_proxies — monoceros share would break ' +
        'the forwarded scheme',
    );
    assert(
      /^:\{\$CADDY_SITE_PORT:81\} \{/m.test(caddyfile),
      'the site address does not match ^:{$CADDY_SITE_PORT:81} { or carries a domain name — ' +
        'a domain makes Caddy chase a certificate and fail',
    );
    assert(
      /handle \/_handout\/\* \{\s*reverse_proxy \{\$WEB_HOST/.test(caddyfile),
      '/_handout/* is not routed to {$WEB_HOST',
    );
    assert(
      /handle \{\s*reverse_proxy \{\$APP_HOST/.test(caddyfile),
      'the catch-all handle is not routed to {$APP_HOST',
    );
  });

  await check('proxy-publication', async () => {
    const response = await proxyFetch(`${PROXY_ORIGIN}/${fixtureSlug}/`);
    assert(response.status === 200, `expected 200, got ${response.status}`);
    assert(
      contentType(response).includes('text/html'),
      `expected HTML, got "${contentType(response)}"`,
    );
    const body = await response.text();
    assert(body === fixtureHtml, 'the served body differs from what was written');

    for (const reference of localReferences(body)) {
      const referenced = await proxyFetch(new URL(reference, `${PROXY_ORIGIN}/${fixtureSlug}/`));
      assert(referenced.status === 200, `${reference} answered ${referenced.status}`);
      const expectedType = reference.endsWith('.css') ? 'text/css' : 'javascript';
      assert(
        contentType(referenced).includes(expectedType),
        `${reference} served as "${contentType(referenced)}", not ${expectedType}`,
      );
    }
  });

  await check('proxy-404', async () => {
    const response = await proxyFetch(`${PROXY_ORIGIN}/${unusedSlug}/`);
    assert(response.status === 404, `expected 404, got ${response.status}`);
    assert(
      contentType(response).includes('text/html'),
      `expected HTML, got "${contentType(response)}"`,
    );
    const body = await response.text();
    assert(body.includes('Diese Adresse gibt es nicht'), 'the not-found page has changed');
  });

  await check('proxy-api', async () => {
    const response = await proxyFetch(`${PROXY_ORIGIN}/_handout/api/health`);
    assert(response.status === 200, `expected 200, got ${response.status}`);
    assert(
      contentType(response).includes('application/json'),
      `expected JSON, got "${contentType(response)}"`,
    );
    const body: unknown = await response.json();
    assert(
      JSON.stringify(body) === JSON.stringify(serviceHealthBody),
      'the proxied body differs from the service body',
    );
  });

  await check('proxy-app', async () => {
    const response = await proxyFetch(`${PROXY_ORIGIN}/_handout/`);
    assert(response.status === 200, `expected 200, got ${response.status}`);
    assert(
      contentType(response).includes('text/html'),
      `expected HTML, got "${contentType(response)}"`,
    );
    const html = await response.text();
    const entry = moduleScriptSrc(html);
    assert(entry !== undefined, 'no <script type="module"> found in the served page');

    for (const reference of localReferences(html)) {
      const referenced = await proxyFetch(new URL(reference, `${PROXY_ORIGIN}/`));
      assert(referenced.status === 200, `${reference} answered ${referenced.status}`);
      if (reference === entry) {
        assert(
          contentType(referenced).includes('javascript'),
          `${reference} served as "${contentType(referenced)}", not JavaScript`,
        );
        for (const specifier of importedSpecifiers(await referenced.text())) {
          const imported = await proxyFetch(new URL(specifier, `${PROXY_ORIGIN}/`));
          assert(imported.status === 200, `${specifier} answered ${imported.status}`);
          assert(
            contentType(imported).includes('javascript'),
            `${specifier} served as "${contentType(imported)}", not JavaScript`,
          );
        }
      }
    }
  });

  await check('proxy-design-tokens', async () => {
    const response = await proxyFetch(`${PROXY_ORIGIN}/_handout/design/tokens.css`);
    assert(response.status === 200, `expected 200, got ${response.status}`);
    assert(
      contentType(response).includes('text/css') && !contentType(response).includes('text/html'),
      `expected CSS, got "${contentType(response)}"`,
    );
  });

  await check('proxy-hmr', async () => {
    // Measured (HAN-7): with no path configured, the HMR socket sits at "/", which
    // Caddy's catch-all hands to the service — an upgrade there 404s instead of
    // switching protocols. web/vite.config.ts moves it to /_handout/vite-hmr, which the
    // existing `handle /_handout/*` block already carries to Vite. This is the check
    // that would catch that route breaking again, silently, behind a page that still
    // loads.
    const proxyUrl = new URL(PROXY_ORIGIN);
    const port = proxyUrl.port === '' ? 80 : Number(proxyUrl.port);
    let result: { statusCode: number; headers: http.IncomingHttpHeaders };
    try {
      result = await websocketUpgrade(proxyUrl.hostname, port, '/_handout/vite-hmr');
    } catch (error) {
      const cause = error instanceof Error ? error.message : String(error);
      throw new Error(
        `caddy did not answer at ${PROXY_ORIGIN}: ${cause} — has the caddy volume mount been ` +
          'added to the container yml and `monoceros apply handout` been run? See README, ' +
          '"The proxy in front"',
      );
    }
    assert(
      result.statusCode === 101,
      `expected 101 Switching Protocols, got ${result.statusCode} — the HMR socket does ` +
        'not reach Vite through the proxy',
    );
    assert(
      result.headers['sec-websocket-protocol'] === 'vite-hmr',
      'the upgrade response is missing Sec-WebSocket-Protocol: vite-hmr',
    );
  });

  await check('proxy-host', async () => {
    const proxyUrl = new URL(PROXY_ORIGIN);
    const port = proxyUrl.port === '' ? 80 : Number(proxyUrl.port);
    let status: number;
    try {
      status = await statusWithHost(
        port,
        '/_handout/',
        'handout-caddy.localhost',
        proxyUrl.hostname,
      );
    } catch (error) {
      const cause = error instanceof Error ? error.message : String(error);
      throw new Error(
        `caddy did not answer at ${PROXY_ORIGIN}: ${cause} — has the caddy volume mount been ` +
          'added to the container yml and `monoceros apply handout` been run? See README, ' +
          '"The proxy in front"',
      );
    }
    assert(status === 200, `expected 200, got ${status} — the site address may pin a domain`);
  });
} finally {
  rmSync(fixtureDir, { recursive: true, force: true });
}

const passed = results.filter((result) => result.ok).length;
console.log(`smoke: ${passed}/${results.length} checks passed`);
if (passed !== results.length) process.exit(1);
