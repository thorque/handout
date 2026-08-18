/** Everything the application itself owns lives under this path segment. */
export const RESERVED_PREFIX = '/_handout';
export const API_PREFIX = `${RESERVED_PREFIX}/api`;

/**
 * Whether `pathname` belongs to the application itself rather than to publication space.
 * The prefix is matched as a whole path segment, never as a string prefix — `/_handoutx`
 * has to fall through to publication space, see docs/url-namespace.md, rule 2. Built from
 * `RESERVED_PREFIX` rather than a bare `startsWith(RESERVED_PREFIX)`, which would get
 * `/_handoutx` wrong.
 */
export function isReservedPath(pathname: string): boolean {
  return pathname === RESERVED_PREFIX || pathname.startsWith(`${RESERVED_PREFIX}/`);
}
