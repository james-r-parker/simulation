import { describe, expect, it } from 'vitest';
import { allocBody } from './helpers/body.js';
import { ENERGY_SOURCE, addEnergy } from '../../js/sim/energy.js';
import { FOOD_KIND, FOOD_ORIGIN } from '../../js/sim/carcass.js';
import { OUTPUT_COUNT } from '../../js/sim/brain-layout.js';
import { feed } from '../../js/sim/feeding.js';
import { buildHash, createSpatialHash } from '../../js/sim/spatial-hash.js';
import { smallWorld } from './helpers/small-world.js';

describe('herd carcass feeding', () => {
    it('limits a bite to 400 stored energy and leaves uneaten value available', () => {
        const world = smallWorld();
        const agent = allocBody(world);
        world.x[agent] = 100;
        world.y[agent] = 100;
        world.spec[agent] = 1;
        world.outputs.fill(0, agent * OUTPUT_COUNT, (agent + 1) * OUTPUT_COUNT);
        addEnergy(world, agent, 20, ENERGY_SOURCE.INITIAL);
        const food = 0;
        world.foodAlive[food] = 1;
        world.foodKind[food] = FOOD_KIND.MEAT;
        world.foodOrigin[food] = FOOD_ORIGIN.HERD_CARCASS;
        world.foodX[food] = 100 + world.size[agent];
        world.foodY[food] = 100;
        world.foodRadius[food] = 5;
        world.foodValue[food] = 1000;
        world.foodCount = 1;

        const hash = createSpatialHash(world.config);
        buildHash(hash, world);
        feed(world, hash);

        expect(world.foodAlive[food]).toBe(1);
        expect(world.foodValue[food]).toBe(600);
        expect(world.energy[agent]).toBe(420);
        expect(world.herdTotals[1]).toBe(400);
    });
});
