// The command-line shells of the release pipeline, run in-process with fake git, wrangler and files
// (docs/designs/deployment-and-community.md). The libraries they call have their own tests.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRelease, cliDeps as buildDeps } from '../scripts/build-release.mjs';
import { cliDeps as planDeps, runDeployPlan, seasonNextOf, spawnStatus } from '../scripts/deploy-plan.mjs';
import { currentBranch } from '../scripts/lib/release-check.mjs';
import { commentFromEnv } from '../scripts/preview-comment.mjs';
import {
    cliDeps as releaseCheckDeps,
    makeGit,
    makeRulesHashAt,
    runReleaseCheck,
    tempDirs,
} from '../scripts/release-check.mjs';
import { cliDeps as uploadDeps, makeD1Execute, releaseUpload } from '../scripts/release-upload.mjs';

/**
 * @param {{log?: string, seasons?: string}} [out] what `git log` and `git show` print
 * @returns {{git: (args: string[]) => string, calls: string[][]}} a fake git and the calls it saw
 */
function fakeGit({ log = 'fix: a\0', seasons = '[]' } = {}) {
    /** @type {string[][]} */
    const calls = [];
    const git = (/** @type {string[]} */ args) => {
        calls.push(args);
        if (args[0] === 'merge-base') {
            return 'base123\n';
        }
        if (args[0] === 'log') {
            return log;
        }
        return seasons;
    };
    return { git, calls };
}

describe('runReleaseCheck', () => {
    it('passes when the rules hash is unchanged, against origin/<BASE_REF>', () => {
        const { git, calls } = fakeGit();
        const out = runReleaseCheck({
            env: { BASE_REF: 'main' },
            git,
            rulesHashAt: () => 'h1',
            headHash: 'h1',
            headSeasons: '[]',
        });
        expect(out).toEqual({ ok: true, line: 'release-check ok (base main, rulesHash unchanged)' });
        expect(calls[0]).toEqual(['merge-base', 'HEAD', 'origin/main']);
    });

    it('fails a rules change without a breaking commit, and passes it with a breaking PR title', () => {
        const deps = { git: fakeGit().git, rulesHashAt: () => 'h1', headHash: 'h2', headSeasons: '[]' };
        const bad = runReleaseCheck({ ...deps, env: { GITHUB_BASE_REF: 'season/next' } });
        expect(bad.ok).toBe(false);
        expect(JSON.parse(bad.line)).toMatchObject({
            event: 'ReleaseCheckFailed',
            reason: 'rules-change-not-breaking',
        });
        const good = runReleaseCheck({ ...deps, env: { BASE_REF: 'season/next', PR_TITLE: 'feat(sim)!: new rules' } });
        expect(good).toEqual({ ok: true, line: 'release-check ok (base season/next, rulesHash changed)' });
    });
});

describe('buildRelease', () => {
    it('builds the versioned and the latest site, writes the entry and the tarball, and reports its size', () => {
        /** @type {[string, string[], Record<string, string> | undefined][]} */
        const runs = [];
        /** @type {Record<string, string>} */
        const files = {};
        const record = buildRelease('6.1.0', {
            run: (cmd, args, env) => (runs.push([cmd, args, env]), 0),
            writeFile: (file, text) => (files[file] = text),
            sizeOf: () => 1234,
            date: '2026-11-08',
            rules: 'h',
        });
        expect(record).toEqual({ event: 'ReleaseBuilt', version: '6.1.0', season: 6, bytes: 1234 });
        expect(runs[0][1]).toContain('/v/6.1.0/');
        expect(runs[1][1]).toEqual(['vite', 'build', '--base', '/', '--outDir', 'dist', '--emptyOutDir']);
        expect(runs[0][2]).toEqual({ APP_VERSION: '6.1.0' });
        expect(runs[2][0]).toBe('tar');
        expect(JSON.parse(files['release-entry.json'])).toEqual({
            version: '6.1.0',
            season: 6,
            date: '2026-11-08',
            rulesHash: 'h',
        });
    });

    it('refuses a bad version and stops on a failed build or tarball', () => {
        const deps = { writeFile: () => {}, sizeOf: () => 0, date: 'd', rules: 'h' };
        expect(() => buildRelease('6.1', { ...deps, run: () => 0 })).toThrow('usage: build-release');
        expect(() => buildRelease(undefined, { ...deps, run: () => 0 })).toThrow('usage: build-release');
        expect(() => buildRelease('6.1.0', { ...deps, run: () => 1 })).toThrow('vite build --base /v/6.1.0/ failed');
        const tarFails = (/** @type {string} */ cmd) => (cmd === 'tar' ? 2 : 0);
        expect(() => buildRelease('6.1.0', { ...deps, run: tarFails })).toThrow('tar failed');
    });
});

