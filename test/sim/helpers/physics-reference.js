// The physics kernels' reference (docs/designs/wasm-kernels.md, Phase 4): seeded worlds stepped tick by tick with a
// digest of the motion state, energy and contact list right after the physics phase, and seeded fuzz worlds (crowds
// with coincident centres, agents on and past the walls and rocks, fast and sprinting agents) run through
// `integrate`, a hash build and `resolveContacts` a few times each.
// test/sim/fixtures/wasm-physics-reference.json holds the JS digests; the kernels must reproduce them.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cloneWithNoisePolicy } from '../../../js/sim/birth-policy.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../../js/sim/brain-layout.js';
import { createConfig } from '../../../js/sim/config.js';
import { integrate, resolveContacts } from '../../../js/sim/physics.js';
import { createRng, nextFloat } from '../../../js/sim/rng.js';
import { buildHash } from '../../../js/sim/spatial-hash.js';
import { createWorld } from '../../../js/sim/spawn.js';
import { STEP_PHASES, step } from '../../../js/sim/step.js';
import { SIMPLE_WORLD } from '../../helpers/simple-world.js';
import { golden } from '../golden-run.js';
import { testPolicy } from './test-policy.js';

/** Where the recorded digests live. */
export const PHYSICS_REFERENCE_URL = new URL('../fixtures/wasm-physics-reference.json', import.meta.url);

const BUSY = golden.shortCases.find((/** @type {any} */ c) => c.name === 'busy').overrides;
const DISEASE = golden.shortCases.find((/** @type {any} */ c) => c.name === 'disease').overrides;

/** The stepped cases: the default world, the busy and disease goldens' worlds, a soft, bouncy, fast world. */
export const PHYSICS_CASES = Object.freeze([
    { name: 'default config', overrides: {}, ticks: 200 },
    { name: 'busy', overrides: BUSY, ticks: 200 },
    { name: 'disease', overrides: DISEASE, ticks: 120 },
    { name: 'bouncy', overrides: { restitution: 0.93, damping: 0.99, maxVelocity: 13.7 }, ticks: 120 },
]);

/** Seeds of the fuzz world, and physics passes per seed. */
export const FUZZ_SEEDS = 40;
export const FUZZ_PASSES = 3;

/** Agent arrays the physics phase writes or that its rules change. */
const KEPT = ['x', 'y', 'vx', 'vy', 'angle', 'turnRate', 'size', 'energy', 'lastLoss', 'lastHerdId', 'ledger'];

/**
 * @param {Record<string, any>} world the world
 * @returns {string} the first 16 hex digits of the sha256 of the kept arrays and the contact list
 */
export function physicsDigest(world) {
    const d = createHash('sha256');
    const contacts = world.contacts.subarray(0, 2 * world.contactCount);
    for (const a of [...KEPT.map((name) => world[name]), contacts]) {
        d.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    }
    d.update(String(world.contactCount));
    return d.digest('hex').slice(0, 16);
}

/** The physics phase's own body. */
const PHYSICS = STEP_PHASES.find((p) => p.name === 'physics');

/**
 * Steps a seeded world and digests it right after every tick's physics phase.
 * @param {{ overrides: Record<string, any>, ticks: number }} c the case
 * @returns {string[]} one digest per tick
 */
export function runPhysicsCase({ overrides, ticks }) {
    const policy = cloneWithNoisePolicy();
    const world = createWorld(createConfig({ ...overrides, checkInvariants: false }), policy);
    const digests = [];
    const physics = (/** @type {any} */ w, /** @type {any} */ p) => {
        PHYSICS?.run(w, p);
        digests.push(physicsDigest(w));
    };
    for (let t = 0; t < ticks; t++) {
        step(world, policy, { physics });
    }
    return digests;
}

/**
 * A coordinate: in a crowd near the centre, on or past a wall, or anywhere.
 * @param {ReturnType<typeof createRng>} rng the stream
 * @param {number} extent the world extent on this axis
 * @returns {number}
 */
function place(rng, extent) {
    const u = nextFloat(rng);
    if (u < 0.35) {
        return extent / 2 + (nextFloat(rng) - 0.5) * 120;
    }
    if (u < 0.45) {
        return nextFloat(rng) < 0.5 ? nextFloat(rng) * 10 - 5 : extent + nextFloat(rng) * 10 - 5;
    }
    return nextFloat(rng) * extent;
}

/**
 * Gives every agent a seeded motion state; a few share another's centre exactly, a few sit on a rock.
 * @param {Record<string, any>} world the world
 * @param {number} seed the seed
 * @returns {void}
 */
function scramble(world, seed) {
    const rng = createRng(seed);
    const { worldWidth: w, worldHeight: h } = world.config;
    for (let i = 0; i < world.alive.length; i++) {
        if (world.alive[i] !== 1) {
            continue;
        }
        const twin = i > 0 && nextFloat(rng) < 0.08;
        const rock = world.obsX.length > 0 && nextFloat(rng) < 0.08;
        const k = Math.floor(nextFloat(rng) * world.obsX.length);
        world.x[i] = twin ? world.x[i - 1] : rock ? world.obsX[k] + nextFloat(rng) * 4 : place(rng, w);
        world.y[i] = twin ? world.y[i - 1] : rock ? world.obsY[k] : place(rng, h);
        world.vx[i] = (nextFloat(rng) - 0.5) * 40;
        world.vy[i] = (nextFloat(rng) - 0.5) * 40;
        world.energy[i] = 20 + nextFloat(rng) * 400;
        world.size[i] = 3 + nextFloat(rng) * 30;
        world.outputs[i * OUTPUT_COUNT + OUTPUT_INDEX.SPRINT] = nextFloat(rng) - 0.5;
    }
}

/**
 * Runs the fuzz world: per seed, scrambled agents through `integrate`, a hash build and `resolveContacts` a few times.
 * @returns {string[]} the digest after every pass
 */
export function runPhysicsFuzz() {
    const config = createConfig({
        ...SIMPLE_WORLD,
        worldWidth: 1000,
        worldHeight: 1000,
        maxAgents: 64,
        initialAgents: 56,
        minAgents: 0,
        rayCount: 4,
        brainHidden: 3,
        maxFood: 8,
        initialFood: 0,
        fertileZoneMax: 3,
        checkInvariants: false,
    });
    const world = createWorld(config, testPolicy);
    const digests = [];
    for (let seed = 1; seed <= FUZZ_SEEDS; seed++) {
        scramble(world, seed);
        for (let pass = 0; pass < FUZZ_PASSES; pass++) {
            integrate(world);
            buildHash(world.hash, world);
            resolveContacts(world, world.hash);
            digests.push(physicsDigest(world));
        }
    }
    return digests;
}

/**
 * @returns {{ stepped: Record<string, string[]>, fuzz: string[] }} the recorded JS digests
 */
export function readPhysicsReference() {
    return JSON.parse(readFileSync(PHYSICS_REFERENCE_URL, 'utf8'));
}
