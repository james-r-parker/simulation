// The WASM sense kernel against the JS ray march, cast for cast, over the states of seeded stepped worlds
// (docs/designs/wasm-kernels.md, Phase 2): each alive agent cast by both on the same state, everything a cast writes
// compared byte for byte.
import { describe, expect, it } from 'vitest';
import { RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { COVER_TOTALS } from '../../js/sim/cover.js';
import { LOCAL_STRIDE } from '../../js/sim/ray-gather.js';
import { castRays, castRaysJs } from '../../js/sim/ray-march.js';
import { syncSense } from '../../js/sim/wasm-sense.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';
import { SENSE_CASES, readSenseReference, runSenseCase } from './helpers/sense-reference.js';
import { smallWorld } from './helpers/small-world.js';

const TIMEOUT_MS = scaleTimeout(60_000);
const STAMP = 3;

/**
 * @param {any} a a typed array
 * @returns {number[]} its values
 */
const list = (a) => Array.from(a);

/**
 * Everything one cast of `slot` wrote: its ray block and hues, the gathered rows, the scratch (bar the stamp counter),
 * its mate sighting and the concealed-hit total.
 * @param {Record<string, any>} world the world
 * @param {number} slot the caster
 * @param {number} count the gathered row count
 * @returns {Record<string, any>} the snapshot
 */
function snapshot(world, slot, count) {
    const raw = world.layout.rawInputCount;
    const rays = world.config.rayCount;
    const scratch = list(world.rayScratch);
    scratch[STAMP] = 0;
    return {
        count,
        block: list(world.inputs.subarray(slot * raw, slot * raw + rays * RAY_CHANNELS)),
        hue: list(world.rayHue.subarray(slot * rays, (slot + 1) * rays)),
        rows: list(world.rayLocal.subarray(0, count * LOCAL_STRIDE)),
        scratch,
        seen: world.mateSeenAt[slot],
        concealed: world.coverTotals[COVER_TOTALS.CONCEALED_HITS],
    };
}

describe('syncSense', () => {
    it('refuses a hash with more cells or entries than the arena mirror holds', () => {
        const world = smallWorld();
        const { hash } = world;
        expect(() => syncSense(world, { ...hash, rows: hash.rows + 1 })).toThrow(/overflows the mirror/);
        expect(() => syncSense(world, { ...hash, entryCount: world.wasm.views.entries.length + 1 })).toThrow(
            /overflows the mirror/,
        );
        expect(() => syncSense(world, hash)).not.toThrow();
    });
});

describe('the WASM sense kernel against the JS ray march', () => {
    for (const c of SENSE_CASES) {
        it(
            `writes what the JS writes, cast for cast, for ${c.ticks} ticks (${c.name})`,
            () => {
                let casts = 0;
                let concealed = 0;
                runSenseCase(c, (world, hash, slot) => {
                    const before = world.coverTotals[COVER_TOTALS.CONCEALED_HITS];
                    const jsCount = castRaysJs(world, hash, slot);
                    const js = snapshot(world, slot, jsCount);
                    world.coverTotals[COVER_TOTALS.CONCEALED_HITS] = before;
                    const wasm = snapshot(world, slot, castRays(world, hash, slot));
                    // Object.is on every value keeps -0 apart from 0.
                    expect(wasm.count).toBe(js.count);
                    for (const key of ['block', 'hue', 'rows', 'scratch']) {
                        const same = wasm[key].every((/** @type {number} */ v, /** @type {number} */ i) =>
                            Object.is(v, js[key][i]),
                        );
                        expect(same && wasm[key].length === js[key].length, `${key}, slot ${slot}`).toBe(true);
                    }
                    expect(wasm.seen).toBe(js.seen);
                    expect(wasm.concealed).toBe(js.concealed);
                    casts += 1;
                    concealed += js.concealed - before;
                    return jsCount;
                });
                expect(casts).toBeGreaterThan(c.ticks);
                if (c.mustConceal) {
                    expect(concealed).toBeGreaterThan(0);
                }
            },
            TIMEOUT_MS,
        );
    }
});

// The recorded reference (T11): the JS ray march's digests, which the kernel must reproduce once the JS is gone.
describe('the WASM sense kernel against the recorded JS reference', () => {
    const reference = readSenseReference();
    for (const c of SENSE_CASES) {
        it(
            `reproduces the digest after every tick (${c.name}, ${c.ticks} ticks)`,
            () => {
                expect(runSenseCase(c, castRays)).toEqual(reference.stepped[c.name]);
            },
            TIMEOUT_MS,
        );
    }
});
