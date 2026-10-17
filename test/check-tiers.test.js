import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Git exports GIT_DIR, GIT_INDEX_FILE and friends to hooks; a child git that inherits them acts on this repo, not
// the temporary one, so every spawn gets an environment without them.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));

// Every test here spawns check.sh; a loaded CI runner needs more than Vitest's 5 s default.
const SPAWN_TIMEOUT_MS = 30_000;

/**
 * Runs scripts/check.sh with the given arguments.
 * @param {...string} args check.sh arguments
 * @returns {{status: number | null, lines: string[]}} exit status and non-empty stdout lines
 */
function check(...args) {
    const result = spawnSync('scripts/check.sh', args, { encoding: 'utf8', env: ENV });
    return { status: result.status, lines: result.stdout.split('\n').filter(Boolean) };
}

describe('check.sh --list', { timeout: SPAWN_TIMEOUT_MS }, () => {
    it('lists the tier 1 gates', () => {
        expect(check('--list', '--tier', '1').lines).toEqual(['conventions', 'format', 'lint', 'test-related']);
    });

    it('lists every tier 1 gate in tier 2', () => {
        const tier2 = check('--list', '--tier', '2').lines;
        for (const gate of check('--list', '--tier', '1').lines) {
            expect(tier2).toContain(gate);
        }
        expect(tier2).toContain('browser-smoke');
        expect(tier2).toContain('eval-smoke');
        const order = tier2.filter((gate) => ['ratchet', 'bench-check', 'build'].includes(gate));
        expect(order).toEqual(['ratchet', 'bench-check', 'build']);
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

    it('keeps eval-smoke out of the docs-only path', () => {
        expect(check('--list', '--docs').lines).not.toContain('eval-smoke');
    });

    it('leaves docs-tests out of every tier but lists it when named', () => {
        expect(check('--list', '--tier', '3').lines).not.toContain('docs-tests');
        expect(check('--list', '--docs').lines).toEqual(['conventions', 'designs-index', 'format', 'docs-tests']);
        expect(check('--list', '--only=docs-tests,lint').lines).toEqual(['lint', 'docs-tests']);
    });
});

describe('check.sh --tier', { timeout: SPAWN_TIMEOUT_MS }, () => {
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

describe('check.sh --list --tier 1 staged-file selection', { timeout: SPAWN_TIMEOUT_MS }, () => {
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

describe('check.sh test gate seed', { timeout: SPAWN_TIMEOUT_MS }, () => {
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

describe('check.sh test scope', { timeout: SPAWN_TIMEOUT_MS }, () => {
    /**
     * Runs the test gate with a fake vitest that records its arguments and TEST_SCOPE.
     * @param {...string} args check.sh arguments
     * @returns {{stdout: string, argv: string, scope: string}} the output, the runner's arguments and its scope
     */
    function gate(...args) {
        const dir = mkdtempSync(join(tmpdir(), 'fake-vitest-'));
        const out = join(dir, 'out.txt');
        const fake = join(dir, 'vitest');
        writeFileSync(fake, `#!/usr/bin/env bash\necho "$@" > "${out}"\necho "scope=\${TEST_SCOPE:-}" >> "${out}"\n`, {
            mode: 0o755,
        });
        const env = Object.fromEntries(Object.entries(ENV).filter(([key]) => key !== 'TEST_SCOPE'));
        const result = spawnSync('scripts/check.sh', ['--only=test,ratchet', ...args], {
            encoding: 'utf8',
            env: { ...env, TEST_SEED: '7', VITEST_BIN: fake, CHECK_LOG_DIR: join(dir, 'logs') },
        });
        const [argv, scope] = readFileSync(out, 'utf8').trim().split('\n');
        rmSync(dir, { recursive: true, force: true });
        return { stdout: result.stdout, argv, scope };
    }

    it('runs the fast tests without coverage under --ci, and skips the ratchet', () => {
        const run = gate('--ci');
        expect(run.stdout).toContain('test (fast, seed 7)');
        expect(run.scope).toBe('scope=fast');
        expect(run.argv).not.toContain('--coverage');
        expect(run.stdout).toMatch(/ratchet\s+skipped \(coverage is measured on the full suite/);
    });

    it('runs every test with coverage under --ci --full', () => {
        const run = gate('--ci', '--full');
        expect(run.stdout).toContain('test (seed 7)');
        expect(run.scope).toBe('scope=');
        expect(run.argv).toContain('--coverage');
    });
});

describe('check.sh browser-smoke gate', { timeout: SPAWN_TIMEOUT_MS }, () => {
    it('does not probe Docker when the gate is not wanted', () => {
        const dir = mkdtempSync(join(tmpdir(), 'fake-docker-'));
        const marker = join(dir, 'docker-called');
        writeFileSync(join(dir, 'docker'), `#!/usr/bin/env bash\ntouch "${marker}"\nexit 1\n`, { mode: 0o755 });
        const fake = join(dir, 'vitest');
        writeFileSync(fake, '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
        const env = { ...ENV, PATH: `${dir}:${ENV.PATH}`, VITEST_BIN: fake, CHECK_LOG_DIR: join(dir, 'logs') };
        spawnSync('scripts/check.sh', ['--only=test'], { encoding: 'utf8', env });
        const probed = existsSync(marker);
        spawnSync('scripts/check.sh', ['--only=browser-smoke'], { encoding: 'utf8', env });
        const probedWhenWanted = existsSync(marker);
        rmSync(dir, { recursive: true, force: true });
        expect(probed).toBe(false);
        expect(probedWhenWanted).toBe(true);
    });
});
