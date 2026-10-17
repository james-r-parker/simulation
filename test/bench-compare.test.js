import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    BASE_INSTALL_ARGS,
    SKIP_EXIT,
    compare,
    formatRows,
    main,
    parseArgs,
    skipReason,
} from '../scripts/bench-compare.mjs';

/**
 * @param {number} step step time in ms
 * @returns {Record<string, number>} a recorded bench run
 */
function run(step) {
    return { 'bench.step_ms@500': step, 'bench.phase.sense_ms@500': step / 2, 'other.metric': 1 };
}

const BASE = [10, 10.2, 9.8, 10.1, 9.9].map(run);

describe('compare', () => {
    it('passes a head median 9% above the base median', () => {
        const rows = compare(BASE, [10.9, 10.9, 10.9, 10.9, 10.9].map(run));
        expect(rows.every((row) => row.ok)).toBe(true);
    });

    it('fails a head median 11% above the base median', () => {
        const rows = compare(BASE, [11.1, 11.1, 11.1, 11.1, 11.1].map(run));
        expect(rows.filter((row) => !row.ok).map((row) => row.metric)).toContain('bench.step_ms@500');
    });

    it('uses the median, so one slow outlier run does not fail', () => {
        const rows = compare(BASE, [10, 10, 10, 10, 90].map(run));
        expect(rows.every((row) => row.ok)).toBe(true);
    });

    it('compares only bench metrics present in both trees', () => {
        const head = [{ 'bench.step_ms@500': 10, 'bench.new_ms': 1 }];
        const rows = compare([run(10)], head);
        expect(rows.map((row) => row.metric)).toEqual(['bench.step_ms@500']);
    });
});

describe('formatRows', () => {
    it('prints base median, head median and change, marking failures', () => {
        const lines = formatRows(compare([run(10)], [run(11.1)]));
        expect(lines[0]).toBe('FAIL bench.phase.sense_ms@500: base 5, head 5.55, change +11.0% (limit +10%)');
    });
});

describe('skipReason', () => {
    const withBench = JSON.stringify({ scripts: { bench: 'node scripts/bench.mjs' } });

    it('skips a base equal to HEAD', () => {
        expect(skipReason({ baseSha: 'a', headSha: 'a', basePackageJson: withBench })).toMatch(/HEAD/);
    });

    it('skips a base without a bench script', () => {
        const basePackageJson = JSON.stringify({ scripts: { test: 'vitest' } });
        expect(skipReason({ baseSha: 'a', headSha: 'b', basePackageJson })).toMatch(/no bench script/);
    });

    it('skips a base without a package.json', () => {
        expect(skipReason({ baseSha: 'a', headSha: 'b', basePackageJson: null })).toMatch(/no bench script/);
    });

    it('runs when the base differs and has a bench script', () => {
        expect(skipReason({ baseSha: 'a', headSha: 'b', basePackageJson: withBench })).toBeNull();
    });
});

describe('parseArgs', () => {
    it('parses --base, --sizes and --skip-check', () => {
        expect(parseArgs(['--base', 'HEAD~1', '--sizes=100,250', '--skip-check'])).toEqual({
            base: 'HEAD~1',
            sizes: '100,250',
            skipCheck: true,
            runs: 5,
        });
    });

    it('defaults to no base and 500 agents', () => {
        expect(parseArgs([])).toEqual({ base: null, sizes: '500', skipCheck: false, runs: 5 });
    });

    it('rejects bad sizes and unknown arguments', () => {
        expect(() => parseArgs(['--sizes=a'])).toThrow(/--sizes/);
        expect(() => parseArgs(['--nope'])).toThrow(/unknown argument/);
        expect(() => parseArgs(['--runs=0'])).toThrow(/--runs/);
        expect(parseArgs(['--runs=2']).runs).toBe(2);
    });
});

// Git exports GIT_DIR and friends to hooks; a child process that inherits them acts on the wrong repository.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
const BENCH_JS = `const fs = require('node:fs');
const ms = Number(fs.readFileSync('ms.txt', 'utf8'));
console.log(JSON.stringify({ 'bench.step_ms@500': ms }));
`;
const LOCK = {
    name: 'fake',
    version: '1.0.0',
    lockfileVersion: 3,
    requires: true,
    packages: { '': { name: 'fake', version: '1.0.0' } },
};

/** @type {string[]} */
const dirs = [];

/**
 * @param {string} cwd repository directory
 * @param {string[]} args git arguments
 * @returns {string} trimmed stdout
 */
