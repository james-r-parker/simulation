import { describe, expect, it } from 'vitest';
import { patchesVisitedOf } from '../../js/evo/observer-watch-counters.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';
import { playMicroWorld } from './helpers/predator-world.js';

const TICKS = 2000;
const PATCHES = 8;

/**
 * @param {string} arm the controller
 * @param {Record<string, any>} extra config overrides
 * @returns {{mateBirths: number, mostPatches: number}} the mating children seen and the most patches one agent visited
 */
function run(arm, extra) {
    const mateChildren = new Set();
    const { observer } = playMicroWorld(1, TICKS, arm, extra, (world) => {
        for (let slot = 0; slot < world.alive.length; slot++) {
            if (world.alive[slot] === 1 && world.parentA[slot] !== world.parentB[slot]) {
                mateChildren.add(world.genomeId[slot]);
            }
        }
    });
    let mostPatches = 0;
    for (let slot = 0; slot < observer.matings.length; slot++) {
        mostPatches = Math.max(mostPatches, patchesVisitedOf(observer, slot));
    }
    return { mateBirths: mateChildren.size, mostPatches };
}

describe('v6 exploit controllers in the micro-world', () => {
    it(
        'mateHopper mates (the MATING term has something to pay) and foodSeeker does not',
        () => {
            expect(run('mateHopper', {}).mateBirths).toBeGreaterThan(0);
            expect(run('foodSeeker', {}).mateBirths).toBe(0);
        },
        scaleTimeout(60_000),
    );

    it(
        'patrol visits more food patches than a controller that stays where food is',
        () => {
            const extra = { foodPatchCount: PATCHES };
            const patrol = run('patrol', extra);
            expect(patrol.mostPatches).toBeGreaterThanOrEqual(3);
            expect(patrol.mostPatches).toBeGreaterThan(run('sitter', extra).mostPatches);
        },
        scaleTimeout(60_000),
    );
});
