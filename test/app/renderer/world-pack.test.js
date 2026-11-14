import { describe, expect, it } from 'vitest';
import { createWorldPack, packWorld, RIPE_FILL, ZONE_RADIUS } from '../../../js/app/renderer/world-pack.js';
import { NEON } from '../../../js/app/renderer/palette.js';
import { smallReady } from '../helpers/ready.js';
import { makeSnapshot } from '../helpers/snapshots.js';

describe('packWorld', () => {
    it('packs the rocks of a real world with their harmonics and the refuge levels', () => {
        const ready = smallReady();
        const pack = createWorldPack(ready.info, 3);
        const levels = new Float32Array(ready.info.terrain.refuges.length).fill(0.5);
        const s = packWorld(ready.snapshot, pack, { info: ready.info, dung: 1, levels, timeSec: 0 });
        expect(pack.rock.count).toBe(s.obstacleCount);
        if (pack.rock.count > 0) {
            expect(pack.rock.gate[0] + pack.rock.gate[1] + pack.rock.gate[2]).toBeGreaterThan(0);
            expect(pack.rock.neon[0]).toBeCloseTo(NEON.rock[0]);
        }
        expect(pack.refuge.count).toBe(ready.info.terrain.refuges.length);
        if (pack.refuge.count > 0) {
            expect(pack.refuge.gate[0]).toBe(0.5);
        }
    });

    it('marks ripe patches, splits fertile from dung zones and fades clouds', () => {
        const info = {
            obstacleCount: 0,
            floraPatchMax: 2,
            fertileZoneMax: 2,
            maxClouds: 2,
            foodPatchRadius: 120,
            smokeRadius: 60,
            terrain: { refuges: [] },
        };
        const pack = createWorldPack(info, 1);
        const snap = makeSnapshot(1, [], {
            clouds: [[5, 6, 0.1]],
            zones: [
                [1, 2, 1, 0],
                [3, 4, 0, 1],
            ],
        });
        packWorld(snap, pack, { info, dung: 1, levels: null, timeSec: 0 });
        expect(pack.fertile.count).toBe(1);
        expect(pack.dung.count).toBe(1);
        expect(pack.fertile.pose[3]).toBe(ZONE_RADIUS);
        expect(pack.dung.pose[3]).toBeCloseTo(ZONE_RADIUS * 0.6);
        expect(pack.cloud.count).toBe(1);
        expect(pack.cloud.neon[0]).toBeLessThan(NEON.select[0]);
        expect(RIPE_FILL).toBe(0.7);
    });
});

/**
 * @param {number[][]} patches `[x, y, species, hue, fill]` rows
 * @param {number[][]} zones `[x, y, share, origin]` rows
 * @returns {{u32: Uint32Array, f32: Float32Array}} a snapshot holding only patches and zones
 */
function patchSnapshot(patches, zones = []) {
    const words = 10 + patches.length * 5 + zones.length * 4;
    const u32 = new Uint32Array(words);
    const f32 = new Float32Array(u32.buffer);
    u32[6] = patches.length;
    u32[8] = zones.length;
    patches.forEach((row, i) => f32.set(row, 10 + i * 5));
    zones.forEach((row, i) => {
        f32.set(row.slice(0, 3), 10 + patches.length * 5 + i * 4);
        u32[10 + patches.length * 5 + i * 4 + 3] = row[3];
    });
    return { u32, f32 };
}

describe('packWorld patches and capacities', () => {
    it('marks a patch ripe above 70% fill, bobs its glints and drops zones past capacity', () => {
        const info = { foodPatchRadius: 100, smokeRadius: 10, floraPatchMax: 2, fertileZoneMax: 1, maxClouds: 1 };
        const pack = createWorldPack(info, 1);
        const snap = patchSnapshot(
            [
                [10, 20, 1, 0.2, 0.9],
                [30, 40, 2, -0.5, 0.3],
            ],
            [
                [1, 1, 1, 0],
                [2, 2, 1, 0],
            ],
        );
        packWorld(snap, pack, { info, dung: 1, levels: null, timeSec: 0.4 });
        expect(pack.patch.count).toBe(2);
        expect(pack.patch.pose[3]).toBe(100);
        expect(pack.patch.gate[1]).toBe(1);
        expect(pack.patch.gate[5]).toBe(0);
        expect(Math.abs(pack.patch.rig2[3])).toBeGreaterThan(0);
        expect(pack.fertile.count).toBe(1);
        expect(pack.rock.count).toBe(0);
        expect(pack.refuge.count).toBe(0);
    });
});

describe('createWorldPack defaults', () => {
    it('sizes every bucket for at least one item when ready.info lacks the capacities, and packs refuge levels', () => {
        const pack = createWorldPack({}, 1);
        expect(pack.rock.pose.length).toBe(4);
        expect(pack.patch.pose.length).toBe(4);
        expect(pack.cloud.pose.length).toBe(4);
        const info = { terrain: { refuges: [{ x: 5, y: 6, radius: 40 }] }, foodPatchRadius: 1, smokeRadius: 1 };
        const withRefuge = createWorldPack(info, 1);
        packWorld(patchSnapshot([]), withRefuge, { info, dung: 1, levels: null, timeSec: 0 });
        expect(withRefuge.refuge.count).toBe(1);
        expect(withRefuge.refuge.gate[0]).toBe(0);
        packWorld(patchSnapshot([]), withRefuge, { info, dung: 1, levels: new Float32Array([0.7]), timeSec: 0 });
        expect(withRefuge.refuge.gate[0]).toBeCloseTo(0.7);
        expect(withRefuge.refuge.pose[3]).toBe(40);
    });
});

describe('terrain outlines are dimmed', () => {
    it('draws patch and zone outlines at TERRAIN_DIM of their colour', async () => {
        const { TERRAIN_DIM } = await import('../../../js/app/renderer/world-pack.js');
        const { floraColor } = await import('../../../js/app/renderer/flora-colors.js');
        const { toDisplay } = await import('../../../js/app/renderer/palette.js');
        const info = { foodPatchRadius: 100, smokeRadius: 10, floraPatchMax: 1, fertileZoneMax: 2, maxClouds: 1 };
        const pack = createWorldPack(info, 1);
        packWorld(
            patchSnapshot(
                [[0, 0, 1, 0.4, 0.5]],
                [
                    [1, 1, 1, 0],
                    [2, 2, 1, 1],
                ],
            ),
            pack,
            { info, dung: 1, levels: null, timeSec: 0 },
        );
        const full = toDisplay(floraColor(0.4, [0, 0, 0]));
        expect(pack.patch.neon[0]).toBeCloseTo(full[0] * TERRAIN_DIM);
        expect(pack.fertile.neon[1]).toBeCloseTo(NEON.forager[1] * TERRAIN_DIM);
        expect(pack.dung.neon[0]).toBeCloseTo(NEON.dust[0] * TERRAIN_DIM);
        expect(TERRAIN_DIM).toBeLessThan(0.5);
    });
});
