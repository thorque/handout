import { describe, expect, it } from 'vitest';
import {
  normalizeEntryPath,
  planZipEntries,
  type UnpackLimits,
  type ZipEntryInfo,
} from './zip-entries';

const LIMITS: UnpackLimits = {
  maxUnpackedBytes: 100_000_000,
  maxEntries: 2000,
  maxCompressionRatio: 200,
};

/** A plain file entry with the given path, defaulting to a harmless, decodable shape. */
function file(name: string, overrides: Partial<ZipEntryInfo> = {}): ZipEntryInfo {
  return {
    name,
    uncompressedSize: 10,
    compressedSize: 10,
    isDirectory: false,
    unixMode: 0o100644,
    isEncrypted: false,
    canDecodeFileData: true,
    compressionMethod: 8,
    ...overrides,
  };
}

/** A directory entry — name ends with `/`, no meaningful size. */
function dir(name: string): ZipEntryInfo {
  return file(name, { isDirectory: true, uncompressedSize: 0, compressedSize: 0 });
}

function planNames(infos: ZipEntryInfo[], limits: UnpackLimits = LIMITS) {
  const plan = planZipEntries(infos, limits);
  if (!plan.ok) throw new Error(`expected an accepted plan, got: ${plan.message}`);
  return plan.entries.map((entry) => entry.targetPath).sort();
}

describe('normalizeEntryPath', () => {
  it('drops a leading "./" segment', () => {
    expect(normalizeEntryPath('./index.html')).toEqual({
      ok: true,
      path: 'index.html',
      segments: ['index.html'],
    });
  });

  it('splits a nested path into segments', () => {
    expect(normalizeEntryPath('a/b/c.css')).toEqual({
      ok: true,
      path: 'a/b/c.css',
      segments: ['a', 'b', 'c.css'],
    });
  });

  it('refuses an absolute path', () => {
    const result = normalizeEntryPath('/etc/passwd');
    expect(result).toEqual({ ok: false, message: expect.stringContaining('absolute') });
  });

  it('refuses a Windows drive letter', () => {
    const result = normalizeEntryPath('C:/x');
    expect(result).toEqual({ ok: false, message: expect.stringContaining('absolute') });
  });

  it('refuses a ".." segment, however deep', () => {
    const result = normalizeEntryPath('a/../../x');
    expect(result).toEqual({ ok: false, message: expect.stringContaining('escapes') });
  });

  it('refuses an empty segment', () => {
    const result = normalizeEntryPath('a//b');
    expect(result).toEqual({ ok: false, message: expect.stringContaining('malformed') });
  });

  it('refuses a NUL byte', () => {
    const result = normalizeEntryPath('a\0b');
    expect(result).toEqual({ ok: false, message: expect.stringContaining('unusable') });
  });

  it('refuses an empty name', () => {
    const result = normalizeEntryPath('');
    expect(result).toEqual({ ok: false, message: expect.stringContaining('unusable') });
  });
});

describe('the structure rule: root index.html, whatever else is in the root', () => {
  it('index.html in the root plus several folders beside it — nothing is stripped', () => {
    const names = planNames([
      file('index.html'),
      dir('assets/'),
      file('assets/app.js'),
      file('styles/style.css'),
      file('readme.txt'),
    ]);
    expect(names).toEqual(['assets/app.js', 'index.html', 'readme.txt', 'styles/style.css']);
  });

  it('index.html in the root, exactly one folder beside it — still unchanged', () => {
    const names = planNames([file('index.html'), file('assets/app.js')]);
    expect(names).toEqual(['assets/app.js', 'index.html']);
  });

  it('index.html in the root and nothing else', () => {
    const names = planNames([file('index.html')]);
    expect(names).toEqual(['index.html']);
  });
});

