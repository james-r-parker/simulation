import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';
import { classify, countByClass, parseWorktreeList } from '../scripts/lib/worktree-gc.mjs';
import { listWorktrees, main as gcMain, processesIn } from '../scripts/lib/worktree-gc-main.mjs';

const clean = {
    path: '/w/a',
    branch: 'feat/a',
    head: 'abc',
    isMain: false,
    isCaller: false,
    locked: false,
    missing: false,
    processes: [],
    runInFlight: false,
    runLogs: false,
    porcelain: '',
    headInMain: true,
    mergedPrs: [{ number: 1, headRefOid: 'abc' }],
};

describe('classify', () => {
    it('classes a clean worktree wholly in a merged PR as safe', () => {
        expect(classify(clean).cls).toBe('safe');
        expect(classify({ ...clean, headInMain: false }).cls).toBe('safe');
    });

    it('never classes a worktree something uses as safe', () => {
        for (const patch of [
            { isMain: true },
            { isCaller: true },
            { locked: true },
            { processes: [123] },
            { runInFlight: true },
            { runLogs: true },
        ]) {
            expect(classify({ ...clean, ...patch }).cls, JSON.stringify(patch)).toBe('live');
        }
    });

    it('classes uncommitted or untracked files as dirty, even on a merged branch', () => {
        expect(classify({ ...clean, porcelain: '?? new.txt\n M a.js\n' })).toEqual({
            cls: 'dirty',
            reason: '2 uncommitted or untracked files',
        });
    });

    it('classes a branch the merged PR does not wholly hold, or that gh cannot vouch for, as unmerged', () => {
        const base = { ...clean, headInMain: false };
        expect(classify({ ...base, mergedPrs: [{ number: 1, headRefOid: 'old' }] }).cls).toBe('unmerged');
        expect(classify({ ...base, mergedPrs: [] }).reason).toBe('no merged PR');
        expect(classify({ ...clean, mergedPrs: null }).reason).toContain('gh could not');
        expect(classify({ ...clean, branch: null }).reason).toBe('detached HEAD');
    });

    it('classes a missing directory as gone', () => {
        expect(classify({ ...clean, missing: true }).cls).toBe('gone');
    });

    it('counts every class', () => {
        expect(countByClass([{ cls: 'safe' }, { cls: 'safe' }, { cls: 'live' }])).toEqual({
            safe: 2,
            dirty: 0,
            unmerged: 0,
            live: 1,
            gone: 0,
        });
    });
});

describe('parseWorktreeList', () => {
    it('reads path, head, branch, lock and prunable', () => {
        const text = [
            'worktree /r\nHEAD aaa\nbranch refs/heads/main',
            'worktree /r/w\nHEAD bbb\nbranch refs/heads/feat/x\nlocked busy',
            'worktree /r/d\nHEAD ccc\ndetached\nprunable gitdir file points to non-existent location',
        ].join('\n\n');
        expect(parseWorktreeList(`${text}\n`)).toEqual([
            { path: '/r', head: 'aaa', branch: 'main', locked: false, prunable: false },
            { path: '/r/w', head: 'bbb', branch: 'feat/x', locked: true, prunable: false },
            { path: '/r/d', head: 'ccc', branch: null, locked: false, prunable: true },
        ]);
    });
});

// A fixture repository: a bare origin, a main clone and worktrees in each state. gh is a stub that answers `pr list` from
// a file per branch (GH_DIR); nothing touches the real worktrees or the network.
const GC = resolve('scripts/worktree-gc.sh');
const TIMEOUT = scaleTimeout(60_000);
const GH_STUB = `#!/usr/bin/env bash
[[ -n "\${GH_FAIL:-}" ]] && exit 1
branch=""
while [[ $# -gt 0 ]]; do [[ "$1" == "--head" ]] && branch="$2"; shift; done
file="$GH_DIR/\${branch//\\//_}.json"
if [[ -f "$file" ]]; then cat "$file"; else echo "[]"; fi
`;

let dir = '';
let main = '';
/** @type {Record<string, string | undefined>} */
let env = {};
/** @type {import('node:child_process').ChildProcess[]} */
let children = [];

