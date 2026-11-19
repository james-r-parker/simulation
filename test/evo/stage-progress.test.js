import { describe, expect, it } from 'vitest';
import { BITE_DRILLS, PROGRESS_RISE, bestOf, gateDrills, stageProgress } from '../../js/evo/stage-progress.js';

const win = (/** @type {number | null} */ winShareLow, /** @type {number | null} */ jawShareLow = null) => ({
    winShareLow,
    jawShareLow,
});

describe('gateDrills', () => {
    it('names each drill a condition reads once and skips retention and cross-play conditions', () => {
        const gate = [
            { read: 'drill.prey-ahead.winShareOverReference' },
            { read: 'drill.prey-ahead.winShareLow' },
            { read: 'drill.kin-spared.edgeLow' },
            { read: 'retention.all' },
            { read: 'crossplay.cycleShare' },
        ];
        expect(gateDrills(gate)).toEqual(['prey-ahead', 'kin-spared']);
    });
});

describe('stageProgress', () => {
    it('scores a bite drill as the mean of its win share and jaw share', () => {
        const gate = [{ read: 'drill.prey-weak.edgeLow' }];
        expect(stageProgress(gate, { drill: { 'prey-weak': win(0.2, 0.6) } })).toBeCloseTo(0.4, 12);
    });

    it('scores any other drill, kin-spared included, as its win share alone', () => {
        const gate = [{ read: 'drill.food-ahead.edgeLow' }, { read: 'drill.kin-spared.edgeLow' }];
        const readings = { drill: { 'food-ahead': win(0.8, 0.9), 'kin-spared': win(0.4, 0.9) } };
        expect(stageProgress(gate, readings)).toBeCloseTo(0.6, 12);
    });

    it('averages over the gate drills and counts a null or missing reading as 0', () => {
        const gate = [{ read: 'drill.prey-ahead.winShareLow' }, { read: 'drill.prey-crossing.edgeLow' }];
        expect(stageProgress(gate, { drill: { 'prey-ahead': win(0.5, 0.5), 'prey-crossing': win(null, null) } })).toBe(
            0.25,
        );
        expect(stageProgress(gate, { drill: {} })).toBe(0);
        expect(stageProgress(gate, {})).toBe(0);
    });

    it('is 0 for a gate that names no drill, and never leaves 0 to 1', () => {
        expect(stageProgress([{ read: 'retention.all' }], { drill: { a: win(1, 1) } })).toBe(0);
        const full = { drill: Object.fromEntries(BITE_DRILLS.map((name) => [name, win(1, 1)])) };
        expect(
            stageProgress(
                BITE_DRILLS.map((name) => ({ read: `drill.${name}.edgeLow` })),
                full,
            ),
        ).toBe(1);
    });
});

describe('bestOf', () => {
    it('is the highest value, 0 for none, and the rise constant is an absolute 0.02', () => {
        expect(bestOf([0.1, 0.4, 0.3])).toBe(0.4);
        expect(bestOf([])).toBe(0);
        expect(PROGRESS_RISE).toBe(0.02);
    });
});
