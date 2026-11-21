import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { run } from '../scripts/experiment.mjs';
import { gitIn, highestId, idsInPaths, nextId, remoteRefs } from '../scripts/lib/experiment-ids.mjs';
import { skeleton } from '../scripts/lib/experiment-new.mjs';
import { listLines, tallyLines } from '../scripts/lib/experiment-report.mjs';
import { branchFiles, renumber } from '../scripts/lib/experiment-renumber.mjs';

/** The ledger directory, spelled so the `test-data` scan reads a fixture path, not the shipped data. */
const LEDGER = join('evals', 'ledger');
const ENV = {
    ...process.env,
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@t',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@t',
};
/** @type {string} */
let dir;
/** @type {string} */
let repo;
const git = (/** @type {string} */ cwd, /** @type {string[]} */ ...args) => {
    const done = spawnSync('git', args, { cwd, encoding: 'utf8', env: ENV });
    if (done.status !== 0) {
        throw new Error(`git ${args.join(' ')}: ${done.stderr}`);
    }
};
const put = (/** @type {string} */ root, /** @type {string} */ path, /** @type {string} */ text) => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
};
const record = (/** @type {string} */ id, over = {}) =>
    JSON.stringify({ id, date: '2026-11-01', hypothesis: 'h', ...over });

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'experiment-'));
    const seed = join(dir, 'seed');
    mkdirSync(seed);
    git(seed, 'init', '-q', '-b', 'main');
    put(seed, `${LEDGER}/E5.json`, record('E5'));
    git(seed, 'add', '.');
    git(seed, 'commit', '-q', '-m', 'init');
    git(dir, 'clone', '-q', '--bare', seed, join(dir, 'remote.git'));
    repo = join(dir, 'repo');
    git(dir, 'clone', '-q', join(dir, 'remote.git'), repo);
    git(repo, 'switch', '-q', '-c', 'feat/mine');
});
afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
});

/** Pushes a branch that holds a ledger record of the given id. */
function pushBranch(/** @type {string} */ name, /** @type {string} */ id) {
    const other = join(dir, `other-${name}`);
    git(dir, 'clone', '-q', join(dir, 'remote.git'), other);
    git(other, 'switch', '-q', '-c', name);
    put(other, `${LEDGER}/${id}.json`, record(id));
    git(other, 'add', '.');
    git(other, 'commit', '-q', '-m', name);
    git(other, 'push', '-q', 'origin', name);
    git(repo, 'fetch', '-q', 'origin');
}

describe('the next id', () => {
    it('reads the ids out of git paths', () => {
        expect(idsInPaths(`${LEDGER}/E7.json\n${LEDGER}/E12.json\nnotes\n${LEDGER}/EX.json\n`)).toEqual([7, 12]);
    });

    it('is one above origin/main when nothing else is open', () => {
        expect(nextId(repo, gitIn(repo))).toBe('E6');
    });

    it('is one above the highest id on any origin branch and in the working tree', () => {
        pushBranch('feat/other', 'E9');
        expect(remoteRefs(gitIn(repo))).toEqual(expect.arrayContaining(['origin/main', 'origin/feat/other']));
        expect(highestId(repo, gitIn(repo))).toBe(9);
        put(repo, `${LEDGER}/E11.json`, record('E11'));
        expect(nextId(repo, gitIn(repo))).toBe('E12');
    });

    it('is E1 in a repository with no ledger and no remote', () => {
        const bare = join(dir, 'bare');
        mkdirSync(bare);
        git(bare, 'init', '-q', '-b', 'main');
        expect(nextId(bare, gitIn(bare))).toBe('E1');
    });
});

