/**
 * The pure rules of the zip branch: no `node:fs`, no `yauzl` import — a plain list of entry
 * descriptions in, a plan or a refusal out. `service/src/handouts/unpack.ts` is the only
 * caller and is what turns a refusal into bytes written or not written. See
 * docs/data-directory.md for the reasoning behind each rule.
 */

export interface ZipEntryInfo {
  /** `entry.fileName`, as yauzl decoded it. */
  name: string;
  uncompressedSize: number;
  compressedSize: number;
  /** `name` ends with `/`. */
  isDirectory: boolean;
  /** `(externalFileAttributes >>> 16) & 0xffff`. */
  unixMode: number;
  isEncrypted: boolean;
  canDecodeFileData: boolean;
  compressionMethod: number;
}

export interface UnpackLimits {
  maxUnpackedBytes: number;
  maxEntries: number;
  maxCompressionRatio: number;
}

export interface PlannedEntry {
  sourceIndex: number;
  targetPath: string;
}

export type ZipPlan =
  | { ok: true; entries: PlannedEntry[]; declaredBytes: number }
  | { ok: false; kind: 'invalid' | 'over-limit'; message: string };

/** `S_IFLNK` from `externalFileAttributes`'s high 16 bits — a symlink whatever created it. */
const SYMLINK_MODE = 0o120000;
const MODE_TYPE_MASK = 0o170000;

/** Below this, a high ratio is harmless: a repetitive small file legitimately reaches it. */
const RATIO_FLOOR_BYTES = 1_048_576;

const MAX_PATH_LENGTH = 512;
const MAX_SEGMENT_BYTES = 255;

const MESSAGE_MAX_LENGTH = 120;

/** The offending entry is attacker-controlled text; truncated so a message stays a message. */
function truncate(name: string): string {
  return name.length > MESSAGE_MAX_LENGTH ? `${name.slice(0, MESSAGE_MAX_LENGTH)}…` : name;
}

function invalid(message: string): { ok: false; kind: 'invalid'; message: string } {
  return { ok: false, kind: 'invalid', message };
}

function overLimit(message: string): { ok: false; kind: 'over-limit'; message: string } {
  return { ok: false, kind: 'over-limit', message };
}

export type NormalizedPath =
  { ok: true; path: string; segments: string[] } | { ok: false; message: string };

/**
 * Splits and validates one entry name into path segments, refusing everything that could
 * escape the target directory or that no producer should legitimately emit. A trailing `/`
 * (a directory entry) is stripped before splitting — `isDirectory` on {@link ZipEntryInfo}
 * is the authoritative signal for that, this function only cares about the path itself.
 */
export function normalizeEntryPath(name: string): NormalizedPath {
  if (name.length === 0 || name.includes('\0')) {
    return { ok: false, message: 'the zip contains an entry with an unusable name' };
  }
  // Absolute: a leading `/`, or a leading Windows drive letter (`C:`). strictFileNames
  // stays off, so yauzl has already turned a Windows-shaped `..\..\x` into `../../x` —
  // caught below by the `..` rule instead of surfacing as a filename containing `\`.
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) {
    return {
      ok: false,
      message: `the zip contains an entry with an absolute path: "${truncate(name)}"`,
    };
  }

  const body = name.endsWith('/') ? name.slice(0, -1) : name;
  const segments: string[] = [];
  for (const part of body.split('/')) {
    if (part === '.') continue; // dropped: cannot escape, and some producers emit it
    if (part === '') {
      return {
        ok: false,
        message: `the zip contains an entry with a malformed path: "${truncate(name)}"`,
      };
    }
    if (part === '..') {
      return {
        ok: false,
        message: `the zip contains an entry that escapes the target directory: "${truncate(name)}"`,
      };
    }
    segments.push(part);
  }
  if (segments.length === 0) {
    // e.g. "." or "./" alone — nothing is left once the sole segment is dropped.
    return {
      ok: false,
      message: `the zip contains an entry with a malformed path: "${truncate(name)}"`,
    };
  }

  return { ok: true, path: segments.join('/'), segments };
}

interface Candidate {
  sourceIndex: number;
  name: string;
  path: string;
  segments: string[];
  isDirectory: boolean;
  uncompressedSize: number;
  compressedSize: number;
}

/** `__MACOSX/`, `.DS_Store`, `Thumbs.db` — matched case-insensitively — and nothing else. */
function isJunk(candidate: Candidate): boolean {
  const firstSegment = candidate.segments[0] ?? '';
  const lastSegment = candidate.segments[candidate.segments.length - 1] ?? '';
  if (firstSegment.toLowerCase() === '__macosx') return true;
  const lowerBasename = lastSegment.toLowerCase();
  return lowerBasename === '.ds_store' || lowerBasename === 'thumbs.db';
}

