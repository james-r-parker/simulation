import { describe, expect, it } from 'vitest';
import { SCAN, SCAN_SIZE, summariseRays } from '../../js/evo/ray-summary.js';
import { arcRays } from '../../js/evo/observer-intent-state.js';
import { CH, intentArena, setRay } from './helpers/intent-world.js';
import { addBorn } from './helpers/observer-world.js';

/**
 * @param {(world: any, slot: number) => void} setup writes rays
 * @returns {Float64Array} the scan row
 */
function scan(setup) {
    const { world } = intentArena();
    const slot = addBorn(world);
    setup(world, slot);
    const row = new Float64Array(SCAN_SIZE);
    summariseRays(world, slot, row, arcRays(world.config));
    return row;
}

describe('summariseRays', () => {
    it('reports -1 for every hit and 0 bigger hits on an empty ray block', () => {
        const row = scan(() => {});
        expect([row[SCAN.FOOD], row[SCAN.PREY], row[SCAN.THREAT]]).toEqual([-1, -1, -1]);
        expect([row[SCAN.BIGGER], row[SCAN.SMOKE], row[SCAN.THREAT_ARC]]).toEqual([0, 0, 0]);
    });

    it('keeps the nearest hit of each kind, the first ray on a tie', () => {
        const row = scan((world, slot) => {
            setRay(world, slot, 3, 0.4, CH.FOOD);
            setRay(world, slot, 5, 0.7, CH.FOOD);
            setRay(world, slot, 6, 0.7, CH.FOOD);
            setRay(world, slot, 0, 0.2, CH.SMALLER);
            setRay(world, slot, 2, 0.9, CH.SMALLER);
        });
        expect([row[SCAN.FOOD], row[SCAN.FOOD_RAY]]).toEqual([expect.closeTo(0.7), 5]);
        expect([row[SCAN.PREY], row[SCAN.PREY_RAY]]).toEqual([expect.closeTo(0.9), 2]);
    });

    it('counts prey only on arc rays and counts bigger hits on any ray', () => {
        expect(scan((world, slot) => setRay(world, slot, 4, 0.5, CH.SMALLER))[SCAN.PREY]).toBe(-1);
        expect(scan((world, slot) => setRay(world, slot, 14, 0.5, CH.SMALLER))[SCAN.PREY]).toBeCloseTo(0.5);
        const row = scan((world, slot) => {
            setRay(world, slot, 8, 0.5, CH.BIGGER);
            setRay(world, slot, 9, 0.5, CH.BIGGER);
        });
        expect(row[SCAN.BIGGER]).toBe(2);
    });

    it('flags smoke only at proximity 1', () => {
        expect(scan((world, slot) => setRay(world, slot, 2, 0.9, CH.SMOKE))[SCAN.SMOKE]).toBe(0);
        expect(scan((world, slot) => setRay(world, slot, 2, 1, CH.SMOKE))[SCAN.SMOKE]).toBe(1);
    });
});
