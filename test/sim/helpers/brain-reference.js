// The brain kernel's recorded reference (docs/designs/wasm-kernels.md, T7): the cases the differential test ran against
// the JS `forwardAll` before it was deleted, and a digest of the arrays the brain phase writes after every call or tick.
// test/sim/fixtures/wasm-brain-reference.json holds the JS kernel's digests; the kernel must reproduce them.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cloneWithNoisePolicy } from '../../../js/sim/birth-policy.js';
import { createConfig } from '../../../js/sim/config.js';
import { createRng, nextFloat, nextGaussian } from '../../../js/sim/rng.js';
import { createWorld } from '../../../js/sim/spawn.js';
import { step } from '../../../js/sim/step.js';
import { golden } from '../golden-run.js';
import { smallWorld } from './small-world.js';

/** Where the recorded digests live. */
export const REFERENCE_URL = new URL('../fixtures/wasm-brain-reference.json', import.meta.url);

/** Values a pooled input or a weight can take at the edges: zeros, subnormals, near-saturation and tiny ones. */
const EDGES = [0, -0, 1e-40, -1e-40, 1e-30, 0.999999, -1, 1, 3e-8, 7.5, -12, 25];

/** Arrays the brain phase writes; `rewardTrace` joins them when the world has one. */
const WRITTEN = ['pooled', 'hidden', 'outputs', 'fastOut'];

/**
 * @param {Record<string, any>} world the world
 * @returns {string} the first 16 hex digits of the sha256 of the written arrays' bytes, in `WRITTEN` order
 */
export function brainDigest(world) {
    const hash = createHash('sha256');
    const names = [...WRITTEN, ...(world.rewardTrace === undefined ? [] : ['rewardTrace'])];
    for (const name of names) {
        const a = world[name];
        hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    }
    return hash.digest('hex').slice(0, 16);
}

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
export function randomise(world, seed, { slots, edgy = false, scale = 1 }) {
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
 * @typedef {{ key: string, over: Record<string, any>, seed: number, slots: number[], edgy?: boolean, scale?: number,
 *   calls: number }} UnitCase
 */

/** The configs of the per-call cases. */
const CONFIGS = [
    { name: 'no learning', over: { hebbianRate: 0 } },
    { name: 'Hebbian', over: { hebbianRate: 0.05 } },
    { name: 'rewarded Hebbian', over: { hebbianRate: 0.05, rewardedHebb: true } },
];

/**
 * @returns {UnitCase[]} the per-call cases: each config at six hidden sizes and four seeds (three calls each), then a
 *   fuzz of 40 seeds over edge values (one call each)
 */
export function unitCases() {
    /** @type {UnitCase[]} */
    const cases = [];
    for (const { name, over } of CONFIGS) {
        for (const brainHidden of [1, 3, 7, 8, 17, 32]) {
            for (let seed = 1; seed <= 4; seed++) {
                const key = `${name}, ${brainHidden} hidden, seed ${seed}`;
                cases.push({ key, over: { ...over, brainHidden }, seed, slots: [0, 2, 3, 6, 7], calls: 3 });
            }
        }
    }
    for (let seed = 1; seed <= 40; seed++) {
        const over = { hebbianRate: seed % 2 === 0 ? 0.1 : 0, brainHidden: 3 + (seed % 9) };
        const scale = seed % 4 === 0 ? 40 : 1;
        cases.push({ key: `fuzz, seed ${seed}`, over, seed, slots: [1, 4, 5], edgy: true, scale, calls: 1 });
    }
    return cases;
}

/**
 * Runs one per-call case on a fresh small world.
 * @param {UnitCase} c the case
 * @param {(world: Record<string, any>) => void} forward the brain phase to run
 * @returns {string[]} the digest after each call
 */
export function runUnitCase(c, forward) {
    const world = smallWorld(c.over);
    randomise(world, c.seed, c);
    const digests = [];
    for (let i = 0; i < c.calls; i++) {
        forward(world);
        digests.push(brainDigest(world));
    }
    return digests;
}

const BUSY = golden.shortCases.find((/** @type {any} */ c) => c.name === 'busy').overrides;

/** The stepped cases: seeded worlds stepped `ticks` ticks, the digest taken after every tick. */
export const STEPPED_CASES = Object.freeze([
    { name: 'default config', overrides: {}, ticks: 200 },
    { name: 'Hebbian, rewarded', overrides: { ...BUSY, hebbianRate: 0.01, rewardedHebb: true }, ticks: 200 },
    { name: 'odd hidden size, no learning', overrides: { ...BUSY, brainHidden: 13, hebbianRate: 0 }, ticks: 200 },
]);

/**
 * Steps a seeded world and digests the brain arrays after every tick.
 * @param {{ overrides: Record<string, any>, ticks: number }} c the case
 * @returns {string[]} the digest after each tick
 */
export function runSteppedCase({ overrides, ticks }) {
    const policy = cloneWithNoisePolicy();
    const world = createWorld(createConfig({ ...overrides, checkInvariants: false }), policy);
    const digests = [];
    for (let t = 0; t < ticks; t++) {
        step(world, policy);
        digests.push(brainDigest(world));
    }
    return digests;
}

/**
 * @returns {{ unit: Record<string, string[]>, stepped: Record<string, string[]> }} the recorded JS digests
 */
export function readReference() {
    return JSON.parse(readFileSync(REFERENCE_URL, 'utf8'));
}
