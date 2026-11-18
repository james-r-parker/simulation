import { describe, expect, it } from 'vitest';
import {
    CARCASS,
    createFoodPack,
    FOOD_MIN_PX,
    packFood,
    spotHash,
    swayFood,
} from '../../../js/app/renderer/food-pack.js';
import { NEON, toDisplay } from '../../../js/app/renderer/palette.js';
import { floraColor } from '../../../js/app/renderer/flora-colors.js';
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

    it('colours a plant from a hue table within 0.002 of the exact display colour', () => {
        const pack = createFoodPack(64);
        const hues = Array.from({ length: 64 }, (_, k) => -1.2 + (2.4 * k) / 63 + 0.0007);
        const foods = hues.map((h, k) => [k, 0, 5, 0, 0, h]);
        packFood(makeSnapshot(1, [], { foods }), pack, { zoom: 1, timeSec: 0 });
        const b = pack.buckets[0];
        hues.forEach((h, k) => {
            const exact = toDisplay(floraColor(h, [0, 0, 0]));
            for (let c = 0; c < 3; c++) {
                expect(Math.abs(b.neon[k * 4 + c] - exact[c]), `hue ${h} channel ${c}`).toBeLessThan(0.002);
            }
        });
        expect(pack.hueTable).toBeInstanceOf(Float32Array);
    });

    it('sways the packed plants to a later time as a full pack would, and leaves carcasses still', () => {
        const foods = [
            [10, 10, 5, 0, 0, 0.1],
            [20, 30, 4, 0, 3, -0.4],
            [30, 30, -8, 0.5, 0, 0],
        ];
        const swayed = createFoodPack(4);
        packFood(makeSnapshot(1, [], { foods }), swayed, { zoom: 1, timeSec: 0.2 });
        swayFood(swayed, 3.7);
        const fresh = createFoodPack(4);
        packFood(makeSnapshot(1, [], { foods }), fresh, { zoom: 1, timeSec: 3.7 });
        for (const k of [0, 3, CARCASS]) {
            const n = fresh.buckets[k].count * 4;
            expect(Array.from(swayed.buckets[k].rig0.slice(0, n)).map((v) => v.toFixed(4))).toEqual(
                Array.from(fresh.buckets[k].rig0.slice(0, n)).map((v) => v.toFixed(4)),
            );
        }
    });
});
