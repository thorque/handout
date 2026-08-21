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
import { openPromise, type Entry, type ZipFile } from 'yauzl';
import { planZipEntries, type UnpackLimits, type ZipEntryInfo } from './zip-entries';

export interface UnpackRequest {
  zipPath: string;
  targetDir: string;
  limits: UnpackLimits;
}

export type UnpackResult =
  | { ok: true; fileCount: number; bytesWritten: number }
  | { ok: false; kind: 'invalid' | 'over-limit'; message: string; cause?: unknown };

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

function toEntryInfo(entry: Entry): ZipEntryInfo {
  return {
    name: entry.fileName,
    uncompressedSize: entry.uncompressedSize,
    compressedSize: entry.compressedSize,
    isDirectory: entry.fileName.endsWith('/'),
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
      // under-declared entry. decodeStrings on, so entry.fileName is already a string.
      zipfile = await openPromise(zipPath, {
        autoClose: false,
        validateEntrySizes: true,
        decodeStrings: true,
      });
    } catch (error) {
      return invalid('the file could not be read as a zip archive', error);
    }

    const infos: ZipEntryInfo[] = [];
    const entries: Entry[] = [];
    try {
      for await (const entry of zipfile.eachEntry()) {
        infos.push(toEntryInfo(entry));
        entries.push(entry);
        // Bounds pass 1's own memory. Not zipfile.entryCount: that is unread central
        // directory metadata and counts junk along with everything else, same as this
        // loop does — the point here is trusting what was actually read, not the
        // metadata's claim about it.
        if (infos.length > limits.maxEntries) {
          return overLimit(`the zip contains more than ${limits.maxEntries} entries`);
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
      // Umsetzungshinweis 2, taken literally a second time: this stays true even if
      // ./zip-entries is ever changed to plan something it should not.
      if (!isContainedIn(targetPath, resolvedTargetDir)) {
        return invalid(
          `the zip contains an entry that escapes the target directory: "${planned.targetPath}"`,
        );
      }

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
        // No mode is ever taken from the archive: the umask decides, never the entry.
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
