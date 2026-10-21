import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseArgs, prepareRefTree } from '../scripts/bench-micro.mjs';

/** @type {string[]} */
const dirs = [];

/**
 * @param {string} dir the directory to run git in
 * @param {string[]} args git arguments
 * @returns {string} stdout
 */
function git(dir, args) {
    // A pre-commit hook exports GIT_DIR and GIT_INDEX_FILE: a child git that inherited them would act on the real repo.
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
    const who = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
    return execFileSync('git', args, { cwd: dir, env: { ...env, ...who }, encoding: 'utf8' });
}

/**
 * @param {string} lock the package-lock.json text
 * @returns {string} a repository with one commit holding that lock file
 */
function repoWithLock(lock) {
    const dir = mkdtempSync(join(tmpdir(), 'bench-micro-test-'));
    dirs.push(dir);
    git(dir, ['init', '-q', '-b', 'main']);
    writeFileSync(join(dir, 'package-lock.json'), lock);
    git(dir, ['add', '.']);
    git(dir, ['commit', '-q', '-m', 'init']);
    return dir;
}

afterEach(() => {
    for (const dir of dirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true });
    }
});

describe('parseArgs', () => {
    it('defaults to this tree alone, three runs and no filter', () => {
        expect(parseArgs([])).toEqual({ compare: null, runs: 3, filter: null });
    });

    it('reads --compare, --runs and --filter', () => {
        expect(parseArgs(['--compare', 'origin/main', '--runs', '5', '--filter', 'hebbian'])).toEqual({
            compare: 'origin/main',
            runs: 5,
            filter: 'hebbian',
        });
    });

    it('rejects a missing value, a bad run count and an unknown flag', () => {
        expect(() => parseArgs(['--compare'])).toThrow(/--compare needs a value/);
        expect(() => parseArgs(['--filter', ''])).toThrow(/--filter needs a value/);
        expect(() => parseArgs(['--runs', '0'])).toThrow(/--runs must be an integer >= 1/);
        expect(() => parseArgs(['--bogus'])).toThrow(/unknown argument: --bogus/);
    });
});

describe('prepareRefTree', () => {
    /**
     * @param {string} headLock the lock file text committed after the ref
     * @returns {{head: string, ref: string, refTree: string}} a head repo, the ref's sha and a bare ref tree
     */
    function setup(headLock) {
        const head = repoWithLock('{"v":1}');
        const ref = git(head, ['rev-parse', 'HEAD']).trim();
        writeFileSync(join(head, 'package-lock.json'), headLock);
        git(head, ['commit', '-q', '--allow-empty', '-am', 'second']);
        mkdirSync(join(head, 'bench', 'micro'), { recursive: true });
        writeFileSync(join(head, 'bench', 'micro', 'x.bench.js'), '// bench');
        writeFileSync(join(head, 'vitest.config.js'), '// config');
        mkdirSync(join(head, 'node_modules'));
        const refTree = mkdtempSync(join(tmpdir(), 'bench-micro-ref-'));
        dirs.push(refTree);
        return { head, ref, refTree };
    }

    it("copies this tree's bench files and config, and links node_modules when the lock file is unchanged", () => {
        const { head, ref, refTree } = setup('{"v":1}');
        prepareRefTree(refTree, head, ref);
        expect(existsSync(join(refTree, 'bench', 'micro', 'x.bench.js'))).toBe(true);
        expect(existsSync(join(refTree, 'vitest.config.js'))).toBe(true);
        expect(lstatSync(join(refTree, 'node_modules')).isSymbolicLink()).toBe(true);
    });

    it('installs rather than links when the lock file differs', () => {
        const { head, ref, refTree } = setup('{"v":2}');
        // The ref tree has no package.json, so the install fails: proof it was tried instead of a link.
        expect(() => prepareRefTree(refTree, head, ref)).toThrow();
        expect(existsSync(join(refTree, 'node_modules'))).toBe(false);
    });
});
