// The cross-check of the Phase 5 budget against the sim (docs/designs/role-budget.md, "Cross-check against the sim"): the herd's arrival and
// the first trample against a body that stands in the path, and the ticks to clear the half-width against a body that runs for the
// flank. The scene and the formula start from the same state, so a difference is the formula's.

import { rateReading } from './role-budget-thrive-check.js';
import { ticksReading, signReading } from './role-budget-defence-check.js';
import { budgetHerd } from './role-budget-herd.js';
import { roleParams } from './role-budget-params.js';
import { playStampede } from './role-scenes-herd.js';

/** The tolerances of the plan's "Tolerances" table: 10% on the warning and the clear ticks. */
export const HERD_TOLERANCE = Object.freeze({ warning: 0.1, clear: 0.1, loss: 0.1 });

/**
 * The specs the scene reads: a body that can hunt startles the herd and turns it (`senseHunters`), so a hunter in the path is not
 * trampled by the stampede it would meet, and its row is read by the formula alone.
 */
export const HERD_SCENE_SPECS = Object.freeze(['forager', 'reproducer', 'scout', 'defender']);

/**
 * @param {Readonly<Record<string, any>>} world the world's config
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @param {string} spec the spec
 * @returns {import('./role-budget-defence-check.js').DefenceReading[]} the readings of one spec: the herd's arrival, the first
 *   trample, the ticks to clear and whether a body the formula calls clear is trampled
 */
export function herdReadings(world, model, spec) {
    const row = `${spec}:herd`;
    const p = roleParams(world, spec);
    const budget = budgetHerd(world, p, model);
    const c = budget.worst;
    const stand = playStampede(world, { spec, facing: 'away', run: false });
    const sprint = c.clear.sprint < c.clear.cruise;
    const ran = playStampede(world, { spec, facing: 'away', run: true, sprint, reaction: model.reactionTicks });
    const formulaClear = model.reactionTicks + c.turn + Math.min(c.clear.cruise, c.clear.sprint);
    const slow = ran.ticks.clear === null || ran.ticks.clear > formulaClear * (1 + HERD_TOLERANCE.clear);
    return [
        ticksReading(row, 'the front arrives', [Math.round(c.warning), stand.ticks.arrival]),
        rateReading(row, 'the first trample, energy', [budget.trample.arrival, stand.outcome.firstLoss], {
            relative: HERD_TOLERANCE.loss,
        }),
        {
            row,
            what: 'ticks to clear: the formula is an upper bound',
            formula: formulaClear,
            scene: ran.ticks.clear,
            tolerance: 'an upper bound, 10%',
            drift: slow,
        },
        signReading(row, 'a body the formula calls clear is not trampled', [
            true,
            !['ok', 'tight'].includes(budget.cells.run.status) || ran.outcome.tramples === 0,
        ]),
    ];
}

/**
 * The Phase 5 cross-check: every reading of every spec the scene reads, and how many are outside their tolerance.
 * @param {Readonly<Record<string, any>>} world the world's config
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @param {{specs?: readonly string[]}} [options] the specs to read (`HERD_SCENE_SPECS`)
 * @returns {{readings: import('./role-budget-defence-check.js').DefenceReading[], drift: number}} the readings and the drift count
 */
export function herdCheck(world, model, { specs = HERD_SCENE_SPECS } = {}) {
    const readings = specs.flatMap((spec) => herdReadings(world, model, spec));
    return { readings, drift: readings.filter((r) => r.drift).length };
}
