/**
 * The I/O side of the zip branch: yauzl, the staging directory, the writing. Every rule
 * that decides *whether* an archive may be unpacked lives in `./zip-entries`, which knows
 * no fs and no yauzl — this module only knows how to read one with yauzl and how to turn a
 * plan into bytes on disk. See docs/data-directory.md for the reasoning.
 */
import { createWriteStream, mkdirSync } from 'node:fs';
import path from 'node:path';
import { PassThrough, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { getFileNameLowLevel, openPromise, type Entry, type ZipFile } from 'yauzl';
import {
  isCountedFileEntry,
  planZipEntries,
  type UnpackLimits,
  type ZipEntryInfo,
} from './zip-entries';

export interface UnpackRequest {
  zipPath: string;
  targetDir: string;
  limits: UnpackLimits;
}

export type UnpackResult =
  | { ok: true; fileCount: number; bytesWritten: number }
  | { ok: false; kind: 'invalid' | 'over-limit'; message: string; cause?: unknown };

/**
 * A legitimate archive carries roughly two raw central-directory entries per real file (a
 * `__MACOSX/._*` twin) plus a handful of directory entries. This multiplies the
 * configured file-count limit generously beyond that, so reading the central directory
 * still aborts on its own — before an archive built almost entirely of junk or directory
 * entries can grow the read (and its heap) without bound, even though such entries never
 * move the kept-file-entry count the refusal below is checked against.
 */
const RAW_ENTRY_ABORT_MULTIPLIER = 20;

/**
 * Left at yauzl's own default (`false`): it turns a Windows-shaped `..\..\x` into
 * `../../x` before any name is looked at, which is what lets normalizeEntryPath's own
 * `..` rule catch it, instead of storing a filename that merely contains a backslash.
 * Named and shared with `toEntryInfo` below so the two can never drift apart on this.
 */
const STRICT_FILE_NAMES = false;

function invalid(message: string, cause?: unknown): UnpackResult {
  return cause === undefined
    ? { ok: false, kind: 'invalid', message }
    : { ok: false, kind: 'invalid', message, cause };
}

function overLimit(message: string): UnpackResult {
  return { ok: false, kind: 'over-limit', message };
}

/**
 * Node's fs and other system errors carry an all-uppercase `.code` (`ENOSPC`, `EACCES`,
 * `EMFILE`, `ENAMETOOLONG`); yauzl's own errors do not. This is what tells "the archive is
 * bad" (a refusal) apart from "our own write failed" (the service's fault, rethrown).
 */
function isSystemError(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string' &&
    /^[A-Z]+$/.test((error as { code: string }).code)
  );
}

/**
 * `decodeStrings: false` below means yauzl never calls its own name decoder on this
 * entry, so this reproduces exactly what it would have done itself — same function, same
 * `STRICT_FILE_NAMES` — minus the `validateFileName` call bundled into that path. See the
 * long comment at the `openPromise` call for why that call has to be skipped.
 */
function toEntryInfo(entry: Entry): ZipEntryInfo {
  const name = getFileNameLowLevel(
    entry.generalPurposeBitFlag,
    entry.fileNameRaw,
    entry.extraFields,
    STRICT_FILE_NAMES,
  );
  return {
    name,
    uncompressedSize: entry.uncompressedSize,
    compressedSize: entry.compressedSize,
    isDirectory: name.endsWith('/'),
    unixMode: (entry.externalFileAttributes >>> 16) & 0xffff,
    isEncrypted: entry.isEncrypted(),
    canDecodeFileData: entry.canDecodeFileData(),
    compressionMethod: entry.compressionMethod,
  };
}

/** True when `target` is `dir` itself or a descendant of it, by plain string comparison. */
function isContainedIn(target: string, dir: string): boolean {
  return target === dir || target.startsWith(dir + path.sep);
}

/**
 * Unpacks `zipPath` into `targetDir`, or refuses whole. Never writes a byte before the
 * whole central directory has been read and the plan decided — see docs/data-directory.md,
 * "The two passes, and why the pre-flight has to be first".
 */
