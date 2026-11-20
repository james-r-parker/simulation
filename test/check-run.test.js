// check.sh run isolation and recovery (docs/designs/quality-gates-and-test-tiers.md, Phase 4): a coverage directory per run,
// coverage and the ratchet after a failed test, the failed-gate record behind --rerun-failed, and --quick.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

const ENV = {
    ...Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_') && key !== 'TEST_SCOPE'),
    ),
    CHECK_CPU_LOCK: 'off',
    CHECK_COVERAGE_DIR: '',
    TEST_SEED: '7',
};
const SPAWN_TIMEOUT_MS = scaleTimeout(30_000);
/** A coverage summary whose only file, under scripts/, has no covered line: far below the ratchet's baseline. */
const BAD_SUMMARY = JSON.stringify({
    total: {},
    [resolve('scripts/x.mjs')]: Object.fromEntries(
        ['lines', 'branches', 'functions', 'statements'].map((m) => [m, { total: 10, covered: 0 }]),
    ),
});

let dir = '';
let logs = '';
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'check-run-'));
    logs = join(dir, 'logs');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/**
 * Writes a stand-in for vitest: it records its arguments, writes `summary` into the --coverage.reportsDirectory it is
 * given (when it is given one and `summary` is set), and exits with `status`.
 * @param {number} status the exit status
 * @param {string} [summary] contents of the coverage-summary.json to write
 * @returns {string} its path
 */
function fakeVitest(status, summary) {
    const fake = join(dir, 'vitest');
    const write = summary
        ? `for a in "$@"; do case "$a" in --coverage.reportsDirectory=*) d="\${a#*=}"; mkdir -p "$d"; cat > "$d/coverage-summary.json" <<'EOF'\n${summary}\nEOF\n;; esac; done\n`
        : '';
    writeFileSync(fake, `#!/usr/bin/env bash\necho "$@" >> "${join(dir, 'args.txt')}"\n${write}exit ${status}\n`, {
        mode: 0o755,
    });
    return fake;
}

/**
 * @param {string[]} args check.sh arguments
 * @param {Record<string, string>} [env] extra environment
 * @returns {{status: number | null, stdout: string}} the outcome
 */
function check(args, env = {}) {
    const r = spawnSync('scripts/check.sh', args, { encoding: 'utf8', env: { ...ENV, CHECK_LOG_DIR: logs, ...env } });
    // The gate lines are coloured; the tests read them plain.
    const plain = ['31m', '32m', '33m', '0m'].reduce(
        (text, code) => text.replaceAll(`\u001b[${code}`, ''),
        r.stdout + r.stderr,
    );
    return { status: r.status, stdout: plain };
}

/** @returns {string[]} each call the fake vitest recorded */
const calls = () => readFileSync(join(dir, 'args.txt'), 'utf8').trim().split('\n');

describe('check.sh coverage directory', { timeout: SPAWN_TIMEOUT_MS }, () => {
    it('gives every run its own coverage directory and removes it at exit', () => {
        const fake = fakeVitest(0);
        check(['--only=test'], { VITEST_BIN: fake });
        check(['--only=test'], { VITEST_BIN: fake });
        const dirs = calls()
            .map((line) => /--coverage\.reportsDirectory=(\S+)/.exec(line)?.[1])
            .filter(Boolean);
        expect(dirs).toHaveLength(2);
        expect(dirs[0]).toMatch(/\/coverage\/run-\d+$/);
        expect(dirs[0]).not.toBe(dirs[1]);
        expect(existsSync(/** @type {string} */ (dirs[0]))).toBe(false);
    });

    it('writes coverage even when a test fails, and keeps a directory the caller named', () => {
        const named = join(dir, 'cov');
        check(['--only=test'], { VITEST_BIN: fakeVitest(1), CHECK_COVERAGE_DIR: named });
        expect(calls()[0]).toContain('--coverage.reportOnFailure');
        expect(calls()[0]).toContain(`--coverage.reportsDirectory=${named}`);
    });
});

