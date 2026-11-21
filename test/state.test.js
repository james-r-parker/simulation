import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    experimentsBlock,
    ladderBlock,
    machineBlock,
    prsBlock,
    runsBlock,
    shipsBlock,
} from '../scripts/lib/state-blocks.mjs';
import { renderState } from '../scripts/lib/state-format.mjs';
import { nextTask, queueBlock, queueRows } from '../scripts/lib/state-queue.mjs';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';
import { readLedger } from '../scripts/lib/ledger.mjs';
import { gatherState, main } from '../scripts/state.mjs';

const README = `# Designs

## Build queue (7)

1. [Metric noise](metric-noise.md) - lead
    1. [Detector baseline](detector-baseline.md) - a step
    2. [Lean observer](lean-observer.md) - a step
2. [Fair chase](fair-chase.md) - lead
3. [Agent workflow](agent-workflow.md) - lead
4. [Training loop](training-loop.md) - lead
5. [Ambient display](ambient-display.md) - lead

## Elsewhere

1. [Not in the queue](other.md) - nope
`;

const DOC = `# Demo

**Status:** In progress

### Phase 1 - First

| Chunk | Tasks  | Builder |
| ----- | ------ | ------- |
| A     | T1, T2 | Sonnet  |

## Task breakdown

### Phase 1 - First

| #   | Task              | Nature       | Depends on |
| --- | ----------------- | ------------ | ---------- |
| T1  | Do one (built)    | [mechanical] | -          |
| T2  | Do two            | [judgement]  | T1         |
`;

describe('Queue block', () => {
    it('keeps the first five Build queue rows, leads and steps in listing order, and none from another section', () => {
        const rows = queueRows(README);
        expect(rows.map((r) => `${r.rank} ${r.file}`)).toEqual([
            '1 metric-noise.md',
            '1.1 detector-baseline.md',
            '1.2 lean-observer.md',
            '2 fair-chase.md',
            '3 agent-workflow.md',
        ]);
        expect(queueRows(README, 99)).toHaveLength(7);
    });

    it('names the first task not marked built in the next unbuilt chunk, and null when all are built', () => {
        expect(nextTask(DOC)).toEqual({ id: 'T2', task: 'Do two', chunk: 'A' });
        expect(nextTask(DOC.replace('Do two', 'Do two (built)'))).toBeNull();
        expect(nextTask('# no tables')).toBeNull();
    });

    it('pairs each row with its doc and gives null for a missing doc', () => {
        const rows = queueBlock(README, (file) => (file === 'metric-noise.md' ? DOC : null), 2);
        expect(rows[0].next?.id).toBe('T2');
        expect(rows[1].next).toBeNull();
    });
});

describe('Runs and Machine blocks', () => {
    /** @type {(name: string, started: string, workers?: number) => any} */
    const run = (name, started, workers) => ({ name, cmd: `cmd ${name}`, started, workers, pid: 1, dir: '/d' });

    it('lists runs in flight first, then the newest finished, with seeds from the log', () => {
        const runs = [
            run('old', '2026-11-01T00:00:00Z', 4),
            run('now', '2026-11-02T00:00:00Z', 8),
            run('new', '2026-11-03T00:00:00Z'),
        ];
        const rows = runsBlock(
            runs,
            (r) => (r.name === 'now' ? 12 : null),
            (r) => r.name === 'now',
            1,
        );
        expect(rows.map((r) => `${r.name}:${r.state}`)).toEqual(['now:in flight', 'new:done']);
        expect(rows[0]).toMatchObject({ workers: 8, seedsDone: 12 });
        expect(rows[1].workers).toBeNull();
    });

    it('claims the workers of runs in flight against the budget and leaves the rest free', () => {
        const rows = [
            { state: 'in flight', workers: 10 },
            { state: 'in flight', workers: null },
            { state: 'done', workers: 20 },
        ];
        expect(machineBlock(rows, { threads: 32, load: 1.5 })).toEqual({
            threads: 32,
            load: 1.5,
            budget: 24,
            claimed: 10,
            free: 14,
        });
    });
});

