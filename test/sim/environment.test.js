import { describe, expect, it } from 'vitest';
import { addFertileZone, decayFertileZones, seasonAt, updateSeason, ZONE_ORIGIN } from '../../js/sim/environment.js';
import { smallWorld } from './helpers/small-world.js';

describe('seasonAt', () => {
    it('writes the index and phase across a year', () => {
        const w = smallWorld({ eraSeasonTicks: 100 });
        const expected = [
            [0, 0, 0],
            [99, 0, 0.2475],
            [100, 1, 0.25],
            [250, 2, 0.625],
            [399, 3, 0.9975],
            [400, 0, 0],
            [500, 1, 0.25],
        ];
        for (const [tick, index, phase] of expected) {
            seasonAt(w, tick);
            expect([w.season[0], w.season[1]]).toEqual([index, phase]);
        }
    });

    it('updateSeason uses the world tick', () => {
        const w = smallWorld({ eraSeasonTicks: 100 });
        w.tick = 300;
        updateSeason(w);
        expect([w.season[0], w.season[1]]).toEqual([3, 0.75]);
    });
});

describe('fertile zones', () => {
    it('adds a zone in the lowest free slot', () => {
        const w = smallWorld({ fertileZoneFertility: 0.05 });
        expect(addFertileZone(w, 10, 20, 100)).toBe(0);
        expect(addFertileZone(w, 30, 40, 200)).toBe(1);
        w.zoneAlive[0] = 0;
        expect(addFertileZone(w, 50, 60, 20)).toBe(0);
        expect([w.zoneX[0], w.zoneY[0], w.zoneInitial[0], w.zoneFertility[0]]).toEqual([50, 60, 1, 1]);
        expect(w.zoneOrigin[0]).toBe(ZONE_ORIGIN.DEATH);
        expect(w.zoneInitial[1]).toBe(10);
    });

    it('replaces the most depleted zone when full, lowest index on a tie', () => {
        const w = smallWorld();
        for (let i = 0; i < 3; i++) {
            addFertileZone(w, i, i, 100);
        }
        w.zoneFertility[1] = w.zoneInitial[1] * 0.2;
        expect(addFertileZone(w, 7, 7, 50)).toBe(1);
        expect(w.zoneX[1]).toBe(7);
        w.zoneFertility.fill(1);
        w.zoneInitial.fill(2);
        expect(addFertileZone(w, 8, 8, 50)).toBe(0);
    });

    it('decays zones and frees those at or below zero', () => {
        const w = smallWorld({ fertileZoneDecay: 0.25 });
        addFertileZone(w, 10, 20, 100);
        for (let t = 0; t < 3; t++) {
            decayFertileZones(w);
        }
        expect(w.zoneAlive[0]).toBe(1);
        expect(w.zoneFertility[0]).toBeCloseTo(w.zoneInitial[0] * 0.25, 12);
        decayFertileZones(w);
        expect(w.zoneAlive[0]).toBe(0);
        expect([w.zoneX[0], w.zoneY[0], w.zoneFertility[0], w.zoneInitial[0]]).toEqual([0, 0, 0, 0]);
        expect(w.zoneOrigin[0]).toBe(ZONE_ORIGIN.DEATH);
        decayFertileZones(w);
        expect(w.zoneFertility[0]).toBe(0);
    });
});

describe('decayFertileZones on free slots', () => {
    it('leaves the contents of a free zone slot untouched', () => {
        const w = smallWorld({ fertileZoneDecay: 0.25 });
        w.zoneX[1] = 5;
        w.zoneY[1] = 6;
        w.zoneFertility[1] = 7;
        w.zoneInitial[1] = 8;
        decayFertileZones(w);
        expect([w.zoneAlive[1], w.zoneX[1], w.zoneY[1], w.zoneFertility[1], w.zoneInitial[1]]).toEqual([0, 5, 6, 7, 8]);
    });
});
