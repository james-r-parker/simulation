import { describe, expect, it } from 'vitest';
import {
    CARCASS,
    CARCASS_REACH,
    createFoodPack,
    fadeCarcassesIn,
    FOOD_MIN_PX,
    packFood,
    spotHash,
    swayFood,
} from '../../../js/app/renderer/food-pack.js';
import { NEON, toDisplay } from '../../../js/app/renderer/palette.js';
import { floraColor } from '../../../js/app/renderer/flora-colors.js';
import { DEATH_ANIMS, FAIL_MS } from '../../../js/app/renderer/death-anim.js';
import { beginDeath, createDying, trackBodies } from '../../../js/app/renderer/dying.js';
import { createInterpolated } from '../../../js/app/interpolate.js';
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
        const values = Array.from({ length: 4000 }, (_, k) => spotHash((k % 80) * 37.5, Math.floor(k / 80) * 41.25));
        expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...values)).toBeLessThan(1);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        expect(mean).toBeGreaterThan(0.45);
        expect(mean).toBeLessThan(0.55);
        expect(new Set(values.map((v) => Math.floor(v * 10))).size).toBe(10);
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

describe('fadeCarcassesIn', () => {
    const NAMES = ['STARVED', 'EATEN'];
    const VIEW = { zoom: 1, timeSec: 0 };

    /**
     * @param {number[]} genomes bodies, each at x = 100 * index, that vanished and died of `cause`
     * @param {number} cause the cause number
     * @returns {ReturnType<typeof createDying>} the dying bodies, started at 0
     */
    function dyingOf(genomes, cause) {
        const d = createDying(8);
        const a = createInterpolated(8);
        a.count = genomes.length;
        genomes.forEach((g, i) => {
            a.slot[i] = i;
            a.genomeId[i] = g;
            a.x[i] = 100 * i;
            a.size[i] = 10;
        });
        trackBodies(d, a, 0);
        trackBodies(d, createInterpolated(8), 0);
        genomes.forEach((g) => beginDeath(d, { genome: g, cause, nowMs: 0 }));
        return d;
    }

    /** @returns {ReturnType<typeof createFoodPack>} a pack of two carcasses, at x 0 and x 100 */
    function twoCarcasses() {
        const pack = createFoodPack(4);
        const foods = [
            [0, 0, -7, 0, 0, 0],
            [100, 0, -7, 0, 0, 0],
        ];
        packFood(makeSnapshot(1, [], { foods }), pack, VIEW);
        return pack;
    }

    it('keeps the carcass of an eaten body dark while it breaks, brightens it as the body fades, and restores it', () => {
        const anim = DEATH_ANIMS.EATEN;
        const pack = twoCarcasses();
        const base = pack.buckets[CARCASS].neon[0];
        const d = dyingOf([30], 1);
        fadeCarcassesIn(pack, d, { nowMs: FAIL_MS + 100, causeNames: NAMES });
        expect(pack.buckets[CARCASS].neon[0]).toBe(0);
        expect(pack.buckets[CARCASS].neon[4]).toBeCloseTo(base);
        fadeCarcassesIn(pack, d, { nowMs: FAIL_MS + anim.breakMs + anim.leaveMs / 2, causeNames: NAMES });
        expect(pack.buckets[CARCASS].neon[0]).toBeCloseTo(base * 0.5);
        fadeCarcassesIn(pack, d, { nowMs: anim.ms, causeNames: NAMES });
        expect(pack.buckets[CARCASS].neon[0]).toBeCloseTo(base);
        expect(pack.carcassFaded).toBe(false);
    });

    it('takes the nearest carcass within reach only, leaves other causes alone, and ignores a pending body', () => {
        const pack = twoCarcasses();
        const base = pack.buckets[CARCASS].neon[0];
        const starved = dyingOf([30], 0);
        fadeCarcassesIn(pack, starved, { nowMs: 100, causeNames: NAMES });
        expect(pack.buckets[CARCASS].neon[0]).toBeCloseTo(base);
        const far = dyingOf([30, 31], 1);
        far.pose[0][0] = 5000;
        far.pose[1][0] = 5000;
        fadeCarcassesIn(pack, far, { nowMs: 100, causeNames: NAMES });
        expect(pack.buckets[CARCASS].neon[0]).toBeCloseTo(base);
        expect(pack.buckets[CARCASS].neon[4]).toBe(0);
        expect(CARCASS_REACH).toBeGreaterThan(1);
        const pending = createDying(8);
        fadeCarcassesIn(pack, pending, { nowMs: 100, causeNames: NAMES });
        expect(pack.buckets[CARCASS].neon[4]).toBeCloseTo(base);
        expect(pack.carcassFaded).toBe(false);
    });
});