describe('Ladder block', () => {
    it('reads the base arm when there is one, else the first, and null for an empty file', () => {
        /** @type {(n: number) => any} */
        const arm = (n) => ({ runs: n, stages: [{ stage: 'nursery', passShare: 0.5, medianGenerations: 10 }] });
        expect(ladderBlock({ fixed: arm(1), base: arm(2) })).toEqual({
            arm: 'base',
            runs: 2,
            stages: [{ stage: 'nursery', passShare: 0.5 }],
        });
        expect(ladderBlock({ fixed: arm(1) })?.arm).toBe('fixed');
        expect(ladderBlock({})).toBeNull();
    });
});

describe('Experiments block', () => {
    it('keeps the last 10 by id and tallies the outcomes of the last 7 days', () => {
        const records = Array.from({ length: 12 }, (_, i) => ({
            id: `E${i + 1}`,
            date: i < 6 ? '2026-11-01' : '2026-11-19',
            outcome: i % 2 ? 'adopted' : undefined,
        }));
        const block = experimentsBlock(records, '2026-11-20');
        expect(block.last.map((r) => r.id)).toEqual(Array.from({ length: 10 }, (_, i) => `E${i + 3}`));
        expect(block.since).toBe('2026-11-13');
        expect(block.tally).toEqual({ unrecorded: 3, adopted: 3 });
    });
});

describe('Pull requests block', () => {
    it('reads the check rollup as pass, fail, pending or none', () => {
        /** @type {(n: number, statusCheckRollup: any[]) => any} */
        const pr = (n, statusCheckRollup) => ({ number: n, title: 't', headRefName: `b${n}`, statusCheckRollup });
        const rows = prsBlock([
            pr(1, [{ status: 'COMPLETED', conclusion: 'SUCCESS' }]),
            pr(2, [
                { status: 'COMPLETED', conclusion: 'SUCCESS' },
                { status: 'COMPLETED', conclusion: 'FAILURE' },
            ]),
            pr(3, [{ status: 'IN_PROGRESS' }]),
            pr(4, []),
        ]);
        expect(rows.map((r) => r.checks)).toEqual(['pass', 'fail', 'pending', 'none']);
    });
});

describe('Ships block', () => {
    it('takes the median minutes and the first-run green share of the last 20 merged ships', () => {
        const lines = [
            { result: 'check-failed', minutes: 99, ciRuns: 3 },
            ...Array.from({ length: 25 }, (_, i) => ({
                result: 'merged',
                minutes: i < 5 ? 500 : 10 + (i % 2),
                ciRuns: i % 4 === 0 ? 2 : 1,
            })),
        ].map((l) => JSON.stringify(l));
        const block = shipsBlock(`${lines.join('\n')}\n{torn`);
        expect(block.ships).toBe(20);
        expect(block.medianMinutes).toBe(10.5);
        expect(block.firstRunGreen).toBe(0.75);
    });

    it('reports nothing for an empty log', () => {
        expect(shipsBlock('')).toEqual({ ships: 0, medianMinutes: null, firstRunGreen: null });
    });
});

describe('renderState', () => {
    it('prints every block heading and tolerates absent sources', () => {
        const text = renderState({
            queue: [{ rank: '1', file: 'a.md', title: 'A', next: null }],
            runs: [],
            machine: { threads: 8, load: 0.5, budget: 4, claimed: 0, free: 4 },
            ladder: null,
            experiments: { last: [], tally: {}, since: '2026-11-13' },
            ships: { ships: 0, medianMinutes: null, firstRunGreen: null },
            prs: null,
            worktrees: null,
        });
        for (const heading of [
            'Queue',
            'Runs',
            'Machine',
            'Ladder',
            'Experiments',
            'Ships',
            'Pull requests',
            'Worktrees',
        ]) {
            expect(text).toContain(`## ${heading}`);
        }
        expect(text).toContain('gh unavailable');
        expect(text).toContain('no unbuilt task');
    });
});

