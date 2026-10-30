// The sim's `deliberateKills` (js/sim/kills.js) against the observer's `intent.deliberateKills`, the reference, on a replay of
// the predator world: every alive agent the observer tracks has the same count in both, tick by tick.

import { describe, expect, it } from 'vitest';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';
import { playPredatorWorld } from './helpers/predator-world.js';

const TICKS = 4000;

/**
 * @param {number} seed the world seed
 * @returns {{kills: number, mismatches: string[]}} the kills the sim counted, and where it disagreed with the observer
 */
function replay(seed) {
    let kills = 0;
    /** @type {string[]} */
    const mismatches = [];
    playPredatorWorld(seed, TICKS, {
        onTick: (world, observer) => {
            let total = 0;
            for (let slot = 0; slot < world.alive.length; slot++) {
                if (world.alive[slot] === 1 && observer.genomeId[slot] === world.genomeId[slot]) {
                    total += world.deliberateKills[slot];
                    if (world.deliberateKills[slot] !== observer.intent.deliberateKills[slot]) {
                        mismatches.push(
                            `tick ${world.tick} slot ${slot}: sim ${world.deliberateKills[slot]} observer ${observer.intent.deliberateKills[slot]}`,
                        );
                    }
                }
            }
            kills = Math.max(kills, total);
        },
    });
    return { kills, mismatches };
}

describe('deliberateKills against the observer', () => {
    it(
        'agrees with intent.deliberateKills for every tracked agent on a replay with kills',
        () => {
            let kills = 0;
            for (const seed of [1, 2]) {
                const result = replay(seed);
                expect(result.mismatches.slice(0, 5), `seed ${seed}`).toEqual([]);
                kills += result.kills;
            }
            expect(kills).toBeGreaterThan(0);
        },
        scaleTimeout(120_000),
    );
});
