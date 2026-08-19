/**
 * The layout on disk: `<dataDir>/handouts/<slug>/`. See docs/data-directory.md.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Config } from '../config';

/**
 * The intermediate level between the data directory and a handout. Delivery looks only
 * under this directory, so nothing else that later lands directly under the data
 * directory (a staging area for unpacking) can ever become a reachable address.
 */
export const HANDOUTS_SUBDIR = 'handouts';

export function handoutsDir(config: Config): string {
  return path.join(config.dataDir, HANDOUTS_SUBDIR);
}

/**
 * Creates the handouts directory if it does not exist yet and returns its path. The
 * service cannot serve without it, so this is called before the delivery route is
 * registered — a missing directory is not an error, only being unable to create one is.
 */
export function ensureHandoutsDir(config: Config): string {
  const dir = handoutsDir(config);
  mkdirSync(dir, { recursive: true });
  return dir;
}
