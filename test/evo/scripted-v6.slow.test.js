import { describe, expect, it } from 'vitest';
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
    // Isolate the controllers from the seasonal food economy while preserving the same energy scale.
    const food = { flora: { grass: { energy: 1, radius: 1, life: 10000 } } };
    const { observer } = playMicroWorld(1, TICKS, arm, { ...food, ...extra }, (world) => {
        for (let slot = 0; slot < world.alive.length; slot++) {
            if (world.alive[slot] === 1 && world.parentA[slot] !== world.parentB[slot]) {
                mateChildren.add(world.genomeId[slot]);
            }
        }
    });
    let mostPatches = 0;
    for (let slot = 0; slot < observer.genomeId.length; slot++) {
        mostPatches = Math.max(mostPatches, observer.watch.visited[slot]);
    }
    return { mateBirths: mateChildren.size, mostPatches };
}

describe('v6 exploit controllers in the micro-world', () => {
    it(
        'mateHopper mates (the MATING term has something to pay) and foodSeeker does not',
        () => {
            // Give both arms an adult breeding window inside this short controller test.
            const breeding = { maturityTicks: 100, pregnancyTicks: 200 };
            expect(run('mateHopper', breeding).mateBirths).toBeGreaterThan(0);
            expect(run('foodSeeker', breeding).mateBirths).toBe(0);
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
