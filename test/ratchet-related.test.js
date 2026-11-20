// scripts/ratchet-related.mjs on a temporary git repo, with a stand-in for vitest that writes the coverage it is told to.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { changedFiles, main } from '../scripts/ratchet-related.mjs';

const BASELINE = JSON.stringify({
    coverage: { 'js/sim': { lines: 100, branches: 100, functions: 100, statements: 100 }, scripts: { lines: 90 } },
});

let root = '';
beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ratchet-related-'));
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, 'js/sim'), { recursive: true });
    writeFileSync(join(root, 'scripts/quality-baseline.json'), BASELINE);
    writeFileSync(join(root, 'js/sim/a.js'), 'export const a = 1;\n');
    git('init', '-q', '-b', 'main');
    git('add', '-A');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'base');
    git('checkout', '-q', '-b', 'feature');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

/**
 * @param {...string} args git arguments
 * @returns {void}
 */
function git(...args) {
    spawnSync('git', args, { cwd: root, env: { PATH: process.env.PATH, HOME: root } });
}

/**
 * Writes a vitest stand-in: it records its arguments, writes `covered` of 4 for every metric of js/sim/a.js into the
 * --coverage.reportsDirectory it is given, and exits with `status`.
 * @param {number} covered covered count out of 4
 * @param {number} [status] exit status
 * @returns {string} its path
 */
function fakeVitest(covered, status = 0) {
    const fake = join(root, 'fake-vitest');
    const metrics = ['lines', 'branches', 'functions', 'statements'].map(
        (m) => `"${m}":{"total":4,"covered":${covered}}`,
    );
    const summary = `{"${join(root, 'js/sim/a.js')}":{${metrics.join(',')}}}`;
    const script = `#!/usr/bin/env bash
echo "$@" > "${join(root, 'args.txt')}"
for a in "$@"; do case "$a" in --coverage.reportsDirectory=*) d="\${a#*=}"; echo '${summary}' > "$d/coverage-summary.json";; esac; done
exit ${status}
`;
    writeFileSync(fake, script, { mode: 0o755 });
    return fake;
}

/**
 * Runs main, collecting what it prints.
 * @param {string} vitest the vitest stand-in
 * @returns {{status: number, out: string}} the exit status and the printed lines
 */
function run(vitest) {
    /** @type {string[]} */
    const lines = [];
    const log = console.log;
    const error = console.error;
    console.log = (line) => lines.push(String(line));
    console.error = (line) => lines.push(String(line));
    try {
        return { status: main(['--base', 'main'], { root, vitest }), out: lines.join('\n') };
    } finally {
        console.log = log;
        console.error = error;
    }
}

describe('changedFiles', () => {
    it('lists committed, unstaged and new files against the merge base, once each', () => {
        writeFileSync(join(root, 'js/sim/a.js'), 'export const a = 2;\n');
        writeFileSync(join(root, 'js/sim/new.js'), 'export const b = 1;\n');
        expect(changedFiles(root, 'main').sort()).toEqual(['js/sim/a.js', 'js/sim/new.js']);
    });

    it('lists nothing for an unchanged branch', () => {
        expect(changedFiles(root, 'main')).toEqual([]);
    });
});

describe('ratchet-related main', () => {
    it('skips with a notice (status 3) when no changed file is under a 100% baseline', () => {
        writeFileSync(join(root, 'scripts/x.mjs'), 'export const x = 1;\n');
        const { status, out } = run(fakeVitest(0));
        expect(status).toBe(3);
        expect(out).toContain('no changed file under a 100% coverage baseline');
        expect(existsSync(join(root, 'args.txt'))).toBe(false);
    });

    it('runs the related tests with coverage limited to the changed 100% file, and passes at 100%', () => {
        writeFileSync(join(root, 'js/sim/a.js'), 'export const a = 2;\n');
        const { status, out } = run(fakeVitest(4));
        expect(status).toBe(0);
        expect(out).toContain('1 changed file(s) at 100%');
        const args = readFileSync(join(root, 'args.txt'), 'utf8');
        expect(args).toContain('related --run');
        expect(args).toContain('--coverage.include=js/sim/a.js');
        expect(args).toContain('--exclude **/*.slow.test.js');
        expect(args.trim().endsWith('js/sim/a.js')).toBe(true);
    });

    it('fails a changed file below 100% and names it', () => {
        writeFileSync(join(root, 'js/sim/a.js'), 'export const a = 2;\n');
        const { status, out } = run(fakeVitest(3));
        expect(status).toBe(1);
        expect(out).toContain('js/sim/a.js: lines 3/4');
        expect(out).toContain('*.slow.test.js');
    });

    it('fails when the related tests fail, without reading coverage', () => {
        writeFileSync(join(root, 'js/sim/a.js'), 'export const a = 2;\n');
        const { status, out } = run(fakeVitest(4, 1));
        expect(status).toBe(1);
        expect(out).toContain('the related tests failed');
    });

    it('never writes the baseline', () => {
        writeFileSync(join(root, 'js/sim/a.js'), 'export const a = 2;\n');
        run(fakeVitest(4));
        expect(readFileSync(join(root, 'scripts/quality-baseline.json'), 'utf8')).toBe(BASELINE);
    });
});
