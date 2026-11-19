// The adaptive-difficulty steering read of a gate checkpoint (docs/designs/training-loop.md, Adaptive difficulty): one extra
// drill run on the steering drill at the current value, while the gate's own drill read stays at full difficulty.
import { describe, expect, it, vi } from 'vitest';
import { DRILLS, sprintArena } from '../js/evo/drill-scenarios.js';
import { initialState } from '../js/evo/stage-run.js';
import { createTrainerArchive } from '../js/evo/trainer.js';
import { createSimLog } from '../js/sim/log.js';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

const calls = /** @type {any[]} */ ([]);
const cell = (/** @type {number} */ wins) => ({
    winShare: wins / 4,
    edge: 0,
    wins,
    trials: 4,
    randomWins: 0,
    randomTrials: 4,
});

vi.mock('../scripts/drill.mjs', () => ({
    drillGenomes: vi.fn(async (/** @type {any} */ args, /** @type {any} */ run) => {
        calls.push({ args, config: run.config });
        const wins = args.drills.length === 1 ? 3 : 1;
        const row = { cells: Object.fromEntries(args.drills.map((/** @type {string} */ d) => [d, cell(wins)])) };
        return [row, { cells: row.cells }];
    }),
}));
vi.mock('../scripts/lib/drill-subjects.mjs', () => ({ eliteSubjects: () => [{ name: 'a' }] }));

const { runCheckpoint } = await import('../scripts/lib/train-checkpoint.mjs');
const { loadStages } = await import('../scripts/lib/train-state.mjs');
const { applySteer, episodeOverrides, steerOptions } = await import('../scripts/lib/train-difficulty.mjs');

const stages = loadStages(/** @type {any} */ ({ config: null, until: null, generations: 1, checkpointEvery: 1 }));
const log = createSimLog(() => {}, { level: 'error' });
const base = {
    archive: createTrainerArchive(stages[0].built),
    stage: stages[0],
    progress: { generation: 1, trainTicks: 0, wallSeconds: 0 },
    log,
};
const gate = { seed: 7, trials: 4 };

describe('runCheckpoint with a steering read', () => {
    it(
        'drills the steering drill at the value, on the gate seed, and leaves the gate read alone',
        async () => {
            calls.length = 0;
            const options = {
                workers: 1,
                evalTicks: 5,
                drillTrials: 1,
                gate,
                steer: { drill: 'prey-ahead', value: 0.3 },
            };
            const result = await runCheckpoint({ ...base, options });
            expect(calls).toHaveLength(2);
            expect(calls[0].config).toEqual({});
            expect(calls[0].args.drills).toEqual(DRILLS.map((d) => d.name));
            expect(calls[1].config).toEqual(sprintArena(0.3));
            expect(calls[1].args).toMatchObject({ drills: ['prey-ahead'], seed: 7, trials: 4 });
            expect(result.steer).toEqual({ drill: 'prey-ahead', value: 0.3, winShare: 0.75 });
            expect(result.readings?.drill['prey-ahead'].winShareLow).toBeLessThan(0.75);
        },
        scaleTimeout(60000),
    );

    it(
        'takes no steering read without a gate or without steer',
        async () => {
            calls.length = 0;
            const steer = { drill: 'prey-ahead', value: 0.3 };
            const noGate = await runCheckpoint({
                ...base,
                options: { workers: 1, evalTicks: 5, drillTrials: 1, steer },
            });
            const noSteer = await runCheckpoint({
                ...base,
                options: { workers: 1, evalTicks: 5, drillTrials: 1, gate },
            });
            expect(noGate.steer).toBeNull();
            expect(noSteer.steer).toBeNull();
            expect(calls).toHaveLength(2);
        },
        scaleTimeout(60000),
    );
});

const ADAPT = /** @type {import('../js/evo/adaptive-difficulty.js').Adapt} */ ({
    param: 'preySprint',
    drill: 'prey-ahead',
    from: 0.1,
    to: 1,
    step: 0.05,
});
const adaptive = { name: 'hunt', gate: [], minGenerations: 1, maxGenerations: 9, adapt: ADAPT };

describe('steerOptions, episodeOverrides and applySteer', () => {
    const state = { ...initialState([adaptive, { name: 'z' }], 40), difficulty: 0.3 };

    it('steers only an adaptive stage outside a review', () => {
        expect(steerOptions(/** @type {any} */ (adaptive), state)).toEqual({ drill: 'prey-ahead', value: 0.3 });
        expect(steerOptions(/** @type {any} */ ({ name: 'x' }), state)).toBeUndefined();
        expect(steerOptions(/** @type {any} */ (adaptive), { ...state, difficulty: null })).toBeUndefined();
        expect(
            steerOptions(/** @type {any} */ (adaptive), { ...state, review: { index: 0, left: 2 } }),
        ).toBeUndefined();
    });

    it('lays the value over the overrides, or leaves them as they are', () => {
        const overrides = { worldWidth: 1 };
        expect(episodeOverrides(overrides, null)).toBe(overrides);
        expect(episodeOverrides(overrides, 0.4).specialisations.scout.sprintBoost).toBe(0.4);
    });

    it('moves the value on the read and logs a change', () => {
        const events = /** @type {any[]} */ ([]);
        const sink = createSimLog((line) => events.push(line), { level: 'info' });
        const after = { ...state, generation: 5 };
        const up = applySteer(
            { before: state, after, steer: { drill: 'prey-ahead', value: 0.3, winShare: 0.8 } },
            sink,
        );
        expect(up.difficulty).toBe(0.35);
        const hold = applySteer(
            { before: state, after, steer: { drill: 'prey-ahead', value: 0.3, winShare: 0.4 } },
            sink,
        );
        expect(hold.difficulty).toBe(0.3);
        const logged = events.filter((e) => e.event === 'TrainDifficulty');
        expect(logged).toHaveLength(1);
        expect(logged[0]).toMatchObject({
            stage: 'hunt',
            generation: 5,
            param: 'preySprint',
            from: 0.3,
            to: 0.35,
            winShare: 0.8,
        });
    });

    it('leaves the state alone with no read, no adapt, another stage or a review', () => {
        const sink = createSimLog(() => {}, { level: 'info' });
        const steer = { drill: 'prey-ahead', value: 0.3, winShare: 0.9 };
        const after = { ...state, generation: 5 };
        expect(applySteer({ before: state, after, steer: null }, sink)).toBe(after);
        expect(applySteer({ before: state, after: { ...after, index: 1 }, steer }, sink).difficulty).toBe(0.3);
        expect(
            applySteer({ before: state, after: { ...after, review: { index: 0, left: 1 } }, steer }, sink).difficulty,
        ).toBe(0.3);
        const plain = { ...state, index: 1 };
        expect(applySteer({ before: plain, after: { ...plain, generation: 5 }, steer }, sink).difficulty).toBe(0.3);
    });
});
