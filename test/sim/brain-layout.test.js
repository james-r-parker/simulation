import { describe, expect, it } from 'vitest';
import {
    BODY_INPUT,
    EXTRA_INPUTS,
    OUTPUT_COUNT,
    OUTPUT_INDEX,
    POOLED_VALUES,
    RAY_CHANNELS,
    TRAIT_GENES,
    brainLayout,
    inputOffsets,
} from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';

/**
 * The per-block derivation of the genome row: wIn, wRec, bHidden, wOut, bOut, trait genes, leak genes.
 * @param {number} inputs the inputs the brain multiplies
 * @param {number} H hidden units
 * @returns {number} floats in a row
 */
function derive(inputs, H) {
    return inputs * H + H * H + H + H * 11 + 11 + 4 + H;
}

describe('brainLayout', () => {
    it('gives 59 inputs (24 pooled and 35 body), 179 raw values and 3343 weights at the defaults', () => {
        const layout = brainLayout(createConfig());
        expect(layout.inputCount).toBe(59);
        expect(layout.rawInputCount).toBe(179);
        expect(layout.weightCount).toBe(3343);
        expect(layout.outputCount).toBe(OUTPUT_COUNT);
    });

    it.each([
        [16, 1423],
        [24, 2319],
        [32, 3343],
        [48, 5775],
        [64, 8719],
    ])('pins the genome size at %i hidden to %i floats, equal to the per-block derivation', (hidden, floats) => {
        const layout = brainLayout(createConfig({ brainHidden: hidden }));
        expect(layout.weightCount).toBe(floats);
        expect(derive(59, hidden)).toBe(floats);
    });

    it('does not depend on the ray count except in the raw row', () => {
        const a = brainLayout(createConfig({ rayCount: 8 }));
        const b = brainLayout(createConfig({ rayCount: 32 }));
        expect(a.weightCount).toBe(b.weightCount);
        expect(a.inputCount).toBe(b.inputCount);
        expect(b.rawInputCount - a.rawInputCount).toBe(24 * RAY_CHANNELS);
    });

    it('counts 8 pooled channels of 3 values, 9 ray channels, 35 body inputs and 11 outputs', () => {
        expect([POOLED_VALUES, RAY_CHANNELS, EXTRA_INPUTS, OUTPUT_COUNT]).toEqual([24, 9, 35, 11]);
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

describe('inputOffsets', () => {
    it('matches a naive offset table of the 24 pooled values then the 35 body inputs', () => {
        const off = inputOffsets(createConfig({ rayCount: 16 }));
        const names = ['food', 'threat', 'prey', 'other', 'kin', 'wall', 'obstacle', 'smoke'];
        names.forEach((name, c) => expect(off.pooled[name]).toBe(3 * c));
        expect(off.bodyStart).toBe(24);
        expect(off.scentStart).toBe(24 + 19);
        expect(off.huntScent).toBe(24 + 23);
        expect(off.heardAlarm).toBe(24 + 26);
        expect(off.heardHunt).toBe(24 + 29);
        expect(off.sex).toBe(24 + 32);
        expect([off.memoryA, off.memoryB]).toEqual([24 + 33, 24 + 34]);
        expect(off.rawBodyStart).toBe(16 * 9);
    });

    it('puts the scent block, the sex input and the memory pair at the end of the body block', () => {
        expect(BODY_INPUT.SCENT + 13).toBe(BODY_INPUT.SEX);
        expect(BODY_INPUT.MEMORY_B).toBe(EXTRA_INPUTS - 1);
    });

    it('moves the raw body start with the ray count and nothing else', () => {
        const a = inputOffsets(createConfig({ rayCount: 8 }));
        const b = inputOffsets(createConfig({ rayCount: 16 }));
        expect({ ...a, rawBodyStart: 0 }).toEqual({ ...b, rawBodyStart: 0 });
        expect(b.rawBodyStart - a.rawBodyStart).toBe(8 * 9);
    });
});
