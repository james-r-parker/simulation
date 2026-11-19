import { describe, expect, it } from 'vitest';
import { initialState, nextStage, restoreState, snapshotState } from '../../js/evo/stage-run.js';

const NURSERY = {
    name: 'nursery',
    gate: [{ read: 'drill.food-ahead.edgeLow', min: 0.3 }],
    minGenerations: 1,
    maxGenerations: 10,
};
const HUNT = {
    name: 'hunt',
    gate: [
        { read: 'drill.prey-ahead.winShareLow', min: 0.3 },
        { read: 'retention.all', min: 1 },
    ],
    minGenerations: 1,
    maxGenerations: 20,
};

/**
 * @param {number} food the nursery drill's edge and win share low bound
 * @param {number} [prey] the prey drill's win share low bound (jaw share the same)
 * @returns {{readings: Record<string, any>}} a checkpoint
 */
const at = (food, prey = 0) => ({
    readings: {
        drill: {
            'food-ahead': { edgeLow: food, winShareLow: food },
            'prey-ahead': { edgeLow: prey, winShareLow: prey, jawShareLow: prey },
        },
    },
});

describe('the progress series of a gated stage', () => {
    it('logs progress and the best so far on each gate read, and keeps the history', () => {
        let step = nextStage(initialState([NURSERY], 40), at(0.1));
        step = nextStage(step.state, at(0.2));
        step = nextStage(step.state, at(0.15));
        const gate = step.events.find((e) => e.event === 'TrainGate');
        expect(gate?.fields).toMatchObject({ progress: 0.15, bestProgress: 0.2 });
        expect(step.state.progressHistory).toEqual([0.1, 0.2, 0.15]);
    });

    it('clears the history when the next stage begins', () => {
        let state = initialState([NURSERY, HUNT], 40);
        state = nextStage(state, at(0.9)).state;
        state = nextStage(state, at(0.9)).state;
        expect(state.index).toBe(1);
        expect(state.progressHistory).toEqual([]);
        const hunt = nextStage(state, at(0.9, 0.2));
        expect(hunt.state.progressHistory).toEqual([0.2]);
    });

    it('clears the history when a review returns and carries it through a snapshot', () => {
        let state = initialState([NURSERY, HUNT], 60);
        for (const food of [0.9, 0.9, 0.9]) {
            state = nextStage(state, at(food, 0.1)).state;
        }
        const saved = snapshotState(state);
        expect(restoreState(state.stages, 60, saved).progressHistory).toEqual(state.progressHistory);
        for (const food of [0.1, 0.1]) {
            state = nextStage(state, at(food, 0.1)).state;
        }
        expect(state.review).not.toBeNull();
        for (let i = 0; i < 5; i++) {
            state = nextStage(state).state;
        }
        expect(state.review).toBeNull();
        expect(state.progressHistory).toEqual([]);
    });

    it('restores a state saved before the series existed with an empty one', () => {
        const state = initialState([NURSERY], 40);
        const { progressHistory, ...old } = snapshotState(state);
        expect(progressHistory).toEqual([]);
        expect(restoreState(state.stages, 40, old).progressHistory).toEqual([]);
    });
});
