/**
 * The layout on disk: `<dataDir>/handouts/<slug>/`. See docs/data-directory.md.
 */
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { Config } from '../config';
import { HandoutDirectoryExistsError } from './errors';

/**
 * The intermediate level between the data directory and a handout. Delivery looks only
 * under this directory, so nothing else that later lands directly under the data
 * directory — `staging/`, below, is exactly that — can ever become a reachable address.
 */
export const HANDOUTS_SUBDIR = 'handouts';

/**
 * Where an upload is written to while it is being received, before it has a slug and
 * before it is proven complete. Sits beside `handouts/`, directly under the data
 * directory, so it can never become a reachable address, and inside the same filesystem
 * as `handouts/` so the swap into place is an atomic `rename`, never a copy.
 */
export const STAGING_SUBDIR = 'staging';

export function handoutsDir(config: Config): string {
  return path.join(config.dataDir, HANDOUTS_SUBDIR);
}

export function stagingDir(config: Config): string {
  return path.join(config.dataDir, STAGING_SUBDIR);
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

/** Same idiom as {@link ensureHandoutsDir}, for the staging directory. */
export function ensureStagingDir(config: Config): string {
  const dir = stagingDir(config);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * A fresh, empty directory to stage one upload into, created inside the staging
 * directory — not `os.tmpdir()` — so that {@link moveIntoPlace}'s `rename` stays within
 * one filesystem and is therefore atomic.
 */
export function createStagingDir(config: Config): string {
  return mkdtempSync(path.join(stagingDir(config), 'upload-'));
}

/**
 * Removes a staging directory and everything in it. Never throws — this runs on the
 * failure path, where the caller is already handling one error and cannot let a cleanup
 * failure replace it.
 */
export function discardStagingDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

/**
 * The atomic swap: renames `stagedDir` to `<handoutsDir>/<slug>`. Refuses an existing
 * target with {@link HandoutDirectoryExistsError} rather than overwriting it — this
 * endpoint is create-only, and replacing a handout under its existing address is its own
 * story.
 */
export function moveIntoPlace(handoutsDirPath: string, slug: string, stagedDir: string): void {
  const target = path.join(handoutsDirPath, slug);
  if (existsSync(target)) {
    throw new HandoutDirectoryExistsError(slug);
  }
  renameSync(stagedDir, target);
}
