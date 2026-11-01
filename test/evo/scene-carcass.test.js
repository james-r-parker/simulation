// Scavenge on a hand-built world: meat items that vanish with a known eater, one that expires, and bite totals.

import { describe, expect, it } from 'vitest';
import { FOOD_KIND, FOOD_ORIGIN } from '../../js/sim/carcass.js';
import { computeMetrics } from '../../js/evo/metrics.js';
import { trackCarcasses } from '../../js/evo/scene-carcass.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { trackHerd } from '../../js/evo/scene-herd.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';

const read = (/** @type {any} */ r, /** @type {string} */ name) => computeMetrics(r.observer, r.world)[`eval.${name}`];

/** Puts a meat item in a food slot. */
function meat(
    /** @type {any} */ world,
    /** @type {number} */ food,
    /** @type {number} */ x,
    /** @type {number} */ age,
) {
    world.foodAlive[food] = 1;
    world.foodKind[food] = FOOD_KIND.MEAT;
    world.foodX[food] = x;
    world.foodY[food] = 500;
    world.foodRadius[food] = 10;
    world.foodValue[food] = 100;
    world.foodAge[food] = age;
}

describe('the carcass metrics', () => {
    it('credit each vanished carcass to the agent that overlapped it and gained food, at its meat share', () => {
        const r = observed();
        const { world, observer } = r;
        const { predator } = world.config.specialisations;
        const grazer = addBlob(world, { x: 700 });
        const hunter = addBlob(world, { x: 500, spec: predator.index });
        meat(world, 0, 500, 0);
        meat(world, 1, 700, 0);
        meat(world, 2, 900, 299);
        world.tick = BURN_IN_TICKS + 1;
        trackCarcasses(observer.scenes.carcass, observer, world);
        for (const food of [0, 1, 2]) {
            world.foodAlive[food] = 0;
        }
        world.foodAge[2] = 301;
        world.foodEnergy[hunter] = 100;
        world.foodEnergy[grazer] = 100;
        world.tick = BURN_IN_TICKS + 2;
        trackCarcasses(observer.scenes.carcass, observer, world);
        observer.intent.run.huntBiteDeliberate = 50;
        observer.intent.run.huntBiteChance = 20;
        trackHerd(observer.scenes.herd, world, observer);
        // The hunter eats all of its carcass (meatFoodValue 1); the grazer a third or less of its own.
        const grazerShare = world.meatFoodBySpec[world.spec[grazer]];
        expect(grazerShare).toBeLessThan(1);
        const eaten = 100 + 100 * grazerShare;
        expect(read(r, 'carcass_meal_share').value).toBeCloseTo(eaten / (eaten + 70), 12);
        expect(read(r, 'carcass_hunter_share').value).toBeCloseTo(100 / eaten, 12);
    });

    it('give a carcass two agents overlap to the lower slot, and none to a carcass nobody gained from', () => {
        const r = observed();
        const { world, observer } = r;
        const { predator } = world.config.specialisations;
        const grazer = addBlob(world, { x: 500 });
        const hunter = addBlob(world, { x: 505, spec: predator.index });
        meat(world, 0, 500, 0);
        meat(world, 1, 900, 0);
        world.tick = BURN_IN_TICKS + 1;
        trackCarcasses(observer.scenes.carcass, observer, world);
        world.foodAlive[0] = 0;
        world.foodAlive[1] = 0;
        world.foodEnergy[grazer] = 100;
        world.foodEnergy[hunter] = 100;
        world.tick = BURN_IN_TICKS + 2;
        trackCarcasses(observer.scenes.carcass, observer, world);
        expect(observer.scenes.carcass.eatenByHunters).toBe(0);
        expect(observer.scenes.carcass.eaten).toBeGreaterThan(0);
    });

    it('do not take plant food or a still-present carcass for an eaten one', () => {
        const r = observed();
        const { world, observer } = r;
        const grazer = addBlob(world, { x: 500 });
        meat(world, 0, 500, 0);
        world.foodAlive[1] = 1;
        world.foodKind[1] = FOOD_KIND.PLANT;
        world.foodValue[1] = 100;
        world.foodX[1] = 500;
        world.tick = BURN_IN_TICKS + 1;
        trackCarcasses(observer.scenes.carcass, observer, world);
        world.foodAlive[1] = 0;
        world.foodEnergy[grazer] = 100;
        world.tick = BURN_IN_TICKS + 2;
        trackCarcasses(observer.scenes.carcass, observer, world);
        expect(observer.scenes.carcass.eaten).toBe(0);
        expect(read(r, 'carcass_meal_share').value).toBeNull();
        expect(read(r, 'carcass_hunter_share').reason).toContain('no carcass eaten');
    });

    it('leaves partial herd-carcass bites to the herd scene instead of double-counting them', () => {
        const r = observed();
        const { world, observer } = r;
        const grazer = addBlob(world, { x: 500 });
        meat(world, 0, 500, 0);
        world.foodOrigin[0] = FOOD_ORIGIN.HERD_CARCASS;
        world.tick = BURN_IN_TICKS + 1;
        trackCarcasses(observer.scenes.carcass, observer, world);
        world.foodValue[0] -= 100;
        world.foodEnergy[grazer] = 100;
        world.tick = BURN_IN_TICKS + 2;
        trackCarcasses(observer.scenes.carcass, observer, world);
        expect(observer.scenes.carcass.eaten).toBe(0);
    });
});
