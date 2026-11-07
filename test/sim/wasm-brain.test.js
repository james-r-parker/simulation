// The WASM brain kernel against the JS `forwardAll`: the same worlds, byte for byte.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { forwardAll } from '../../js/sim/brain.js';
import { createRng, nextFloat, nextGaussian } from '../../js/sim/rng.js';
import { attachWasm } from '../../js/sim/wasm-arena.js';
import { PARAM_ARRAYS, STATUS_SLOT, wasmForwardAll, writeBrainParams } from '../../js/sim/wasm-brain.js';
import { loadKernels } from '../../js/sim/wasm-loader.js';
import { smallWorld } from './helpers/small-world.js';

const kernels = loadKernels(readFileSync(new URL('../../wasm/blob-kernels.wasm', import.meta.url)));

/** Values a pooled input or a weight can take at the edges: zeros, subnormals, near-saturation and tiny ones. */
const EDGES = [0, -0, 1e-40, -1e-40, 1e-30, 0.999999, -1, 1, 3e-8, 7.5, -12, 25];

/** Arrays the brain phase writes, compared byte for byte. */
const WRITTEN = ['pooled', 'hidden', 'outputs', 'fastOut'];

/**
 * @param {ReturnType<typeof createRng>} rng the stream
 * @param {boolean} edgy whether to draw a share of edge values
 * @returns {number} a value
 */
function draw(rng, edgy) {
    const r = nextFloat(rng);
    if (edgy && r < 0.3) {
        return EDGES[Math.floor(nextFloat(rng) * EDGES.length)];
    }
    return r < 0.45 ? 0 : nextGaussian(rng);
}

/**
 * Fills the brain state of some slots with seeded values: weights, raw inputs (so pooling has hits), ray hues, hidden
 * rows, leak rates, plastic blocks and reward traces.
 * @param {Record<string, any>} world the world
 * @param {number} seed the seed
 * @param {{ slots: number[], edgy?: boolean, scale?: number }} options the alive slots, edge values, weight scale
 * @returns {void}
 */
function randomise(world, seed, { slots, edgy = false, scale = 1 }) {
    const rng = createRng(seed);
    const { weightCount, rawInputCount, hidden, geneOutputs } = world.layout;
    const rows = /** @type {[string, number, () => number][]} */ ([
        ['weights', weightCount, () => draw(rng, edgy) * scale],
        ['inputs', rawInputCount, () => Math.abs(draw(rng, edgy)) % 1.5],
        ['rayHue', world.config.rayCount, () => nextFloat(rng)],
        ['hidden', hidden, () => nextFloat(rng) * 2 - 1],
        ['leakRate', hidden, () => nextFloat(rng)],
        ['fastOut', hidden * geneOutputs, () => nextGaussian(rng)],
    ]);
    for (const slot of slots) {
        world.alive[slot] = 1;
        for (const [name, stride, value] of rows) {
            for (let i = 0; i < stride; i++) {
                world[name][slot * stride + i] = value();
            }
        }
        if (world.rewardTrace !== undefined) {
            world.rewardTrace[slot] = nextFloat(rng);
        }
    }
}

/**
 * Two identical worlds, the second running the WASM kernel.
 * @param {Record<string, any>} over config overrides
 * @param {number} seed the seed
 * @param {{ slots: number[], edgy?: boolean, scale?: number }} options what to randomise
 * @returns {{ js: Record<string, any>, wasm: Record<string, any> }} the pair
 */
function pair(over, seed, options) {
    const js = smallWorld(over);
    const wasm = smallWorld(over);
    randomise(js, seed, options);
    randomise(wasm, seed, options);
    expect(attachWasm(wasm, kernels, { wasmKernels: true })).toBe(true);
    return { js, wasm };
}

/**
 * @param {Record<string, any>} js the JS world
 * @param {Record<string, any>} wasm the WASM world
 * @returns {string[]} the written arrays whose bytes differ
 */
function differing(js, wasm) {
    const bytes = (/** @type {any} */ a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
    const names = [...WRITTEN, ...(js.rewardTrace === undefined ? [] : ['rewardTrace'])];
    return names.filter((name) => Buffer.compare(bytes(js[name]), bytes(wasm[name])) !== 0);
}

const CONFIGS = [
    { name: 'no learning', over: { hebbianRate: 0 } },
    { name: 'Hebbian', over: { hebbianRate: 0.05 } },
    { name: 'rewarded Hebbian', over: { hebbianRate: 0.05, rewardedHebb: true } },
];

describe('wasmForwardAll', () => {
    for (const { name, over } of CONFIGS) {
        it.each([1, 3, 7, 8, 17, 32])(`matches forwardAll byte for byte (${name}, %i hidden units)`, (brainHidden) => {
            for (let seed = 1; seed <= 4; seed++) {
                const { js, wasm } = pair({ ...over, brainHidden }, seed, { slots: [0, 2, 3, 6, 7] });
                for (let tick = 0; tick < 3; tick++) {
                    forwardAll(js);
                    wasmForwardAll(wasm);
                    expect(differing(js, wasm)).toEqual([]);
                }
            }
        });
    }

    it('matches forwardAll on a fuzz of edge values: zeros, -0, subnormals and saturating sums', () => {
        for (let seed = 1; seed <= 40; seed++) {
            const over = { hebbianRate: seed % 2 === 0 ? 0.1 : 0, brainHidden: 3 + (seed % 9) };
            const { js, wasm } = pair(over, seed, { slots: [1, 4, 5], edgy: true, scale: seed % 4 === 0 ? 40 : 1 });
            forwardAll(js);
            wasmForwardAll(wasm);
            expect(differing(js, wasm)).toEqual([]);
        }
    });

    it('throws the error detTanh throws on a non-finite sum or learn gene, naming the slot', () => {
        for (const bad of [NaN, Infinity]) {
            for (const at of ['bHidden', 'bOut', 'traitStart']) {
                const { js, wasm } = pair({ hebbianRate: 0.05 }, 9, { slots: [2, 5] });
                const offset = 5 * js.layout.weightCount + js.layout[at] + (at === 'traitStart' ? 3 : 0);
                js.weights[offset] = bad;
                wasm.weights[offset] = bad;
                const message = (() => {
                    try {
                        forwardAll(js);
                    } catch (error) {
                        return /** @type {Error} */ (error).message;
                    }
                    return 'no throw';
                })();
                expect(message).toMatch(/^detTanh: expected a finite x/);
                expect(() => wasmForwardAll(wasm)).toThrow(message);
                expect(wasm.wasm.views.params[STATUS_SLOT]).toBe(5);
            }
        }
    });

    it('writes every array offset into the parameter block', () => {
        const world = smallWorld();
        attachWasm(world, kernels, { wasmKernels: true });
        writeBrainParams(world.wasm, world.config, world.layout);
        const { params } = world.wasm.views;
        expect(PARAM_ARRAYS.map((_, i) => params[i])).toEqual(PARAM_ARRAYS.map((n) => world.wasm.offsets[n]));
    });
});
