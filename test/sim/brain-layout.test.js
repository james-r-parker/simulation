import { describe, expect, it } from 'vitest';
import {
    BODY_INPUT,
    EXTRA_INPUTS,
    GENE_OUTPUTS,
    GENE_OUTPUT_COUNT,
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
 * The per-block derivation of the genome row: wIn, wRec, bHidden, wOut, bOut, wSkip, trait genes, leak genes. The
 * three output blocks have 10 columns: the 11 outputs less `SPLIT`.
 * @param {number} inputs the inputs the brain multiplies
 * @param {number} H hidden units
 * @returns {number} floats in a row
 */
function derive(inputs, H) {
    return inputs * H + H * H + H + H * 10 + 10 + 56 * 10 + 4 + H;
}

describe('brainLayout', () => {
    it('gives 89 inputs (56 pooled and 33 body), 193 raw values and 4830 weights at the defaults', () => {
        const layout = brainLayout(createConfig());
        expect(layout.inputCount).toBe(89);
        expect(layout.rawInputCount).toBe(193);
        expect(layout.weightCount).toBe(4830);
        expect(layout.outputCount).toBe(OUTPUT_COUNT);
    });

    it.each([
        [16, 2446],
        [24, 3574],
        [32, 4830],
        [48, 7726],
        [64, 11134],
    ])('pins the genome size at %i hidden to %i floats, equal to the per-block derivation', (hidden, floats) => {
        const layout = brainLayout(createConfig({ brainHidden: hidden }));
        expect(layout.weightCount).toBe(floats);
        expect(derive(89, hidden)).toBe(floats);
    });

    it('does not depend on the ray count except in the raw row', () => {
        const a = brainLayout(createConfig({ rayCount: 8 }));
        const b = brainLayout(createConfig({ rayCount: 32 }));
        expect(a.weightCount).toBe(b.weightCount);
        expect(a.inputCount).toBe(b.inputCount);
        expect(b.rawInputCount - a.rawInputCount).toBe(24 * RAY_CHANNELS);
    });

    it('counts 9 pooled channels of 6 values (two hits of 3), 10 ray channels, 33 body inputs and 11 outputs', () => {
        expect([POOLED_VALUES, RAY_CHANNELS, EXTRA_INPUTS, OUTPUT_COUNT]).toEqual([56, 10, 33, 11]);
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
        expect(l.traitStart).toBe(l.wSkip + 56 * 10);
        expect(l.leakStart).toBe(l.traitStart + TRAIT_GENES);
        expect(l.weightCount).toBe(l.leakStart + 3);
    });

    it.each([16, 24, 32, 48, 64])('puts every block offset at its derived size at %i hidden', (H) => {
        /** @type {Record<string, number>} */
        const l = { ...brainLayout(createConfig({ brainHidden: H })) };
        const sizes = {
            wIn: 89 * H,
            wRec: H * H,
            bHidden: H,
            wOut: H * 10,
            bOut: 10,
            wSkip: 56 * 10,
            traitStart: 4,
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
    it('matches a naive offset table of the 56 pooled values then the 33 body inputs', () => {
        const off = inputOffsets(createConfig({ rayCount: 16 }));
        const names = ['food', 'threat', 'prey', 'other', 'kin', 'wall', 'obstacle', 'smoke', 'megafauna'];
        names.forEach((name, c) => expect(off.pooled[name]).toBe(6 * c));
        expect(off.bodyStart).toBe(56);
        expect(off.scentStart).toBe(56 + 17);
        expect(off.huntScent).toBe(56 + 21);
        expect(off.heardAlarm).toBe(56 + 24);
        expect(off.heardHunt).toBe(56 + 27);
        expect(off.sex).toBe(56 + 30);
        expect([off.memoryA, off.memoryB]).toEqual([56 + 31, 56 + 32]);
        expect(off.rawBodyStart).toBe(16 * 10);
    });

    it('puts the scent block, the sex input and the memory pair at the end of the body block', () => {
        expect(BODY_INPUT.SCENT + 13).toBe(BODY_INPUT.SEX);
        expect(BODY_INPUT.MEMORY_B).toBe(EXTRA_INPUTS - 1);
    });

    it('moves the raw body start with the ray count and nothing else', () => {
        const a = inputOffsets(createConfig({ rayCount: 8 }));
        const b = inputOffsets(createConfig({ rayCount: 16 }));
        expect({ ...a, rawBodyStart: 0 }).toEqual({ ...b, rawBodyStart: 0 });
        expect(b.rawBodyStart - a.rawBodyStart).toBe(8 * 10);
    });
});
