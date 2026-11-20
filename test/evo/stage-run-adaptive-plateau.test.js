import { describe, expect, it } from 'vitest';
import { initialState, nextStage, restoreState, snapshotState } from '../../js/evo/stage-run.js';

const ADAPT = /** @type {import('../../js/evo/adaptive-difficulty.js').Adapt} */ ({
    param: 'preySprint',
    drill: 'prey-ahead',
    from: 0.1,
    to: 1,
    step: 0.05,
});
const STAGE = {
    name: 'hunt',
    gate: [{ read: 'drill.prey-ahead.winShareLow', min: 0.9 }],
    minGenerations: 2,
    maxGenerations: 60,
    plateauStop: 3,
    adapt: ADAPT,
};
const WORLD = { name: 'world' };

/** @param {number} progress the drill's win share and jaw share low bounds */
const at = (progress) => ({ readings: { drill: { 'prey-ahead': { winShareLow: progress, jawShareLow: progress } } } });

/**
 * @param {import('../../js/evo/stage-run.js').RunState} start the state
 * @param {number[]} progress one gate checkpoint per generation, run at the state's difficulty
 * @returns {{state: import('../../js/evo/stage-run.js').RunState, events: {event: string, fields: any}[]}} the end state and events
 */
function drive(start, progress) {
    let state = start;
    /** @type {{event: string, fields: any}[]} */
    const events = [];
    for (const value of progress) {
        const step = nextStage(state, at(value));
        state = step.state;
        events.push(...step.events);
    }
    return { state, events };
}

const start = (/** @type {number} */ difficulty) => ({ ...initialState([STAGE, WORLD], 200), difficulty });

describe('the plateau stop of an adaptive stage', () => {
    it('does not stall on flat progress while the difficulty is below `to`', () => {
        const { state } = drive(start(0.4), Array(12).fill(0.3));
        expect(state.status).toBe('running');
        expect(state.stalled).toEqual([]);
    });

    it('stalls on flat progress at `to`, counting only the checkpoints taken there', () => {
        const below = drive(start(0.4), [0.5, 0.3, 0.3]).state;
        expect(below.progressHistory).toHaveLength(3);
        const top = drive({ ...below, difficulty: 1 }, [0.3, 0.3, 0.3]);
        expect(top.state.status).toBe('running');
        expect(top.state.progressHistory).toEqual([0.3, 0.3, 0.3]);
        const stalled = drive(top.state, [0.3]);
        expect(stalled.state.status).toBe('stalled');
        const stall = stalled.events.at(-1);
        expect(stall?.fields).toMatchObject({ reason: 'plateau', bestProgress: 0.5 });
    });

    it('reports the best progress of the whole stage in TrainGate', () => {
        const below = drive(start(0.4), [0.5]).state;
        const { events } = drive({ ...below, difficulty: 1 }, [0.2]);
        expect(events.find((e) => e.event === 'TrainGate')?.fields).toMatchObject({ progress: 0.2, bestProgress: 0.5 });
    });

    it('keeps maxGenerations as the backstop below `to`', () => {
        const { state } = drive(start(0.4), Array(60).fill(0.3));
        expect(state.status).toBe('stalled');
        expect(state.stalled[0]).toMatchObject({ reason: 'max' });
    });

    it('carries the stage best and the top flag through a save, and restores an old save', () => {
        const state = drive({ ...start(0.4), difficulty: 1 }, [0.4, 0.3]).state;
        const saved = JSON.parse(JSON.stringify(snapshotState(state)));
        const back = restoreState([STAGE, WORLD], 200, saved);
        expect(back.stageBest).toBe(0.4);
        expect(back.atTop).toBe(true);
        const old = { ...saved };
        delete old.stageBest;
        delete old.atTop;
        const restored = restoreState([STAGE, WORLD], 200, old);
        expect(restored.stageBest).toBe(0.4);
        expect(restored.atTop).toBe(true);
    });

    it('resets both when the next stage begins', () => {
        /** @type {import('../../js/evo/stage-run.js').RunState} */
        let state = { ...start(1), stageBest: 0.8, atTop: true };
        while (state.index === 0) {
            state = nextStage(state, at(1)).state;
        }
        expect(state.stageBest).toBe(0);
        expect(state.atTop).toBe(false);
    });
});
