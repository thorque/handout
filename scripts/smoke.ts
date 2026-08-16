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

const passed = results.filter((result) => result.ok).length;
console.log(`smoke: ${passed}/${results.length} checks passed`);
if (passed !== results.length) process.exit(1);
