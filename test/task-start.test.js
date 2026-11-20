import { spawnSync } from 'node:child_process';
import {
    chmodSync,
    copyFileSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { describeNext, nextChunk } from '../scripts/lib/plan-next-chunk.mjs';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

const PLAN = `# Demo

**Status:** In progress - phase 1 built

### Phase 1 - First (built)

| Chunk | Tasks  | Builder |
| ----- | ------ | ------- |
| A     | T1, T2 | Sonnet  |

### Phase 2 - Second

| Chunk | Tasks        | Builder |
| ----- | ------------ | ------- |
| B     | T3 to T4a    | Haiku   |
| C     | T5           | Sonnet  |

## Task breakdown

| #   | Task | Nature       | Depends on |
| --- | ---- | ------------ | ---------- |
| T1  | one (built) | [mechanical] | - |
| T2  | two (built) | [mechanical] | - |
| T3  | three | [mechanical] | - |
| T4  | four | [mechanical] | - |
| T4a | four a | [mechanical] | - |
| T5  | five | [judgement] | - |
`;

describe('nextChunk', () => {
    it('names the first chunk of the first unbuilt phase with its task rows, ranges expanded', () => {
        const found = nextChunk(PLAN);
        expect(found?.chunk).toBe('B');
        expect(found?.builder).toBe('Haiku');
        expect(found?.status).toBe('In progress - phase 1 built');
        expect(found?.tasks.map((t) => t.split('|')[1].trim())).toEqual(['T3', 'T4', 'T4a']);
    });

    it('skips a chunk whose task rows are all built, and returns null when none is left', () => {
        const partly = PLAN.replace('three |', 'three (built) |')
            .replace('four |', 'four (built) |')
            .replace('four a |', 'four a (built) |');
        expect(nextChunk(partly)?.chunk).toBe('C');
        expect(nextChunk(partly.replace('five |', 'five (built) |'))).toBeNull();
    });

    it('prints a report for a file', () => {
        const dir = mkdtempSync(join(tmpdir(), 'plan-chunk-'));
        try {
            writeFileSync(join(dir, 'p.md'), PLAN);
            const text = describeNext(join(dir, 'p.md'));
            expect(text).toContain('Next chunk: B');
            expect(text).toContain('| T3  | three');
            writeFileSync(join(dir, 'q.md'), '# none\n');
            expect(describeNext(join(dir, 'q.md'))).toContain('no unbuilt chunk');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

let dir = '';
let main = '';
let env = {};

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
 * @param {string[]} args task-start.sh arguments
 * @param {string} [cwd] where to run it
 * @returns {{status: number | null, stdout: string, stderr: string}} the outcome
 */
function start(args, cwd = main) {
    const r = spawnSync(join(main, 'scripts/task-start.sh'), args, { cwd, encoding: 'utf8', env });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'task-start-'));
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    // A stub npm that records its call and makes a node_modules, so no test installs anything.
    writeFileSync(join(bin, 'npm'), '#!/usr/bin/env bash\necho "$@" >>"$PWD/.npm-calls"\nmkdir -p node_modules\n');
    chmodSync(join(bin, 'npm'), 0o755);
    env = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        GIT_AUTHOR_NAME: 't',
        GIT_AUTHOR_EMAIL: 't@t',
        GIT_COMMITTER_NAME: 't',
        GIT_COMMITTER_EMAIL: 't@t',
    };
    const origin = join(dir, 'origin.git');
    main = join(dir, 'main');
    git(dir, ['init', '--bare', '-b', 'main', origin]);
    git(dir, ['clone', origin, main]);
    mkdirSync(join(main, 'scripts/lib'), { recursive: true });
    mkdirSync(join(main, 'docs'));
    copyFileSync(resolve('scripts/task-start.sh'), join(main, 'scripts/task-start.sh'));
    copyFileSync(resolve('scripts/lib/plan-next-chunk.mjs'), join(main, 'scripts/lib/plan-next-chunk.mjs'));
    chmodSync(join(main, 'scripts/task-start.sh'), 0o755);
    writeFileSync(join(main, 'package.json'), '{}');
    writeFileSync(join(main, 'package-lock.json'), '{"a":1}');
    writeFileSync(join(main, 'docs/plan.md'), PLAN);
    writeFileSync(join(main, '.gitignore'), 'node_modules\n.npm-calls\n');
    git(main, ['add', '.']);
    git(main, ['commit', '-m', 'init']);
    git(main, ['push', 'origin', 'main']);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Gives the main checkout a node_modules with a package, a .vite and a .cache directory. */
function seedModules() {
    mkdirSync(join(main, 'node_modules/pkg'), { recursive: true });
    mkdirSync(join(main, 'node_modules/.vite'));
    mkdirSync(join(main, 'node_modules/.cache'));
    writeFileSync(join(main, 'node_modules/pkg/index.js'), 'x');
    writeFileSync(join(main, 'node_modules/.vite/a'), 'x');
}

describe('task-start.sh', { timeout: scaleTimeout(30_000) }, () => {
    it('creates the branch from origin/main in a new worktree and prints its path last', () => {
        seedModules();
        const r = start(['feat/demo']);
        expect(r.status, r.stderr).toBe(0);
        const tree = r.stdout.trim().split('\n').at(-1) ?? '';
        expect(tree).toBe(join(main, '.claude/worktrees/feat-demo'));
        expect(git(tree, ['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('feat/demo');
        expect(git(tree, ['rev-parse', 'HEAD'])).toBe(git(main, ['rev-parse', 'origin/main']));
    });

    it('hard-links node_modules without .vite and .cache when the lockfiles match', () => {
        seedModules();
        const tree = start(['feat/demo']).stdout.trim().split('\n').at(-1) ?? '';
        const copy = join(tree, 'node_modules/pkg/index.js');
        expect(readFileSync(copy, 'utf8')).toBe('x');
        expect(statSync(copy).ino).toBe(statSync(join(main, 'node_modules/pkg/index.js')).ino);
        expect(existsSync(join(tree, 'node_modules/.vite'))).toBe(false);
        expect(existsSync(join(tree, 'node_modules/.cache'))).toBe(false);
        expect(existsSync(join(tree, '.npm-calls'))).toBe(false);
    });

    it('runs npm ci when the main checkout has no node_modules or another lockfile', () => {
        const none = start(['feat/none']).stdout.trim().split('\n').at(-1) ?? '';
        expect(readFileSync(join(none, '.npm-calls'), 'utf8')).toBe('ci\n');
        seedModules();
        writeFileSync(join(main, 'package-lock.json'), '{"a":2}');
        const other = start(['feat/other']).stdout.trim().split('\n').at(-1) ?? '';
        expect(readFileSync(join(other, '.npm-calls'), 'utf8')).toBe('ci\n');
    });

    it('prints the plan status, next chunk and task rows with --plan', () => {
        const r = start(['feat/demo', '--plan', 'docs/plan.md']);
        expect(r.status, r.stderr).toBe(0);
        expect(r.stdout).toContain('Status: In progress - phase 1 built');
        expect(r.stdout).toContain('Next chunk: B');
        expect(r.stdout).toMatch(/\| T4a +\|/);
        expect(r.stdout.trim().split('\n').at(-1)).toContain('feat-demo');
    });

    it('--here switches the current worktree and refuses one with commits origin/main lacks', () => {
        const here = start(['feat/here', '--here']);
        expect(here.status, here.stderr).toBe(0);
        expect(git(main, ['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('feat/here');
        writeFileSync(join(main, 'x.txt'), 'x');
        git(main, ['add', 'x.txt']);
        git(main, ['commit', '-m', 'work']);
        const refused = start(['feat/again', '--here']);
        expect(refused.status).toBe(2);
        expect(refused.stderr).toContain('commit(s) origin/main lacks');
    });

    it('refuses a bad branch name, an existing branch and unknown flags', () => {
        expect(start(['demo']).status).toBe(2);
        expect(start(['feat/demo', '--bogus']).status).toBe(2);
        expect(start(['feat/demo']).status).toBe(0);
        const again = start(['feat/demo']);
        expect(again.status).toBe(2);
        expect(again.stderr).toContain('branch already exists');
    });
});