/**
 * @param {string} cwd where to run
 * @param {string[]} args git arguments
 * @returns {string} trimmed stdout
 */
function git(cwd, args) {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', env });
    expect(r.status, `${args.join(' ')}: ${r.stderr}`).toBe(0);
    return r.stdout.trim();
}

/**
 * Makes a worktree on a new branch with one commit and, when `merged`, merges the branch into main, pushes main and
 * records a merged PR for it (the way a GitHub merge commit leaves it).
 * @param {string} name the branch and directory name
 * @param {boolean} merged whether the branch is merged
 * @param {boolean} [outside] whether it sits outside `<main>/.claude/worktrees`
 * @returns {string} the worktree path
 */
function addWorktree(name, merged, outside = false) {
    const path = outside ? join(dir, 'trees', name) : join(main, '.claude', 'worktrees', name);
    git(main, ['worktree', 'add', '-q', '-b', `feat/${name}`, path, 'origin/main']);
    writeFileSync(join(path, `${name}.txt`), name);
    git(path, ['add', '.']);
    git(path, ['commit', '-q', '-m', name]);
    if (merged) {
        const oid = git(path, ['rev-parse', 'HEAD']);
        git(main, ['merge', '-q', '--no-ff', '-m', `merge ${name}`, `feat/${name}`]);
        git(main, ['push', '-q', 'origin', 'main']);
        writeFileSync(join(dir, 'gh', `feat_${name}.json`), JSON.stringify([{ number: 7, headRefOid: oid }]));
    }
    return path;
}

/**
 * @param {string[]} args script arguments
 * @param {{cwd?: string, env?: Record<string, string>}} [options] where to run, extra environment
 * @returns {{status: number | null, stdout: string, stderr: string}} the outcome
 */
function gc(args, options = {}) {
    const r = spawnSync(GC, args, { cwd: options.cwd ?? main, encoding: 'utf8', env: { ...env, ...options.env } });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/**
 * @param {string} name a worktree name
 * @returns {string} the class `--list` prints for it
 */
function classOf(name) {
    const row = gc(['--list', '--json']).stdout;
    const found = JSON.parse(row).worktrees.find((/** @type {{path: string}} */ w) => w.path.endsWith(`/${name}`));
    return found.cls;
}

beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'worktree-gc-')));
    mkdirSync(join(dir, 'bin'));
    mkdirSync(join(dir, 'gh'));
    mkdirSync(join(dir, 'trees'));
    writeFileSync(join(dir, 'bin', 'gh'), GH_STUB);
    chmodSync(join(dir, 'bin', 'gh'), 0o755);
    env = {
        ...process.env,
        PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
        GH_DIR: join(dir, 'gh'),
        GIT_AUTHOR_NAME: 't',
        GIT_AUTHOR_EMAIL: 't@t',
        GIT_COMMITTER_NAME: 't',
        GIT_COMMITTER_EMAIL: 't@t',
    };
    git(dir, ['init', '-q', '--bare', '-b', 'main', 'origin.git']);
    main = join(dir, 'main');
    git(dir, ['clone', '-q', 'origin.git', 'main']);
    writeFileSync(join(main, '.gitignore'), '.runs\n');
    git(main, ['add', '.']);
    git(main, ['commit', '-q', '-m', 'init']);
    git(main, ['push', '-q', 'origin', 'HEAD:main']);
    git(main, ['fetch', '-q', 'origin']);
    children = [];
});
afterEach(() => {
    vi.unstubAllEnvs();
    for (const child of children) {
        child.kill();
    }
    rmSync(dir, { recursive: true, force: true });
});

