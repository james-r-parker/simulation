// The provisioning state and plain tests (hunter-learning.md T4, T4a): whether a killer was still a dependent, and the invariant on
// the provisioning totals.

import { describe, expect, it } from 'vitest';
import { updateSize } from '../../js/sim/energy.js';
import { INDEPENDENT_TICKS, assertProvision, isDependentKiller } from '../../js/sim/provision-state.js';
import { freeAgent } from '../../js/sim/world.js';
import { addBlob, lifeWorld } from './helpers/life-world.js';

const PREDATOR = 1;

/**
 * @param {Record<string, any>} [over] config overrides
 * @returns {any} a world with provisioning on
 */
function provisionWorld(over = {}) {
    return lifeWorld({ provisionEnabled: true, provisionRange: 120, ...over });
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
    it('is true within INDEPENDENT_TICKS of a provisioning, false after', () => {
        const w = provisionWorld();
        const hunter = add(w);
        w.tick = 5000;
        w.provisionedTick[hunter] = 5000 - INDEPENDENT_TICKS + 1;
        expect(isDependentKiller(w, hunter)).toBe(true);
        w.provisionedTick[hunter] = 5000 - INDEPENDENT_TICKS;
        expect(isDependentKiller(w, hunter)).toBe(false);
        w.provisionedTick[hunter] = 0;
        expect(isDependentKiller(w, hunter)).toBe(false);
    });

    it('is true while either parent is alive within provisionRange, false when it is far or dead', () => {
        const w = provisionWorld({ provisionRange: 120 });
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

    it('is false for a founder with no parents and no provisioning', () => {
        const w = provisionWorld();
        const founder = add(w);
        expect(isDependentKiller(w, founder)).toBe(false);
    });
});

describe('assertProvision', () => {
    /** @type {(slot: number, value: number, detail: string) => Error} */
    const fail = (slot, value, detail) => new Error(`${slot} ${value} ${detail}`);

    it('passes equal totals and throws on unequal ones', () => {
        const w = provisionWorld();
        expect(() => assertProvision(w, fail)).not.toThrow();
        w.provisionTotals[0] = 5;
        expect(() => assertProvision(w, fail)).toThrow(/differ/);
        w.provisionTotals[1] = 5;
        expect(() => assertProvision(w, fail)).not.toThrow();
    });

    it('throws on a stamp from the future', () => {
        const w = provisionWorld();
        w.provisionedTick[3] = w.tick + 2;
        expect(() => assertProvision(w, fail)).toThrow(/future/);
    });
});