// The whole page on a fixture repository with a stubbed gh: the page reads the registries of every worktree and writes
// no file.
const STATE = resolve('scripts/state.mjs');
const GH_STUB = `#!/usr/bin/env bash
echo '[{"number":9,"title":"A change","headRefName":"feat/x","statusCheckRollup":[{"status":"COMPLETED","conclusion":"SUCCESS"}]}]'
`;
let dir = '';
/** @type {Record<string, string | undefined>} */
let env = {};

/**
 * @param {string} cwd where to run
 * @param {string[]} args git arguments
 */
function git(cwd, args) {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', env });
    expect(r.status, `${args.join(' ')}: ${r.stderr}`).toBe(0);
}

/**
 * @param {string} root the tree to list
 * @returns {string[]} every file path under it, outside `.git`
 */
function listing(root) {
    return readdirSync(root, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile() && !String(e.parentPath).includes('.git'))
        .map((e) => join(String(e.parentPath), e.name))
        .sort();
}

beforeEach(() => {
    // The Machine block's budget is the workstation rule; defaultWorkers takes every core when CI is set.
    vi.stubEnv('CI', '');
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'state-')));
    mkdirSync(join(dir, 'bin'));
    writeFileSync(join(dir, 'bin', 'gh'), GH_STUB);
    chmodSync(join(dir, 'bin', 'gh'), 0o755);
    env = {
        ...process.env,
        PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
        GIT_AUTHOR_NAME: 't',
        GIT_AUTHOR_EMAIL: 't@t',
        GIT_COMMITTER_NAME: 't',
        GIT_COMMITTER_EMAIL: 't@t',
    };
    const repo = join(dir, 'repo');
    mkdirSync(join(repo, 'docs', 'designs'), { recursive: true });
    mkdirSync(join(repo, 'evals', 'train-screens', 'results', 'g'), { recursive: true });
    mkdirSync(join(repo, '.checklogs'));
    mkdirSync(join(repo, '.runs'));
    writeFileSync(join(repo, 'docs', 'designs', 'README.md'), README);
    writeFileSync(join(repo, 'docs', 'designs', 'metric-noise.md'), DOC);
    writeFileSync(
        join(repo, 'evals', 'train-screens', 'results', 'g', 'yield.json'),
        JSON.stringify({ base: { runs: 4, stages: [{ stage: 'nursery', passShare: 0.75 }] } }),
    );
    mkdirSync(join(repo, 'evals', 'ledger'));
    writeFileSync(join(repo, 'evals', 'ledger', 'E1.json'), JSON.stringify({ id: 'E1', date: '2026-11-19' }));
    writeFileSync(
        join(repo, '.checklogs', 'ship.jsonl'),
        `${JSON.stringify({ result: 'merged', minutes: 8, ciRuns: 1 })}\n`,
    );
    writeFileSync(join(repo, '.gitignore'), '.runs\n.checklogs\n');
    writeFileSync(join(repo, '.runs', 'e1.log'), 'seed 1 done in 1s worldHash a\nseed 2 done in 1s worldHash b\n');
    const run = {
        name: 'e1',
        cmd: 'npm run eval',
        pid: process.pid,
        dir: join(repo, '.runs'),
        cwd: repo,
        started: '2026-11-20T00:00:00Z',
        workers: 6,
    };
    writeFileSync(join(repo, '.runs', 'runs.json'), JSON.stringify([run]));
    git(repo, ['init', '-q', '-b', 'main']);
    git(repo, ['add', '.']);
    git(repo, ['commit', '-q', '-m', 'init']);
});
afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.unstubAllEnvs();
});

