// hunter territory (hunter-learning T9d): a hunter with more than territoryMax other mature hunters in range cannot
// mate or split; immature, non-hunter and distant neighbours do not count; non-hunters and the switch off are untouched.

import { describe, expect, it } from 'vitest';
import { isReadyToMate } from '../../js/sim/mate-eligibility.js';
import { readyBeforeGate } from '../../js/sim/reproduction.js';
import { territoryAllows } from '../../js/sim/territory.js';
import { addBlob, lifeWorld } from './helpers/life-world.js';

const FORAGER = 0;
const PREDATOR = 1;
const MATURITY = 100;

/**
 * @param {Record<string, any>} [over] config overrides
 * @returns {any} a world with territory on, radius 600 and one other hunter tolerated
 */
function world(over = {}) {
    return lifeWorld({
        hunterTerritory: true,
        territoryRadius: 600,
        territoryMax: 1,
        maturityTicks: MATURITY,
        ...over,
    });
}

/**
 * @param {any} w the world
 * @param {Record<string, number>} [fields] slot fields over a mature hunter at the origin of the cluster
 * @returns {number} the slot
 */
function blob(w, fields = {}) {
    return addBlob(w, { spec: PREDATOR, ageTicks: MATURITY, energy: 100000, x: 500, y: 500, ...fields });
}

/**
 * @param {any} w the world
 * @param {number} n how many mature hunters to add 100 units from the origin
 * @returns {void}
 */
function crowd(w, n) {
    for (let i = 0; i < n; i++) {
        blob(w, { x: 600 });
    }
}

describe('territoryAllows', () => {
    it('lets a lone hunter and one with exactly territoryMax neighbours breed', () => {
        const w = world();
        const me = blob(w);
        expect(territoryAllows(w, me)).toBe(true);
        crowd(w, 1);
        expect(territoryAllows(w, me)).toBe(true);
    });

    it('stops a crowded hunter from mating or splitting', () => {
        const w = world();
        const me = blob(w);
        crowd(w, 2);
        expect(territoryAllows(w, me)).toBe(false);
        expect(isReadyToMate(w, me)).toBe(false);
        expect(readyBeforeGate(w, me)).toBe(false);
    });

    it('breeds when the same hunter is alone', () => {
        const w = world();
        const me = blob(w);
        expect(isReadyToMate(w, me)).toBe(true);
        expect(readyBeforeGate(w, me)).toBe(true);
    });

    it('does not count immature, non-hunter, dead or distant neighbours', () => {
        const w = world();
        const me = blob(w);
        crowd(w, 1);
        blob(w, { x: 600, ageTicks: MATURITY - 1 });
        blob(w, { x: 600, spec: FORAGER });
        blob(w, { x: 500 + 601 });
        const dead = blob(w, { x: 600 });
        w.alive[dead] = 0;
        expect(territoryAllows(w, me)).toBe(true);
    });

    it('counts a neighbour exactly at the radius', () => {
        const w = world();
        const me = blob(w);
        blob(w, { x: 1100 });
        blob(w, { x: 500, y: 1100 });
        expect(territoryAllows(w, me)).toBe(false);
    });

    it('leaves a non-hunter untouched however crowded', () => {
        const w = world();
        const me = blob(w, { spec: FORAGER });
        crowd(w, 5);
        expect(territoryAllows(w, me)).toBe(true);
        expect(readyBeforeGate(w, me)).toBe(true);
    });

    it('does nothing with the switch off', () => {
        const w = world({ hunterTerritory: false });
        const me = blob(w);
        crowd(w, 5);
        expect(territoryAllows(w, me)).toBe(true);
        expect(isReadyToMate(w, me)).toBe(true);
    });

    it('follows territoryMax and territoryRadius', () => {
        const w = world({ territoryMax: 3 });
        const me = blob(w);
        crowd(w, 3);
        expect(territoryAllows(w, me)).toBe(true);
        crowd(w, 1);
        expect(territoryAllows(w, me)).toBe(false);
        const far = world({ territoryRadius: 50 });
        const lone = blob(far);
        crowd(far, 4);
        expect(territoryAllows(far, lone)).toBe(true);
    });
});
