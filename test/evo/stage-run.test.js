import { describe, expect, it } from 'vitest';
import {
    checkpointDue,
    currentEntry,
    initialState,
    needsGate,
    nextStage,
    restoreState,
    snapshotState,
} from '../../js/evo/stage-run.js';

const EDGE = (/** @type {string} */ drill) => [{ read: `drill.${drill}.edgeLow`, min: 0.3 }];
const NURSERY = { name: 'nursery', gate: EDGE('food-ahead'), minGenerations: 2, maxGenerations: 5 };
const HUNT = {
    name: 'hunt',
    gate: [...EDGE('prey-ahead'), { read: 'retention.all', min: 1 }],
    minGenerations: 2,
    maxGenerations: 8,
};
const WORLD = { name: 'world' };

/**
 * @param {number | null} food nursery reading
 * @param {number | null} [prey] hunt reading
 * @returns {{readings: Record<string, any>}} a checkpoint
 */
const reading = (food, prey = null) => ({
    readings: { drill: { 'food-ahead': { edgeLow: food }, 'prey-ahead': { edgeLow: prey } } },
});

/**
 * Runs generations, taking a checkpoint after each with the next scripted reading.
 * @param {import('../../js/evo/stage-run.js').RunState} start the state
 * @param {({readings: Record<string, any>} | null)[]} script one checkpoint (or none) per generation
 * @returns {{state: import('../../js/evo/stage-run.js').RunState, events: string[]}} the end state and the event names
 */
function drive(start, script) {
    let state = start;
    /** @type {string[]} */
    const events = [];
    for (const checkpoint of script) {
        const step = nextStage(state, checkpoint);
        state = step.state;
        events.push(...step.events.map((e) => e.event));
    }
    return { state, events };
}