describe('runDeployPlan', () => {
    const wrangler = readFileSync('wrangler.toml', 'utf8');
    /**
     * @param {Record<string, unknown>} run the workflow_run fields to change
     * @returns {(file: string) => string} a reader of the event file and the repository wrangler.toml
     */
    const reader = (run) => (file) =>
        file === 'wrangler.toml'
            ? wrangler
            : JSON.stringify({
                  workflow_run: {
                      conclusion: 'success',
                      event: 'push',
                      head_branch: 'main',
                      head_sha: 'abc1234def',
                      head_repository: { full_name: 'o/r' },
                      pull_requests: [],
                      ...run,
                  },
              });
    const env = { GITHUB_EVENT_PATH: 'event.json', GITHUB_REPOSITORY: 'o/r', GITHUB_OUTPUT: 'out.txt' };

    it('prints and appends the plan of a green push to main (a /next/ deploy)', () => {
        /** @type {string[]} */
        const appended = [];
        const lines = runDeployPlan({
            env,
            readFile: reader({}),
            appendFile: (_f, t) => appended.push(t),
            seasonNext: false,
        });
        expect(lines).toContain('action=next');
        expect(appended.join('')).toBe(`${lines.join('\n')}\n`);
    });

    it('adds a DeploySkipped record on a skip, and needs the event path and repository', () => {
        const lines = runDeployPlan({
            env: { GITHUB_EVENT_PATH: 'event.json', GITHUB_REPOSITORY: 'o/r' },
            readFile: reader({ conclusion: 'failure' }),
            appendFile: () => {},
            seasonNext: false,
        });
        expect(lines).toContain('action=skip');
        expect(JSON.parse(/** @type {string} */ (lines.at(-1)))).toMatchObject({ event: 'DeploySkipped' });
        expect(() => runDeployPlan({ env: {}, readFile: reader({}), appendFile: () => {}, seasonNext: false })).toThrow(
            'GITHUB_EVENT_PATH and GITHUB_REPOSITORY are required',
        );
    });
});

describe('releaseUpload', () => {
    const entry = JSON.stringify({ version: '6.1.0', season: 6, date: '2026-11-07', rulesHash: 'h' });

    it('inserts a release that is not stored, on the named database', () => {
        /** @type {[string, string][]} */
        const statements = [];
        const record = releaseUpload(['entry.json', '--db', 'blob-library-preview'], {
            readFile: () => entry,
            execute: (db, sql) => (statements.push([db, sql]), []),
            now: () => 5,
        });
        expect(record).toMatchObject({ event: 'ReleaseUploaded', version: '6.1.0', action: 'insert', wallMs: 0 });
        expect(statements.map(([db]) => db)).toEqual(['blob-library-preview', 'blob-library-preview']);
    });

    it('does nothing for an identical stored row, on blob-library by default', () => {
        const stored = { version: '6.1.0', season: 6, released: '2026-11-07', rules_hash: 'h' };
        /** @type {string[]} */
        const dbs = [];
        const record = releaseUpload(['entry.json'], {
            readFile: () => entry,
            execute: (db) => (dbs.push(db), [stored]),
            now: () => 0,
        });
        expect(record.action).toBe('noop');
        expect(dbs).toEqual(['blob-library']);
    });
});

/**
 * @param {Record<string, {status: number, stdout?: string, stderr?: string}>} byCmd the result for each command
 * @returns {{spawn: (cmd: string, args: string[]) => {status: number, stdout: string, stderr: string}, calls: string[][]}}
 *   a fake process runner and the command lines it saw
 */
function fakeSpawn(byCmd) {
    /** @type {string[][]} */
    const calls = [];
    const spawn = (/** @type {string} */ cmd, /** @type {string[]} */ args) => {
        calls.push([cmd, ...args]);
        const { status, stdout = '', stderr = '' } = byCmd[cmd] ?? { status: 0 };
        return { status, stdout, stderr };
    };
    return { spawn, calls };
}

describe('the process wrappers', () => {
    it('makeGit returns the output and throws with stderr when git fails', () => {
        expect(makeGit(fakeSpawn({ git: { status: 0, stdout: 'abc' } }).spawn)(['rev-parse', 'HEAD'])).toBe('abc');
        const failing = makeGit(fakeSpawn({ git: { status: 1, stderr: 'bad ref' } }).spawn);
        expect(() => failing(['show', 'x'])).toThrow('git show x failed: bad ref');
    });

    it('makeRulesHashAt hashes in a temporary worktree and always removes it', () => {
        /** @type {string[]} */
        const removed = [];
        const ok = fakeSpawn({ git: { status: 0 }, node: { status: 0, stdout: 'h9\n' } });
        const hashAt = makeRulesHashAt({ spawn: ok.spawn, tempDir: () => '/tmp/w', removeDir: (d) => removed.push(d) });
        expect(hashAt('base123')).toBe('h9');
        expect(ok.calls[0]).toEqual(['git', 'worktree', 'add', '--detach', '/tmp/w', 'base123']);
        expect(ok.calls.at(-1)).toEqual(['git', 'worktree', 'remove', '--force', '/tmp/w']);
        const bad = fakeSpawn({ git: { status: 0 }, node: { status: 1, stderr: 'boom' } });
        const failing = makeRulesHashAt({
            spawn: bad.spawn,
            tempDir: () => '/tmp/v',
            removeDir: (d) => removed.push(d),
        });
        expect(() => failing('s1')).toThrow('cannot hash the rules at s1: boom');
        expect(removed).toEqual(['/tmp/w', '/tmp/v']);
    });

    it('makeD1Execute runs one remote statement and returns its rows, or throws with stderr', () => {
        const ok = fakeSpawn({ wr: { status: 0, stdout: JSON.stringify([{ results: [{ n: 1 }] }]) } });
        expect(makeD1Execute(ok.spawn, 'wr')('blob-library', 'SELECT 1')).toEqual([{ n: 1 }]);
        expect(ok.calls[0]).toEqual([
            'wr',
            'd1',
            'execute',
            'blob-library',
            '--remote',
            '--json',
            '--command',
            'SELECT 1',
        ]);
        expect(makeD1Execute(fakeSpawn({ wr: { status: 0, stdout: '[]' } }).spawn, 'wr')('db', 'x')).toEqual([]);
        const bad = makeD1Execute(fakeSpawn({ wr: { status: 1, stderr: 'auth' } }).spawn, 'wr');
        expect(() => bad('db', 'x')).toThrow('d1 execute failed: auth');
    });
});

