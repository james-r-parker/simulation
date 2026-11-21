import { describe, expect, it } from 'vitest';
import {
    CRACKS_PER_BASIN,
    createGroundPack,
    DEPTH_PARALLAX,
    DEPTH_POINTS,
    FROST_TICKS,
    packGround,
    SEASON_MOTES,
} from '../../../js/app/renderer/ground-pack.js';

const INFO = { worldWidth: 2000, worldHeight: 1000, terrain: { coldMarginWidth: 100, wallX: 1000 } };
const VIEW = { timeSec: 0, season: 0, seasonProgress: 0, droughtBasin: -1 };

describe('ground pack', () => {
    it('lays frost ticks inside the cold margins, the same for the same seed', () => {
        const a = createGroundPack(INFO, 7);
        const b = createGroundPack(INFO, 7);
        expect(a.frost.count).toBe(FROST_TICKS);
        expect(Array.from(a.frost.pose.slice(0, 8))).toEqual(Array.from(b.frost.pose.slice(0, 8)));
        for (let i = 0; i < FROST_TICKS; i++) {
            const y = a.frost.pose[i * 4 + 1];
            expect(y <= 100 || y >= 900).toBe(true);
        }
        expect(createGroundPack({ ...INFO, terrain: { coldMarginWidth: 0, wallX: 1000 } }, 7).frost.count).toBe(0);
    });

    it('draws cracks only in the basin under drought', () => {
        const pack = createGroundPack(INFO, 1);
        packGround(pack, VIEW);
        expect(pack.crack.count).toBe(0);
        packGround(pack, { ...VIEW, droughtBasin: 1 });
        expect(pack.crack.count).toBe(CRACKS_PER_BASIN);
        for (let i = 0; i < CRACKS_PER_BASIN; i++) {
            expect(pack.crack.pose[i * 4]).toBeGreaterThan(1000);
        }
    });

    it('puts every mote in its season, switches them one by one at the end and gathers winter at the margins', () => {
        const pack = createGroundPack(INFO, 3);
        packGround(pack, { ...VIEW, season: 1, seasonProgress: 0.5 });
        expect(pack.moteBuckets.map((/** @type {any} */ b) => b.count)).toEqual([0, SEASON_MOTES, 0, 0]);
        packGround(pack, { ...VIEW, season: 1, seasonProgress: 0.975 });
        expect(pack.moteBuckets[1].count).toBeGreaterThan(0);
        expect(pack.moteBuckets[2].count).toBeGreaterThan(0);
        packGround(pack, { ...VIEW, season: 3, seasonProgress: 0.1 });
        const winter = pack.moteBuckets[3];
        for (let i = 0; i < winter.count; i++) {
            const y = winter.pose[i * 4 + 1];
            expect(y <= 100 || y >= 900).toBe(true);
        }
    });
});

describe('ground pack without cold margins', () => {
    it('leaves winter motes where they drift', () => {
        const pack = createGroundPack(
            { worldWidth: 2000, worldHeight: 1000, terrain: { coldMarginWidth: 0, wallX: 1000 } },
            3,
        );
        packGround(pack, { ...VIEW, season: 3 });
        expect(pack.moteBuckets[3].count).toBe(SEASON_MOTES);
        expect(createGroundPack({ worldWidth: 2000, worldHeight: 1000 }, 3).frost.count).toBe(0);
    });
});

