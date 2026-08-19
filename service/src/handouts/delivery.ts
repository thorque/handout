/**
 * Resolution and containment for a handout file. No byte-sending here — that is
 * `@fastify/static`'s job, delegated to it once this has proven the path is safe to send.
 * See docs/data-directory.md for the reasoning behind each rule.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

export interface ResolvedHandoutFile {
  realPath: string;
  realHandoutDir: string;
}

/** True when `target` is `dir` itself or a descendant of it, by plain string comparison. */
function isContainedIn(target: string, dir: string): boolean {
  return target === dir || target.startsWith(dir + path.sep);
}

async function realpathOrUndefined(target: string): Promise<string | undefined> {
  try {
    return await fs.realpath(target);
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error.code === 'ENOENT' || error.code === 'ENOTDIR')
    ) {
      return undefined;
    }
    throw error;
  }
}

async function resolveWithinHandout(
  handoutDir: string,
  realHandoutDir: string,
  parts: string[],
  allowIndexFallback: boolean,
): Promise<ResolvedHandoutFile | undefined> {
  // Rejects '.', '..' and every dotfile in one rule — a NUL byte would otherwise reach
  // fs.realpath and throw an unhandled error instead of a clean not-found.
  for (const part of parts) {
    if (part.includes('\0') || part.startsWith('.')) return undefined;
  }

  const target = path.join(handoutDir, ...parts);
  if (!isContainedIn(target, handoutDir)) return undefined;

  const realPath = await realpathOrUndefined(target);
  if (realPath === undefined) return undefined;

  // Catches a hand-placed symlink out of the handout — to /etc, or to a sibling handout's
  // directory. String containment above does not see through a symlink.
  if (!isContainedIn(realPath, realHandoutDir)) return undefined;

  const stats = await fs.stat(realPath);
  if (stats.isDirectory()) {
    if (!allowIndexFallback) return undefined; // no recursion into a nested index.html
    return resolveWithinHandout(handoutDir, realHandoutDir, [...parts, 'index.html'], false);
  }
  if (!stats.isFile()) return undefined; // fifo, socket, device — never served

  return { realPath, realHandoutDir };
}

/**
 * Resolves `rest` inside handout `slug` under `handoutsDir`, or `undefined` when it
 * cannot be served — a missing handout directory, a missing file, a rejected part, or an
 * escape past the handout's own directory.
 */
export async function resolveHandoutFile(
  handoutsDir: string,
  slug: string,
  rest: string[],
): Promise<ResolvedHandoutFile | undefined> {
  const handoutDir = path.join(handoutsDir, slug);
  const realHandoutDir = await realpathOrUndefined(handoutDir);
  if (realHandoutDir === undefined) return undefined;

  return resolveWithinHandout(handoutDir, realHandoutDir, rest, true);
}
