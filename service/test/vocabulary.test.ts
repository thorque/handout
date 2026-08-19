/**
 * Mechanical guards for the vocabulary and namespace decisions this story makes, run over
 * every tracked file in the repository — not just the service workspace.
 *
 * `git grep` searches tracked files only, which is deliberate: `.claude/CLAUDE.md` is
 * gitignored and legitimately holds links into Jira and Confluence, and it must stay out
 * of scope. `git grep` exits 1 when it finds nothing and 0 when it finds something, so a
 * non-zero exit is treated as "clean" here — getting that backwards would make every case
 * below pass forever, silently proving nothing.
 *
 * Two things this test cannot see: the German word "Veröffentlichung" is a different word
 * from "publication" and stays in the user interface; and the word "publication" still
 * exists in the repository's git history, which no test can or should police.
 *
 * The repository root is resolved from `import.meta.dirname`, not from `process.cwd()`,
 * which differs between vitest (started in `service/`) and the service itself — the same
 * reason `MIGRATIONS_DIR` in `service/src/db/migrate.ts` is resolved that way.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const SELF = 'service/test/vocabulary.test.ts';

/** True when `pattern` does not occur in any tracked file, `SELF` excluded. */
function gitGrepClean(args: string[]): { clean: boolean; output: string } {
  try {
    const output = execFileSync('git', ['grep', ...args, '--', '.', `:(exclude)${SELF}`], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    // A zero exit means git grep found a match — not clean.
    return { clean: false, output };
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 1) return { clean: true, output: '' }; // no match: exactly what we want
    throw error; // any other exit (e.g. 128, a bad invocation) must not be read as "clean"
  }
}

/** True when no tracked file *path* (not content) matches `pattern`, case-insensitive. */
function gitLsFilesClean(pattern: RegExp): { clean: boolean; matches: string[] } {
  const output = execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8' });
  const matches = output.split('\n').filter((file) => pattern.test(file));
  return { clean: matches.length === 0, matches };
}

describe('vocabulary', () => {
  it('never names the old application namespace — criterion 1', () => {
    const { clean, output } = gitGrepClean(['-n', '_handout']);
    expect(clean, `found "_handout" in tracked files:\n${output}`).toBe(true);
  });

  it('never says "publication" — criterion 4', () => {
    const { clean, output } = gitGrepClean(['-in', 'publication']);
    expect(clean, `found "publication" in tracked files:\n${output}`).toBe(true);
  });

  it('no tracked file path names "publication" either — criterion 4', () => {
    const { clean, matches } = gitLsFilesClean(/publication/i);
    expect(clean, `found "publication" in tracked paths:\n${matches.join('\n')}`).toBe(true);
  });

  it('carries no second address mode — criterion 5', () => {
    const { clean, output } = gitGrepClean([
      '-inE',
      'subdomain mode|base domain|baseDomain|address mode|addressMode',
    ]);
    expect(clean, `found two-address-mode vocabulary in tracked files:\n${output}`).toBe(true);
  });

  it('carries no ticket key in a committed file', () => {
    const { clean, output } = gitGrepClean(['-nE', 'HAN-[0-9]+']);
    expect(clean, `found a ticket key in tracked files:\n${output}`).toBe(true);
  });

  it('carries no link into the tracker or the wiki', () => {
    const { clean, output } = gitGrepClean(['-inE', 'atlassian\\.net|claude\\.ai/design']);
    expect(clean, `found a tracker or wiki link in tracked files:\n${output}`).toBe(true);
  });
});