describe('worktree-gc.sh', { timeout: TIMEOUT }, () => {
    it('lists a merged clean worktree as safe and the main checkout as live', () => {
        addWorktree('done', true);
        const out = gc(['--list']);
        expect(out.status).toBe(0);
        expect(out.stdout).toMatch(/^safe +.*\/worktrees\/done +feat\/done/m);
        expect(out.stdout).toMatch(/^live +.*\/main +main .*main checkout/m);
        expect(out.stdout).toContain('safe=1 dirty=0 unmerged=0 live=1 gone=0');
    });

    it('keeps a worktree with an untracked or uncommitted file, though its branch is merged', () => {
        const path = addWorktree('dirty', true);
        writeFileSync(join(path, 'scratch.txt'), 'x');
        expect(classOf('dirty')).toBe('dirty');
        writeFileSync(join(path, 'dirty.txt'), 'changed');
        expect(classOf('dirty')).toBe('dirty');
    });

    it('keeps a branch with no merged PR, and one with a commit after the merge', () => {
        addWorktree('open', false);
        const path = addWorktree('after', true);
        writeFileSync(join(path, 'more.txt'), 'x');
        git(path, ['add', '.']);
        git(path, ['commit', '-q', '-m', 'after the merge']);
        expect(classOf('open')).toBe('unmerged');
        expect(classOf('after')).toBe('unmerged');
    });

    it('classes nothing safe when gh cannot answer', () => {
        addWorktree('done', true);
        const out = JSON.parse(gc(['--list', '--json'], { env: { GH_FAIL: '1' } }).stdout);
        expect(out.counts.safe).toBe(0);
    });

    it('keeps a worktree with a process running in it', () => {
        const path = addWorktree('busy', true);
        children.push(spawn('sleep', ['60'], { cwd: path, stdio: 'ignore' }));
        expect(classOf('busy')).toBe('live');
        expect(gc(['--list']).stdout).toMatch(/a process runs in it/);
    });

    it('keeps a worktree whose .runs holds a run log or a run in flight', () => {
        const logged = addWorktree('logged', true);
        mkdirSync(join(logged, '.runs'));
        writeFileSync(join(logged, '.runs', 'e1.log'), 'seed 1 done');
        writeFileSync(join(logged, '.runs', 'e1.done'), '0');
        const flying = addWorktree('flying', true);
        mkdirSync(join(flying, '.runs'));
        const run = { name: 'e2', pid: process.pid, dir: join(flying, '.runs'), cmd: 'x', cwd: flying, started: 's' };
        writeFileSync(join(flying, '.runs', 'runs.json'), JSON.stringify([run]));
        expect(classOf('logged')).toBe('live');
        expect(classOf('flying')).toBe('live');
        expect(gc(['--list']).stdout).toMatch(/run is in flight/);
    });

    it('keeps the calling session worktree and a locked one', () => {
        const path = addWorktree('caller', true);
        git(main, ['worktree', 'lock', '--reason', 'busy', addWorktree('locked', true)]);
        const out = JSON.parse(gc(['--list', '--json'], { cwd: path }).stdout);
        const byName = Object.fromEntries(out.worktrees.map((/** @type {any} */ w) => [w.path.split('/').pop(), w]));
        expect(byName.caller.cls).toBe('live');
        expect(byName.caller.reason).toContain('calling session');
        expect(byName.locked.cls).toBe('live');
    });

    it('removes only the safe worktrees and their branches, and never forces', () => {
        const safe = addWorktree('done', true);
        const dirty = addWorktree('dirty', true);
        writeFileSync(join(dirty, 'scratch.txt'), 'x');
        const open = addWorktree('open', false);
        const out = gc([]);
        expect(out.status).toBe(0);
        expect(out.stdout).toContain(`removed ${safe}`);
        expect(existsSync(safe)).toBe(false);
        expect(git(main, ['branch', '--list', 'feat/done'])).toBe('');
        expect(existsSync(dirty)).toBe(true);
        expect(existsSync(open)).toBe(true);
        expect(git(main, ['branch', '--list', 'feat/dirty', 'feat/open']).split('\n')).toHaveLength(2);
    });

    it('lists a safe worktree outside .claude/worktrees as outside and removes it only with --all', () => {
        const inside = addWorktree('done', true);
        const stream = addWorktree('stream', true, true);
        const listed = gc(['--list']).stdout;
        expect(listed).toMatch(/^safe +.*\/trees\/stream .*\[outside .claude\/worktrees: kept unless --all\]/m);
        expect(listed).not.toMatch(/worktrees\/done .*outside/);
        const out = gc([]);
        expect(out.stdout).toContain(`removed ${inside}`);
        expect(existsSync(inside)).toBe(false);
        expect(existsSync(stream)).toBe(true);
        expect(git(main, ['branch', '--list', 'feat/stream'])).not.toBe('');
        const all = gc(['--all']);
        expect(all.stdout).toContain(`removed ${stream}`);
        expect(existsSync(stream)).toBe(false);
    });

    it('--list never removes, even with --all', () => {
        const stream = addWorktree('stream', true, true);
        expect(gc(['--list', '--all']).status).toBe(0);
        expect(existsSync(stream)).toBe(true);
    });

    it('rejects an unknown argument and a directory outside a repository', () => {
        expect(gc(['--force']).status).toBe(2);
        expect(gc(['--list'], { cwd: tmpdir(), env: { GIT_CEILING_DIRECTORIES: tmpdir() } }).status).toBe(1);
    });
});

