// The first meal (docs/designs/role-budget.md, "The first meal"): from where and with what a body is born, can it reach a food
// source that suits it (`reach`), find one with no knowledge of where it is (`find`), and climb back to its birth energy on it
// (`eat`). One line per birth rule (a founder, a floor entrant, a child); the row's cells are the worst of the three. Pure.

import { detExp } from '../sim/det-math.js';
import { SLACK_CAP, cell, rowOf } from './role-budget-cell.js';
import { bestRangeSpeed, forageCycle, lifeOf, splitGate } from './role-budget-forage.js';
import { densityOf } from './role-budget-thrive.js';
import { viewReach } from './role-budget-senses.js';

/** The steps of the row, in order. */
export const FIRST_MEAL_STEPS = Object.freeze(['reach', 'find', 'eat']);

/** The largest exponent `decay` takes (`detExp` is defined to -708). */
const MAX_DECAY = 700;

/**
 * @param {number} x a non-negative exponent
 * @returns {number} `exp(-x)`, 0 for an exponent past `MAX_DECAY`
 */
const decay = (x) => (x > MAX_DECAY ? 0 : detExp(-x));

/** The steps of the integral of the nearest-source distribution. */
const INTEGRAL_STEPS = 4000;

/**
 * For a random point and `n` sources of radius `rho` in a world of area `A` the nearest centre is beyond `r` with probability
 * `exp(-a r^2)`, `a = n pi / A`.
 * @param {{n: number, rho: number, area: number}} source the number, radius and world area
 * @returns {{mean: number, p90: number, a: number}} the mean distance to the nearest source's edge, `E[max(0, R - rho)]` (the
 *   integral of `exp(-a r^2)` from `rho` on), its 90th percentile, and `a`
 */
export function nearestEdge({ n, rho, area }) {
    const a = (n * Math.PI) / area;
    const end = rho + 6 / Math.sqrt(a);
    const dr = (end - rho) / INTEGRAL_STEPS;
    let sum = 0;
    for (let i = 0; i < INTEGRAL_STEPS; i++) {
        const r = rho + (i + 0.5) * dr;
        sum += decay(a * r * r) * dr;
    }
    return { mean: sum, p90: Math.max(0, Math.sqrt(Math.LN10 / a) - rho), a };
}

/**
 * @param {import('./role-budget-cell.js').Cell[]} cells the cells of one step, one per birth rule
 * @returns {import('./role-budget-cell.js').Cell} the worst: an impossible one, else the least slack
 */
function worst(cells) {
    const bad = cells.find((c) => c.status === 'impossible');
    return {
        ...(bad ??
            cells.reduce((a, b) => (/** @type {number} */ (b.margin) < /** @type {number} */ (a.margin) ? b : a))),
    };
}

/**
 * @typedef {object} Source the food source a body walks to
 * @property {number} n how many there are in the world
 * @property {number} rho a source's radius
 * @property {number} strip half the width a walking body sees (sideways reach)
 * @property {number} area the world's area
 * @property {{perMeal: number, ticks: number}} meal the net energy of one meal and the ticks one takes
 * @property {number} holds what one source holds, in meals
 */

/**
 * @typedef {object} RuleLine one birth rule's reading
 * @property {number} energy the energy born with
 * @property {number} speed the gait of the walk (`bestRangeSpeed`)
 * @property {number} range the distance walked before the energy is gone, from the heat recurrence
 * @property {{mean: number, p90: number, share: number, cell: import('./role-budget-cell.js').Cell}} reach the distance to the
 *   nearest source's edge, and the share of birth points it is inside the range for
 * @property {{path: number, share: number, cell: import('./role-budget-cell.js').Cell}} find the path a straight walk takes to
 *   meet a source, and the share of walks that meet one inside the range
 * @property {{meals: number, holds: number, cell: import('./role-budget-cell.js').Cell}} eat the meals to climb back, and what the
 *   source holds
 */

/**
 * @param {import('./role-budget-forage.js').Context} ctx the context
 * @param {{rule: 'founder' | 'entrant' | 'child', source: Source, model: import('./role-budget-model.js').RoleModel}} at the
 *   birth rule, the source and the model
 * @returns {RuleLine} the reading of one rule
 */
