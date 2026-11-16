// The carcass loss audit (honest-budgets T33b): `leaveCarcass` books the energy of a body that leaves no carcass because every
// food slot is taken, apart from the energy of the carcasses it places. Fixtures: a full pool, simultaneous deaths, a zero-value
// body and the last free slot. The counters sit outside `worldHash`, and no energy enters the ledger.

import { describe, expect, it } from 'vitest';
import { leaveCarcass } from '../../js/sim/carcass.js';
import { reap } from '../../js/sim/population.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { addBlob, lifeWorld, recordingPolicy } from './helpers/life-world.js';

const ON = { carcassFadeTicks: 50, carcassShare: 0.5, maxAgeTicks: 10, maxEnergy: 1000 };
const FED = { foodEnergy: 400, biteEnergy: 200 };

/**
 * @param {any} w the world
 * @param {number} n how many food slots to fill with plant food
 * @returns {void}
 */
function fillFood(w, n) {
    for (let food = 0; food < n; food++) {
        w.foodAlive[food] = 1;
        w.foodCount += 1;
    }
}

describe('carcass loss counters', () => {
    it('start at zero: nothing placed, nothing lost', () => {
        expect(Array.from(lifeWorld(ON).carcassLoss)).toEqual([0, 0, 0]);
    });

    it('book a carcass placed in the free slot as placed energy, not lost', () => {
        const w = lifeWorld({ ...ON, maxFood: 2 });
        leaveCarcass(w, addBlob(w, { energy: 80, ...FED }));
        expect(Array.from(w.carcassLoss)).toEqual([40, 0, 0]);
    });

    it('book the whole value of a body that finds the pool full as lost, and leave the pool as it was', () => {
        const w = lifeWorld({ ...ON, maxFood: 2 });
        fillFood(w, 2);
        leaveCarcass(w, addBlob(w, { energy: 80, ...FED }));
        expect(Array.from(w.carcassLoss)).toEqual([0, 40, 1]);
        expect(w.foodCount).toBe(2);
    });

    it('lose the carcass of the later body when two die in one reap and one slot is free', () => {
        const w = lifeWorld({ ...ON, maxFood: 3 });
        fillFood(w, 2);
        addBlob(w, { energy: 80, ageTicks: 10, x: 300, y: 400, size: 12, ...FED });
        addBlob(w, { energy: 60, ageTicks: 10, x: 500, y: 400, size: 12, ...FED });
        reap(w, recordingPolicy([]));
        // The lower slot takes the last free food slot; the other body is lost.
        expect(Array.from(w.carcassLoss)).toEqual([40, 30, 1]);
        expect(w.foodCount).toBe(3);
    });

    it('count a body that holds nothing as neither placed nor lost, even with a full pool', () => {
        const w = lifeWorld({ ...ON, maxFood: 1 });
        fillFood(w, 1);
        leaveCarcass(w, addBlob(w, { energy: 0, ...FED }));
        expect(Array.from(w.carcassLoss)).toEqual([0, 0, 0]);
    });

    it('count the energy a kill left unclaimed (carcassHeld) in the lost value', () => {
        const w = lifeWorld({ ...ON, maxFood: 1 });
        fillFood(w, 1);
        const slot = addBlob(w, { energy: 0, ...FED });
        w.carcassHeld[slot] = 600;
        leaveCarcass(w, slot);
        expect(Array.from(w.carcassLoss)).toEqual([0, 300, 1]);
    });

    it('leave the world hash unmoved, so no golden changes', () => {
        const a = lifeWorld({ ...ON, maxFood: 1 });
        const b = lifeWorld({ ...ON, maxFood: 1 });
        fillFood(a, 1);
        fillFood(b, 1);
        leaveCarcass(a, addBlob(a, { energy: 80, ...FED }));
        addBlob(b, { energy: 80, ...FED });
        expect(hashWorld(a)).toBe(hashWorld(b));
    });
});
