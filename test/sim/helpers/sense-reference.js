// The sense kernel's reference (docs/designs/wasm-kernels.md, Phase 2): seeded worlds stepped tick by tick, and after
// each tick every alive agent cast again on a freshly built hash, with a digest of everything the cast writes that the
// world keeps (the inputs rows, the ray hues, the mate sightings and the cover totals) and the gathered row counts.
// test/sim/fixtures/wasm-sense-reference.json holds the JS ray march's digests; the kernel must reproduce them.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cloneWithNoisePolicy } from '../../../js/sim/birth-policy.js';
import { createConfig } from '../../../js/sim/config.js';
import { buildHash } from '../../../js/sim/spatial-hash.js';
import { createWorld } from '../../../js/sim/spawn.js';
import { step } from '../../../js/sim/step.js';
import { golden } from '../golden-run.js';

/** Where the recorded digests live. */
export const SENSE_REFERENCE_URL = new URL('../fixtures/wasm-sense-reference.json', import.meta.url);

const BUSY = golden.shortCases.find((/** @type {any} */ c) => c.name === 'busy').overrides;
const DISEASE = golden.shortCases.find((/** @type {any} */ c) => c.name === 'disease').overrides;

/** The stepped cases: the default world, the busy and disease goldens' worlds, and cover concealment on. */
export const SENSE_CASES = Object.freeze([
    { name: 'default config', overrides: {}, ticks: 120 },
    { name: 'busy', overrides: BUSY, ticks: 200 },
    { name: 'disease', overrides: DISEASE, ticks: 200 },
    { name: 'coverConceals, default', overrides: { coverConceals: true }, ticks: 200 },
]);

/** World arrays a cast writes that outlive it. */
const KEPT = ['inputs', 'rayHue', 'mateSeenAt', 'coverTotals'];

/**
 * @param {Record<string, any>} world the world
 * @param {number} rows the gathered row counts, summed over the casts
 * @returns {string} the first 16 hex digits of the sha256 of the kept arrays and the row count
 */
function digest(world, rows) {
    const hash = createHash('sha256');
    for (const name of KEPT) {
        const a = world[name];
        hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    }
    hash.update(String(rows));
    return hash.digest('hex').slice(0, 16);
}

/**
 * Steps a seeded world and, after every tick, casts every alive agent with `cast` on a rebuilt hash.
 * @param {{ overrides: Record<string, any>, ticks: number }} c the case
 * @param {(world: Record<string, any>, hash: any, slot: number) => number} cast casts one agent and returns its
 *   gathered row count
 * @returns {string[]} the digest after each tick's casts
 */
export function runSenseCase({ overrides, ticks }, cast) {
    const policy = cloneWithNoisePolicy();
    const world = createWorld(createConfig({ ...overrides, checkInvariants: false }), policy);
    const digests = [];
    for (let t = 0; t < ticks; t++) {
        step(world, policy);
        buildHash(world.hash, world);
        let rows = 0;
        for (let slot = 0; slot < world.alive.length; slot++) {
            if (world.alive[slot] === 1) {
                rows += cast(world, world.hash, slot);
            }
        }
        digests.push(digest(world, rows));
    }
    return digests;
}

/**
 * @returns {{ stepped: Record<string, string[]> }} the recorded JS digests
 */
export function readSenseReference() {
    return JSON.parse(readFileSync(SENSE_REFERENCE_URL, 'utf8'));
}