export function planZipEntries(infos: ZipEntryInfo[], limits: UnpackLimits): ZipPlan {
  // Every rule below runs on every entry, junk included: an entry named
  // "__MACOSX/../../etc/passwd" must refuse the archive, not be quietly dropped by a filter
  // that runs first — see the assumption this ordering is written against.
  const candidates: Candidate[] = [];
  for (let index = 0; index < infos.length; index += 1) {
    const info = infos[index];
    if (info === undefined) continue;

    const normalized = normalizeEntryPath(info.name);
    if (!normalized.ok) return invalid(normalized.message);

    const mode = info.unixMode & MODE_TYPE_MASK;
    if (mode === SYMLINK_MODE) {
      return invalid(`the zip contains a symbolic link: "${truncate(info.name)}"`);
    }
    if (info.isEncrypted) {
      return invalid(`the zip contains an encrypted entry: "${truncate(info.name)}"`);
    }
    if (!info.canDecodeFileData) {
      return invalid(`the zip uses an unsupported compression method for "${truncate(info.name)}"`);
    }
    if (normalized.path.length > MAX_PATH_LENGTH) {
      return invalid(`the zip contains an entry whose path is too long: "${truncate(info.name)}"`);
    }
    for (const segment of normalized.segments) {
      if (Buffer.byteLength(segment, 'utf8') > MAX_SEGMENT_BYTES) {
        return invalid(
          `the zip contains an entry whose path is too long: "${truncate(info.name)}"`,
        );
      }
    }

    candidates.push({
      sourceIndex: index,
      name: info.name,
      path: normalized.path,
      segments: normalized.segments,
      isDirectory: info.isDirectory,
      uncompressedSize: info.uncompressedSize,
      compressedSize: info.compressedSize,
    });
  }

  // Filter: dropped means never written, never counted, invisible to the structure rule.
  const kept = candidates.filter((candidate) => !isJunk(candidate));

  const fileEntries = kept.filter((candidate) => !candidate.isDirectory);

  if (fileEntries.length > limits.maxEntries) {
    return overLimit(`the zip contains more than ${limits.maxEntries} entries`);
  }

  const declaredBytes = fileEntries.reduce((sum, entry) => sum + entry.uncompressedSize, 0);
  if (declaredBytes > limits.maxUnpackedBytes) {
    return overLimit(`the zip unpacks to more than ${limits.maxUnpackedBytes} bytes`);
  }

  for (const entry of fileEntries) {
    if (entry.uncompressedSize <= RATIO_FLOOR_BYTES) continue;
    if (entry.uncompressedSize > entry.compressedSize * limits.maxCompressionRatio) {
      return overLimit(
        `"${truncate(entry.name)}" unpacks to more than ${limits.maxCompressionRatio} times its packed size`,
      );
    }
  }

  // The structure rule: find the entry file. See docs/data-directory.md for the reasoning
  // — this is a search, never a count of what sits at the top level.
  const rootIndex = fileEntries.find((entry) => entry.path === 'index.html');

  let effective: Candidate[] | undefined;
  if (rootIndex !== undefined) {
    effective = kept;
  } else {
    const firstSegments = new Set(kept.map((entry) => entry.segments[0]));
    if (firstSegments.size === 1) {
      const [topSegment] = firstSegments;
      const folder = topSegment ?? '';
      const folderIsAFile = fileEntries.some((entry) => entry.path === folder);
      const folderHasIndex = fileEntries.some((entry) => entry.path === `${folder}/index.html`);
      if (!folderIsAFile && folderHasIndex) {
        effective = kept.map((entry) => ({
          ...entry,
          segments: entry.segments.slice(1),
          path: entry.segments.slice(1).join('/'),
        }));
      }
    }
  }

  if (effective === undefined) {
    // Rule 16: which refusal message to use. A publisher whose archive plainly has a start
    // page must be told that index.htm is the reason, not read a generic "no index.html".
    const rootIndexHtm = fileEntries.find((entry) => entry.path === 'index.htm');
    const firstSegments = new Set(kept.map((entry) => entry.segments[0]));
    const singleFolder = firstSegments.size === 1 ? [...firstSegments][0] : undefined;
    const folderIndexHtm =
      singleFolder !== undefined
        ? fileEntries.find((entry) => entry.path === `${singleFolder}/index.htm`)
        : undefined;
    const htmEntry = rootIndexHtm ?? folderIndexHtm;
    if (htmEntry !== undefined) {
      return invalid(
        `the zip's entry file must be named index.html, not index.htm: "${truncate(htmEntry.name)}"`,
      );
    }
    return invalid(
      'the zip contains no index.html — neither in its root nor inside a single top-level folder',
    );
  }

  const planned: PlannedEntry[] = effective
    .filter((entry) => !entry.isDirectory)
    .map((entry) => ({ sourceIndex: entry.sourceIndex, targetPath: entry.path }));

  const seen = new Map<string, number>();
  for (const entry of planned) {
    if (seen.has(entry.targetPath)) {
      return invalid(
        `the zip contains two entries for the same path: "${truncate(entry.targetPath)}"`,
      );
    }
    seen.set(entry.targetPath, entry.sourceIndex);
  }

  const plannedPaths = new Set(planned.map((entry) => entry.targetPath));
  for (const entry of planned) {
    const parts = entry.targetPath.split('/');
    let prefix = '';
    for (let i = 0; i < parts.length - 1; i += 1) {
      prefix = prefix === '' ? (parts[i] ?? '') : `${prefix}/${parts[i] ?? ''}`;
      if (plannedPaths.has(prefix)) {
        return invalid(`the zip uses "${truncate(prefix)}" as both a file and a directory`);
      }
    }
  }

  return { ok: true, entries: planned, declaredBytes };
}