function git(cwd, args) {
    return execFileSync('git', args, { cwd, env: ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/**
 * @param {string} dir repository directory
 * @param {{ms: number, bench: boolean}} state the tree to commit
 */
function commitTree(dir, { ms, bench }) {
    const scripts = bench ? { bench: 'node bench.js' } : {};
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fake', version: '1.0.0', scripts }));
    writeFileSync(join(dir, 'package-lock.json'), JSON.stringify(LOCK));
    writeFileSync(join(dir, 'bench.js'), BENCH_JS);
    writeFileSync(join(dir, 'ms.txt'), String(ms));
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '--allow-empty', '-m', `ms ${ms}`]);
}

/**
 * @param {{base: {ms: number, bench: boolean}, head: {ms: number, bench: boolean} | null}} trees the two commits
 * @returns {string} the throwaway repository
 */
function makeRepo({ base, head }) {
    const dir = mkdtempSync(join(tmpdir(), 'bench-compare-test-'));
    dirs.push(dir);
    git(dir, ['init', '-q']);
    git(dir, ['config', 'user.email', 't@example.com']);
    git(dir, ['config', 'user.name', 't']);
    git(dir, ['config', 'commit.gpgsign', 'false']);
    commitTree(dir, base);
    if (head) {
        commitTree(dir, head);
    }
    return dir;
}

/**
 * @param {string} dir repository directory
 * @param {string[]} extra extra arguments
 * @returns {number} main's exit code, with its output silenced
 */
function runMain(dir, extra = []) {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
        return main(['--base', 'HEAD~1', '--runs=2', ...extra], dir);
    } finally {
        log.mockRestore();
    }
}

/** @param {string} dir repository directory */
function expectNoWorktreeLeft(dir) {
    const entries = git(dir, ['worktree', 'list']).split('\n');
    expect(entries).toHaveLength(1);
}

describe('main (end to end on a throwaway repository)', () => {
    afterEach(() => {
        for (const dir of dirs.splice(0)) {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('exits 0 when head is within 10% of base', () => {
        const dir = makeRepo({ base: { ms: 100, bench: true }, head: { ms: 105, bench: true } });
        expect(runMain(dir)).toBe(0);
        expectNoWorktreeLeft(dir);
    });

    it('exits 1 when head is 50% slower than base', () => {
        const dir = makeRepo({ base: { ms: 100, bench: true }, head: { ms: 150, bench: true } });
        expect(runMain(dir)).toBe(1);
        expectNoWorktreeLeft(dir);
    });

    it('skips when the base has no bench script', () => {
        const dir = makeRepo({ base: { ms: 100, bench: false }, head: { ms: 100, bench: true } });
        expect(runMain(dir)).toBe(SKIP_EXIT);
        expectNoWorktreeLeft(dir);
    });

    it('skips when the base is HEAD', () => {
        const dir = makeRepo({ base: { ms: 100, bench: true }, head: null });
        expect(main(['--base', 'HEAD', '--runs=2'], dir)).toBe(SKIP_EXIT);
        expectNoWorktreeLeft(dir);
    });

    it('skips when origin/main is missing and no base is given', () => {
        const dir = makeRepo({ base: { ms: 100, bench: true }, head: { ms: 100, bench: true } });
        expect(main(['--runs=2'], dir)).toBe(SKIP_EXIT);
    });

    it('uses the merge base with origin/main when HEAD is ahead of it', () => {
        const dir = makeRepo({ base: { ms: 100, bench: true }, head: { ms: 100, bench: true } });
        git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD~1']);
        expect(main(['--runs=2', '--skip-check'], dir)).toBe(0);
    });

    it('falls back to the last origin/main commit older than a day when HEAD is origin/main', () => {
        const dir = makeRepo({ base: { ms: 100, bench: true }, head: { ms: 100, bench: true } });
        git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
        expect(main(['--runs=2', '--skip-check'], dir)).toBe(SKIP_EXIT);
    });

    it('throws when the base ref does not exist', () => {
        const dir = makeRepo({ base: { ms: 100, bench: true }, head: { ms: 100, bench: true } });
        expect(() => main(['--base', 'nope'], dir)).toThrow();
    });
});

describe('base worktree install', () => {
    it('logs errors only, so npm warnings do not fill the digest', () => {
        expect(BASE_INSTALL_ARGS).toContain('--loglevel=error');
        expect(BASE_INSTALL_ARGS.slice(0, 2)).toEqual(['ci', '--ignore-scripts']);
    });
});
