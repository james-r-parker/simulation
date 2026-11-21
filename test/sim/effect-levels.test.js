import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import * as levels from '../../js/sim/effect-levels.js';
import { SHARE } from '../../js/sim/effect-refs.js';
import { allocBody } from './helpers/body.js';
import { smallWorld } from './helpers/small-world.js';

/**
 * @param {Record<string, any>} [over] config overrides
 * @returns {{world: any, slot: number}} a world with one forager at its lane bases, 50 degrees, half full
 */
function bodyWorld(over = {}) {
    const world = smallWorld({ maxAgents: 4, ...over });
    const slot = allocBody(world, 0);
    world.alive[slot] = 1;
    world.energy[slot] = world.lanes.maxEnergy[slot] / 2;
    world.temperature[slot] = 50;
    return { world, slot };
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the slot
 * @param {(world: any, slot: number) => number} level a level function
 * @param {number[]} temperatures degrees to read it at
 * @returns {number[]} the level at each
 */
function atEach(world, slot, level, temperatures) {
    return temperatures.map((t) => {
        world.temperature[slot] = t;
        return level(world, slot);
    });
}

/**
 * @param {(world: any, slot: number) => void} reader a `share` reader, which leaves its share in `SHARE[0]`
 * @returns {(world: any, slot: number) => number} the same read as a returned number
 */
const shared = (reader) => (world, slot) => {
    reader(world, slot);
    return SHARE[0];
};
const [fatLevel, coldRampLevel, hotRampLevel, spentLevel] = [
    levels.fatLevel,
    levels.coldRampLevel,
    levels.hotRampLevel,
    levels.spentLevel,
].map(shared);

describe('the temperature levels, against the default thresholds 30, 40, 65 and 85', () => {
    const { world, slot } = bodyWorld();

    it('steps the cold band under each cold threshold, strictly', () => {
        expect(atEach(world, slot, levels.coldBandLevel, [0, 29.99, 30, 39.99, 40, 100])).toEqual([2, 2, 1, 1, 0, 0]);
    });

    it('steps the heat band above the optimal maximum, and at the heat stress', () => {
        expect(atEach(world, slot, levels.heatBandLevel, [0, 65, 65.01, 84.99, 85, 100])).toEqual([0, 0, 1, 1, 2, 2]);
    });

    it('ramps the cold and hot shares from the optimal band to the ends', () => {
        const cold = atEach(world, slot, coldRampLevel, [0, 20, 40, 65]);
        expect(cold).toEqual([1, 0.5, 0, 0]);
        const hot = atEach(world, slot, hotRampLevel, [40, 65, 82.5, 100]);
        expect(hot).toEqual([0, 0, 0.5, 1]);
    });

    it('is out of band under the cold stress and over the heat stress, not at them', () => {
        expect(atEach(world, slot, levels.outOfBandLevel, [29.99, 30, 85, 85.01])).toEqual([1, 0, 0, 1]);
    });
});

describe('fat', () => {
    it('is the energy over the store', () => {
        const { world, slot } = bodyWorld();
        expect(fatLevel(world, slot)).toBe(0.5);
        world.energy[slot] = 0;
        expect(fatLevel(world, slot)).toBe(0);
    });
});

describe('juvenile', () => {
    it('is 1 for a hunter under juvenileTicks and 0 for an adult hunter or a forager', () => {
        const { world, slot } = bodyWorld({ juvenileTicks: 100 });
        world.spec[slot] = 1;
        expect([0, 99, 100].map((age) => ((world.ageTicks[slot] = age), levels.juvenileLevel(world, slot)))).toEqual([
            1, 1, 0,
        ]);
        world.spec[slot] = 0;
        world.ageTicks[slot] = 0;
        expect(levels.juvenileLevel(world, slot)).toBe(0);
    });
});

describe('spent', () => {
    it('is 0 with the store off, 0 at or above the floor and rises to 1 as the store empties', () => {
        const off = bodyWorld();
        expect(spentLevel(off.world, off.slot)).toBe(0);
        const { world, slot } = bodyWorld({ sprintStoreEnabled: true, sprintFloor: 0.5 });
        const read = [1, 0.5, 0.25, 0].map(
            (level) => ((world.sprintStore.level[slot] = level), spentLevel(world, slot)),
        );
        expect(read).toEqual([0, 0, 0.5, 1]);
    });
});

describe('the feeding levels', () => {
    it('reads grazing, handling, digesting and sated from the output, the meal timer and the store', () => {
        const { world, slot } = bodyWorld({ handlingTicks: 20, digestTicks: 10, satiationShare: 0.5 });
        const read = (/** @type {Function} */ level) => level(world, slot);
        world.ateTimer[slot] = 255;
        world.energy[slot] = 0;
        world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = 0.5;
        expect([levels.grazingLevel, levels.handlingLevel, levels.digestingLevel, levels.satedLevel].map(read)).toEqual(
            [1, 0, 0, 0],
        );
        world.ateTimer[slot] = 9;
        world.energy[slot] = world.lanes.maxEnergy[slot] / 2;
        world.spec[slot] = 1;
        expect([levels.grazingLevel, levels.handlingLevel, levels.digestingLevel, levels.satedLevel].map(read)).toEqual(
            [0, 1, 1, 1],
        );
    });

    it('reads resting from the rest timer, sick from the dose and diseased from the strain', () => {
        const { world, slot } = bodyWorld({ predatorRestTicks: 10, sickDose: 0.3 });
        expect([levels.restingLevel, levels.sickLevel, levels.diseasedLevel].map((l) => l(world, slot))).toEqual([
            0, 0, 0,
        ]);
        world.restTimer[slot] = 3;
        world.dose[slot] = 0.5;
        world.infection[slot] = 2;
        expect([levels.restingLevel, levels.sickLevel, levels.diseasedLevel].map((l) => l(world, slot))).toEqual([
            1, 1, 1,
        ]);
        const none = bodyWorld();
        expect(levels.restingLevel(none.world, none.slot)).toBe(0);
    });
});