describe('depth points', () => {
    const W = INFO.worldWidth;
    const H = INFO.worldHeight;
    /** @param {number} a @param {number} b @param {number} size @returns {number} the shortest signed distance a to b on a wrapped axis */
    const gap = (a, b, size) => ((((b - a) % size) + 1.5 * size) % size) - size / 2;

    it('scatter dim specks across the world, a fixed device size at any zoom', async () => {
        const { DEPTH_BRIGHTNESS, DEPTH_PX } = await import('../../../js/app/renderer/ground-pack.js');
        const pack = createGroundPack(INFO, 5);
        expect(pack.depth.count).toBe(DEPTH_POINTS);
        for (let i = 0; i < DEPTH_POINTS; i++) {
            const k = pack.depth.neon[i * 4];
            expect(k).toBeGreaterThanOrEqual(DEPTH_BRIGHTNESS.min - 1e-6);
            expect(k).toBeLessThanOrEqual(DEPTH_BRIGHTNESS.max + 1e-6);
        }
        packGround(pack, { ...VIEW, timeSec: 50, zoom: 4 });
        expect(pack.depth.pose[3]).toBeCloseTo(DEPTH_PX / 2 / 4);
        for (let i = 0; i < DEPTH_POINTS; i++) {
            expect(pack.depth.pose[i * 4]).toBeGreaterThanOrEqual(0);
            expect(pack.depth.pose[i * 4]).toBeLessThan(W);
            expect(pack.depth.pose[i * 4 + 1]).toBeGreaterThanOrEqual(0);
            expect(pack.depth.pose[i * 4 + 1]).toBeLessThan(H);
        }
    });

    it('falls in three equal layers, laid the same for the same seed', () => {
        const a = createGroundPack(INFO, 5);
        const b = createGroundPack(INFO, 5);
        expect(Array.from(a.depth.base.slice(0, 20))).toEqual(Array.from(b.depth.base.slice(0, 20)));
        const counts = [0, 0, 0];
        a.depth.layer.forEach((/** @type {number} */ l) => counts[l]++);
        expect(counts).toEqual([400, 400, 400]);
        expect(DEPTH_PARALLAX).toEqual([0.2, 0.5, 0.8]);
    });

    it('moves each layer on screen by its parallax share of the camera move', () => {
        const pack = createGroundPack(INFO, 5);
        const view = { ...VIEW, timeSec: 0, zoom: 2 };
        packGround(pack, { ...view, cameraX: 1000, cameraY: 500 });
        const before = Float32Array.from(pack.depth.pose);
        packGround(pack, { ...view, cameraX: 1100, cameraY: 460 });
        for (let i = 0; i < DEPTH_POINTS; i++) {
            const share = DEPTH_PARALLAX[pack.depth.layer[i]];
            // On screen a point sits at (world - camera) x zoom, so it moves by its world move less the camera's.
            const moveX = gap(before[i * 4], pack.depth.pose[i * 4], W) - 100;
            const moveY = gap(before[i * 4 + 1], pack.depth.pose[i * 4 + 1], H) + 40;
            expect(moveX).toBeCloseTo(-share * 100, 3);
            expect(moveY).toBeCloseTo(share * 40, 3);
        }
    });

    it('drifts each layer under 2 device px a minute at any zoom, the far layer slowest', () => {
        for (const zoom of [0.5, 1, 4]) {
            const pack = createGroundPack(INFO, 5);
            packGround(pack, { ...VIEW, timeSec: 0, zoom });
            const start = Float32Array.from(pack.depth.pose);
            for (let s = 1; s <= 60; s++) {
                packGround(pack, { ...VIEW, timeSec: s, zoom });
            }
            const moved = [0, 0, 0];
            for (let i = 0; i < DEPTH_POINTS; i++) {
                const l = pack.depth.layer[i];
                const px =
                    Math.hypot(
                        gap(start[i * 4], pack.depth.pose[i * 4], W),
                        gap(start[i * 4 + 1], pack.depth.pose[i * 4 + 1], H),
                    ) * zoom;
                moved[l] = Math.max(moved[l], px);
            }
            expect(moved[0]).toBeGreaterThan(0.2);
            expect(moved[2]).toBeLessThan(2);
            expect(moved[0]).toBeLessThan(moved[1]);
            expect(moved[1]).toBeLessThan(moved[2]);
        }
    });

    it('does not pop when the zoom changes, and a long gap in time does not fling the points', () => {
        const pack = createGroundPack(INFO, 5);
        packGround(pack, { ...VIEW, timeSec: 10, zoom: 1 });
        const a = Float32Array.from(pack.depth.pose);
        packGround(pack, { ...VIEW, timeSec: 10, zoom: 8 });
        expect(Array.from(pack.depth.pose.slice(0, 40)).filter((v, k) => k % 4 !== 3)).toEqual(
            Array.from(a.slice(0, 40)).filter((v, k) => k % 4 !== 3),
        );
        packGround(pack, { ...VIEW, timeSec: 100000, zoom: 1 });
        let farthest = 0;
        for (let i = 0; i < DEPTH_POINTS; i++) {
            farthest = Math.max(farthest, Math.abs(gap(a[i * 4], pack.depth.pose[i * 4], W)));
        }
        expect(farthest).toBeLessThan(0.1);
    });
});
