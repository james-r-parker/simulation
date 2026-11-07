// Seeded inputs for the function microbenchmarks, built once per process and shared by every bench file.
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'vitest';
import { cloneWithNoisePolicy } from '../../js/sim/birth-policy.js';
import { createConfig } from '../../js/sim/config.js';
import { createRng, fork, nextFloat } from '../../js/sim/rng.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';
import { buildHash } from '../../js/sim/spatial-hash.js';

const AGENTS = 500;
const WARMUP_TICKS = 300;
const SEED = 20261021;

/** @type {Map<string, Record<string, any>>} */
const cache = new Map();

/**
 * With `BENCH_WASM=1` every micro world runs the WASM kernels (docs/designs/wasm-kernels.md), so
 * `npm run bench:parts -- --area brain --compare <ref>` prices the switch against a ref that runs the JS kernels. The
 * compare runs these files in the ref's tree too; a tree without the kernels runs the JS ones.
 */
const ARENA_URL = new URL('../../js/sim/wasm-arena.js', import.meta.url);
const WASM = process.env.BENCH_WASM === '1' && existsSync(ARENA_URL) ? await loadWasm() : null;

/**
 * @returns {Promise<{ attachWasm: Function, kernels: any }>} the attach function and the committed kernels
 */
async function loadWasm() {
    const { attachWasm } = await import(ARENA_URL.href);
    const { loadKernels } = await import(new URL('../../js/sim/wasm-loader.js', import.meta.url).href);
    const kernels = loadKernels(readFileSync(new URL('../../wasm/blob-kernels.wasm', import.meta.url)));
    return { attachWasm, kernels };
}

/**
 * Moves a world into a WASM arena when `BENCH_WASM=1` and the tree has the kernels; otherwise does nothing.
 * @param {Record<string, any>} world a world from `createWorld`, or a copy with its own `agentRows`
 * @returns {void}
 */
export function benchAttach(world) {
    if (WASM === null) {
        return;
    }
    if (!WASM.attachWasm(world, WASM.kernels, { wasmKernels: true, midRun: true })) {
        throw new Error('BENCH_WASM=1 but the WASM kernels did not attach');
    }
}

/**
 * A 500-agent world stepped 300 ticks from a fixed seed, so rays, hidden rows and outputs hold real values, with the
 * spatial hash rebuilt for the state it ends in. Built once per override set.
 * @param {Record<string, number | boolean>} [overrides] config keys on top of the defaults
 * @returns {Record<string, any>} the world
 */
export function microWorld(overrides = {}) {
    const key = JSON.stringify(overrides);
    let world = cache.get(key);
    if (world === undefined) {
        const config = createConfig({
            seed: SEED,
            initialAgents: AGENTS,
            minAgents: AGENTS,
            maxAgents: AGENTS,
            ...overrides,
        });
        const brain = cloneWithNoisePolicy();
        world = createWorld(config, brain);
        for (let i = 0; i < WARMUP_TICKS; i++) {
            step(world, brain);
        }
        buildHash(world.hash, world);
        benchAttach(world);
        cache.set(key, world);
    }
    return world;
}

/**
 * @param {Record<string, any>} world the world
 * @returns {number[]} the alive slots, ascending
 */
export function aliveSlots(world) {
    const slots = [];
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1) {
            slots.push(slot);
        }
    }
    return slots;
}

/**
 * @param {string} name the stream name, so each bench file draws its own numbers from the one seed
 * @returns {ReturnType<typeof createRng>} a seeded stream
 */
export function microRng(name) {
    return fork(createRng(SEED), `micro/${name}`);
}

/**
 * @param {string} name the stream name
 * @param {number} count how many values
 * @param {number} lo the lowest value
 * @param {number} hi the highest value
 * @returns {Float64Array} seeded values spread evenly over `[lo, hi)`
 */
export function seededValues(name, count, lo, hi) {
    const rng = microRng(name);
    const out = new Float64Array(count);
    for (let i = 0; i < count; i++) {
        out[i] = lo + (hi - lo) * nextFloat(rng);
    }
    return out;
}

/** Where each benchmark writes its result, relative to the project root; `scripts/bench-micro.mjs` reads it back. */
export const RESULT_DIR = '.bench-micro';

/**
 * Registers one Vitest bench-mode test that runs each case in turn and writes its result under `RESULT_DIR`.
 * @param {string} suite the bench file's module name
 * @param {Array<[string, () => unknown]>} cases a benchmark name and its function, each run on inputs built once
 * @returns {void}
 */
export function microSuite(suite, cases) {
    test(
        suite,
        async ({ bench }) => {
            for (const [name, fn] of cases) {
                const writeResult = `${RESULT_DIR}/${suite}/${encodeURIComponent(name)}.json`;
                await bench(name, { writeResult }, fn).run();
            }
        },
        120000,
    );
}