describe('check.sh ratchet after a failed test', { timeout: SPAWN_TIMEOUT_MS }, () => {
    it('still runs the ratchet and reports it, and the run fails because of the test', () => {
        const run = check(['--only=test,ratchet'], { VITEST_BIN: fakeVitest(1, BAD_SUMMARY) });
        expect(run.status).toBe(1);
        expect(run.stdout).toMatch(/✗ test \(seed 7\)/);
        expect(run.stdout).toMatch(/✗ ratchet \(a test failed\)/);
        expect(run.stdout).toContain('scripts lines coverage is below its baseline');
    });

    it('passes the ratchet on good coverage, and the run still fails on the failed test', () => {
        const summary = JSON.stringify({ total: {} });
        const run = check(['--only=test,ratchet'], { VITEST_BIN: fakeVitest(1, summary) });
        expect(run.status).toBe(1);
        expect(run.stdout).toMatch(/✓ ratchet \(a test failed\)/);
    });

    it('fails a ratchet drop after tests that passed', () => {
        const run = check(['--only=test,ratchet'], { VITEST_BIN: fakeVitest(0, BAD_SUMMARY) });
        expect(run.status).toBe(1);
        expect(run.stdout).toMatch(/✓ test/);
        expect(run.stdout).toMatch(/✗ ratchet\s/);
    });

    it('skips the ratchet when the test gate wrote no coverage', () => {
        const run = check(['--only=test,ratchet'], { VITEST_BIN: fakeVitest(0) });
        expect(run.status).toBe(0);
        expect(run.stdout).toMatch(/ratchet\s+skipped \(needs the coverage of a test gate/);
    });
});

describe('check.sh --rerun-failed', { timeout: SPAWN_TIMEOUT_MS }, () => {
    it('records the failed gates, reruns only those, and clears them when they pass', () => {
        expect(check(['--only=test'], { VITEST_BIN: fakeVitest(1) }).status).toBe(1);
        expect(readFileSync(join(logs, 'failed-gates'), 'utf8').trim()).toBe('test');
        const before = calls().length;
        const rerun = check(['--rerun-failed'], { VITEST_BIN: fakeVitest(0) });
        expect(rerun.status).toBe(0);
        expect(calls().length).toBeGreaterThan(before);
        expect(existsSync(join(logs, 'failed-gates'))).toBe(false);
    });

    it('says so, and runs nothing, when no gate failed', () => {
        const run = check(['--rerun-failed']);
        expect(run.status).toBe(0);
        expect(run.stdout).toContain('nothing to rerun');
    });

    it('keeps the failed gates a partial run did not select', () => {
        spawnSync('mkdir', ['-p', logs]);
        writeFileSync(join(logs, 'failed-gates'), 'lint,test\n');
        check(['--only=test'], { VITEST_BIN: fakeVitest(0) });
        expect(readFileSync(join(logs, 'failed-gates'), 'utf8').trim()).toBe('lint');
    });

    it('reruns the tests with a failed ratchet, in gate order', () => {
        spawnSync('mkdir', ['-p', logs]);
        writeFileSync(join(logs, 'failed-gates'), 'ratchet,lint\n');
        const list = check(['--list', '--rerun-failed']);
        expect(list.stdout.split('\n').filter(Boolean)).toEqual(['lint', 'test', 'ratchet']);
    });

    it('does not combine with --tier, --only, --docs, --quick or itself', () => {
        for (const other of [['--tier', '1'], ['--only=lint'], ['--docs'], ['--quick']]) {
            expect(check(['--rerun-failed', ...other]).status, other.join(' ')).toBe(2);
        }
    });
});

describe('check.sh --quick', { timeout: SPAWN_TIMEOUT_MS }, () => {
    it('selects the static gates, ratchet-related and the build, and no full tests, ratchet or smokes', () => {
        const gates = check(['--list', '--quick']).stdout.split('\n').filter(Boolean);
        expect(gates).toEqual([
            'conventions',
            'designs-index',
            'format',
            'lint',
            'typecheck',
            'deps',
            'dupes',
            'ratchet-related',
            'build',
        ]);
    });

    it('leaves ratchet-related out of every tier, so CI and the hook never run it', () => {
        for (const tier of ['1', '2', '3']) {
            expect(check(['--list', '--tier', tier]).stdout.split('\n')).not.toContain('ratchet-related');
        }
    });

    it('does not combine with --tier, --only or --docs', () => {
        for (const other of [['--tier', '1'], ['--only=lint'], ['--docs']]) {
            expect(check(['--quick', ...other]).status, other.join(' ')).toBe(2);
        }
    });
});
