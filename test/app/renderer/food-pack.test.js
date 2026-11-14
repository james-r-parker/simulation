import { describe, expect, it } from 'vitest';
import { CARCASS, createFoodPack, FOOD_MIN_PX, packFood, spotHash } from '../../../js/app/renderer/food-pack.js';
import { NEON } from '../../../js/app/renderer/palette.js';
import { makeSnapshot } from '../helpers/snapshots.js';

describe('packFood', () => {
    it('sorts food by species into its model bucket and carcasses into the last', () => {
        const pack = createFoodPack(8);
        const snap = makeSnapshot(1, [], {
            foods: [
                [10, 10, 5, 0.1, 0, 0.2],
                [20, 20, 5, 0.1, 4, 0],
                [30, 30, -8, 0, 0, 0],
                [40, 40, 5, 0.1, 5, 0],
            ],
        });
        expect(packFood(snap, pack, { zoom: 1, timeSec: 0 })).toBe(4);
        expect(pack.buckets.map((b) => b.count)).toEqual([1, 0, 0, 0, 1, 1, 1]);
        expect(pack.buckets[CARCASS].pose[3]).toBe(8);
    });

    it('ages a carcass from meat to rot and shrinks it', () => {
        const pack = createFoodPack(2);
        packFood(makeSnapshot(1, [], { foods: [[0, 0, -10, 1, 0, 0]] }), pack, { zoom: 1, timeSec: 0 });
        const b = pack.buckets[CARCASS];
        expect(b.neon[0]).toBeCloseTo(NEON.rot[0]);
        expect(b.pose[3]).toBeCloseTo(7);
        expect(b.rig0[2]).toBe(0);
    });

    it('draws a tiny item at least FOOD_MIN_PX across and sways plants', () => {
        const pack = createFoodPack(2);
        packFood(makeSnapshot(1, [], { foods: [[3, 4, 0.1, 0, 1, 0]] }), pack, { zoom: 0.5, timeSec: 0.7 });
        const b = pack.buckets[1];
        expect(b.pose[3]).toBeCloseTo(FOOD_MIN_PX / 2 / 0.5);
        expect(Math.abs(b.rig0[2])).toBeGreaterThan(0);
        expect(b.rig0[3]).toBe(1);
    });

    it('turns neighbours differently but each spot the same every frame', () => {
        expect(spotHash(1, 2)).toBe(spotHash(1, 2));
        expect(spotHash(1, 2)).not.toBe(spotHash(2, 1));
    });
});