describe('npm run state', { timeout: scaleTimeout(60_000) }, () => {
    it('gathers every block from a fixture repository', () => {
        const state = gatherState(join(dir, 'repo'), { today: '2026-11-20' });
        expect(state.queue[0]).toMatchObject({ rank: '1', file: 'metric-noise.md', next: { id: 'T2' } });
        expect(state.runs).toMatchObject([{ name: 'e1', state: 'in flight', workers: 6, seedsDone: 2 }]);
        expect(state.machine).toMatchObject({ claimed: 6 });
        expect(state.ladder).toMatchObject({ arm: 'base', stages: [{ stage: 'nursery', passShare: 0.75 }] });
        expect(state.experiments.tally).toEqual({ unrecorded: 1 });
        expect(state.ships).toEqual({ ships: 1, medianMinutes: 8, firstRunGreen: 1 });
        expect(state.worktrees).toMatchObject({ live: 1 });
        expect(readLedger(join(dir, 'repo'))).toHaveLength(1);
    });

    it('prints the page and the json form, and writes no file', () => {
        const repo = join(dir, 'repo');
        const before = listing(repo);
        const page = spawnSync('node', [STATE, '--root', repo], { cwd: dir, encoding: 'utf8', env });
        expect(page.status).toBe(0);
        expect(page.stdout).toContain('## Runs');
        expect(page.stdout).toContain('in flight e1 workers 6');
        expect(page.stdout).toContain('#9 pass');
        const json = spawnSync('node', [STATE, '--json', '--root', repo], { cwd: dir, encoding: 'utf8', env });
        expect(JSON.parse(json.stdout).prs[0].number).toBe(9);
        expect(listing(repo)).toEqual(before);
    });

    it('rejects an unknown argument', () => {
        expect(spawnSync('node', [STATE, '--nope'], { cwd: dir, encoding: 'utf8', env }).status).toBe(2);
    });
});

describe('state.mjs in process', { timeout: scaleTimeout(60_000) }, () => {
    /**
     * @param {string[]} args main's arguments
     * @param {string} [cwd] the directory it runs in
     * @returns {{status: number, out: string, err: string}} the exit code and what it printed
     */
    function runMain(args, cwd) {
        vi.stubEnv('PATH', String(env.PATH));
        let out = '';
        const write = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
            out += String(chunk);
            return true;
        });
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const status = main(args, cwd);
        const err = error.mock.calls.flat().join('\n');
        write.mockRestore();
        error.mockRestore();
        return { status, out, err };
    }

    it('prints the page for the working directory and the json form for --root', () => {
        const repo = join(dir, 'repo');
        const page = runMain([], repo);
        expect(page.status).toBe(0);
        expect(page.out).toContain('#9 pass');
        const json = runMain(['--json', '--root', repo], dir);
        expect(JSON.parse(json.out).queue[0].file).toBe('metric-noise.md');
    });

    it('rejects an unknown argument and a --root with no directory', () => {
        expect(runMain(['--nope']).status).toBe(2);
        const bare = runMain(['--root']);
        expect(bare.status).toBe(2);
        expect(bare.err).toContain('usage');
    });

    it('reports no ladder, no pull requests and no worktrees where the sources are absent', () => {
        const bare = join(dir, 'bare');
        mkdirSync(join(bare, 'evals', 'train-screens', 'results', 'empty'), { recursive: true });
        writeFileSync(join(dir, 'bin', 'gh'), '#!/usr/bin/env bash\nexit 1\n');
        vi.stubEnv('PATH', String(env.PATH));
        vi.stubEnv('GIT_CEILING_DIRECTORIES', dir);
        const state = gatherState(bare, { today: '2026-11-20' });
        expect(state.ladder).toBeNull();
        expect(state.prs).toBeNull();
        expect(state.worktrees).toBeNull();
        expect(state.queue).toEqual([]);
        rmSync(join(bare, 'evals', 'train-screens', 'results'), { recursive: true });
        expect(gatherState(bare).ladder).toBeNull();
    });

    it('treats gh output that is not json as no pull requests', () => {
        writeFileSync(join(dir, 'bin', 'gh'), '#!/usr/bin/env bash\necho "not json"\n');
        vi.stubEnv('PATH', String(env.PATH));
        expect(gatherState(join(dir, 'repo')).prs).toBeNull();
    });
});
