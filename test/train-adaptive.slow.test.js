// An adaptive stage in a whole tiny run (docs/designs/training-loop.md, Adaptive difficulty): the episodes run at the stage's
// value, the value moves on the steering read at each gate checkpoint, a resume replays it, and the stage hash ignores it.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

/** @type {any[]} */
const episodeTasks = [];
/** @type {any[]} */
const checkpointOptions = [];
let share = 0.9;

vi.mock('../scripts/lib/worker-pool.mjs', async (importOriginal) => {
    const original = /** @type {any} */ (await importOriginal());
    return {
        ...original,
        runPool: (/** @type {any[]} */ tasks, /** @type {any} */ options) => {
            episodeTasks.push(...tasks);
            return original.runPool(tasks, options);
        },
    };
});
vi.mock('../scripts/lib/train-checkpoint.mjs', async (importOriginal) => ({
    ...(await importOriginal()),
    runCheckpoint: vi.fn(async (/** @type {any} */ run) => {
        checkpointOptions.push(run.options);
        return {
            point: { generation: run.progress.generation, stage: run.stage.name, drillLossReasons: {} },
            readings: run.options.gate === null ? null : { drill: { 'prey-ahead': { edgeLow: 0.1 } } },
            subjects: [],
            steer: run.options.steer ? { ...run.options.steer, winShare: share } : null,
        };
    }),
}));

const { parseArgs, runTraining } = await import('../scripts/train.mjs');

