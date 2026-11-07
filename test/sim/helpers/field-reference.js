// The pheromone update's reference (docs/designs/wasm-kernels.md, Phase 4): seeded worlds stepped tick by tick with a
// digest of the danger, attack and hunt grids after every tick, and seeded fuzz grids (every grid shape from 1 x 1 up,
// zeros, subnormals and values near the cap, several decay and diffusion rates) updated a few times each.
// test/sim/fixtures/wasm-field-reference.json holds the JS `updatePheromones` digests; the kernel must reproduce them.
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
export const FIELD_REFERENCE_URL = new URL('../fixtures/wasm-field-reference.json', import.meta.url);

const BUSY = golden.shortCases.find((/** @type {any} */ c) => c.name === 'busy').overrides;

/** The stepped cases: the default world, the busy golden's world, an odd pheromone cell size. */
export const FIELD_CASES = Object.freeze([
    { name: 'default config', overrides: {}, ticks: 200 },
    { name: 'busy', overrides: BUSY, ticks: 200 },
    { name: 'odd pheromone cell', overrides: { pheromoneCellSize: 77.7, pheromoneDiffusion: 0.31 }, ticks: 120 },
]);

/** The fuzz grids: pheromone cell sizes giving 1 x 1, 2 x 2, 3 x 3, 4 x 3 and wider grids, and the rates. */
export const FUZZ_FIELDS = Object.freeze([
    { pheromoneCellSize: 1000 },
    { pheromoneCellSize: 600 },
    { pheromoneCellSize: 400, pheromoneDecay: 0.1, pheromoneDiffusion: 0.9 },
    { pheromoneCellSize: 340, worldHeight: 1000, worldWidth: 1300 },
    { pheromoneCellSize: 97, pheromoneDecay: 0, pheromoneDiffusion: 1 },
    { pheromoneCellSize: 61.3, pheromoneDecay: 0.999, pheromoneDiffusion: 0.05 },
    { pheromoneCellSize: 43, worldWidth: 1290 },
]);

/** Seeds per fuzz grid, and updates per seed. */
export const FUZZ_SEEDS = 12;
export const FUZZ_UPDATES = 3;

const GRIDS = ['danger', 'attack', 'hunt'];

/**
 * @param {Record<string, any>} world the world
 * @returns {string} the first 16 hex digits of the sha256 of the three grids
 */
export function fieldDigest(world) {
    const d = createHash('sha256');
    for (const name of GRIDS) {
        const a = world[name];
        d.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    }
    return d.digest('hex').slice(0, 16);
}

/**
 * Steps a seeded world and digests the grids after every tick.
 * @param {{ overrides: Record<string, any>, ticks: number }} c the case
 * @returns {string[]} one digest per tick
 */
export function runFieldCase({ overrides, ticks }) {
    const policy = cloneWithNoisePolicy();
    const world = createWorld(createConfig({ ...overrides, checkInvariants: false }), policy);
    const digests = [];
    for (let t = 0; t < ticks; t++) {
        step(world, policy);
        digests.push(fieldDigest(world));
    }
    return digests;
}

/**
 * A seeded cell value: zero, a subnormal, a tiny value, the cap or a value in between.
 * @param {ReturnType<typeof createRng>} rng the stream
 * @returns {number}
 */
function cellValue(rng) {
    const u = nextFloat(rng);
    if (u < 0.3) {
        return 0;
    }
    if (u < 0.35) {
        return 1e-40 * nextFloat(rng);
    }
    if (u < 0.45) {
        return 1e-6 * nextFloat(rng);
    }
    if (u < 0.55) {
        return 5;
    }
    return 5 * nextFloat(rng);
}

/**
 * Fills seeded grids and updates them with `update` a few times per seed.
 * @param {(world: Record<string, any>) => void} update the pheromone update
 * @returns {Record<string, string[]>} the digests after each update, per fuzz grid
 */
export function runFieldFuzz(update) {
    /** @type {Record<string, string[]>} */
    const out = {};
    for (const [i, sizes] of FUZZ_FIELDS.entries()) {
        const config = createConfig({
            ...SIMPLE_WORLD,
            maxAgents: 8,
            initialAgents: 0,
            minAgents: 0,
            rayCount: 4,
            brainHidden: 3,
            maxFood: 4,
            initialFood: 0,
            fertileZoneMax: 3,
            worldWidth: 1000,
            worldHeight: 1000,
            ...sizes,
        });
        const world = allocateWorld(config);
        const digests = [];
        for (let seed = 1; seed <= FUZZ_SEEDS; seed++) {
            const rng = createRng(1000 * i + seed);
            for (const name of GRIDS) {
                const grid = world[name];
                for (let c = 0; c < grid.length; c++) {
                    grid[c] = cellValue(rng);
                }
            }
            for (let u = 0; u < FUZZ_UPDATES; u++) {
                update(world);
                digests.push(fieldDigest(world));
            }
        }
        out[`${i}: ${world.pheromoneGrid.cols}x${world.pheromoneGrid.rows}`] = digests;
    }
    return out;
}

/**
 * @returns {{ stepped: Record<string, string[]>, fuzz: Record<string, string[]> }} the recorded JS digests
 */
export function readFieldReference() {
    return JSON.parse(readFileSync(FIELD_REFERENCE_URL, 'utf8'));
}
