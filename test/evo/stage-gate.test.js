import { describe, expect, it } from 'vitest';
import { GATE_HOLD, gateState, readGate, streaksOf, validateGate } from '../../js/evo/stage-gate.js';

const EDGE = [{ read: 'drill.food-ahead.edgeLow', min: 0.3 }];
const at = (/** @type {number | null} */ edgeLow) => ({ drill: { 'food-ahead': { edgeLow } } });

describe('readGate', () => {
    it('passes when every condition holds, reading nested or flat keys, bounds inclusive', () => {
        const gate = [...EDGE, { read: 'drill.food-ahead.lossShare.never-bit', max: 0.5 }];
        const nested = { drill: { 'food-ahead': { edgeLow: 0.3, lossShare: { 'never-bit': 0.5 } } } };
        expect(readGate(gate, nested).passed).toBe(true);
        expect(readGate(EDGE, { 'drill.food-ahead.edgeLow': 0.31 }).passed).toBe(true);
        expect(readGate(EDGE, at(0.29))).toMatchObject({
            passed: false,
            conditions: [{ read: 'drill.food-ahead.edgeLow', value: 0.29, min: 0.3, passed: false }],
        });
    });

    it('fails on a null, missing or non-finite reading and on one failing condition among passing ones', () => {
        expect(readGate(EDGE, at(null)).passed).toBe(false);
        expect(readGate(EDGE, {}).conditions[0].value).toBeNull();
        expect(readGate(EDGE, at(NaN)).passed).toBe(false);
        const two = [...EDGE, { read: 'retention.all', min: 1 }];
        expect(readGate(two, { ...at(1), retention: { all: 0 } }).passed).toBe(false);
    });
});

describe('gateState', () => {
    it('holds after GATE_HOLD passes in a row, and one miss resets the run', () => {
        expect(GATE_HOLD).toBe(2);
        expect(gateState([at(0.5)], EDGE)).toMatchObject({ streak: 1, held: false });
        expect(gateState([at(0.5), at(0.4)], EDGE)).toMatchObject({ streak: 2, held: true });
        expect(gateState([at(0.5), at(0.1), at(0.4)], EDGE)).toMatchObject({ streak: 1, held: false });
    });

    it('reads a regression as GATE_HOLD failures in a row and names the last read', () => {
        const state = gateState([at(0.5), at(0.1), at(0.2)], EDGE);
        expect(state).toMatchObject({ failStreak: 2, regressed: true, held: false });
        expect(state.last?.passed).toBe(false);
        expect(gateState([], EDGE)).toMatchObject({ streak: 0, failStreak: 0, last: null });
    });

    it('counts trailing runs of booleans', () => {
        expect(streaksOf([true, false, false, false])).toMatchObject({ failStreak: 3, streak: 0, regressed: true });
        expect(streaksOf([false, true, true, true], 3)).toMatchObject({ streak: 3, held: true });
    });
});

describe('validateGate', () => {
    it('accepts the keys the ladder uses', () => {
        const keys = [
            'drill.prey-ahead.winShareOverReference',
            'drill.pack-converge.blindGapLow',
            'crossplay.preyVsStage.hunt',
            'crossplay.cycleShare',
            'retention.all',
            'retention.hunt',
        ];
        expect(() =>
            validateGate(
                keys.map((read) => ({ read, min: 0 })),
                'c',
            ),
        ).not.toThrow();
    });

    it('refuses an empty gate, a world metric, an unknown key and a missing or double bound', () => {
        expect(() => validateGate([], 'c')).toThrow(/non-empty/);
        expect(() => validateGate([{ read: 'eval.births_per_1k', min: 1 }], 'c')).toThrow(/world metric/);
        expect(() => validateGate([{ read: 'drill.x.nope', min: 1 }], 'c')).toThrow(/unknown reading/);
        expect(() => validateGate([{ read: 'retention.all' }], 'c')).toThrow(/exactly one/);
        expect(() => validateGate([{ read: 'retention.all', min: 1, max: 2 }], 'c')).toThrow(/exactly one/);
        expect(() => validateGate([null], 'c')).toThrow(/expected/);
    });
});
