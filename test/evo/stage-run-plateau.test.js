import { describe, expect, it } from 'vitest';
import { initialState, nextStage } from '../../js/evo/stage-run.js';

const GATE = [{ read: 'drill.prey-ahead.winShareLow', min: 0.9 }];
const STAGE = { name: 'hunt', gate: GATE, minGenerations: 2, maxGenerations: 30, plateauStop: 3 };
const WORLD = { name: 'world' };

/** @param {number} progress the drill's win share and jaw share low bounds (`prey-ahead` is a bite drill) */
const at = (progress) => ({ readings: { drill: { 'prey-ahead': { winShareLow: progress, jawShareLow: progress } } } });

/**
 * @param {import('../../js/evo/stage-run.js').RunState} start the state
 * @param {number[]} progress one gate checkpoint per generation
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

describe('the plateau stop', () => {
    it('stalls a required stage when the best progress has not risen by PROGRESS_RISE over plateauStop checkpoints', () => {
        const { state, events } = drive(initialState([STAGE, WORLD], 60), [0.1, 0.3, 0.3, 0.31, 0.3]);
        expect(state.status).toBe('stalled');
        const stall = events.at(-1);
        expect(stall?.event).toBe('TrainStageStalled');
        expect(stall?.fields).toMatchObject({ stage: 'hunt', generation: 5, reason: 'plateau', bestProgress: 0.31 });
        expect(state.stalled[0].reason).toBe('plateau');
    });

    it('keeps going while the best still rises by PROGRESS_RISE within the window', () => {
        const { state } = drive(initialState([STAGE, WORLD], 60), [0.1, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45]);
        expect(state.status).toBe('running');
        expect(state.index).toBe(0);
    });

    it('waits for minGenerations and for plateauStop checkpoints', () => {
        const slow = { ...STAGE, minGenerations: 5, plateauStop: 2 };
        const { state } = drive(initialState([slow, WORLD], 60), [0.2, 0.2, 0.2, 0.2]);
        expect(state.status).toBe('running');
        expect(drive(initialState([slow, WORLD], 60), [0.2, 0.2, 0.2, 0.2, 0.2]).state.status).toBe('stalled');
    });

    it('lets an optional stage stall on a plateau and the ladder move on, with the history cleared', () => {
        const optional = { ...STAGE, optional: true };
        const { state } = drive(initialState([optional, WORLD], 60), [0.3, 0.3, 0.3, 0.3]);
        expect(state).toMatchObject({ status: 'running', index: 1, count: 0, progressHistory: [] });
        expect(state.stalled[0]).toMatchObject({ optional: true, reason: 'plateau' });
    });

    it('does nothing with plateauStop 0 or absent, and for a gate that names no drill', () => {
        const flat = Array(12).fill(0.2);
        for (const stop of [{ plateauStop: 0 }, { plateauStop: undefined }]) {
            expect(drive(initialState([{ ...STAGE, ...stop }, WORLD], 60), flat).state.status).toBe('running');
        }
        const blind = { ...STAGE, gate: [{ read: 'retention.all', min: 1 }] };
        expect(drive(initialState([blind, WORLD], 60), flat).state.status).toBe('running');
    });

    it('never stalls on a plateau at a checkpoint where the gate passes', () => {
        const high = drive(initialState([STAGE, WORLD], 60), [0.95, 0.95, 0.95]);
        expect(high.state).toMatchObject({ status: 'running', index: 1 });
        expect(high.events.map((e) => e.event)).toEqual(['TrainGate', 'TrainGate', 'TrainStagePassed']);
        // flat progress 0.475 (win 0.95, jaw 0), so the plateau holds from the fourth checkpoint, but that one passes the gate
        const flat = (/** @type {number} */ win) => ({
            readings: { drill: { 'prey-ahead': { winShareLow: win, jawShareLow: 0.95 - win } } },
        });
        let state = initialState([STAGE, WORLD], 60);
        for (const win of [0.5, 0.5, 0.5, 0.95]) {
            state = nextStage(state, flat(win)).state;
        }
        expect(state).toMatchObject({ status: 'running', index: 0, count: 4 });
    });

    it('stalls with reason max when the plateau and the maximum fall on the same checkpoint', () => {
        const tight = { ...STAGE, maxGenerations: 4 };
        const { state } = drive(initialState([tight, WORLD], 60), [0.1, 0.1, 0.1, 0.1]);
        expect(state.stalled).toHaveLength(1);
        expect(state.stalled[0]).toMatchObject({ reason: 'max', generation: 4 });
    });

    it('stalls with reason max at the maximum when the stage never plateaued', () => {
        const rising = { ...STAGE, maxGenerations: 4 };
        const { state } = drive(initialState([rising, WORLD], 60), [0.1, 0.2, 0.3, 0.4]);
        expect(state.stalled[0]).toMatchObject({ reason: 'max', bestProgress: 0.4 });
    });
});
