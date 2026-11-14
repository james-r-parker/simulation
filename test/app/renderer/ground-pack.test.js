import { describe, expect, it } from 'vitest';
import {
    CRACKS_PER_BASIN,
    createGroundPack,
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