describe('the structure rule: one top folder holding the entry file', () => {
  it('strips the one folder', () => {
    const names = planNames([
      dir('wrapper/'),
      file('wrapper/index.html'),
      file('wrapper/assets/app.js'),
    ]);
    expect(names).toEqual(['assets/app.js', 'index.html']);
  });

  it('refuses when the entry file sits a level deeper still', () => {
    const plan = planZipEntries([file('a/b/index.html')], LIMITS);
    expect(plan).toEqual({ ok: false, kind: 'invalid', message: expect.any(String) });
  });

  it('refuses two top-level entries and no root index.html', () => {
    const plan = planZipEntries([file('wrapper/index.html'), file('readme.txt')], LIMITS);
    expect(plan).toEqual({ ok: false, kind: 'invalid', message: expect.any(String) });
  });

  it('refuses several folders with no index.html anywhere, naming both places searched', () => {
    const plan = planZipEntries([file('a/x.html'), file('b/y.html')], LIMITS);
    expect(plan.ok).toBe(false);
    if (plan.ok) throw new Error('expected a refusal');
    expect(plan.kind).toBe('invalid');
    expect(plan.message).toContain('root');
    expect(plan.message).toContain('top-level folder');
  });

  it('refuses a single root entry that is a file, not a folder', () => {
    const plan = planZipEntries([file('readme.txt')], LIMITS);
    expect(plan).toEqual({ ok: false, kind: 'invalid', message: expect.any(String) });
  });

  it('refuses index.htm in the root with no index.html, naming the index.htm rule', () => {
    const plan = planZipEntries([file('index.htm'), file('assets/app.js')], LIMITS);
    expect(plan.ok).toBe(false);
    if (plan.ok) throw new Error('expected a refusal');
    expect(plan.message).toContain('index.htm');
    expect(plan.message).toContain('index.html');
  });

  it('refuses index.htm inside the single top folder the same way', () => {
    const plan = planZipEntries([file('wrapper/index.htm')], LIMITS);
    expect(plan.ok).toBe(false);
    if (plan.ok) throw new Error('expected a refusal');
    expect(plan.message).toContain('index.htm');
  });

  it('a directory entry named index.html/ does not satisfy the search', () => {
    const plan = planZipEntries([dir('index.html/'), file('a/b.css')], LIMITS);
    expect(plan).toEqual({ ok: false, kind: 'invalid', message: expect.any(String) });
  });

  it('junk beside the single top folder does not stop the strip', () => {
    const names = planNames([
      dir('__MACOSX/'),
      file('__MACOSX/._index.html'),
      file('wrapper/index.html'),
      file('wrapper/app.js'),
    ]);
    expect(names).toEqual(['app.js', 'index.html']);
  });
});

describe('the junk filter', () => {
  it('drops __MACOSX/, .DS_Store and Thumbs.db, case-insensitively', () => {
    const names = planNames([
      file('__MACOSX/._index.html'),
      file('index.html'),
      file('.DS_Store'),
      file('sub/Thumbs.db'),
    ]);
    expect(names).toEqual(['index.html']);
  });

  it('does not drop a dot-path — that would change the delivered artifact', () => {
    const names = planNames([file('index.html'), file('.gitignore'), file('.well-known/x.json')]);
    expect(names).toEqual(['.gitignore', '.well-known/x.json', 'index.html']);
  });

  it('does not save an archive that is unsafe for another reason', () => {
    const plan = planZipEntries([file('__MACOSX/../../etc/passwd'), file('index.html')], LIMITS);
    expect(plan).toEqual({
      ok: false,
      kind: 'invalid',
      message: expect.stringContaining('escapes'),
    });
  });

  it('junk does not count towards the entry limit', () => {
    const plan = planZipEntries(
      [file('index.html'), file('a.css'), file('.DS_Store'), file('__MACOSX/x')],
      { ...LIMITS, maxEntries: 2 },
    );
    expect(plan.ok).toBe(true);
  });

  it('directory entries are not written', () => {
    const names = planNames([dir('assets/'), file('index.html')]);
    expect(names).toEqual(['index.html']);
  });

  it('a zero-byte index.html satisfies the search — content is never inspected', () => {
    const names = planNames([file('index.html', { uncompressedSize: 0, compressedSize: 0 })]);
    expect(names).toEqual(['index.html']);
  });
});

