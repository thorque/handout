import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolvePublicationFile } from './delivery';

let handoutsDir: string;
let symlinksSupported = true;

beforeAll(() => {
  handoutsDir = mkdtempSync(path.join(os.tmpdir(), 'handout-delivery-'));

  mkdirSync(path.join(handoutsDir, 'aaaaaaaa', 'sub'), { recursive: true });
  writeFileSync(path.join(handoutsDir, 'aaaaaaaa', 'index.html'), 'aaaaaaaa root');
  writeFileSync(path.join(handoutsDir, 'aaaaaaaa', 'sub', 'index.html'), 'aaaaaaaa sub');
  mkdirSync(path.join(handoutsDir, 'aaaaaaaa', 'assets'));
  writeFileSync(path.join(handoutsDir, 'aaaaaaaa', 'assets', 'app.js'), 'console.log(1)');
  writeFileSync(path.join(handoutsDir, 'aaaaaaaa', '.env'), 'SECRET=1');
  mkdirSync(path.join(handoutsDir, 'aaaaaaaa', 'empty'));

  mkdirSync(path.join(handoutsDir, 'bbbbbbbb'));
  writeFileSync(path.join(handoutsDir, 'bbbbbbbb', 'index.html'), 'bbbbbbbb root');

  try {
    symlinkSync('/etc', path.join(handoutsDir, 'aaaaaaaa', 'etc'));
    symlinkSync(
      path.join('..', 'bbbbbbbb', 'index.html'),
      path.join(handoutsDir, 'aaaaaaaa', 'neighbour.html'),
    );
    symlinkSync('index.html', path.join(handoutsDir, 'aaaaaaaa', 'alias.html'));
  } catch {
    symlinksSupported = false;
  }
});

afterAll(() => {
  rmSync(handoutsDir, { recursive: true, force: true });
});

describe('resolvePublicationFile', () => {
  it('resolves the publication root to its index.html', async () => {
    const resolved = await resolvePublicationFile(handoutsDir, 'aaaaaaaa', []);
    expect(resolved?.realPath.endsWith(path.join('aaaaaaaa', 'index.html'))).toBe(true);
  });

  it('resolves a subdirectory to its own index.html', async () => {
    const resolved = await resolvePublicationFile(handoutsDir, 'aaaaaaaa', ['sub']);
    expect(resolved?.realPath.endsWith(path.join('sub', 'index.html'))).toBe(true);
  });

  it('resolves a plain file', async () => {
    const resolved = await resolvePublicationFile(handoutsDir, 'aaaaaaaa', ['assets', 'app.js']);
    expect(resolved?.realPath.endsWith(path.join('assets', 'app.js'))).toBe(true);
    expect(resolved?.realPublicationDir.endsWith('aaaaaaaa')).toBe(true);
  });

  it('gives undefined for a slug with no directory', async () => {
    expect(await resolvePublicationFile(handoutsDir, 'zzzzzzzz', [])).toBeUndefined();
  });

  it('gives undefined for a missing file', async () => {
    expect(
      await resolvePublicationFile(handoutsDir, 'aaaaaaaa', ['missing.html']),
    ).toBeUndefined();
  });

  it('gives undefined for a traversal attempt', async () => {
    expect(
      await resolvePublicationFile(handoutsDir, 'aaaaaaaa', ['..', '..', 'etc', 'passwd']),
    ).toBeUndefined();
  });

  it('gives undefined for an escape into the neighbouring publication', async () => {
    expect(
      await resolvePublicationFile(handoutsDir, 'aaaaaaaa', ['..', 'bbbbbbbb', 'index.html']),
    ).toBeUndefined();
  });

  it('gives undefined for a dotfile', async () => {
    expect(await resolvePublicationFile(handoutsDir, 'aaaaaaaa', ['.env'])).toBeUndefined();
  });

  it('gives undefined for a directory with no index.html', async () => {
    expect(await resolvePublicationFile(handoutsDir, 'aaaaaaaa', ['empty'])).toBeUndefined();
  });

  it.runIf(symlinksSupported)(
    'gives undefined for a symlink that escapes to an absolute path',
    async () => {
      expect(
        await resolvePublicationFile(handoutsDir, 'aaaaaaaa', ['etc', 'passwd']),
      ).toBeUndefined();
    },
  );

  it.runIf(symlinksSupported)(
    'gives undefined for a symlink that escapes into a sibling publication',
    async () => {
      expect(
        await resolvePublicationFile(handoutsDir, 'aaaaaaaa', ['neighbour.html']),
      ).toBeUndefined();
    },
  );

  it.runIf(symlinksSupported)(
    'still resolves a symlink that stays inside the publication',
    async () => {
      const resolved = await resolvePublicationFile(handoutsDir, 'aaaaaaaa', ['alias.html']);
      expect(resolved?.realPath.endsWith(path.join('aaaaaaaa', 'index.html'))).toBe(true);
    },
  );
});
