import { describe, expect, it } from 'vitest';
import { SURVIVABLE_PREDATOR_EVERY, playPredatorWorld, survivableWorld } from './helpers/predator-world.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

const TICKS = 5000;

/**
 * @param {any} world the world
 * @returns {number} the alive agents that are not predators
 */
function preyAlive(world) {
    let n = 0;
    for (let slot = 0; slot < world.alive.length; slot++) {
        n += world.alive[slot] === 1 && world.spec[slot] !== 1 ? 1 : 0;
    }
    return n;
}

/**
 * The survivability criterion of `docs/designs/world-balance.md` (Chance-or-waste controllers), chosen before any pair
 * metric was looked at: `hunter` against `fleer`, on each seed, at least half the starting prey alive at the
 * midpoint, some prey alive at the end, and at least 5 resolved bite episodes of which at least 3 escaped.
 */
describe('the survivable-prey duel keeps prey alive', () => {
    it.each([1, 2, 3])(
        'seed %i',
        (seed) => {
            let start = 0;
            let middle = 0;
            const { world, observer } = playPredatorWorld(seed, TICKS, {
                world: survivableWorld,
                predatorEvery: SURVIVABLE_PREDATOR_EVERY,
                onTick: (w) => {
                    start = w.tick === 1 ? preyAlive(w) : start;
                    middle = w.tick === TICKS / 2 ? preyAlive(w) : middle;
                },
            });
            const { caughtEpisodes, escapedEpisodes } = observer.combat;
            expect(middle).toBeGreaterThanOrEqual(start / 2);
            expect(preyAlive(world)).toBeGreaterThan(0);
            expect(caughtEpisodes + escapedEpisodes).toBeGreaterThanOrEqual(5);
            expect(escapedEpisodes).toBeGreaterThanOrEqual(3);
        },
        scaleTimeout(120_000),
    );
});
