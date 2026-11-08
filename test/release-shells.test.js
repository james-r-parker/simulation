// The command-line shells of the release pipeline, run in-process with fake git, wrangler and files
// (docs/designs/deployment-and-community.md). The libraries they call have their own tests.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildRelease } from '../scripts/build-release.mjs';
import { runDeployPlan } from '../scripts/deploy-plan.mjs';
import { runReleaseCheck } from '../scripts/release-check.mjs';
import { releaseUpload } from '../scripts/release-upload.mjs';

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
