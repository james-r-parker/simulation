import { describe, expect, it } from 'vitest';
import { EXTRA_INPUTS, OUTPUT_COUNT, OUTPUT_INDEX, RAY_CHANNELS, brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';

describe('brainLayout', () => {
    it('gives 176 inputs and 6952 weights at the defaults', () => {
        const layout = brainLayout(createConfig());
        expect(layout.inputCount).toBe(176);
        expect(layout.weightCount).toBe(6952);
        expect(layout.outputCount).toBe(OUTPUT_COUNT);
    });

    it('counts 9 ray channels, 32 extra inputs and 8 outputs', () => {
        expect([RAY_CHANNELS, EXTRA_INPUTS, OUTPUT_COUNT]).toEqual([9, 32, 8]);
    });

    it('names the outputs by index', () => {
        expect(OUTPUT_INDEX).toEqual({
            THRUST: 0,
            TURN: 1,
            SPRINT: 2,
            MATE: 3,
            BITE: 4,
            ALARM: 5,
            SMOKE: 6,
            HUNT: 7,
        });
        expect(Object.isFrozen(OUTPUT_INDEX)).toBe(true);
    });

    it('lays the blocks out contiguously in contract order', () => {
        const config = createConfig({ rayCount: 4, brainHidden: 3 });
        const l = brainLayout(config);
        expect(l.wIn).toBe(0);
        expect(l.wRec).toBe(l.inputCount * 3);
        expect(l.bHidden).toBe(l.wRec + 9);
        expect(l.wOut).toBe(l.bHidden + 3);
        expect(l.bOut).toBe(l.wOut + 3 * OUTPUT_COUNT);
        expect(l.weightCount).toBe(l.bOut + OUTPUT_COUNT);
    });

    it('is frozen', () => {
        expect(Object.isFrozen(brainLayout(createConfig()))).toBe(true);
    });
});
