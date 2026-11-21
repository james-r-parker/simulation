import { describe, expect, it } from 'vitest';
import {
    BODY_INPUT,
    BODY_SENSE_VALUES,
    EXTRA_INPUTS,
    GENE_OUTPUTS,
    GENE_OUTPUT_COUNT,
    OUTPUT_COUNT,
    OUTPUT_INDEX,
    POOLED_VALUES,
    RAY_CHANNELS,
    TRAIT_GENES,
    TRAIT_INDEX,
    TRAIT_SLOTS,
    brainLayout,
    inputOffsets,
} from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';

/**
 * The per-block derivation of the genome row: wIn, wRec, bHidden, wOut, bOut, wSkip, trait genes, leak genes. The
 * three output blocks have 10 columns: the 11 outputs less `SPLIT`; the skip block has a row per pooled value (69) and
 * the trait block 24 slots.
 * @param {number} inputs the inputs the brain multiplies
 * @param {number} H hidden units
 * @returns {number} floats in a row
 */
function derive(inputs, H) {
    return inputs * H + H * H + H + H * 10 + 10 + 69 * 10 + 24 + H;
}

describe('brainLayout', () => {
    it('gives 106 inputs (69 pooled and 37 body), 197 raw values and 5524 weights at the defaults', () => {
        const layout = brainLayout(createConfig());
        expect(layout.inputCount).toBe(106);
        expect(layout.rawInputCount).toBe(197);
        expect(layout.weightCount).toBe(5524);
        expect(layout.outputCount).toBe(OUTPUT_COUNT);
    });

    it.each([
        [16, 2868],
        [24, 4132],
        [32, 5524],
        [48, 8692],
        [64, 12372],
    ])('pins the genome size at %i hidden to %i floats, equal to the per-block derivation', (hidden, floats) => {
        const layout = brainLayout(createConfig({ brainHidden: hidden }));
        expect(layout.weightCount).toBe(floats);
        expect(derive(106, hidden)).toBe(floats);
    });

    it('does not depend on the ray count except in the raw row', () => {
        const a = brainLayout(createConfig({ rayCount: 8 }));
        const b = brainLayout(createConfig({ rayCount: 32 }));
        expect(a.weightCount).toBe(b.weightCount);
        expect(a.inputCount).toBe(b.inputCount);
        expect(b.rawInputCount - a.rawInputCount).toBe(24 * RAY_CHANNELS);
    });

    it('counts 9 pooled channels of 6 values (two hits of 3), 13 body sense values, 2 hues, 10 ray channels, 37 body inputs and 11 outputs', () => {
        expect([POOLED_VALUES, BODY_SENSE_VALUES, RAY_CHANNELS, EXTRA_INPUTS, OUTPUT_COUNT]).toEqual([
            69, 13, 10, 37, 11,
        ]);
    });

    it('holds 24 trait slots: the 18 named genes at 0 to 17 and six spare', () => {
        expect([TRAIT_SLOTS, TRAIT_GENES]).toEqual([24, 24]);
        expect(Object.values(TRAIT_INDEX)).toEqual(Array.from({ length: 18 }, (_, i) => i));
        expect(TRAIT_INDEX).toMatchObject({ SIZE: 0, VISION: 1, CHILD_SHARE: 2, LEARN: 3, SPEED: 4, NERVE: 17 });
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
        expect(l.bOut).toBe(l.wOut + 3 * 10);
        expect(l.traitStart).toBe(l.wSkip + 69 * 10);
        expect(l.leakStart).toBe(l.traitStart + TRAIT_GENES);
        expect(l.weightCount).toBe(l.leakStart + 3);
    });

    it.each([16, 24, 32, 48, 64])('puts every block offset at its derived size at %i hidden', (H) => {
        /** @type {Record<string, number>} */
        const l = { ...brainLayout(createConfig({ brainHidden: H })) };
        const sizes = {
            wIn: 106 * H,
            wRec: H * H,
            bHidden: H,
            wOut: H * 10,
            bOut: 10,
            wSkip: 69 * 10,
            traitStart: 24,
            leakStart: H,
        };
        let at = 0;
        for (const [block, size] of Object.entries(sizes)) {
            expect(l[block]).toBe(at);
            at += size;
        }
        expect(l.weightCount).toBe(at);
    });

    it('gives the SPLIT output no gene column: 10 gene columns map to the other ten outputs', () => {
        expect(GENE_OUTPUT_COUNT).toBe(10);
        expect(GENE_OUTPUTS).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 9, 10]);
        expect(GENE_OUTPUTS).not.toContain(OUTPUT_INDEX.SPLIT);
        const layout = brainLayout(createConfig());
        expect(layout.geneOutputs).toBe(10);
        expect(layout.outputCount).toBe(11);
    });

    it('is frozen', () => {
        expect(Object.isFrozen(brainLayout(createConfig()))).toBe(true);
    });
});

describe('inputOffsets', () => {
    it('matches a naive offset table of the 69 pooled values then the 37 body inputs', () => {
        const off = inputOffsets(createConfig({ rayCount: 16 }));
        const names = ['food', 'threat', 'prey', 'other', 'kin', 'wall', 'obstacle', 'smoke', 'megafauna'];
        names.forEach((name, c) => expect(off.pooled[name]).toBe(6 * c));
        expect([off.senseStart, off.countStart, off.foodHueStart]).toEqual([54, 63, 67]);
        expect(off.bodyStart).toBe(69);
        expect(off.scentStart).toBe(69 + 17);
        expect(off.huntScent).toBe(69 + 21);
        expect(off.heardAlarm).toBe(69 + 24);
        expect(off.heardHunt).toBe(69 + 27);
        expect(off.sex).toBe(69 + 30);
        expect([off.memoryA, off.memoryB]).toEqual([69 + 31, 69 + 32]);
        expect(off.refuge).toBe(69 + 33);
        expect(off.reserve).toBe(69 + 36);
        expect(off.rawBodyStart).toBe(16 * 10);
    });

    it('puts the scent block, the sex input, the memory pair, the refuge and the reserve at the end of the body block', () => {
        expect(BODY_INPUT.SCENT + 13).toBe(BODY_INPUT.SEX);
        expect(BODY_INPUT.REFUGE_NEAR + 1).toBe(BODY_INPUT.RESERVE);
        expect(BODY_INPUT.RESERVE).toBe(EXTRA_INPUTS - 1);
        expect(BODY_INPUT.MEMORY_B + 1).toBe(BODY_INPUT.REFUGE_BEARING_SIN);
    });

    it('moves the raw body start with the ray count and nothing else', () => {
        const a = inputOffsets(createConfig({ rayCount: 8 }));
        const b = inputOffsets(createConfig({ rayCount: 16 }));
        expect({ ...a, rawBodyStart: 0 }).toEqual({ ...b, rawBodyStart: 0 });
        expect(b.rawBodyStart - a.rawBodyStart).toBe(8 * 10);
    });
});
