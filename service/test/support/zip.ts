/**
 * A hand-built zip writer for the malicious fixtures the unpacking tests need — a
 * well-behaved writer such as `yazl` validates every name it is given (no absolute path,
 * no `..` segment), which is exactly why a real archive with such an entry cannot come
 * from one. Same spirit as `./multipart.ts`: a small, test-only builder rather than an
 * extra dependency.
 */
import zlib from 'node:zlib';

export interface ZipEntrySpec {
  /** Written verbatim into the archive — no validation, that is the whole point. */
  name: string;
  /** Omitted for a directory entry. */
  content?: Buffer | string;
  /** Store as method 8 (deflate) instead of 0 (stored). */
  deflate?: boolean;
  /** Goes into `externalFileAttributes`' high 16 bits. */
  unixMode?: number;
  /** Written into the size fields instead of the real content length — a lying archive. */
  declaredUncompressedSize?: number;
  /** Sets general purpose bit 0. */
  encrypted?: boolean;
  /** Overrides the compression method field, independent of `deflate`. */
  compressionMethod?: number;
}

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

/** UNIX, so `unixMode` is meaningful — see `versionMadeBy`'s creator byte. */
const VERSION_MADE_BY_UNIX = 3 << 8;
const VERSION_NEEDED_TO_EXTRACT = 20;

function u16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
}

function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value, 0);
  return buffer;
}

/** Builds a well-formed (or deliberately lying) zip archive from a list of entry specs. */
export function buildZip(entries: ZipEntrySpec[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const spec of entries) {
    const nameBuffer = Buffer.from(spec.name, 'utf8');
    const rawContent =
      spec.content === undefined
        ? Buffer.alloc(0)
        : Buffer.isBuffer(spec.content)
          ? spec.content
          : Buffer.from(spec.content, 'utf8');
    const method = spec.compressionMethod ?? (spec.deflate === true ? 8 : 0);
    const storedContent = spec.deflate === true ? zlib.deflateRawSync(rawContent) : rawContent;
    const crc = zlib.crc32(rawContent);
    const uncompressedSize = spec.declaredUncompressedSize ?? rawContent.length;
    const compressedSize = storedContent.length;
    const generalPurposeFlag = spec.encrypted === true ? 0x0001 : 0x0000;
    const externalFileAttributes = ((spec.unixMode ?? 0o100644) << 16) >>> 0;
    const localOffset = offset;

    // No data descriptor, no zip64: sizes and CRC go straight into the local header, which
    // is what lets pass 1 (the central directory) and a from-scratch reader agree.
    const localHeader = Buffer.concat([
      u32(LOCAL_FILE_HEADER_SIGNATURE),
      u16(VERSION_NEEDED_TO_EXTRACT),
      u16(generalPurposeFlag),
      u16(method),
      u16(0), // last mod file time
      u16(0), // last mod file date
      u32(crc),
      u32(compressedSize),
      u32(uncompressedSize),
      u16(nameBuffer.length),
      u16(0), // extra field length
      nameBuffer,
    ]);
    localParts.push(localHeader, storedContent);
    offset += localHeader.length + storedContent.length;

    const centralHeader = Buffer.concat([
      u32(CENTRAL_DIRECTORY_HEADER_SIGNATURE),
      u16(VERSION_MADE_BY_UNIX),
      u16(VERSION_NEEDED_TO_EXTRACT),
      u16(generalPurposeFlag),
      u16(method),
      u16(0), // last mod file time
      u16(0), // last mod file date
      u32(crc),
      u32(compressedSize),
      u32(uncompressedSize),
      u16(nameBuffer.length),
      u16(0), // extra field length
      u16(0), // file comment length
      u16(0), // disk number start
      u16(0), // internal file attributes
      u32(externalFileAttributes),
      u32(localOffset),
      nameBuffer,
    ]);
    centralParts.push(centralHeader);
  }

  const localData = Buffer.concat(localParts);
  const centralData = Buffer.concat(centralParts);
  const endOfCentralDirectory = Buffer.concat([
    u32(END_OF_CENTRAL_DIRECTORY_SIGNATURE),
    u16(0), // number of this disk
    u16(0), // disk where central directory starts
    u16(entries.length), // central directory records on this disk
    u16(entries.length), // total central directory records
    u32(centralData.length),
    u32(localData.length), // offset of start of central directory
    u16(0), // comment length
  ]);

  return Buffer.concat([localData, centralData, endOfCentralDirectory]);
}
