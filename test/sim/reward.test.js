import { describe, expect, it } from 'vitest';
import { REWARD_NAMES, REWARD_SOURCE, noteReward } from '../../js/sim/reward.js';
import { applyGenes } from '../../js/sim/traits.js';
import { freeAgent } from '../../js/sim/world.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { FOOD_KIND } from '../../js/sim/carcass.js';
import { HUNTER, PREY, createArena, runArena, stillBrain } from './helpers/predator-arena.js';
import { addBlob } from './helpers/life-world.js';
import { smallWorld } from './helpers/small-world.js';

const FOOD = 100;

/**
 * @param {Record<string, any>} over config overrides
 * @returns {{world: any, slot: number}} a world with one agent
 */
function setup(over = {}) {
    const world = smallWorld({ rewardedHebb: true, foodEnergy: FOOD, ...over });
    return { world, slot: addBlob(world) };
}

describe('noteReward', () => {
    it('adds stored / foodEnergy to the trace, capped at 1', () => {
        const { world, slot } = setup();
        noteReward(world, slot, REWARD_SOURCE.KILL, 25);
        expect(world.rewardTrace[slot]).toBeCloseTo(0.25, 6);
        noteReward(world, slot, REWARD_SOURCE.KILL, 500);
        expect(world.rewardTrace[slot]).toBe(1);
    });

    it.each([
        ['kill', [1, 0, 0]],
        ['kill-bite', [1, 1, 0]],
        ['meat', [1, 1, 1]],
    ])('rewardSource %s feeds the trace from the sources %j only', (rewardSource, admitted) => {
        for (const source of [REWARD_SOURCE.KILL, REWARD_SOURCE.BITE, REWARD_SOURCE.SCAVENGE]) {
            const { world, slot } = setup({ rewardSource });
            noteReward(world, slot, source, 10);
            expect(world.rewardTrace[slot] > 0).toBe(admitted[source] === 1);
            expect(world.rewardCounts[source]).toBe(1);
        }
    });

    it('counts every source in every arm, with or without rewardedHebb', () => {
        const world = smallWorld({ foodEnergy: FOOD });
        const slot = addBlob(world);
        expect(world.rewardTrace).toBeUndefined();
        noteReward(world, slot, REWARD_SOURCE.BITE, 5);
        noteReward(world, slot, REWARD_SOURCE.SCAVENGE, 5);
        noteReward(world, slot, REWARD_SOURCE.SCAVENGE, 5);
        expect(Array.from(world.rewardCounts)).toEqual([0, 1, 2]);
        expect(REWARD_NAMES).toEqual(['kill', 'bite', 'scavenge']);
    });

    it('ignores a call with nothing stored', () => {
        const { world, slot } = setup();
        noteReward(world, slot, REWARD_SOURCE.KILL, 0);
        noteReward(world, slot, REWARD_SOURCE.KILL, -3);
        expect(world.rewardTrace[slot]).toBe(0);
        expect(Array.from(world.rewardCounts)).toEqual([0, 0, 0]);
    });

    it('is reset by applyGenes and zeroed by freeAgent', () => {
        const { world, slot } = setup();
        noteReward(world, slot, REWARD_SOURCE.KILL, 50);
        applyGenes(world, slot);
        expect(world.rewardTrace[slot]).toBe(0);
        noteReward(world, slot, REWARD_SOURCE.KILL, 50);
        freeAgent(world, slot);
        expect(world.rewardTrace[slot]).toBe(0);
    });

    it('does not move the world hash when rewardedHebb is off', () => {
        const a = smallWorld({ foodEnergy: FOOD });
        const b = smallWorld({ foodEnergy: FOOD });
        addBlob(a);
        noteReward(b, addBlob(b), REWARD_SOURCE.KILL, 50);
        expect(hashWorld(b)).toBe(hashWorld(a));
    });
});

describe('the feed phase calls noteReward', () => {
    it('counts the kill when the bite is fatal and the scavenge when the hunter eats the carcass', () => {
        const world = createArena({ gap: 300, hunterEnergy: 2500 });
        world.foodEnergy[PREY] = 500;
        runArena(world, { ticks: 400, prey: stillBrain, after: (w) => w.alive[PREY] === 0 });
        expect(world.rewardCounts[REWARD_SOURCE.KILL]).toBe(1);
        const bites = world.rewardCounts[REWARD_SOURCE.BITE];
        const meat = world.foodKind.findIndex(
            (/** @type {number} */ k, /** @type {number} */ f) => world.foodAlive[f] === 1 && k === FOOD_KIND.MEAT,
        );
        world.x[HUNTER] = world.foodX[meat];
        world.y[HUNTER] = world.foodY[meat];
        runArena(world, { ticks: 1, prey: stillBrain });
        expect(world.rewardCounts[REWARD_SOURCE.SCAVENGE]).toBe(1);
        expect(world.rewardCounts[REWARD_SOURCE.KILL]).toBe(1);
        expect(world.rewardCounts[REWARD_SOURCE.BITE]).toBe(bites);
    });
});
