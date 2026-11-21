// A stage's drills run under the stage world's body rules (docs/designs/fair-chase.md, Decisions): the gate drills, the kept
// passers' drills, the steering read, and the learnability check's probe and bar. A stage with no body rule drills under `{}`.
import { describe, expect, it, vi } from 'vitest';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';
import { sprintArena } from '../js/evo/drill-scenarios.js';
import { createTrainerArchive } from '../js/evo/trainer.js';
import { createSimLog } from '../js/sim/log.js';

const calls = /** @type {any[]} */ ([]);
const tasks = /** @type {any[]} */ ([]);
const bars = /** @type {any[]} */ ([]);
const cell = { winShare: 0.5, edge: 0, wins: 2, trials: 4, randomWins: 0, randomTrials: 4 };

vi.mock('../scripts/drill.mjs', () => ({
    drillGenomes: vi.fn(async (/** @type {any} */ args, /** @type {any} */ run) => {
        calls.push({ args, config: run.config });
        const row = { cells: Object.fromEntries(args.drills.map((/** @type {string} */ d) => [d, cell])) };
        return [row, { cells: row.cells }];
    }),
}));
vi.mock('../scripts/lib/drill-subjects.mjs', () => ({ eliteSubjects: () => [{ name: 'a' }] }));
vi.mock('../scripts/lib/worker-pool.mjs', async (importOriginal) => ({
    ...(await importOriginal()),
    runPool: vi.fn(async (/** @type {any[]} */ list) => {
        const probes = list.filter((t) => t.lesson !== undefined);
        tasks.push(...probes);
        return list.map((t) => (t.lesson === undefined ? { metrics: {} } : { reached: 0.1 }));
    }),
}));
vi.mock('../js/evo/feasible.js', async (importOriginal) => ({
    ...(await importOriginal()),
    baselineShares: vi.fn((/** @type {string} */ drill, /** @type {any} */ run) => {
        bars.push({ drill, config: run.config });
        return { reference: 0.5, random: 0.1 };
    }),
}));

const { runCheckpoint } = await import('../scripts/lib/train-checkpoint.mjs');
const { keeperReadings } = await import('../scripts/lib/train-keepers.mjs');
const { loadStages } = await import('../scripts/lib/train-state.mjs');
const { checkLadder } = await import('../scripts/lib/feasible-run.mjs');

const COURSER = 'evals/fair-chase/courser.json';
const stagesOf = (/** @type {string | null} */ config) =>
    loadStages(/** @type {any} */ ({ config, until: null, generations: 1, checkpointEvery: 1 }));
const log = createSimLog(() => {}, { level: 'error' });
const gate = { seed: 7, trials: 4 };
const checkpoint = (/** @type {any} */ stage, /** @type {any} */ extra = {}) =>
    runCheckpoint({
        archive: createTrainerArchive(stage.built),
        stage,
        progress: { generation: 1, trainTicks: 0, wallSeconds: 0 },
        options: { workers: 1, evalTicks: 5, drillTrials: 1, gate, ...extra },
        log,
    });

describe('the trainer checkpoint drills', { timeout: scaleTimeout(60_000) }, () => {
    it('runs a stage without body rules under the default config, as before', async () => {
        calls.length = 0;
        await checkpoint(stagesOf(null)[0], { steer: { drill: 'prey-ahead', value: 0.3 } });
        expect(calls.map((c) => c.config)).toEqual([{}, sprintArena(0.3)]);
    });

    it('runs the courser stage with the sprint store, and lays the steered arena over it', async () => {
        calls.length = 0;
        const [stage] = stagesOf(COURSER);
        await checkpoint(stage, { steer: { drill: 'prey-ahead', value: 0.3 } });
        expect(calls[0].config.sprintStoreEnabled).toBe(true);
        expect(calls[1].config).toMatchObject({ sprintStoreEnabled: true, sprintDrain: 0.01 });
        expect(calls[1].config.specialisations).toEqual({
            predator: { sprintDrainMultiplier: 0.5 },
            forager: { sprintBoost: 0.3 },
        });
    });

    it('drills a stage kept passers under that stage body rules', async () => {
        calls.length = 0;
        const [stage] = stagesOf(COURSER);
        const gateRead = [{ read: 'drill.food-ahead.edgeLow' }];
        const stages = [
            { ...stage, name: 'hunt', gate: gateRead },
            { name: 'plain', gate: gateRead },
        ];
        const kept = [{ name: 's', id: 1, spec: 1, weights: [0.1] }];
        await keeperReadings({ hunt: kept, plain: kept }, { stages, seed: 1, trials: 1, workers: 1, log });
        expect(calls[0].config.sprintStoreEnabled).toBe(true);
        expect(calls[1].config).toEqual({});
    });
});

describe('the learnability check', { timeout: scaleTimeout(60_000) }, () => {
    const ladder = (/** @type {string | null} */ config) => [
        { name: 'hunt', config, gate: [{ read: 'drill.prey-ahead.winShareLow', min: 0.3 }] },
    ];
    const readConfig = () => JSON.parse(JSON.stringify({ sprintStoreEnabled: true, sprintDrain: 0.01, maxFood: 700 }));
    const run = (/** @type {string | null} */ config) =>
        checkLadder(ladder(config), { readConfig, generations: 1, seeds: 2, population: 4, trials: 1 });

    it('probes and reads the bar under the same body rules, and never its food or size rules', async () => {
        tasks.length = 0;
        bars.length = 0;
        await run(COURSER);
        expect(tasks).toHaveLength(2);
        const expected = { sprintStoreEnabled: true, sprintDrain: 0.01 };
        expect(tasks.map((t) => t.config)).toEqual([expected, expected]);
        expect(bars).toEqual([{ drill: 'prey-ahead', config: expected }]);
    });

    it('keeps a stage without a config file on the default config', async () => {
        tasks.length = 0;
        bars.length = 0;
        await run(null);
        expect(tasks.map((t) => t.config)).toEqual([{}, {}]);
        expect(bars[0].config).toEqual({});
    });
});
