import { describe, expect, it } from 'vitest';
import { cloneWithNoisePolicy } from '../../js/sim/birth-policy.js';
import { createConfig } from '../../js/sim/config.js';
import { EVENT_STRIDE, EVENT_TYPE } from '../../js/sim/events.js';
import { assertInvariants } from '../../js/sim/invariants.js';
import { TALLY } from '../../js/sim/merit-state.js';
import { splitGatedShare } from '../../js/sim/merit-tally.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

const TIMEOUT_MS = scaleTimeout(60_000);

const TICKS = 3000;
const MERIT = { splitDeliberateMin: 200, meritSplitFloorPop: 20 };

/**
 * Runs a seed-1 world with the reference policy, collecting the MeritSummary records.
 * @param {Record<string, any>} over config overrides
 * @returns {{world: any, summaries: number[][]}} the final world and each summary's fields after the type
 */
function run(over) {
    const policy = cloneWithNoisePolicy();
    const world = createWorld(createConfig({ ...SIMPLE_WORLD, seed: 1, checkInvariants: true, ...over }), policy);
    /** @type {number[][]} */
    const summaries = [];
    for (let t = 0; t < TICKS; t++) {
        step(world, policy);
        for (let i = 0; i < world.events.count; i++) {
            const o = i * EVENT_STRIDE;
            if (world.events.data[o] === EVENT_TYPE.MERIT_SUMMARY) {
                summaries.push(Array.from(world.events.data.subarray(o + 1, o + 7)));
            }
        }
    }
    assertInvariants(world);
    return { world, summaries };
}

describe('the merit phase in a real world', () => {
    it(
        'is deterministic with merit on, and logs a summary every 1000 ticks',
        () => {
            const a = run(MERIT);
            const b = run(MERIT);
            expect(hashWorld(a.world)).toBe(hashWorld(b.world));
            expect(a.summaries).toEqual(b.summaries);
            expect(a.summaries.map((s) => s[0])).toEqual([1000, 2000]);
            for (const [, mean, p90, ready, gated, share] of a.summaries) {
                expect(mean).toBeGreaterThanOrEqual(0);
                expect(p90).toBeGreaterThanOrEqual(0);
                expect(ready).toBeGreaterThanOrEqual(gated);
                expect(share).toBeGreaterThanOrEqual(0);
                expect(share).toBeLessThanOrEqual(1);
            }
            expect(a.summaries.some((s) => s[2] > 0)).toBe(true);
        },
        TIMEOUT_MS,
    );

    it(
        'keeps the cumulative tally equal to the summed windows',
        () => {
            const { world, summaries } = run(MERIT);
            const ready = summaries.reduce((sum, s) => sum + s[3], 0);
            expect(ready).toBeLessThanOrEqual(world.meritTally[TALLY.READY]);
            expect(world.meritTally[TALLY.MARK + TALLY.READY]).toBe(ready);
            expect(splitGatedShare(world)).toBeGreaterThanOrEqual(0);
        },
        TIMEOUT_MS,
    );
});
