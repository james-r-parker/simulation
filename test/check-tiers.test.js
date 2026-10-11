import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Git exports GIT_DIR, GIT_INDEX_FILE and friends to hooks; a child git that inherits them acts on this repo, not
// the temporary one, so every spawn gets an environment without them.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));

/**
 * Runs scripts/check.sh with the given arguments.
 * @param {...string} args check.sh arguments
 * @returns {{status: number | null, lines: string[]}} exit status and non-empty stdout lines
 */
function check(...args) {
    const result = spawnSync('scripts/check.sh', args, { encoding: 'utf8', env: ENV });
    return { status: result.status, lines: result.stdout.split('\n').filter(Boolean) };
}

describe('check.sh --list', () => {
    it('lists the tier 1 gates', () => {
        expect(check('--list', '--tier', '1').lines).toEqual(['conventions', 'format', 'lint', 'test-related']);
    });

    it('lists every tier 1 gate in tier 2', () => {
        const tier2 = check('--list', '--tier', '2').lines;
        for (const gate of check('--list', '--tier', '1').lines) {
            expect(tier2).toContain(gate);
        }
        expect(tier2).toContain('browser-smoke');
    });

    it('lists every tier 2 gate in tier 3, plus mutation and bench-compare', () => {
        const tier3 = check('--list', '--tier=3').lines;
        for (const gate of check('--list', '--tier', '2').lines) {
            expect(tier3).toContain(gate);
        }
        expect(tier3.slice(-2)).toEqual(['mutation', 'bench-compare']);
    });

    it('defaults to tier 2', () => {
        expect(check('--list').lines).toEqual(check('--list', '--tier', '2').lines);
    });

    it('leaves docs-tests out of every tier but lists it when named', () => {
        expect(check('--list', '--tier', '3').lines).not.toContain('docs-tests');
        expect(check('--list', '--docs').lines).toEqual(['conventions', 'designs-index', 'format', 'docs-tests']);
        expect(check('--list', '--only=docs-tests,lint').lines).toEqual(['lint', 'docs-tests']);
    });
});

describe('check.sh --tier', () => {
    it('rejects --tier with --only', () => {
        expect(check('--tier', '1', '--only=lint').status).toBe(2);
    });

    it('rejects --tier with --docs', () => {
        expect(check('--tier', '1', '--docs').status).toBe(2);
    });

    it('rejects an unknown tier', () => {
        expect(check('--tier', '9').status).toBe(2);
    });
});

describe('check.sh --list --tier 1 staged-file selection', () => {
    it('names only the staged, non-deleted files each gate reads', () => {
        const repo = mkdtempSync(join(tmpdir(), 'check-tier1-'));
        /** @param {...string} args git arguments */
        const git = (...args) => spawnSync('git', args, { cwd: repo, encoding: 'utf8', env: ENV });
        try {
            mkdirSync(join(repo, 'scripts'));
            copyFileSync(resolve('scripts/check.sh'), join(repo, 'scripts/check.sh'));
            git('init', '-q');
            for (const name of ['gone.js', 'edited.js', 'seen.md']) {
                writeFileSync(join(repo, name), 'x\n');
            }
            git('add', '.');
            git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'base');
            git('rm', '-q', 'gone.js');
            writeFileSync(join(repo, 'edited.js'), 'changed\n');
            writeFileSync(join(repo, 'staged.js'), 'x\n');
            writeFileSync(join(repo, 'notes.md'), 'x\n');
            writeFileSync(join(repo, 'untracked.js'), 'x\n');
            git('add', 'staged.js', 'notes.md');

            const result = spawnSync('bash', ['scripts/check.sh', '--list', '--tier', '1'], {
                cwd: repo,
                encoding: 'utf8',
                env: ENV,
            });
            const detail = result.stderr.split('\n').filter(Boolean);

            expect(result.status).toBe(0);
            expect(detail).toEqual(['format: notes.md staged.js', 'lint: staged.js', 'test-related: staged.js']);
        } finally {
            rmSync(repo, { recursive: true, force: true });
        }
    });
});

describe('check.sh test gate seed', () => {
    it('prints TEST_SEED on the test gate line and hands it to the runner', () => {
        const dir = mkdtempSync(join(tmpdir(), 'fake-vitest-'));
        const argsFile = join(dir, 'args.txt');
        const fake = join(dir, 'vitest');
        writeFileSync(fake, `#!/usr/bin/env bash\necho "$@" > "${argsFile}"\n`, { mode: 0o755 });
        const result = spawnSync('scripts/check.sh', ['--only=test'], {
            encoding: 'utf8',
            env: { ...ENV, TEST_SEED: '4242', VITEST_BIN: fake, CHECK_LOG_DIR: join(dir, 'logs') },
        });
        expect(result.stdout).toContain('test (seed 4242)');
        expect(readFileSync(argsFile, 'utf8')).toContain('--sequence.seed=4242');
    });
});