describe('the three limits', () => {
  it('refuses over the entry count', () => {
    const infos = [file('index.html'), ...Array.from({ length: 5 }, (_, i) => file(`f${i}.txt`))];
    const plan = planZipEntries(infos, { ...LIMITS, maxEntries: 3 });
    expect(plan).toEqual({ ok: false, kind: 'over-limit', message: expect.any(String) });
  });

  it('accepts just under the entry count', () => {
    const infos = [file('index.html'), ...Array.from({ length: 2 }, (_, i) => file(`f${i}.txt`))];
    const plan = planZipEntries(infos, { ...LIMITS, maxEntries: 3 });
    expect(plan.ok).toBe(true);
  });

  it('refuses over the unpacked size', () => {
    const plan = planZipEntries(
      [file('index.html', { uncompressedSize: 100 }), file('big.bin', { uncompressedSize: 901 })],
      { ...LIMITS, maxUnpackedBytes: 1000 },
    );
    expect(plan).toEqual({ ok: false, kind: 'over-limit', message: expect.any(String) });
  });

  it('accepts just under the unpacked size', () => {
    const plan = planZipEntries(
      [file('index.html', { uncompressedSize: 100 }), file('big.bin', { uncompressedSize: 899 })],
      { ...LIMITS, maxUnpackedBytes: 1000 },
    );
    expect(plan.ok).toBe(true);
  });

  it('refuses over the compression ratio', () => {
    const plan = planZipEntries(
      [
        file('index.html'),
        file('gross.bin', { uncompressedSize: 2_000_000, compressedSize: 2_000 }),
      ],
      { ...LIMITS, maxCompressionRatio: 200 },
    );
    expect(plan).toEqual({ ok: false, kind: 'over-limit', message: expect.any(String) });
  });

  it('accepts just under the compression ratio', () => {
    const plan = planZipEntries(
      [
        file('index.html'),
        file('gross.bin', { uncompressedSize: 2_000_000, compressedSize: 12_000 }),
      ],
      { ...LIMITS, maxCompressionRatio: 200 },
    );
    expect(plan.ok).toBe(true);
  });

  it('accepts a high ratio under the 1 MiB floor — harmless whatever the ratio', () => {
    const plan = planZipEntries(
      [file('index.html'), file('small.bin', { uncompressedSize: 400_000, compressedSize: 100 })],
      { ...LIMITS, maxCompressionRatio: 200 },
    );
    expect(plan.ok).toBe(true);
  });

  it('refuses a compressedSize of 0 with a non-zero uncompressed size', () => {
    const plan = planZipEntries(
      [file('index.html'), file('gross.bin', { uncompressedSize: 2_000_000, compressedSize: 0 })],
      LIMITS,
    );
    expect(plan).toEqual({ ok: false, kind: 'over-limit', message: expect.any(String) });
  });
});

describe('collisions', () => {
  it('refuses two entries that plan to the same target path', () => {
    const plan = planZipEntries([file('a/b.html'), file('a/b.html')], LIMITS);
    expect(plan).toEqual({ ok: false, kind: 'invalid', message: expect.any(String) });
  });

  it('refuses a path used as both a file and a directory', () => {
    const plan = planZipEntries([file('index.html'), file('a'), file('a/b')], LIMITS);
    expect(plan).toEqual({ ok: false, kind: 'invalid', message: expect.any(String) });
  });
});

describe('path and segment length', () => {
  it('refuses a path over 512 characters', () => {
    const longPath = `${'a'.repeat(600)}.html`;
    const plan = planZipEntries([file('index.html'), file(longPath)], LIMITS);
    expect(plan).toEqual({ ok: false, kind: 'invalid', message: expect.any(String) });
  });

  it('refuses a segment over 255 bytes', () => {
    const longSegment = 'a'.repeat(300);
    const plan = planZipEntries([file('index.html'), file(`${longSegment}/x.css`)], LIMITS);
    expect(plan).toEqual({ ok: false, kind: 'invalid', message: expect.any(String) });
  });
});

describe('symlinks, encryption and unsupported compression', () => {
  it('refuses a symlink', () => {
    const plan = planZipEntries([file('index.html'), file('link', { unixMode: 0o120777 })], LIMITS);
    expect(plan).toEqual({
      ok: false,
      kind: 'invalid',
      message: expect.stringContaining('symbolic'),
    });
  });

  it('accepts a plain file mode', () => {
    const plan = planZipEntries([file('index.html', { unixMode: 0o100644 })], LIMITS);
    expect(plan.ok).toBe(true);
  });

  it('refuses an encrypted entry', () => {
    const plan = planZipEntries(
      [file('index.html'), file('secret.bin', { isEncrypted: true })],
      LIMITS,
    );
    expect(plan).toEqual({
      ok: false,
      kind: 'invalid',
      message: expect.stringContaining('encrypted'),
    });
  });

  it('refuses an entry with an unsupported compression method', () => {
    const plan = planZipEntries(
      [file('index.html'), file('odd.bin', { canDecodeFileData: false, compressionMethod: 9 })],
      LIMITS,
    );
    expect(plan).toEqual({ ok: false, kind: 'invalid', message: expect.any(String) });
  });
});