describe('new', () => {
    it('prints the next id and writes a record that names its plan, branch and date', () => {
        const print = vi.fn();
        const code = run(['new', '--plan', 'agent-workflow.md', '--task', 'T13', '--stream', 'lane-a'], {
            root: repo,
            today: '2026-11-21',
            print,
        });
        expect(code).toBe(0);
        expect(print).toHaveBeenCalledWith('E6');
        const written = JSON.parse(readFileSync(join(repo, `${LEDGER}/E6.json`), 'utf8'));
        expect(written).toMatchObject({
            id: 'E6',
            plan: 'agent-workflow.md',
            task: 'T13',
            stream: 'lane-a',
            date: '2026-11-21',
            branch: 'feat/mine',
        });
        expect(written.outcome).toBeUndefined();
    });

    it('leaves out the task and the stream when not given', () => {
        expect(skeleton('E1', { plan: 'x.md' }, { date: 'd', branch: 'b' })).not.toHaveProperty('task');
        expect(skeleton('E1', { plan: 'x.md' }, { date: 'd', branch: 'b' })).not.toHaveProperty('stream');
    });

    it('needs a design doc file name', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(run(['new'], { root: repo })).toBe(1);
        expect(run(['new', '--plan', 'Not A Doc'], { root: repo })).toBe(1);
        expect(run(['new', '--plan'], { root: repo })).toBe(1);
        expect(error.mock.calls[0][0]).toContain('new needs --plan');
        expect(existsSync(join(repo, `${LEDGER}/E6.json`))).toBe(false);
    });
});

describe('list and tally', () => {
    const records = [
        { id: 'E1', date: '2026-10-01', hypothesis: 'old', outcome: 'adopted', plan: 'a.md', kind: 'compare' },
        {
            id: 'E2',
            date: '2026-11-02',
            hypothesis: `${'x'.repeat(120)}`,
            outcome: 'falsified',
            plan: 'b.md',
            task: 'T3',
        },
        { id: 'E3', date: '2026-11-03', hypothesis: 'no\noutcome', plan: 'b.md' },
    ];

    it('prints one line per record with the hypothesis cut at 100 characters', () => {
        const lines = listLines(records, {});
        expect(lines).toHaveLength(3);
        expect(lines[0]).toBe('E1  2026-10-01  a.md  -  compare  adopted  old');
        expect(lines[1]).toBe(`E2  2026-11-02  b.md  T3  -  falsified  ${'x'.repeat(100)}`);
        expect(lines[2]).toBe('E3  2026-11-03  b.md  -  -  unrecorded  no outcome');
    });

    it('filters by plan, date and outcome', () => {
        expect(listLines(records, { plan: 'b.md' })).toHaveLength(2);
        expect(listLines(records, { since: '2026-11-03' })).toHaveLength(1);
        expect(listLines(records, { outcome: 'adopted' })).toHaveLength(1);
        expect(listLines(records, { outcome: 'unrecorded' })[0]).toContain('E3');
    });

    it('counts per outcome and per plan, largest first', () => {
        expect(tallyLines(records, {})).toEqual([
            'records 3',
            'outcome',
            '  adopted 1',
            '  falsified 1',
            '  unrecorded 1',
            'plan',
            '  b.md 2',
            '  a.md 1',
        ]);
        expect(tallyLines(records, { since: '2026-11-01' })).toContain('records 2');
    });

    it('runs from the command with filters, and rejects a flag with no value', () => {
        put(repo, `${LEDGER}/E7.json`, record('E7', { plan: 'p.md', outcome: 'adopted' }));
        const print = vi.fn();
        expect(run(['list', '--plan', 'p.md'], { root: repo, print })).toBe(0);
        expect(print).toHaveBeenCalledWith(expect.stringContaining('E7  2026-11-01  p.md'));
        expect(run(['tally', '--since', '2026-01-01'], { root: repo, print })).toBe(0);
        expect(print).toHaveBeenCalledWith('records 2');
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(run(['list', '--plan'], { root: repo, print })).toBe(1);
        expect(run(['list', '--bogus'], { root: repo, print })).toBe(1);
    });

    it('prints the usage for no command or an unknown one', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(run([], { root: repo })).toBe(1);
        expect(run(['frobnicate'], { root: repo })).toBe(1);
        expect(error.mock.calls[0][0]).toContain('usage: node scripts/experiment.mjs new');
    });
});