describe('worktree-gc in process', { timeout: TIMEOUT }, () => {
    /**
     * Runs `main` here with the stub gh first on PATH.
     * @param {string[]} args main's arguments
     * @param {string} [cwd] the directory it runs in
     * @returns {{status: number, out: string, err: string}} the exit code and what it printed
     */
    function runMain(args, cwd = main) {
        vi.stubEnv('PATH', String(env.PATH));
        vi.stubEnv('GH_DIR', join(dir, 'gh'));
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const status = gcMain(args, cwd);
        const out = log.mock.calls.flat().join('\n');
        const err = error.mock.calls.flat().join('\n');
        log.mockRestore();
        error.mockRestore();
        return { status, out, err };
    }

    /** @param {string} script the body of a replacement gh */
    function stubGh(script) {
        writeFileSync(join(dir, 'bin', 'gh'), `#!/usr/bin/env bash\n${script}\n`);
    }

    it('lists as text and as json, and removes the safe worktree', () => {
        const safe = addWorktree('done', true);
        addWorktree('open', false);
        const listed = runMain(['--list']);
        expect(listed.status).toBe(0);
        expect(listed.out).toMatch(/^safe +.*\/done +feat\/done/m);
        expect(listed.out).toContain('safe=1 dirty=0 unmerged=1 live=1 gone=0');
        expect(JSON.parse(runMain(['--list', '--json']).out).counts.safe).toBe(1);
        const removed = runMain([]);
        expect(removed.status).toBe(0);
        expect(removed.out).toContain(`removed ${safe}`);
        expect(existsSync(safe)).toBe(false);
    });

    it('exits 1 and keeps the worktree when git refuses to remove a safe one', () => {
        const racy = addWorktree('racy', true);
        const real = join(dir, 'gh', 'feat_racy.json');
        stubGh(`git worktree lock "$PWD"; cat "${real}"`);
        const out = runMain([]);
        expect(out.status).toBe(1);
        expect(out.err).toContain(`kept ${racy}`);
        expect(existsSync(racy)).toBe(true);
    });

    it('classes a worktree unmerged when gh prints something that is not json', () => {
        addWorktree('done', true);
        stubGh('echo "not json"');
        const rows = listWorktrees(main) ?? [];
        expect(rows.find((r) => r.path.endsWith('/done'))?.cls).toBe('unmerged');
    });

    it('classes a worktree whose directory is gone', () => {
        const path = addWorktree('vanished', true);
        rmSync(path, { recursive: true });
        const rows = listWorktrees(main) ?? [];
        expect(rows.find((r) => r.path.endsWith('/vanished'))).toMatchObject({ cls: 'gone', outside: false });
    });

    it('reports usage, and no repository', () => {
        expect(runMain(['--force']).status).toBe(2);
        vi.stubEnv('GIT_CEILING_DIRECTORIES', tmpdir());
        expect(runMain(['--list'], tmpdir()).err).toContain('not inside a git repository');
    });

    it('finds the processes whose working directory is inside a directory', () => {
        const path = addWorktree('busy', true);
        expect(processesIn(path)).toEqual([]);
        const child = spawn('sleep', ['60'], { cwd: path, stdio: 'ignore' });
        children.push(child);
        expect(processesIn(path)).toContain(child.pid);
        expect(processesIn(`${path}${'/'}`)).toContain(child.pid);
        expect(processesIn(join(dir, 'nowhere'))).toEqual([]);
    });
});
