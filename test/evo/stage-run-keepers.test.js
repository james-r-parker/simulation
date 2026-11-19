import { describe, expect, it } from 'vitest';
import { initialState, nextStage } from '../../js/evo/stage-run.js';

const EDGE = (/** @type {string} */ drill) => [{ read: `drill.${drill}.edgeLow`, min: 0.3 }];
const NURSERY = { name: 'nursery', gate: EDGE('food-ahead'), minGenerations: 2, maxGenerations: 5, keepPasser: true };
const HUNT = { name: 'hunt', gate: EDGE('prey-ahead'), minGenerations: 2, maxGenerations: 40 };
const WORLD = { name: 'world' };

/** @param {number} food @param {number} prey @param {number | null} [kept] the keeper's food reading (null: no keeper) */
const reading = (food, prey, kept = null) => ({
    readings: {
        drill: { 'food-ahead': { edgeLow: food }, 'prey-ahead': { edgeLow: prey } },
        ...(kept === null ? {} : { keepers: { nursery: { 'food-ahead': { edgeLow: kept } } } }),
    },
});

/** @param {import('../../js/evo/stage-run.js').RunState} start @param {any[]} script @returns {{state: any, events: any[]}} */
function drive(start, script) {
    let state = start;
    /** @type {any[]} */
    const events = [];
    for (const checkpoint of script) {
        const step = nextStage(state, checkpoint);
        state = step.state;
        events.push(...step.events);
    }
    return { state, events };
}

const passedNursery = (/** @type {any} */ nursery = NURSERY) =>
    drive(initialState([nursery, HUNT, WORLD], 80), [reading(0.9, 0), reading(0.9, 0)]).state;

describe('nextStage with a kept passer', () => {
    it('does not regress a passed stage whose kept passer still passes, and says it was kept', () => {
        const lost = reading(0.1, 0.1, 0.9);
        const { state, events } = drive(passedNursery(), [lost, lost, lost, lost]);
        expect(events.map((e) => e.event)).toEqual(['TrainGate', 'TrainGate', 'TrainGate', 'TrainGate']);
        expect(events[3].fields.retention).toEqual({ nursery: 1, all: 1 });
        expect(events[3].fields.kept).toEqual(['nursery']);
        expect(state.review).toBeNull();
        expect(state.failStreaks.nursery).toBe(0);
    });

    it('still regresses when the kept passer fails too', () => {
        const lost = reading(0.1, 0.1, 0.2);
        const { events } = drive(passedNursery(), [lost, lost, lost]);
        expect(events.map((e) => e.event)).toContain('TrainStageRegressed');
    });

    it('is unchanged when no passer is kept or the stage does not ask for one', () => {
        const lost = reading(0.1, 0.1);
        const regressed = drive(passedNursery(), [lost, lost, lost]).events.map((e) => e.event);
        expect(regressed).toEqual(['TrainGate', 'TrainGate', 'TrainStageRegressed', 'TrainReview']);
        const plain = { ...NURSERY, keepPasser: undefined };
        const withKeeper = reading(0.1, 0.1, 0.9);
        const events = drive(passedNursery(plain), [withKeeper, withKeeper, withKeeper]).events.map((e) => e.event);
        expect(events).toContain('TrainStageRegressed');
    });
});