describe('renumber', () => {
    it('gives the record the next id and rewrites the branch citations of the old one', () => {
        put(repo, `${LEDGER}/E6.json`, record('E6'));
        put(repo, 'evals/decisions/E6/results.md', 'Result of E6, not E60.\n');
        put(repo, 'docs/designs/x.md', 'See E6 and evals/decisions/E6/results.md.\n');
        put(repo, 'docs/untouched.md', 'E6 here is on main, so it is left alone.\n');
        git(repo, 'add', 'docs/untouched.md');
        git(repo, 'commit', '-q', '-m', 'x');
        git(repo, 'push', '-q', 'origin', 'feat/mine:main');
        git(repo, 'fetch', '-q', 'origin');
        pushBranch('feat/other', 'E7');
        const print = vi.fn();
        expect(run(['renumber', 'E6'], { root: repo, print })).toBe(0);
        expect(print).toHaveBeenCalledWith('E6 -> E8; rewrote 3 files');
        expect(existsSync(join(repo, `${LEDGER}/E6.json`))).toBe(false);
        expect(JSON.parse(readFileSync(join(repo, `${LEDGER}/E8.json`), 'utf8')).id).toBe('E8');
        expect(readFileSync(join(repo, 'evals/decisions/E8/results.md'), 'utf8')).toBe('Result of E8, not E60.\n');
        expect(readFileSync(join(repo, 'docs/designs/x.md'), 'utf8')).toBe(
            'See E8 and evals/decisions/E8/results.md.\n',
        );
        expect(readFileSync(join(repo, 'docs/untouched.md'), 'utf8')).toContain('E6 here');
    });

    it('lists the files the branch changed and skips files that are not text', () => {
        put(repo, 'a.md', 'x');
        put(repo, 'pic.png', 'E6');
        expect(branchFiles(gitIn(repo))).toEqual(expect.arrayContaining(['a.md', 'pic.png']));
        put(repo, `${LEDGER}/E6.json`, record('E6'));
        expect(renumber(repo, 'E6', gitIn(repo)).files).toEqual([`${LEDGER}/E7.json`]);
        expect(readFileSync(join(repo, 'pic.png'), 'utf8')).toBe('E6');
    });

    it('refuses when the new id already has a decisions directory', () => {
        put(repo, `${LEDGER}/E6.json`, record('E6'));
        put(repo, 'evals/decisions/E7/results.md', 'x');
        expect(() => renumber(repo, 'E6', gitIn(repo))).toThrow('evals/decisions/E7 already exists');
        expect(existsSync(join(repo, `${LEDGER}/E6.json`))).toBe(true);
    });

    it('refuses to move a record that origin/main already holds', () => {
        expect(() => renumber(repo, 'E5', gitIn(repo))).toThrow('E5 is on origin/main');
        expect(existsSync(join(repo, `${LEDGER}/E5.json`))).toBe(true);
    });

    it('does not rewrite a longer id or a hyphenated suffix of the old one', () => {
        put(repo, `${LEDGER}/E6.json`, record('E6'));
        put(repo, 'n.md', 'E6, E60, xE6, E6-foo\n');
        renumber(repo, 'E6', gitIn(repo));
        expect(readFileSync(join(repo, 'n.md'), 'utf8')).toBe('E7, E60, xE6, E6-foo\n');
    });

    it('names a record that does not exist or an id that is not one', () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(() => renumber(repo, 'E99', gitIn(repo))).toThrow('no record E99');
        expect(() => renumber(repo, '../x', gitIn(repo))).toThrow('no record ../x');
        expect(run(['renumber'], { root: repo })).toBe(1);
        expect(run(['renumber', 'E99'], { root: repo })).toBe(1);
    });
});
