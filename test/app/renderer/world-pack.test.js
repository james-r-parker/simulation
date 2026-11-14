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
