/**
 * `unpackZip` against real zip bytes, built by `./support/zip` — the malicious fixtures
 * that cannot come from a well-behaved writer. `handouts.repository.test.ts` and
 * `migrations.test.ts` are the precedent for a non-integration suite living in `test/`
 * rather than beside its module: this one needs the fixture builder from `./support/zip`.
 * The pure planning rules have their own unit tests in
 * `src/handouts/zip-entries.test.ts`; this file is what pins that the actual bytes land
 * (or do not) where the plan says they should.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { UnpackLimits } from '../src/handouts/zip-entries';
import { unpackZip } from '../src/handouts/unpack';
import { buildZip, type ZipEntrySpec } from './support/zip';

const LIMITS: UnpackLimits = {
  maxUnpackedBytes: 100_000_000,
  maxEntries: 2000,
  maxCompressionRatio: 200,
};

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** A fresh zip file on disk plus a fresh, empty target directory to unpack into. */
function setUp(entries: ZipEntrySpec[]): { zipPath: string; targetDir: string; root: string } {
  const root = mkdtempSync(path.join(os.tmpdir(), 'handout-unpack-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const zipPath = path.join(root, 'upload.zip');
  writeFileSync(zipPath, buildZip(entries));
  const targetDir = path.join(root, 'content');
  return { zipPath, targetDir, root };
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) {
      result.push(path.join(entry.parentPath, entry.name).slice(dir.length + 1));
    }
  }
  return result.sort();
}

