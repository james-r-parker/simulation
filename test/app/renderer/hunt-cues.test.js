import { describe, expect, it } from 'vitest';
import {
    easeJaw,
    JAW_RATE,
    jawTarget,
    SPRINT_FROM,
    sprintAmp,
    THRUST_REST,
    thrustOf,
} from '../../../js/app/renderer/hunt-cues.js';

describe('jawTarget', () => {
    it('is 1 while the BITE output holds the jaw open and 0 otherwise', () => {
        const bits = { JAW_OPEN: 4 };
        expect(jawTarget(4 | 1, bits)).toBe(1);
        expect(jawTarget(3, bits)).toBe(0);
    });
});

describe('easeJaw', () => {
    it('moves 1 - 1/e of the way in 1/JAW_RATE seconds, whatever the frame rate', () => {
        const once = easeJaw(0, { target: 1, dtMs: 1000 / JAW_RATE });
        expect(once).toBeCloseTo(1 - Math.exp(-1), 6);
        let split = 0;
        for (let i = 0; i < 4; i++) {
            split = easeJaw(split, { target: 1, dtMs: 1000 / JAW_RATE / 4 });
        }
        expect(split).toBeCloseTo(once, 6);
    });

    it('stays put at the target and shuts as well as opens', () => {
        expect(easeJaw(1, { target: 1, dtMs: 16 })).toBe(1);
        expect(easeJaw(1, { target: 0, dtMs: 16 })).toBeLessThan(1);
    });
});

describe('thrustOf and sprintAmp', () => {
    it('thrust runs from its rest value to 1 and is clamped', () => {
        expect(thrustOf(0)).toBe(THRUST_REST);
        expect(thrustOf(1)).toBe(1);
        expect(thrustOf(5)).toBe(1);
        expect(thrustOf(-1)).toBe(THRUST_REST);
    });

    it('the sprint stretch is 0 up to SPRINT_FROM and 1 at top speed', () => {
        expect(sprintAmp(SPRINT_FROM)).toBe(0);
        expect(sprintAmp(0.2)).toBe(0);
        expect(sprintAmp(1)).toBe(1);
        expect(sprintAmp((1 + SPRINT_FROM) / 2)).toBeCloseTo(0.5);
    });
});
