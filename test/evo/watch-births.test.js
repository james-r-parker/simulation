// eval.predator_births (fitness-and-selection T15f): hand-built AgentBorn records fed through the real `observe`.

import { describe, expect, it } from 'vitest';
import { BORN_CAUSE } from '../../js/sim/events.js';
import { computeMetrics } from '../../js/evo/metrics.js';
import { observe } from '../../js/evo/observer.js';
import { nextTick, observed, pushBorn } from './helpers/observer-world.js';

const FORAGER = 0;
const PREDATOR = 1;
const SCOUT = 3;

/**
 * Feeds one tick holding the given births, each a record of the specialisation, cause and birth tick.
 * @param {{world: any, observer: any}} r the run
 * @param {number} tick the tick to observe
 * @param {[number, number, number][]} births spec, cause and the tick on the record
 * @returns {void}
 */
function tickWith({ world, observer }, tick, births) {
    nextTick(world, tick);
    births.forEach(([spec, cause, at], i) =>
        pushBorn(world, { slot: i, genomeId: world.nextId++, spec, cause, tick: at }),
    );
    observe(observer, world);
}

const births = (/** @type {any} */ r) => computeMetrics(r.observer, r.world)['eval.predator_births'];

describe('eval.predator_births', () => {
    it('is 0 before any birth', () => {
        expect(births(observed())).toEqual({ value: 0 });
    });

    it('counts predator mate and split births from tick 10000, and nothing else', () => {
        const r = observed();
        tickWith(r, 9999, [[PREDATOR, BORN_CAUSE.MATE, 9999]]); // burn-in: not counted
        tickWith(r, 10001, [
            [PREDATOR, BORN_CAUSE.MATE, 10000], // counted
            [PREDATOR, BORN_CAUSE.SPLIT, 10001], // counted
            [PREDATOR, BORN_CAUSE.IMMIGRANT, 10001], // an immigrant, not a birth by the predators
            [PREDATOR, BORN_CAUSE.FLOOR, 10001],
            [FORAGER, BORN_CAUSE.SPLIT, 10001], // not a hunter
        ]);
        expect(births(r)).toEqual({ value: 2 });
    });

    it('counts every specialisation that can hunt', () => {
        const r = observed({ specialisations: { scout: { canHunt: true } } });
        tickWith(r, 10001, [
            [SCOUT, BORN_CAUSE.SPLIT, 10001],
            [PREDATOR, BORN_CAUSE.MATE, 10001],
        ]);
        expect(births(r)).toEqual({ value: 2 });
    });
});
