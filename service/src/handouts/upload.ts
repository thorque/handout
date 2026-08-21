/**
 * The pure rules of the create endpoint: no I/O, no Fastify import, so they are plain unit
 * tests. `service/src/routes/handouts-api.ts` is what wires these into the HTTP layer.
 */

/** The name a single HTML file is stored under — what makes `resolveHandoutFile` find it. */
export const INDEX_FILE = 'index.html';

export const MAX_DISPLAY_NAME_LENGTH = 200;

/**
 * The extension only, case-insensitively — never the declared content type. The client
 * controls `Content-Type`, and a CLI posting with `curl -F` sends
 * `application/octet-stream`, so trusting it would break the very path this interface has
 * to serve. No content sniffing either: "never touch the delivered artifact" and a rule
 * like "must start with `<!doctype`" would reject legitimate HTML.
 */
export function isHtmlFilename(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower.endsWith('.html') || lower.endsWith('.htm');
}

export type DisplayNameResult =
  | { ok: true; displayName: string }
  | { ok: false; reason: string };

/**
 * `filename` without its extension, or the whole string if it carries none. A filename
 * that starts with a dot (`.html`) has no basename at all — `''`, not the whole string —
 * which is what makes such a file, with no explicit name, a refusal rather than a name of
 * `.html`.
 */
function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot === -1) return filename;
  return filename.slice(0, dot);
}

/**
 * The three-way rule: a trimmed non-empty `explicit` longer than
 * {@link MAX_DISPLAY_NAME_LENGTH} is a refusal the caller must see — the caller can fix
 * what it sent. A blank or whitespace-only `explicit` counts as absent, and a name
 * *derived* from the filename is truncated to the limit instead of refused, because a long
 * filename should not cost an upload. A fallback that ends up empty (a file literally named
 * `.html`) is a refusal too — the database's own length check must never be what answers.
 */
export function displayNameFrom(explicit: string | undefined, filename: string): DisplayNameResult {
  const trimmedExplicit = explicit?.trim() ?? '';
  if (trimmedExplicit !== '') {
    if (trimmedExplicit.length > MAX_DISPLAY_NAME_LENGTH) {
      return {
        ok: false,
        reason: `displayName must be at most ${MAX_DISPLAY_NAME_LENGTH} characters`,
      };
    }
    return { ok: true, displayName: trimmedExplicit };
  }

  const derived = stripExtension(filename).trim();
  if (derived === '') {
    return { ok: false, reason: 'could not derive a display name from the filename' };
  }
  return { ok: true, displayName: derived.slice(0, MAX_DISPLAY_NAME_LENGTH) };
}
