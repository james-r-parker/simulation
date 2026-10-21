import { describe, expect, it } from 'vitest';
import { buildHunterIndex, createHunterIndex, nearestHunterSquared } from '../../js/evo/nearest-hunter.js';

const HUNTER = 1;
const HUNTER_SPEC = Uint8Array.from([0, 1]);

/**
 * @param {number} seed a seed
 * @returns {() => number} a deterministic uniform [0, 1) generator
 */
function lcg(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

/**
 * @param {number} slots slot count
 * @param {() => number} rand the generator
 * @param {{hunters: number, lattice: boolean}} shape how many hunters; whether positions fall on a coarse lattice,
 *   which makes equal x values and coincident agents
 * @returns {Record<string, any>} a world with the fields the index reads
 */
function scene(slots, rand, { hunters, lattice }) {
    const world = {
        alive: new Uint8Array(slots),
        spec: new Uint8Array(slots),
        x: new Float64Array(slots),
        y: new Float64Array(slots),
    };
    for (let s = 0; s < slots; s++) {
        world.alive[s] = rand() < 0.9 ? 1 : 0;
        world.spec[s] = s < hunters ? HUNTER : 0;
        world.x[s] = lattice ? Math.floor(rand() * 4) * 37 : rand() * 14400;
        world.y[s] = lattice ? Math.floor(rand() * 4) * 53 : rand() * 8100;
    }
    return world;
}

/**
 * The all-pairs scan the index replaces.
 * @param {Record<string, any>} world the world
 * @param {number} s the querying slot
 * @returns {number} the squared distance to the nearest alive hunter other than `s`
 */
function naive(world, s) {
    let best = Infinity;
    for (let h = 0; h < world.alive.length; h++) {
        if (world.alive[h] === 1 && HUNTER_SPEC[world.spec[h]] === 1 && h !== s) {
            const dx = world.x[s] - world.x[h];
            const dy = world.y[s] - world.y[h];
            best = Math.min(best, dx * dx + dy * dy);
        }
    }
    return best;
}

/**
 * Moves every agent a little, kills and revives some, and flips some agents between hunter and not, as ticks do.
 * @param {Record<string, any>} world the world
 * @param {() => number} rand the generator
 * @returns {void}
 */
function drift(world, rand) {
    for (let s = 0; s < world.alive.length; s++) {
        world.x[s] += (rand() - 0.5) * 8;
        world.y[s] += (rand() - 0.5) * 8;
        world.alive[s] = rand() < 0.02 ? 1 - world.alive[s] : world.alive[s];
        world.spec[s] = rand() < 0.01 ? 1 - world.spec[s] : world.spec[s];
    }
}

describe('nearestHunterSquared', () => {
    it.each([
        [0, false],
        [1, false],
        [2, false],
        [40, false],
        [200, false],
        [30, true],
    ])('matches the all-pairs scan with %i hunters (lattice %s)', (hunters, lattice) => {
        const rand = lcg(hunters * 31 + 7);
        const index = createHunterIndex(200);
        for (let trial = 0; trial < 25; trial++) {
            const world = scene(200, rand, { hunters, lattice });
            buildHunterIndex(index, world, HUNTER_SPEC);
            for (let s = 0; s < 200; s++) {
                expect(nearestHunterSquared(index, world, s, HUNTER_SPEC)).toBe(naive(world, s));
            }
        }
    });

    it('stays exact over ticks of drift, deaths and role changes, when each call is seeded by the last', () => {
        const rand = lcg(99);
        const world = scene(200, rand, { hunters: 50, lattice: false });
        const index = createHunterIndex(200);
        for (let tick = 0; tick < 120; tick++) {
            drift(world, rand);
            buildHunterIndex(index, world, HUNTER_SPEC);
            for (let s = 0; s < 200; s++) {
                if (world.alive[s] === 1) {
                    expect(nearestHunterSquared(index, world, s, HUNTER_SPEC)).toBe(naive(world, s));
                }
            }
        }
    });

    it('counts a coincident other hunter at distance 0 but never the agent itself', () => {
        const world = scene(8, lcg(3), { hunters: 0, lattice: false });
        world.alive.fill(0);
        for (const s of [5, 6]) {
            world.alive[s] = 1;
            world.spec[s] = HUNTER;
            world.x[s] = 100;
            world.y[s] = 100;
        }
        const index = createHunterIndex(8);
        buildHunterIndex(index, world, HUNTER_SPEC);
        expect(nearestHunterSquared(index, world, 5, HUNTER_SPEC)).toBe(0);
        world.alive[6] = 0;
        buildHunterIndex(index, world, HUNTER_SPEC);
        expect(nearestHunterSquared(index, world, 5, HUNTER_SPEC)).toBe(Infinity);
    });
});
