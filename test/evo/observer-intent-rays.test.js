import { describe, expect, it } from 'vitest';
import { SCAN, SCAN_SIZE, scanRays } from '../../js/evo/observer-intent-rays.js';
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
    scanRays(row, world, slot, arcRays(world.config));
    return row;
}

describe('scanRays', () => {
    it('reports -1 for everything on an empty ray block', () => {
        const row = scan(() => {});
        expect([row[SCAN.FOOD], row[SCAN.PREY], row[SCAN.THREAT], row[SCAN.SMOKE]]).toEqual([-1, -1, -1, 0]);
    });

    it('keeps the nearest hit of each kind, the first ray on a tie', () => {
        const row = scan((world, slot) => {
            setRay(world, slot, 3, 0.4, CH.FOOD);
            setRay(world, slot, 5, 0.7, CH.FOOD);
            setRay(world, slot, 6, 0.7, CH.FOOD);
            setRay(world, slot, 8, 0.2, CH.BIGGER);
            setRay(world, slot, 10, 0.9, CH.BIGGER);
        });
        expect([row[SCAN.FOOD], row[SCAN.FOOD_RAY]]).toEqual([expect.closeTo(0.7), 5]);
        expect([row[SCAN.THREAT], row[SCAN.THREAT_RAY]]).toEqual([expect.closeTo(0.9), 10]);
    });

    it('counts prey only on arc rays and flags a threat on an arc ray', () => {
        expect(scan((world, slot) => setRay(world, slot, 4, 0.5, CH.SMALLER))[SCAN.PREY]).toBe(-1);
        expect(scan((world, slot) => setRay(world, slot, 14, 0.5, CH.SMALLER))[SCAN.PREY]).toBeCloseTo(0.5);
        expect(scan((world, slot) => setRay(world, slot, 8, 0.5, CH.BIGGER))[SCAN.THREAT_ARC]).toBe(0);
        expect(scan((world, slot) => setRay(world, slot, 15, 0.5, CH.BIGGER))[SCAN.THREAT_ARC]).toBe(1);
    });

    it('flags smoke only at proximity 1', () => {
        expect(scan((world, slot) => setRay(world, slot, 2, 0.9, CH.SMOKE))[SCAN.SMOKE]).toBe(0);
        expect(scan((world, slot) => setRay(world, slot, 2, 1, CH.SMOKE))[SCAN.SMOKE]).toBe(1);
    });
});