describe('nextStage', () => {
    it('passes a stage on two passes in a row once its minimum generations have run, then moves to the next', () => {
        const start = initialState([NURSERY, HUNT, WORLD], 40);
        const { state, events } = drive(start, [reading(0.9), reading(0.9), reading(0.9)]);
        expect(events).toEqual(['TrainGate', 'TrainGate', 'TrainStagePassed', 'TrainGate']);
        expect(state.passed.nursery).toMatchObject({ passedAt: 2, checkpoints: 2 });
        expect(state).toMatchObject({ index: 1, count: 1, generation: 3, status: 'running' });
        expect(currentEntry(state).name).toBe('hunt');
    });

    it('does not pass before the minimum generations, and one miss resets the run of passes', () => {
        const start = initialState([NURSERY, WORLD], 40);
        const early = drive(start, [reading(0.9)]);
        expect(early.state.index).toBe(0);
        const missed = drive(start, [reading(0.9), reading(0.1), reading(0.9), reading(0.9)]);
        expect(missed.events.filter((e) => e === 'TrainStagePassed')).toHaveLength(1);
        expect(missed.state.passed.nursery.passedAt).toBe(4);
    });

    it('stalls a required stage at its maximum generations, naming the failing conditions', () => {
        const { state, events } = drive(initialState([NURSERY, WORLD], 40), Array(5).fill(reading(0.1)));
        expect(events.at(-1)).toBe('TrainStageStalled');
        expect(state.status).toBe('stalled');
        expect(state.stalled[0]).toMatchObject({ stage: 'nursery', optional: false, generation: 5 });
        expect(state.stalled[0].failing).toEqual([
            { read: 'drill.food-ahead.edgeLow', value: 0.1, min: 0.3, passed: false },
        ]);
    });

    it('lets an optional stage stall and moves on; a stall with no checkpoint reads no failing condition', () => {
        const optional = { ...NURSERY, optional: true };
        const { state } = drive(initialState([optional, WORLD], 40), Array(5).fill(reading(0.1)));
        expect(state).toMatchObject({ status: 'running', index: 1 });
        expect(state.stalled[0]).toMatchObject({ stage: 'nursery', optional: true });
        const blind = drive(initialState([optional, WORLD], 40), Array(5).fill(null));
        expect(blind.state.stalled[0].failing).toEqual([]);
    });

    it('runs fixed stages for their generations and the last to the end, with no gate events', () => {
        const stages = [{ name: 'a', generations: 2 }, { name: 'b', generations: 1 }, WORLD];
        const { state, events } = drive(initialState(stages, 9), Array(4).fill(null));
        expect(events).toEqual([]);
        expect(state).toMatchObject({ index: 2, count: 1, ran: { a: 2, b: 1, world: 1 } });
    });

    it('finishes the run when the last stage is gated and passes', () => {
        const { state } = drive(initialState([NURSERY], 40), [reading(0.9), reading(0.9)]);
        expect(state.status).toBe('done');
    });

    it('reads retention after the stage minimum: two failures in a row regress, review and return', () => {
        const passedNursery = drive(initialState([NURSERY, HUNT, WORLD], 60), [reading(0.9), reading(0.9)]).state;
        expect(passedNursery.index).toBe(1);
        const good = reading(0.9, 0.9);
        const lost = reading(0.1, 0.9);
        const steps = drive(passedNursery, [good, lost, lost]);
        expect(steps.events).toEqual(['TrainGate', 'TrainGate', 'TrainStageRegressed', 'TrainReview']);
        expect(steps.state.review).toEqual({ index: 0, left: 5 });
        expect(steps.state.reviews).toEqual({ nursery: 1 });
        expect(currentEntry(steps.state).name).toBe('nursery');
        expect(needsGate(steps.state)).toBe(false);
        const back = drive(steps.state, Array(5).fill(good));
        expect(back.events).toEqual([]);
        expect(back.state).toMatchObject({ review: null, index: 1, history: [], failStreaks: {} });
        expect(back.state.ran.nursery).toBe(7);
        expect(currentEntry(back.state).name).toBe('hunt');
    });

    it('stops the run as a stall when a stage regresses after REVIEW_MAX reviews', () => {
        let state = drive(initialState([NURSERY, { ...HUNT, maxGenerations: 100 }, WORLD], 400), [
            reading(0.9),
            reading(0.9),
        ]).state;
        state = drive(state, [reading(0.9, 0.9), reading(0.9, 0.9)]).state;
        const lost = reading(0.1, 0.9);
        for (let review = 1; review <= 3; review++) {
            state = drive(state, [lost, lost]).state;
            expect(state.reviews.nursery).toBe(review);
            state = drive(state, Array(5).fill(null)).state;
        }
        const last = drive(state, [lost, lost]);
        expect(last.events).toEqual(['TrainGate', 'TrainStageRegressed', 'TrainStageStalled']);
        expect(last.state).toMatchObject({ status: 'stalled', stalled: [{ stage: 'nursery' }] });
    });

    it('ignores a checkpoint during a review and does not mutate its input', () => {
        const start = initialState([NURSERY, HUNT, WORLD], 60);
        const frozen = JSON.stringify(snapshotState(start));
        nextStage(start, reading(0.9));
        expect(JSON.stringify(snapshotState(start))).toBe(frozen);
    });
});

describe('checkpointDue and needsGate', () => {
    it('is due on the interval, at the run end and at the generation a gated stage would stall', () => {
        const start = initialState([NURSERY, WORLD], 40);
        expect(checkpointDue(start, 0)).toBe(false);
        expect(checkpointDue(start, 1)).toBe(true);
        expect(checkpointDue(start, 10)).toBe(false);
        const late = { ...start, count: 4 };
        expect(checkpointDue(late, 10)).toBe(true);
        expect(checkpointDue({ ...start, generation: 39, count: 0 }, 10)).toBe(true);
        expect(needsGate(start)).toBe(true);
        expect(needsGate(initialState([WORLD], 4))).toBe(false);
    });
});

describe('snapshotState and restoreState', () => {
    it('round-trips through JSON and refuses other stages', () => {
        const stages = [NURSERY, HUNT, WORLD];
        const state = drive(initialState(stages, 40), [reading(0.9), reading(0.9), reading(0.9, 0.9)]).state;
        const saved = JSON.parse(JSON.stringify(snapshotState(state)));
        expect(restoreState(stages, 40, saved)).toEqual(state);
        expect(() => restoreState([NURSERY, WORLD], 40, saved)).toThrow(/written by stages/);
        expect(() => restoreState(stages, 40, {})).toThrow(/written by stages/);
    });
});