const root = mkdtempSync(join(tmpdir(), 'train-adaptive-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const WORLD = {
    worldWidth: 2400,
    worldHeight: 1600,
    initialAgents: 40,
    maxAgents: 80,
    minAgents: 0,
    maxFood: 60,
    initialFood: 60,
    herdCount: 0,
    refugeCount: 0,
    wallGaps: 1,
    coldMarginWidth: 0,
};
const config = join(root, 'hunt.json');
writeFileSync(config, JSON.stringify({ ...WORLD, specialisations: { scout: { turnMultiplier: 0.5 } } }));
const adapt = { param: 'preySprint', drill: 'prey-ahead', from: 0.1, to: 1, step: 0.05 };
const gate = [{ read: 'drill.prey-ahead.edgeLow', min: 0.3 }];
const entry = { name: 'hunt', config, minGenerations: 1, maxGenerations: 40, gate };
const adaptiveLadder = join(root, 'adaptive.json');
const fixedLadder = join(root, 'fixed.json');
writeFileSync(
    adaptiveLadder,
    JSON.stringify([
        { ...entry, adapt },
        { name: 'world', config: null },
    ]),
);
writeFileSync(fixedLadder, JSON.stringify([entry, { name: 'world', config: null }]));

/** @param {string} ladder a ladder file @param {string} name the output directory name @param {string[]} extra more arguments @returns {string[]} arguments of a tiny run */
const tiny = (ladder, name, extra = []) => [
    ...['--curriculum', ladder, '--episodes', '2', '--ticks', '300', '--offer-from', '100', '--checkpoint-every', '1'],
    ...['--out', join(root, name), ...extra],
];

/** @param {string} name the output directory name @returns {Record<string, any>[]} the run's log records */
const logOf = (name) =>
    readFileSync(join(root, name, 'train.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l));

/** @returns {number[]} the prey sprint each generation's episodes ran at (two episodes a generation) */
const sprints = () =>
    episodeTasks.filter((_, i) => i % 2 === 0).map((t) => t.overrides.specialisations?.forager?.sprintBoost ?? null);

beforeEach(() => {
    episodeTasks.length = 0;
    checkpointOptions.length = 0;
    share = 0.9;
});

describe('an adaptive stage', () => {
    it(
        'runs its episodes at the value, steers it at each gate checkpoint and records it on the curve and the log',
        async () => {
            await runTraining(parseArgs(['--generations', '4', ...tiny(adaptiveLadder, 'rise')]), { gateTrials: 2 });
            expect(sprints()).toEqual([0.1, 0.15, 0.2, 0.25]);
            expect(episodeTasks[0].overrides.specialisations.scout).toEqual({ turnMultiplier: 0.5, sprintBoost: 0.1 });
            expect(checkpointOptions.map((o) => o.steer)).toEqual([
                { drill: 'prey-ahead', value: 0.1 },
                { drill: 'prey-ahead', value: 0.15 },
                { drill: 'prey-ahead', value: 0.2 },
                { drill: 'prey-ahead', value: 0.25 },
            ]);
            expect(checkpointOptions.every((o) => o.gate !== null)).toBe(true);
            const rows = readFileSync(join(root, 'rise', 'curve.jsonl'), 'utf8')
                .trim()
                .split('\n')
                .map((l) => JSON.parse(l));
            expect(rows.map((r) => r.difficulty)).toEqual([0.1, 0.15, 0.2, 0.25]);
            const changes = logOf('rise').filter((r) => r.event === 'TrainDifficulty');
            expect(changes.map((r) => [r.generation, r.from, r.to])).toEqual([
                [1, 0.1, 0.15],
                [2, 0.15, 0.2],
                [3, 0.2, 0.25],
                [4, 0.25, 0.3],
            ]);
            expect(changes[0]).toMatchObject({ stage: 'hunt', param: 'preySprint', winShare: 0.9 });
            const saved = JSON.parse(readFileSync(join(root, 'rise', 'archive-3.json'), 'utf8'));
            expect(saved.trainState.difficulty).toBe(0.3);
        },
        scaleTimeout(120000),
    );

    it(
        'holds the value between the bounds, logging nothing',
        async () => {
            share = 0.4;
            await runTraining(parseArgs(['--generations', '2', ...tiny(adaptiveLadder, 'hold')]), { gateTrials: 2 });
            expect(sprints()).toEqual([0.1, 0.1]);
            expect(logOf('hold').some((r) => r.event === 'TrainDifficulty')).toBe(false);
        },
        scaleTimeout(120000),
    );

    it(
        'is accepted on a resume, which replays the value, and keeps the stage hash',
        async () => {
            await runTraining(parseArgs(['--generations', '2', ...tiny(adaptiveLadder, 'first')]), { gateTrials: 2 });
            const saved = join(root, 'first', 'archive-1.json');
            expect(JSON.parse(readFileSync(saved, 'utf8')).trainState.difficulty).toBe(0.2);
            episodeTasks.length = 0;
            await runTraining(
                parseArgs(['--generations', '4', ...tiny(adaptiveLadder, 'second', ['--resume', saved])]),
                {
                    gateTrials: 2,
                },
            );
            expect(sprints()).toEqual([0.2, 0.25]);
            const hash = (/** @type {string} */ name) => logOf(name).find((r) => r.event === 'TrainStage')?.rulesHash;
            await runTraining(parseArgs(['--generations', '1', ...tiny(fixedLadder, 'fixed')]), { gateTrials: 2 });
            expect(hash('first')).toBe(hash('fixed'));
            expect(hash('second')).toBe(hash('fixed'));
        },
        scaleTimeout(180000),
    );

    it(
        'does not touch a stage with no adapt',
        async () => {
            episodeTasks.length = 0;
            await runTraining(parseArgs(['--generations', '2', ...tiny(fixedLadder, 'plain')]), { gateTrials: 2 });
            expect(sprints()).toEqual([null, null]);
            expect(checkpointOptions.every((o) => o.steer === undefined)).toBe(true);
            const rows = readFileSync(join(root, 'plain', 'curve.jsonl'), 'utf8')
                .trim()
                .split('\n');
            expect(rows.map((l) => JSON.parse(l).difficulty)).toEqual([null, null]);
        },
        scaleTimeout(120000),
    );
});