describe('the real dependencies of each shell', () => {
    it('release-check reads this tree: its git runs, and its hash and seasons file are this checkout', () => {
        const deps = releaseCheckDeps({ BASE_REF: 'main' });
        expect(deps.git(['--version'])).toMatch(/^git version/);
        expect(deps.headHash).toMatch(/^[0-9a-f]+$/);
        expect(deps.headSeasons).toBe(readFileSync('library/seasons.json', 'utf8'));
        expect(typeof deps.rulesHashAt).toBe('function');
    });

    it('build-release runs commands, writes and sizes files, and stamps the date and rules hash', () => {
        const deps = buildDeps();
        expect(deps.run('node', ['-e', 'process.exit(0)'])).toBe(0);
        expect(
            deps.run('node', ['-e', 'process.exit(process.env.APP_VERSION === "6.1.0" ? 0 : 3)'], {
                APP_VERSION: '6.1.0',
            }),
        ).toBe(0);
        const dir = mkdtempSync(join(tmpdir(), 'build-deps-'));
        const file = join(dir, 'x.txt');
        deps.writeFile(file, 'abcd');
        expect(deps.sizeOf(file)).toBe(4);
        rmSync(dir, { recursive: true });
        expect(deps.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(deps.rules).toMatch(/^[0-9a-f]+$/);
    });

    it('deploy-plan reads and appends real files and asks git for season/next', () => {
        const dir = mkdtempSync(join(tmpdir(), 'plan-deps-'));
        const file = join(dir, 'out.txt');
        const deps = planDeps({ GITHUB_REPOSITORY: 'o/r' }, true);
        deps.appendFile(file, 'a=1\n');
        deps.appendFile(file, 'b=2\n');
        expect(deps.readFile(file)).toBe('a=1\nb=2\n');
        expect(deps.seasonNext).toBe(true);
        rmSync(dir, { recursive: true });
        expect(seasonNextOf((cmd, args) => (cmd === 'git' && args.includes('season/next') ? 0 : 2))).toBe(true);
        expect(seasonNextOf(() => 2)).toBe(false);
    });

    it('release-upload reads files, runs the named wrangler and has a clock', () => {
        const deps = uploadDeps({ WRANGLER: 'false' });
        expect(deps.readFile('package.json')).toContain('"name"');
        expect(() => deps.execute('db', 'SELECT 1')).toThrow('d1 execute failed');
        expect(deps.now()).toBeGreaterThan(0);
    });

    it('preview-comment needs URL and SHA and renders the comment', () => {
        expect(commentFromEnv({ URL: 'https://pr-7.x.pages.dev', SHA: 'abc' })).toContain('https://pr-7.x.pages.dev');
        expect(() => commentFromEnv({ URL: '', SHA: 'abc' })).toThrow('URL and SHA are required');
        expect(() => commentFromEnv({ URL: 'u' })).toThrow('URL and SHA are required');
    });
});

describe('the small real helpers', () => {
    it('tempDirs makes a fresh temp directory and removes it', () => {
        const { tempDir, removeDir } = tempDirs();
        const dir = tempDir();
        expect(dir).toContain('release-check-');
        writeFileSync(join(dir, 'f'), 'x');
        removeDir(dir);
        expect(existsSync(dir)).toBe(false);
    });

    it('spawnStatus returns a command exit status', () => {
        expect(spawnStatus('node', ['-e', 'process.exit(0)'])).toBe(0);
        expect(spawnStatus('node', ['-e', 'process.exit(4)'])).toBe(4);
    });

    it('currentBranch asks git outside CI and returns a string', () => {
        expect(typeof currentBranch({ env: {} })).toBe('string');
        expect(currentBranch({ env: { GITHUB_BASE_REF: 'season/next' } })).toBe('season/next');
    });
});
