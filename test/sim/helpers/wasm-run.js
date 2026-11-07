// Seeded worlds stepped with the JS brain kernel and with the WASM one, for the differential tests.
import { readFileSync } from 'node:fs';
import { cloneWithNoisePolicy } from '../../../js/sim/birth-policy.js';
import { createConfig } from '../../../js/sim/config.js';
import { assertInvariants } from '../../../js/sim/invariants.js';
import { createWorld } from '../../../js/sim/spawn.js';
import { step } from '../../../js/sim/step.js';
import { attachWasm } from '../../../js/sim/wasm-arena.js';
import { loadKernels } from '../../../js/sim/wasm-loader.js';
import { hashWorld } from '../../../js/sim/world-hash.js';

/** The committed kernels, compiled once. */
export const kernels = loadKernels(readFileSync(new URL('../../../wasm/blob-kernels.wasm', import.meta.url)));

/** The arrays the brain phase writes, compared after every tick. */
export const BRAIN_ARRAYS = Object.freeze(['outputs', 'hidden', 'fastOut']);

/**
 * @param {Record<string, any>} overrides config overrides on top of the defaults (seed 1 unless given)
 * @param {{ wasm: boolean, kernels?: import('../../../js/sim/wasm-loader.js').Kernels, log?: any }} options the switch,
 *   the kernels to attach (the committed ones by default) and the fallback log
 * @returns {{ world: Record<string, any>, policy: any, attached: boolean }} a fresh world from `createWorld`
 */
export function makeWorld(overrides, { wasm, kernels: given = kernels, log }) {
    const policy = cloneWithNoisePolicy();
    const world = createWorld(createConfig({ ...overrides, checkInvariants: false }), policy);
    const attached = attachWasm(world, given, { wasmKernels: wasm, log });
    return { world, policy, attached };
}

/**
 * Runs a golden case as `runGolden` does (invariants every 100 ticks), with the brain kernel chosen by `options`.
 * @param {{ overrides: object, ticks: number }} testCase the case
 * @param {{ wasm: boolean, kernels?: import('../../../js/sim/wasm-loader.js').Kernels, log?: any }} options as for
 *   `makeWorld`
 * @returns {{ hash: string, attached: boolean }} the world hash after the last tick, and whether WASM ran
 */
export function runCase({ overrides, ticks }, options) {
    const { world, policy, attached } = makeWorld(overrides, options);
    for (let t = 1; t <= ticks; t++) {
        step(world, policy);
        if (t % 100 === 0) {
            assertInvariants(world);
        }
    }
    return { hash: hashWorld(world), attached };
}

/**
 * @param {any} a a typed array
 * @returns {Buffer} its bytes
 */
function bytes(a) {
    return Buffer.from(a.buffer, a.byteOffset, a.byteLength);
}

/**
 * Steps the same seeded world with each kernel and compares the brain arrays byte for byte after every tick.
 * @param {Record<string, any>} overrides config overrides
 * @param {number} ticks how many ticks
 * @returns {{ mismatches: string[], jsHash: string, wasmHash: string, alive: number }} each `<tick>:<array>` that
 *   differed, both final hashes and the alive count at the end
 */
export function stepPair(overrides, ticks) {
    const js = makeWorld(overrides, { wasm: false });
    const wasm = makeWorld(overrides, { wasm: true });
    if (!wasm.attached) {
        throw new Error('stepPair: the WASM kernels did not attach');
    }
    /** @type {string[]} */
    const mismatches = [];
    for (let t = 1; t <= ticks && mismatches.length < 5; t++) {
        step(js.world, js.policy);
        step(wasm.world, wasm.policy);
        for (const name of BRAIN_ARRAYS) {
            if (Buffer.compare(bytes(js.world[name]), bytes(wasm.world[name])) !== 0) {
                mismatches.push(`${t}:${name}`);
            }
        }
    }
    const alive = js.world.alive.reduce((/** @type {number} */ s, /** @type {number} */ a) => s + a, 0);
    return { mismatches, jsHash: hashWorld(js.world), wasmHash: hashWorld(wasm.world), alive };
}