export async function unpackZip(request: UnpackRequest): Promise<UnpackResult> {
  const { zipPath, targetDir, limits } = request;
  const resolvedTargetDir = path.resolve(targetDir);

  let zipfile: ZipFile | undefined;
  try {
    try {
      // autoClose: false is what lets pass 2 open read streams after eachEntry() has
      // ended; openPromise forces lazyEntries: true on its own. validateEntrySizes stays
      // on, which is what stage 2 in docs/data-directory.md relies on for an
      // under-declared entry.
      //
      // decodeStrings: false, deliberately not the default. With it on, yauzl decodes
      // entry.fileName itself and immediately runs its own validateFileName on it,
      // raising a plain Error before checkEntry (./zip-entries.ts) ever sees the name —
      // so an escaping ("..") or absolute path answered a flat "the zip could not be
      // read" over HTTP instead of the precise, entry-naming refusal checkEntry already
      // writes. checkEntry became unreachable for exactly the paths it exists to name.
      // Turning decodeStrings off skips that call entirely; toEntryInfo decodes the name
      // itself with yauzl's own getFileNameLowLevel (the same function yauzl would have
      // called), so every entry — malformed or not — reaches checkEntry, and only it
      // decides. Rejected alternative: pattern-matching yauzl's own error text back into
      // our message — cheaper, but tied to a dependency's wording that can change under
      // us on any update, for the exact kind of two-places-disagree bug this story has
      // already paid for twice.
      zipfile = await openPromise(zipPath, {
        autoClose: false,
        validateEntrySizes: true,
        decodeStrings: false,
        strictFileNames: STRICT_FILE_NAMES,
      });
    } catch (error) {
      return invalid('the file could not be read as a zip archive', error);
    }

    const infos: ZipEntryInfo[] = [];
    const entries: Entry[] = [];
    // Two counters, because they answer two different questions and cannot stand in for
    // each other: keptFileEntries is what the refusal below is checked against — the same
    // "would this end up a file entry" decision planZipEntries makes, via
    // isCountedFileEntry, so a macOS-made zip with a __MACOSX/._* twin per real file, or a
    // handful of directory entries, is never refused for a file count nowhere near the
    // limit. The raw count is what bounds *reading* itself: an archive built almost
    // entirely of junk or directory entries never moves keptFileEntries at all, so without
    // its own ceiling the central-directory scan (and its heap) would grow unbounded.
    let keptFileEntries = 0;
    const rawEntryLimit = limits.maxEntries * RAW_ENTRY_ABORT_MULTIPLIER;
    try {
      for await (const entry of zipfile.eachEntry()) {
        const info = toEntryInfo(entry);
        infos.push(info);
        entries.push(entry);

        if (isCountedFileEntry(info)) {
          keptFileEntries += 1;
          if (keptFileEntries > limits.maxEntries) {
            return overLimit(`the zip contains more than ${limits.maxEntries} entries`);
          }
        }

        if (infos.length > rawEntryLimit) {
          return overLimit(
            `the zip's central directory lists far more entries than its file-count ` +
              `limit of ${limits.maxEntries} allows`,
          );
        }
      }
    } catch (error) {
      return invalid('the zip could not be read', error);
    }

    const plan = planZipEntries(infos, limits);
    if (!plan.ok) return plan;

    let fileCount = 0;
    let bytesWritten = 0;
    for (const planned of plan.entries) {
      const entry = entries[planned.sourceIndex];
      if (entry === undefined) continue; // sourceIndex always indexes entries built above

      const targetPath = path.resolve(resolvedTargetDir, planned.targetPath);
      // A second, defensive containment check: this stays true even if ./zip-entries is
      // ever changed to plan a path it should not.
      if (!isContainedIn(targetPath, resolvedTargetDir)) {
        return invalid(
          `the zip contains an entry that escapes the target directory: "${planned.targetPath}"`,
        );
      }

      // No mode is ever taken from the archive: the umask decides, never the entry.
      mkdirSync(path.dirname(targetPath), { recursive: true });

      let readStream: Readable;
      try {
        readStream = await zipfile.openReadStreamPromise(entry);
      } catch (error) {
        return invalid('the zip could not be read', error);
      }

      let entryBytes = 0;
      const counter = new PassThrough();
      counter.on('data', (chunk: Buffer) => {
        entryBytes += chunk.length;
      });

      try {
        await pipeline(readStream, counter, createWriteStream(targetPath));
      } catch (error) {
        // Anything past this point that is not a system error is the archive
        // misbehaving mid-stream — a bad CRC, a decompression failure, the size
        // mismatch validateEntrySizes raises for an under-declared entry — and that is
        // a refusal, not a bug in the service.
        if (isSystemError(error)) throw error; // our own fault, becomes a 500
        return invalid('the zip could not be read', error);
      }

      bytesWritten += entryBytes;
      fileCount += 1;
      // Stage 2: catches a central directory that under-declared an entry's size, should
      // validateEntrySizes ever be turned off. Checked after every entry, not the archive
      // as a whole — see docs/data-directory.md, "Two stages of size enforcement".
      if (bytesWritten > limits.maxUnpackedBytes) {
        return overLimit(`the zip unpacks to more than ${limits.maxUnpackedBytes} bytes`);
      }
    }

    return { ok: true, fileCount, bytesWritten };
  } finally {
    zipfile?.close();
  }
}
