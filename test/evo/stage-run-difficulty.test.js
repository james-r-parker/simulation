import { describe, expect, it } from 'vitest';
import { episodeDifficulty, initialState, nextStage, restoreState, snapshotState } from '../../js/evo/stage-run.js';

const ADAPT = { param: 'preySprint', drill: 'prey-ahead', from: 0.1, to: 1, step: 0.05 };
const FIRST = {
    name: 'first',
    gate: [{ read: 'drill.food-ahead.edgeLow', min: 0.3 }],
    minGenerations: 1,
    maxGenerations: 10,
};
const ADAPTIVE = {
    name: 'hunt',
    gate: [{ read: 'drill.prey-ahead.edgeLow', min: 0.3 }],
    minGenerations: 1,
    maxGenerations: 10,
    adapt: ADAPT,
};
const LATER = { name: 'later', gate: [{ read: 'drill.food-ahead.edgeLow', min: 0.3 }], maxGenerations: 10 };
const pass = { readings: { drill: { 'food-ahead': { edgeLow: 1 }, 'prey-ahead': { edgeLow: 1 } } } };

/** @param {any} state a state @returns {any} the state after enough passing checkpoints to move on */
const held = (state) => {
    let now = state;
    while (now.index === state.index) {
        now = nextStage(now, pass).state;
    }
    return now;
};

describe('the difficulty of a run state', () => {
    it('is null for a stage with no adapt and adapt.from for one with', () => {
        expect(initialState([FIRST, ADAPTIVE], 40).difficulty).toBeNull();
        expect(initialState([ADAPTIVE], 40).difficulty).toBe(0.1);
        expect(episodeDifficulty(initialState([FIRST, ADAPTIVE], 40))).toBeNull();
    });

    it('is reset to adapt.from when an adaptive stage begins, and to null when a plain one does', () => {
        let state = initialState([FIRST, ADAPTIVE, LATER], 40);
        state = held(state);
        expect(state.index).toBe(1);
        expect(state.difficulty).toBe(0.1);
        state = { ...state, difficulty: 0.6 };
        expect(episodeDifficulty(state)).toBe(0.6);
        state = held(state);
        expect(state.index).toBe(2);
        expect(state.difficulty).toBeNull();
    });

    it('runs a review of a passed stage at the full value', () => {
        const state = { ...initialState([ADAPTIVE, LATER], 40), difficulty: 0.4, review: { index: 0, left: 2 } };
        expect(episodeDifficulty(state)).toBe(1);
        expect(episodeDifficulty({ ...state, index: 1, review: { index: 1, left: 2 } })).toBeNull();
    });
});

describe('the difficulty in a saved state', () => {
    it('is carried through snapshotState and restoreState', () => {
        const state = { ...initialState([ADAPTIVE], 40), difficulty: 0.35 };
        const saved = JSON.parse(JSON.stringify(snapshotState(state)));
        expect(saved.difficulty).toBe(0.35);
        expect(restoreState([ADAPTIVE], 40, saved).difficulty).toBe(0.35);
    });

    it('restores an old save without it as adapt.from, or null when the stage has no adapt', () => {
        const old = (/** @type {any[]} */ stages, /** @type {number} */ index) => {
            const saved = /** @type {Record<string, any>} */ (snapshotState({ ...initialState(stages, 40), index }));
            delete saved.difficulty;
            return restoreState(stages, 40, saved);
        };
        expect(old([ADAPTIVE], 0).difficulty).toBe(0.1);
        expect(old([FIRST, ADAPTIVE], 1).difficulty).toBe(0.1);
        expect(old([FIRST, ADAPTIVE], 0).difficulty).toBeNull();
    });

    it('accepts a saved null', () => {
        const saved = snapshotState(initialState([FIRST], 40));
        expect(restoreState([FIRST], 40, saved).difficulty).toBeNull();
    });
});
