import { describe, expect, it } from 'vitest';
import { GENOME_VERSION, assertGenomeFits, decodeGenome, encodeGenome } from '../../js/evo/genome.js';
import { randomWeights } from '../../js/evo/mutation.js';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createRng } from '../../js/sim/rng.js';

const layout = brainLayout({ rayCount: 2, brainHidden: 4 });

/** @returns {import('../../js/evo/genome.js').Genome} a genome that fits `layout` */
function makeGenome() {
    const weights = new Float32Array(layout.weightCount);
    randomWeights(weights, layout, createRng(7), 3);
    return {
        version: 2,
        id: 12,
        lineageId: 3,
        parents: [4, 5],
        specialisation: 'scout',
        layout: { inputCount: layout.inputCount, brainHidden: layout.hidden, outputCount: layout.outputCount },
        sigma: 0.05,
        weights,
    };
}

describe('assertGenomeFits', () => {
    it('accepts a genome that fits', () => {
        expect(() => assertGenomeFits(makeGenome(), layout)).not.toThrow();
    });

    it.each([
        ['version', (/** @type {any} */ g) => (g.version = 1), /genome\.version: expected 2, got 1/],
        ['specialisation', (/** @type {any} */ g) => (g.specialisation = 'x'), /genome\.specialisation.*got x/],
        ['layout.inputCount', (/** @type {any} */ g) => (g.layout.inputCount += 1), /genome\.layout\.inputCount/],
        [
            'layout.brainHidden',
            (/** @type {any} */ g) => (g.layout.brainHidden = 5),
            /layout\.brainHidden: expected 4, got 5/,
        ],
        ['layout.outputCount', (/** @type {any} */ g) => (g.layout.outputCount = 4), /genome\.layout\.outputCount/],
        ['weights.length', (/** @type {any} */ g) => (g.weights = g.weights.subarray(1)), /genome\.weights\.length/],
    ])('throws naming %s', (_name, damage, pattern) => {
        const genome = makeGenome();
        damage(genome);
        expect(() => assertGenomeFits(genome, layout)).toThrow(pattern);
    });
});

describe('encodeGenome and decodeGenome', () => {
    it('round-trips bit-exactly through JSON', () => {
        const genome = makeGenome();
        const back = decodeGenome(JSON.parse(JSON.stringify(encodeGenome(genome))));
        expect(back).toEqual(genome);
        expect(back.weights).toBeInstanceOf(Float32Array);
        expect(Array.from(new Uint32Array(back.weights.buffer))).toEqual(
            Array.from(new Uint32Array(genome.weights.buffer)),
        );
        expect(back.weights.every((w) => !Number.isNaN(w))).toBe(true);
    });

    it('stores the weights as base64 text', () => {
        const encoded = encodeGenome(makeGenome());
        expect(typeof encoded.weights).toBe('string');
        expect(() => assertGenomeFits(decodeGenome(encoded), layout)).not.toThrow();
    });

    it('round trips a version 2 genome bit-exactly, trait and leak genes included', () => {
        const genome = makeGenome();
        genome.weights.set([0.25, -0.5, 1, 2], layout.traitStart);
        genome.weights.fill(3, layout.leakStart);
        const back = decodeGenome(JSON.parse(JSON.stringify(encodeGenome(genome))));
        expect(back.version).toBe(GENOME_VERSION);
        expect(back.weights).toHaveLength(layout.weightCount);
        expect(Array.from(back.weights.subarray(layout.traitStart))).toEqual(
            Array.from(genome.weights.subarray(layout.traitStart)),
        );
    });

    it('sizes the weights from brainLayout and refuses a genome of the old 179-input layout by name', () => {
        const encoded = encodeGenome(makeGenome());
        expect(decodeGenome(encoded).weights).toHaveLength(brainLayout({ rayCount: 0, brainHidden: 4 }).weightCount);
        encoded.layout.inputCount = 179;
        expect(() => decodeGenome(encoded)).toThrow(
            /genome\.layout: expected 81 inputs and 11 outputs, got 179 and 11/,
        );
    });

    it('rejects weights of the wrong size', () => {
        const encoded = encodeGenome(makeGenome());
        encoded.layout.brainHidden = 5;
        expect(() => decodeGenome(encoded)).toThrow(/weights/);
    });
});
