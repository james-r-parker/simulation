// Whether a killer was still a dependent (hunter-learning.md, Detectors).

import { describe, expect, it } from 'vitest';
import { updateSize } from '../../js/sim/energy.js';
import { isDependentKiller } from '../../js/sim/dependent-killer.js';
import { freeAgent } from '../../js/sim/world.js';
import { addBlob, lifeWorld } from './helpers/life-world.js';

const PREDATOR = 1;

/** @returns {any} a world with room for a few hunters */
function huntWorld() {
    return lifeWorld({});
}

/**
 * @param {any} w the world
 * @param {{x?: number, y?: number}} [at] where it stands
 * @returns {number} the slot of a hunter
 */
function add(w, { x = 100, y = 100 } = {}) {
    const slot = addBlob(w, { spec: PREDATOR, energy: 500, x, y, angle: 0 });
    updateSize(w, slot);
    return slot;
}

/**
 * @param {any} w the world
 * @param {number} parent the parent's slot
 * @param {number} x where it stands
 * @returns {number} the slot of a young hunter of that parent
 */
function addYoung(w, parent, x) {
    const slot = add(w, { x });
    w.parentA[slot] = w.genomeId[parent];
    w.parentB[slot] = w.genomeId[parent];
    return slot;
}

describe('isDependentKiller', () => {
    it('is true while either parent is alive within PARENT_RANGE, false when it is far or dead', () => {
        const w = huntWorld();
        const mother = add(w, { x: 100 });
        const father = add(w, { x: 600, y: 600 });
        const child = addYoung(w, mother, 200);
        w.parentB[child] = w.genomeId[father];
        expect(isDependentKiller(w, child)).toBe(true);
        w.x[mother] = 400;
        expect(isDependentKiller(w, child)).toBe(false);
        w.x[father] = 250;
        w.y[father] = 100;
        expect(isDependentKiller(w, child)).toBe(true);
        freeAgent(w, father);
        freeAgent(w, mother);
        expect(isDependentKiller(w, child)).toBe(false);
    });

    it('is false for a founder with no parents', () => {
        const w = huntWorld();
        const founder = add(w);
        expect(isDependentKiller(w, founder)).toBe(false);
    });
});
