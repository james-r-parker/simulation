import { describe, expect, it } from 'vitest';
import { addFertileZone, decayFertileZones, moveObstacles, seasonAt, updateSeason } from '../../js/sim/environment.js';
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

/**
 * @param {ReturnType<typeof smallWorld>} w
 * @param {number} i
 * @param {number[]} v x, y, vx, vy, radius
 * @returns {void}
 */
function setObstacle(w, i, [x, y, vx, vy, r]) {
    w.obsX[i] = x;
    w.obsY[i] = y;
    w.obsVx[i] = vx;
    w.obsVy[i] = vy;
    w.obsRadius[i] = r;
}

describe('moveObstacles', () => {
    it('moves an obstacle by its velocity', () => {
        const w = smallWorld();
        setObstacle(w, 0, [500, 500, 3, -2, 30]);
        moveObstacles(w);
        expect([w.obsX[0], w.obsY[0], w.obsVx[0], w.obsVy[0]]).toEqual([503, 498, 3, -2]);
    });

    it('bounces off each wall and stays inside', () => {
        const w = smallWorld();
        setObstacle(w, 0, [32, 32, -5, -5, 30]);
        setObstacle(w, 1, [968, 968, 5, 5, 30]);
        moveObstacles(w);
        expect([w.obsX[0], w.obsY[0], w.obsVx[0], w.obsVy[0]]).toEqual([30, 30, 5, 5]);
        expect([w.obsX[1], w.obsY[1], w.obsVx[1], w.obsVy[1]]).toEqual([970, 970, -5, -5]);
    });

    it('keeps bouncing obstacles inside the world over many ticks', () => {
        const w = smallWorld();
        setObstacle(w, 0, [100, 100, 7, 11, 40]);
        setObstacle(w, 1, [900, 50, -13, 3, 25]);
        for (let t = 0; t < 2000; t++) {
            moveObstacles(w);
            for (let i = 0; i < 2; i++) {
                expect(w.obsX[i] - w.obsRadius[i]).toBeGreaterThanOrEqual(0);
                expect(w.obsX[i] + w.obsRadius[i]).toBeLessThanOrEqual(1000);
                expect(w.obsY[i] - w.obsRadius[i]).toBeGreaterThanOrEqual(0);
                expect(w.obsY[i] + w.obsRadius[i]).toBeLessThanOrEqual(1000);
            }
        }
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
        decayFertileZones(w);
        expect(w.zoneFertility[0]).toBe(0);
    });
});

describe('moveObstacles at the wall', () => {
    it('does not bounce an obstacle that only touches a wall', () => {
        const w = smallWorld();
        setObstacle(w, 0, [40, 40, -10, -10, 30]);
        setObstacle(w, 1, [960, 960, 10, 10, 30]);
        moveObstacles(w);
        expect([w.obsX[0], w.obsY[0], w.obsVx[0], w.obsVy[0]]).toEqual([30, 30, -10, -10]);
        expect([w.obsX[1], w.obsY[1], w.obsVx[1], w.obsVy[1]]).toEqual([970, 970, 10, 10]);
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