function ruleLine(ctx, { rule, source, model }) {
    const { p } = ctx;
    const energy =
        rule === 'child'
            ? splitGate(p) * p.repro.childShare
            : rule === 'founder'
              ? p.repro.founderEnergy
              : p.repro.entrantEnergy;
    const speed = bestRangeSpeed(ctx, energy);
    const life = lifeOf(ctx, { energy, speed });
    const range = life.distance;
    const edge = nearestEdge(source);
    const born = rule === 'child';
    const meanReach = born ? 0 : edge.mean;
    const sweep = (2 * (source.strip + source.rho) * source.n) / source.area;
    const path = born ? 0 : 1 / sweep;
    const slack = (/** @type {number} */ distance) =>
        range >= distance ? Math.min(SLACK_CAP, (range - distance) / speed) : null;
    const arrival = energy * Math.max(0, 1 - meanReach / range);
    const meals = source.meal.perMeal > 0 ? (energy - arrival) / source.meal.perMeal : Infinity;
    const eatSlack = meals <= source.holds ? Math.min(SLACK_CAP, (source.holds - meals) * source.meal.ticks) : null;
    return {
        energy,
        speed,
        range,
        reach: {
            mean: meanReach,
            p90: born ? 0 : edge.p90,
            share: born ? 1 : 1 - decay(edge.a * (range + source.rho) * (range + source.rho)),
            cell: cell(slack(meanReach), model),
        },
        find: { path, share: born ? 1 : 1 - decay(range * sweep), cell: cell(slack(path), model) },
        eat: { meals, holds: source.holds, cell: cell(eatSlack, model) },
    };
}

/**
 * @param {import('./role-budget-forage.js').Context} ctx the context of the spec
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @param {{preySize: number, net: number, ticks: number} | null} hunting for a hunter: the mean size of its prey, the net energy
 *   of a chase (`predator:living`) and its ticks; null for a body that eats food
 * @returns {Source} the source: a food patch, or prey at the density of `maxAgents x (1 - hunterShare)`
 */
function sourceOf(ctx, model, hunting) {
    const { p, world } = ctx;
    const strip = viewReach(p, Math.PI / 2);
    if (hunting === null) {
        const density = densityOf(ctx, model);
        const cycle = forageCycle(ctx, { density });
        const holds = density * Math.PI * world.patchRadius * world.patchRadius;
        return {
            n: world.patches,
            rho: world.patchRadius,
            strip,
            area: world.area,
            meal: { perMeal: cycle.netPerMeal, ticks: cycle.cycleTicks },
            holds,
        };
    }
    const n = world.maxAgents * (1 - model.hunterShare);
    return {
        n,
        rho: hunting.preySize,
        strip,
        area: world.area,
        meal: { perMeal: hunting.net, ticks: hunting.ticks },
        holds: n,
    };
}

/**
 * @typedef {object} FirstMealBudget
 * @property {ReturnType<typeof rowOf>} row the matrix row `<spec>:first-meal`
 * @property {Record<string, import('./role-budget-cell.js').Cell>} cells reach, find and eat: the worst of the birth rules
 * @property {Record<'founder' | 'entrant' | 'child', RuleLine>} rules the reading of each birth rule
 * @property {Source} source the source
 * @property {string | null} binding the step of least slack
 */

/**
 * The first-meal budget of one spec.
 * @param {import('./role-budget-forage.js').Context} ctx the context of the spec (a hunter's at its juvenile burn)
 * @param {{model: import('./role-budget-model.js').RoleModel, hunting?: {preySize: number, net: number, ticks: number}}} options
 *   the model and, for a hunter, what it hunts
 * @returns {FirstMealBudget} the budget
 */
export function budgetFirstMeal(ctx, { model, hunting = undefined }) {
    const source = sourceOf(ctx, model, hunting ?? null);
    const rules = /** @type {FirstMealBudget['rules']} */ (
        Object.fromEntries(
            ['founder', 'entrant', 'child'].map((rule) => [
                rule,
                ruleLine(ctx, { rule: /** @type {any} */ (rule), source, model }),
            ]),
        )
    );
    const lines = Object.values(rules);
    const cells = {
        reach: worst(lines.map((l) => l.reach.cell)),
        find: worst(lines.map((l) => l.find.cell)),
        eat: worst(lines.map((l) => l.eat.cell)),
    };
    const row = rowOf(`${ctx.p.spec}:first-meal`, cells);
    return { row, cells, rules, source, binding: row.binding };
}
