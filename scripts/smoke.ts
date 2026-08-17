/**
 * End-to-end smoke check against the two running dev servers.
 *
 * It assumes both are already up (`monoceros-ctl start handout-app`) and only observes
 * them over the network — nothing here starts, stops or imports application code.
 */
import http from 'node:http';
import os from 'node:os';

const SERVICE_ORIGIN = 'http://127.0.0.1:3000';
const WEB_ORIGIN = 'http://127.0.0.1:5173';

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
function statusWithHost(port: number, path: string, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: '127.0.0.1', port, path, method: 'GET', headers: { Host: host } },
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

await check('service-404', async () => {
  const response = await fetch(`${SERVICE_ORIGIN}/nope`);
  assert(response.status === 404, `expected 404, got ${response.status}`);
  assert(
    contentType(response).includes('application/json'),
    `expected JSON, got "${contentType(response)}"`,
  );
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
    assert(!markup.includes(brandFile), `the page references ${brandFile} instead of inlining it`);
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

const passed = results.filter((result) => result.ok).length;
console.log(`smoke: ${passed}/${results.length} checks passed`);
if (passed !== results.length) process.exit(1);
