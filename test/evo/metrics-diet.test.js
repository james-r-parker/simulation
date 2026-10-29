// The parent diet metrics (fitness-and-selection.md T48e): hand-built parents with meal counts, births fed through the
// real `observe`, read with `computeMetrics`. Pools count from tick 10000.

import { describe, expect, it } from 'vitest';
import { DIET_DIRECTIONS } from '../../js/evo/metrics-diet.js';
import { MERIT_DIRECTIONS } from '../../js/evo/metrics-merit.js';
import { computeMetrics } from '../../js/evo/metrics.js';
import { observe } from '../../js/evo/observer.js';
import { BORN_CAUSE } from '../../js/sim/events.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { nextTick, observed, pushBorn } from './helpers/observer-world.js';

const ON = { maxAgents: 40 };
const NAMES = ['split_parent_delib_share', 'mate_parent_delib_share', 'split_bumper_share'];

const read = (/** @type {any} */ r, /** @type {string} */ name) => computeMetrics(r.observer, r.world)[`eval.${name}`];

/**
 * Adds a parent that has eaten `total` meals, `deliberate` of them deliberately.
 * @param {any} world the world
 * @param {number} deliberate deliberate meals
 * @param {number} total all meals
 * @returns {number} the slot
 */
function parent(world, deliberate, total) {
    const slot = addBlob(world);
    world.mealsDeliberate[slot] = deliberate;
    world.mealsTotal[slot] = total;
    return slot;
}

/**
 * Adds a child of `mother` (and `father`, when given) and feeds its birth to the observer.
 * @param {{world: any, observer: any}} r the run
 * @param {{mother: number, father?: number, fatherId?: number, tick: number, cause: number}} f the parents (`fatherId` is the id the event names), the tick and the cause
 * @returns {void}
 */
function birth(r, { mother, father = -1, fatherId = father < 0 ? 0 : r.world.genomeId[father], tick, cause }) {
    const child = addBlob(r.world);
    r.world.parentSlotA[child] = mother;
    r.world.parentSlotB[child] = father;
    nextTick(r.world, tick);
    pushBorn(r.world, {
        slot: child,
        genomeId: r.world.genomeId[child],
        parentA: r.world.genomeId[mother],
        parentB: father < 0 ? r.world.genomeId[mother] : fatherId,
        cause,
    });
    observe(r.observer, r.world);
}

describe('the parent diet metrics', () => {
    it('are watch metrics in the compare table', () => {
        expect(Object.keys(DIET_DIRECTIONS).sort()).toEqual(NAMES.map((n) => `eval.${n}`).sort());
        expect(Object.values(DIET_DIRECTIONS)).toEqual(['watch', 'watch', 'watch']);
        expect(MERIT_DIRECTIONS).toMatchObject(DIET_DIRECTIONS);
    });

    it('are null with no birth after burn-in', () => {
        const r = observed(ON);
        const mother = parent(r.world, 5, 10);
        birth(r, { mother, tick: 9999, cause: BORN_CAUSE.SPLIT });
        birth(r, { mother, tick: 9999, cause: BORN_CAUSE.MATE });
        expect(read(r, 'split_parent_delib_share').reason).toBe('no split birth after burn-in');
        expect(read(r, 'mate_parent_delib_share').reason).toBe('no mate birth after burn-in');
        expect(read(r, 'split_bumper_share').reason).toBe('no split birth after burn-in');
    });
});

describe('split births', () => {
    it('average the splitting parent share, and count the bumpers under 0.1', () => {
        const r = observed(ON);
        const skilled = parent(r.world, 8, 10);
        const bumper = parent(r.world, 0, 10);
        const edge = parent(r.world, 1, 10); // exactly 0.1 is not a bumper
        const fresh = parent(r.world, 0, 0); // no meals reads 0
        for (const [i, mother] of [skilled, bumper, edge, fresh].entries()) {
            birth(r, { mother, tick: 10001 + i, cause: BORN_CAUSE.SPLIT });
        }
        expect(read(r, 'split_parent_delib_share').value).toBeCloseTo((0.8 + 0 + 0.1 + 0) / 4, 10);
        expect(read(r, 'split_bumper_share').value).toBe(0.5);
    });
});

describe('mate births', () => {
    it('average the two parents, and use the mother alone when the father is gone', () => {
        const r = observed(ON);
        const mother = parent(r.world, 8, 10);
        const father = parent(r.world, 2, 10);
        birth(r, { mother, father, tick: 10001, cause: BORN_CAUSE.MATE });
        expect(read(r, 'mate_parent_delib_share').value).toBeCloseTo(0.5, 10);
        r.world.genomeId[father] = 99; // the slot now holds another genome
        birth(r, { mother, father, fatherId: 77, tick: 10002, cause: BORN_CAUSE.MATE });
        expect(read(r, 'mate_parent_delib_share').value).toBeCloseTo((0.5 + 0.8) / 2, 10);
    });

    it('do not touch the split metrics', () => {
        const r = observed(ON);
        const mother = parent(r.world, 8, 10);
        birth(r, { mother, father: parent(r.world, 2, 10), tick: 10001, cause: BORN_CAUSE.MATE });
        expect(read(r, 'split_parent_delib_share').value).toBeNull();
    });
});
