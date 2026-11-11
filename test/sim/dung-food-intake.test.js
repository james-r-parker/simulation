import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { FOOD_ORIGIN } from '../../js/sim/carcass.js';
import { feed } from '../../js/sim/feeding.js';
import { buildHash, createSpatialHash } from '../../js/sim/spatial-hash.js';
import { spawnFoodItem } from '../../js/sim/spawn.js';
import { addBlob } from './helpers/life-world.js';
import { smallWorld } from './helpers/small-world.js';

describe('dung-zone food intake', () => {
    it('tracks stored plant energy eaten from dung zones', () => {
        const world = smallWorld();
        const slot = addBlob(world, { x: 500, y: 500, energy: 20 });
        world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = 1; // a forager eats only while it bites (eat-choice G1)
        const food = spawnFoodItem(world);
        world.foodX[food] = 500;
        world.foodY[food] = 500;
        world.foodRadius[food] = 5;
        world.foodValue[food] = 7;
        world.foodOrigin[food] = FOOD_ORIGIN.DUNG_ZONE;
        const hash = createSpatialHash(world.config);
        buildHash(hash, world);

        feed(world, hash);

        expect(world.dungFoodIntake).toBe(7);
    });
});
