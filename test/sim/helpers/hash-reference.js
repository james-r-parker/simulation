// The spatial hash build's reference (docs/designs/wasm-kernels.md, Phase 4): seeded worlds stepped tick by tick, with a
// digest of the hash the step built after physics and of a rebuild on the tick's end state, plus seeded fuzz worlds
// (circles on and past every edge, radii from below a cell to past the grid, odd cell sizes) built once each.
// test/sim/fixtures/wasm-hash-reference.json holds the JS `buildHash` digests; the kernel must reproduce them.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cloneWithNoisePolicy } from '../../../js/sim/birth-policy.js';
import { createConfig } from '../../../js/sim/config.js';
import { createRng, nextFloat } from '../../../js/sim/rng.js';
import { createWorld } from '../../../js/sim/spawn.js';
import { step } from '../../../js/sim/step.js';
import { allocateWorld } from '../../../js/sim/world.js';
import { SIMPLE_WORLD } from '../../helpers/simple-world.js';
import { golden } from '../golden-run.js';

/** Where the recorded digests live. */
export const HASH_REFERENCE_URL = new URL('../fixtures/wasm-hash-reference.json', import.meta.url);

const BUSY = golden.shortCases.find((/** @type {any} */ c) => c.name === 'busy').overrides;
const DISEASE = golden.shortCases.find((/** @type {any} */ c) => c.name === 'disease').overrides;

/** The stepped cases: the default world, the busy and disease goldens' worlds, an odd cell size. */
export const HASH_CASES = Object.freeze([
    { name: 'default config', overrides: {}, ticks: 200 },
    { name: 'busy', overrides: BUSY, ticks: 200 },
    { name: 'disease', overrides: DISEASE, ticks: 150 },
    { name: 'odd cell size', overrides: { hashCellSize: 97.3 }, ticks: 120 },
]);

/** The fuzz worlds' configs: cell sizes that divide the world, that do not, and that are not integers. */
export const FUZZ_CONFIGS = Object.freeze([
    { worldWidth: 1000, worldHeight: 1000, hashCellSize: 140 },
    { worldWidth: 1200, worldHeight: 1000, hashCellSize: 100 },
    { worldWidth: 1001.5, worldHeight: 1313, hashCellSize: 61.7 },
]);

/** Seeds per fuzz config. */
export const FUZZ_SEEDS = 60;

/**
 * @param {any} hash a built hash
 * @returns {string} the first 16 hex digits of the sha256 of the cell offsets, the used entries, their boxes and the count
 */
export function hashDigest(hash) {
    const n = hash.entryCount;
    const cells = hash.cols * hash.rows;
    const d = createHash('sha256');
    for (const a of [hash.cellStart.subarray(0, cells + 1), hash.entries.subarray(0, n)]) {
        d.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    }
    for (const a of [hash.boxX.subarray(0, n), hash.boxY.subarray(0, n)]) {
        d.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    }
    d.update(String(n));
    return d.digest('hex').slice(0, 16);
}

/**
 * Steps a seeded world; after each tick, digests the hash the step built after physics, rebuilds it on the end state
 * with `build` and digests that too.
 * @param {{ overrides: Record<string, any>, ticks: number }} c the case
 * @param {(hash: any, world: Record<string, any>) => void} build builds the hash
 * @returns {string[]} two digests per tick
 */
export function runHashCase({ overrides, ticks }, build) {
    const policy = cloneWithNoisePolicy();
    const world = createWorld(createConfig({ ...overrides, checkInvariants: false }), policy);
    const digests = [];
    for (let t = 0; t < ticks; t++) {
        step(world, policy);
        digests.push(hashDigest(world.hash));
        build(world.hash, world);
        digests.push(hashDigest(world.hash));
    }
    return digests;
}

/**
 * A coordinate: on an edge, past one, or inside, so the clamps and the floor at a cell boundary are all exercised.
 * @param {ReturnType<typeof createRng>} rng the stream
 * @param {number} extent the world extent on this axis
 * @param {number} cell the cell size
 * @returns {number}
 */
function place(rng, extent, cell) {
    const u = nextFloat(rng);
    if (u < 0.08) {
        return 0;
    }
    if (u < 0.16) {
        return extent;
    }
    if (u < 0.22) {
        return -nextFloat(rng) * 300;
    }
    if (u < 0.28) {
        return extent + nextFloat(rng) * 300;
    }
    if (u < 0.4) {
        return Math.floor(nextFloat(rng) * (extent / cell)) * cell;
    }
    return nextFloat(rng) * extent;
}

/**
 * Fills a world's agent and food slots with seeded circles, some slots left dead.
 * @param {Record<string, any>} world a world from `allocateWorld`
 * @param {number} seed the seed
 * @returns {void}
 */
function populate(world, seed) {
    const rng = createRng(seed);
    const { worldWidth: w, worldHeight: h, hashCellSize: cell } = world.config;
    world.alive.fill(0);
    world.foodAlive.fill(0);
    for (let i = 0; i < world.alive.length; i++) {
        world.alive[i] = nextFloat(rng) < 0.7 ? 1 : 0;
        world.x[i] = place(rng, w, cell);
        world.y[i] = place(rng, h, cell);
        const big = nextFloat(rng) < 0.03;
        world.size[i] = big ? cell * (1 + 4 * nextFloat(rng)) : 1 + nextFloat(rng) * 0.9 * cell;
    }
    for (let i = 0; i < world.foodAlive.length; i++) {
        world.foodAlive[i] = nextFloat(rng) < 0.6 ? 1 : 0;
        world.foodX[i] = place(rng, w, cell);
        world.foodY[i] = place(rng, h, cell);
        world.foodRadius[i] = nextFloat(rng) < 0.5 ? 20 : 30 + nextFloat(rng) * 40;
    }
}

/**
 * Builds every fuzz world once with `build`.
 * @param {(hash: any, world: Record<string, any>) => void} build builds the hash
 * @param {(world: Record<string, any>) => any} makeHash the hash to build for a world
 * @returns {Record<string, string[]>} the digests per config, by `hashCellSize`
 */
export function runHashFuzz(build, makeHash) {
    /** @type {Record<string, string[]>} */
    const out = {};
    for (const sizes of FUZZ_CONFIGS) {
        const config = createConfig({
            ...SIMPLE_WORLD,
            maxAgents: 48,
            initialAgents: 0,
            minAgents: 0,
            rayCount: 4,
            brainHidden: 3,
            maxFood: 40,
            initialFood: 0,
            fertileZoneMax: 3,
            ...sizes,
        });
        const world = allocateWorld(config);
        const digests = [];
        for (let seed = 1; seed <= FUZZ_SEEDS; seed++) {
            populate(world, seed);
            const hash = makeHash(world);
            build(hash, world);
            digests.push(hashDigest(hash));
        }
        out[String(sizes.hashCellSize)] = digests;
    }
    return out;
}

/**
 * @returns {{ stepped: Record<string, string[]>, fuzz: Record<string, string[]> }} the recorded JS digests
 */
export function readHashReference() {
    return JSON.parse(readFileSync(HASH_REFERENCE_URL, 'utf8'));
}
