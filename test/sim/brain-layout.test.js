import { describe, expect, it } from 'vitest';
import {
    EXTRA_INPUTS,
    OUTPUT_COUNT,
    OUTPUT_INDEX,
    RAY_CHANNELS,
    TRAIT_GENES,
    brainLayout,
} from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';

describe('brainLayout', () => {
    it('gives 179 inputs and 7183 weights at the defaults', () => {
        const layout = brainLayout(createConfig());
        expect(layout.inputCount).toBe(179);
        expect(layout.weightCount).toBe(7183);
        expect(layout.outputCount).toBe(OUTPUT_COUNT);
    });

    it('counts 9 ray channels, 35 extra inputs and 11 outputs', () => {
        expect([RAY_CHANNELS, EXTRA_INPUTS, OUTPUT_COUNT]).toEqual([9, 35, 11]);
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
            SPLIT: 8,
            MEMORY_A: 9,
            MEMORY_B: 10,
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
        expect(l.traitStart).toBe(l.bOut + OUTPUT_COUNT);
        expect(l.leakStart).toBe(l.traitStart + TRAIT_GENES);
        expect(l.weightCount).toBe(l.leakStart + 3);
    });

    it('is frozen', () => {
        expect(Object.isFrozen(brainLayout(createConfig()))).toBe(true);
    });
});