describe('unpackZip', () => {
  it('round trip: index.html plus two folders beside it, byte-identical content', async () => {
    const { zipPath, targetDir } = setUp([
      { name: 'index.html', content: '<h1>Hallo</h1>' },
      { name: 'assets/' },
      { name: 'assets/app.js', content: 'console.log("hi")', deflate: true },
      { name: 'styles/style.css', content: 'body { color: teal }' },
    ]);

    const result = await unpackZip({ zipPath, targetDir, limits: LIMITS });

    expect(result).toEqual({ ok: true, fileCount: 3, bytesWritten: expect.any(Number) });
    expect(listFiles(targetDir)).toEqual(['assets/app.js', 'index.html', 'styles/style.css']);
    expect(readFileSync(path.join(targetDir, 'index.html'), 'utf8')).toBe('<h1>Hallo</h1>');
    expect(readFileSync(path.join(targetDir, 'assets/app.js'), 'utf8')).toBe('console.log("hi")');
    expect(readFileSync(path.join(targetDir, 'styles/style.css'), 'utf8')).toBe(
      'body { color: teal }',
    );
  });

  it('refuses an escaping entry with the precise message, and writes nothing outside the target directory', async () => {
    const { zipPath, targetDir, root } = setUp([
      { name: 'index.html', content: '<h1>harmlos</h1>' },
      { name: '../escape.html', content: '<h1>ausgebrochen</h1>' },
    ]);

    const result = await unpackZip({ zipPath, targetDir, limits: LIMITS });

    // decodeStrings: false at the openPromise call is what makes this reachable at all:
    // with it on, yauzl's own validateFileName refuses ".." before checkEntry ever sees
    // the name, and the publisher gets a flat "the zip could not be read" instead of
    // this. A publisher who cannot tell which entry is at fault cannot fix the archive.
    expect(result).toEqual({
      ok: false,
      kind: 'invalid',
      message: 'the zip contains an entry that escapes the target directory: "../escape.html"',
    });
    expect(existsSync(path.join(root, 'escape.html'))).toBe(false);
  });

  it('refuses an absolute entry path with the precise message', async () => {
    const { zipPath, targetDir } = setUp([
      { name: 'index.html', content: '<h1>harmlos</h1>' },
      { name: '/etc/passwd', content: 'root:x:0:0' },
    ]);

    const result = await unpackZip({ zipPath, targetDir, limits: LIMITS });

    expect(result).toEqual({
      ok: false,
      kind: 'invalid',
      message: 'the zip contains an entry with an absolute path: "/etc/passwd"',
    });
  });

  it('normalizes a Windows-shaped backslash path the same way yauzl itself would, and still refuses it as an escape', async () => {
    // Verifies the caveat that comes with turning yauzl's own name validation off:
    // getFileNameLowLevel (called ourselves now, in toEntryInfo) still replaces "\"
    // with "/" before checkEntry ever sees the name, exactly as yauzl would have done
    // internally — so this is caught by normalizeEntryPath's own ".." rule, not stored
    // as a filename that merely contains a backslash.
    const { zipPath, targetDir } = setUp([
      { name: 'index.html', content: '<h1>harmlos</h1>' },
      { name: '..\\..\\escaped.html', content: 'x' },
    ]);

    const result = await unpackZip({ zipPath, targetDir, limits: LIMITS });

    expect(result).toEqual({
      ok: false,
      kind: 'invalid',
      message: 'the zip contains an entry that escapes the target directory: "../../escaped.html"',
    });
  });

  it('refuses a symlink entry and creates no symlink under the target directory', async () => {
    const { zipPath, targetDir } = setUp([
      { name: 'index.html', content: '<h1>harmlos</h1>' },
      { name: 'geheim.html', content: '../../etc/passwd', unixMode: 0o120777 },
    ]);

    const result = await unpackZip({ zipPath, targetDir, limits: LIMITS });

    expect(result).toEqual({
      ok: false,
      kind: 'invalid',
      message: expect.stringContaining('symbolic'),
    });
    // No code path in unpackZip ever creates a symlink; nothing to find under targetDir.
    expect(existsSync(path.join(targetDir, 'geheim.html'))).toBe(false);
  });

  it('refuses over the compression ratio — under every other limit', async () => {
    const { zipPath, targetDir } = setUp([
      { name: 'index.html', content: '<h1>ok</h1>' },
      { name: 'gross.bin', content: Buffer.alloc(2_000_000, 0), deflate: true },
    ]);

    const result = await unpackZip({
      zipPath,
      targetDir,
      limits: { ...LIMITS, maxCompressionRatio: 200 },
    });

    expect(result).toEqual({ ok: false, kind: 'over-limit', message: expect.any(String) });
  });

  it('refuses over the entry count', async () => {
    const entries: ZipEntrySpec[] = [{ name: 'index.html', content: '<h1>ok</h1>' }];
    for (let i = 0; i < 25; i += 1) entries.push({ name: `f${i}.txt`, content: 'x' });
    const { zipPath, targetDir } = setUp(entries);

    const result = await unpackZip({ zipPath, targetDir, limits: { ...LIMITS, maxEntries: 10 } });

    expect(result).toEqual({ ok: false, kind: 'over-limit', message: expect.any(String) });
  });

  it('does not count junk twins or directory entries towards the entry limit', async () => {
    // 10 real files (index.html plus 9 more), a __MACOSX/._* twin for each, and 3
    // directory entries: 23 entries read from the central directory, but only 10 of
    // them are real files. Before the fix, the pre-flight bailed on the raw count of
    // everything read (23 > 10) and refused an archive planZipEntries itself accepts —
    // exactly the case the junk rule exists to prevent. This is red without the fix in
    // unpack.ts's own pre-flight loop; zip-entries.test.ts's "junk does not count
    // towards the entry limit" cannot catch it, because planZipEntries was never wrong.
    const entries: ZipEntrySpec[] = [
      { name: 'index.html', content: '<h1>ok</h1>' },
      { name: '__MACOSX/' },
      { name: '__MACOSX/._index.html', content: 'junk' },
      { name: 'assets/' },
    ];
    for (let i = 0; i < 9; i += 1) {
      entries.push({ name: `f${i}.txt`, content: 'x' });
      entries.push({ name: `__MACOSX/._f${i}.txt`, content: 'junk' });
    }
    entries.push({ name: 'styles/' });
    const { zipPath, targetDir } = setUp(entries);

    const result = await unpackZip({ zipPath, targetDir, limits: { ...LIMITS, maxEntries: 10 } });

    expect(result).toEqual({ ok: true, fileCount: 10, bytesWritten: expect.any(Number) });
    expect(existsSync(path.join(targetDir, '__MACOSX'))).toBe(false);
  });

  it('aborts reading a central directory built almost entirely of junk, before the file-count refusal could ever apply', async () => {
    // maxEntries: 5 gives a raw-read ceiling of 100 (20x). None of these 105 entries is
    // a real file, so keptFileEntries never moves and the file-count refusal above never
    // fires — without the raw-read counter of its own, the loop would read all of them,
    // planZipEntries would see an all-junk list, and the refusal would be 'invalid' ("no
    // index.html"), not 'over-limit'. This is red without that second counter.
    const entries: ZipEntrySpec[] = [];
    for (let i = 0; i < 105; i += 1) {
      entries.push({ name: `__MACOSX/._f${i}.txt`, content: 'junk' });
    }
    const { zipPath, targetDir } = setUp(entries);

    const result = await unpackZip({ zipPath, targetDir, limits: { ...LIMITS, maxEntries: 5 } });

    expect(result).toEqual({ ok: false, kind: 'over-limit', message: expect.any(String) });
  });

  it('refuses over the unpacked size before any file exists in the target directory', async () => {
    const { zipPath, targetDir } = setUp([
      { name: 'index.html', content: 'x'.repeat(600) },
      { name: 'big.bin', content: 'y'.repeat(600) },
    ]);

    const result = await unpackZip({
      zipPath,
      targetDir,
      limits: { ...LIMITS, maxUnpackedBytes: 1000 },
    });

    expect(result).toEqual({ ok: false, kind: 'over-limit', message: expect.any(String) });
    expect(listFiles(targetDir)).toEqual([]);
  });

  it('refuses a central directory that under-declares an entry size, writing no complete file', async () => {
    const realContent = 'x'.repeat(2_000_000);
    const { zipPath, targetDir } = setUp([
      { name: 'index.html', content: '<h1>ok</h1>' },
      {
        name: 'lying.bin',
        content: realContent,
        deflate: true,
        declaredUncompressedSize: 10,
      },
    ]);

    const result = await unpackZip({ zipPath, targetDir, limits: LIMITS });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a refusal');
    // Whichever layer caught the lie — validateEntrySizes or the running counter — no
    // complete copy of the real content exists; the file may be absent or partial.
    const lyingPath = path.join(targetDir, 'lying.bin');
    const written = existsSync(lyingPath) ? readFileSync(lyingPath, 'utf8') : null;
    expect(written).not.toBe(realContent);
  });

  it('refuses a file that is not a zip at all', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'handout-unpack-'));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    const zipPath = path.join(root, 'upload.zip');
    writeFileSync(zipPath, 'not a zip');
    const targetDir = path.join(root, 'content');

    const result = await unpackZip({ zipPath, targetDir, limits: LIMITS });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a refusal');
    expect(result.kind).toBe('invalid');
  });

  it('strips a single top-level folder', async () => {
    const { zipPath, targetDir } = setUp([
      { name: 'prototyp/' },
      { name: 'prototyp/index.html', content: '<h1>Hallo</h1>' },
      { name: 'prototyp/assets/app.js', content: 'x' },
    ]);

    const result = await unpackZip({ zipPath, targetDir, limits: LIMITS });

    expect(result).toEqual({ ok: true, fileCount: 2, bytesWritten: expect.any(Number) });
    expect(listFiles(targetDir)).toEqual(['assets/app.js', 'index.html']);
    expect(existsSync(path.join(targetDir, 'prototyp'))).toBe(false);
  });

  it('strips the folder even with __MACOSX/ beside it', async () => {
    const { zipPath, targetDir } = setUp([
      { name: 'prototyp/' },
      { name: 'prototyp/index.html', content: '<h1>Hallo</h1>' },
      { name: 'prototyp/assets/app.js', content: 'x' },
      { name: '__MACOSX/' },
      { name: '__MACOSX/._index.html', content: 'junk' },
    ]);

    const result = await unpackZip({ zipPath, targetDir, limits: LIMITS });

    expect(result).toEqual({ ok: true, fileCount: 2, bytesWritten: expect.any(Number) });
    expect(listFiles(targetDir)).toEqual(['assets/app.js', 'index.html']);
    expect(existsSync(path.join(targetDir, '__MACOSX'))).toBe(false);
  });

  it('refuses when no index.html is found anywhere, writing nothing', async () => {
    const { zipPath, targetDir } = setUp([
      { name: 'a/start.html', content: '<h1>start</h1>' },
      { name: 'b/more.html', content: '<h1>mehr</h1>' },
    ]);

    const result = await unpackZip({ zipPath, targetDir, limits: LIMITS });

    expect(result).toEqual({ ok: false, kind: 'invalid', message: expect.any(String) });
    expect(listFiles(targetDir)).toEqual([]);
  });

  it('refuses index.htm alone, writing nothing', async () => {
    const { zipPath, targetDir } = setUp([
      { name: 'index.htm', content: '<h1>falsche Endung</h1>' },
      { name: 'assets/app.js', content: 'x' },
    ]);

    const result = await unpackZip({ zipPath, targetDir, limits: LIMITS });

    expect(result).toEqual({
      ok: false,
      kind: 'invalid',
      message: expect.stringContaining('index.htm'),
    });
    expect(listFiles(targetDir)).toEqual([]);
  });

  it('refuses when the entry file sits one level too deep', async () => {
    const { zipPath, targetDir } = setUp([{ name: 'a/b/index.html', content: '<h1>zu tief</h1>' }]);

    const result = await unpackZip({ zipPath, targetDir, limits: LIMITS });

    expect(result).toEqual({ ok: false, kind: 'invalid', message: expect.any(String) });
    expect(listFiles(targetDir)).toEqual([]);
  });

  it('drops junk names but keeps a dot-path', async () => {
    const { zipPath, targetDir } = setUp([
      { name: 'index.html', content: '<h1>ok</h1>' },
      { name: '__MACOSX/._index.html', content: 'junk' },
      { name: '.DS_Store', content: 'junk' },
      { name: 'Thumbs.db', content: 'junk' },
      { name: '.gitignore', content: 'node_modules' },
    ]);

    const result = await unpackZip({ zipPath, targetDir, limits: LIMITS });

    expect(result).toEqual({ ok: true, fileCount: 2, bytesWritten: expect.any(Number) });
    expect(listFiles(targetDir)).toEqual(['.gitignore', 'index.html']);
    expect(existsSync(path.join(targetDir, '__MACOSX'))).toBe(false);
    expect(existsSync(path.join(targetDir, '.DS_Store'))).toBe(false);
    expect(existsSync(path.join(targetDir, 'Thumbs.db'))).toBe(false);
  });
});
