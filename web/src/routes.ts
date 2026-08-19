export type Route = 'app' | 'design-system';

const DESIGN_SYSTEM_PATH = '/app/design-system';

/**
 * The whole routing this story needs. No router library: the real routing arrives with
 * the story that has routes to show.
 *
 * The path is matched as a whole segment, the same rule docs/url-namespace.md sets for
 * the application's reserved segments — `/app/design-systemx` is not the sample page.
 */
export function resolveRoute(pathname: string): Route {
  const normalised = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return normalised === DESIGN_SYSTEM_PATH ? 'design-system' : 'app';
}
