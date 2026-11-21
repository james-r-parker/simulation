// A hunter's living (docs/designs/role-budget.md, "A hunter's living"): do its kills pay for its chases, and do the chases a
// life holds reach the split gate. Pure; it reads the Phase 1 budgets of the hunter against each prey.

import { bite, createBody } from './role-budget-body.js';
import { SLACK_CAP, cell, rowOf } from './role-budget-cell.js';
import { frameOptions, gapAtAwareness } from './role-budget-frame.js';
import { gaitCost, splitGate } from './role-budget-forage.js';
import { encountersPerLife, poorestBirth } from './role-budget-thrive.js';
import { MAX_TICKS, chaseTimeline } from './role-budget-timeline.js';

/** The steps of the row, in order. */
export const LIVING_STEPS = Object.freeze(['eat', 'breed']);

/**
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter
 * @param {import('./role-budget-params.js').RoleParams} prey the prey, at its start energy
 * @returns {number} what a kill of the prey returns: the bites down to its kill line and the gorge (`min(killGorgeShare x the energy
 *   above the line, killGorgeCap, the store room)`), 700 for a forager at 1000 energy (the anchors)
 */
export function killIncome(hunter, prey) {
    const h = createBody(hunter, { x: 0, y: 0, angle: 0 });
    const p = createBody(prey, { x: 1, y: 0, angle: 0 });
    const tally = { bites: 0, income: 0, kick: 0 };
    let killed = false;
    while (!killed && tally.bites < SLACK_CAP) {
        killed = bite(h, p, tally);
    }
    return tally.income;
}

/**
 * What one chase of the `reactive` tier costs the hunter on one prey, as a chase that kills and as one that does not. A killing
 * chase is the broken bound's when it kills, else the straight bound's (the prey that does not break), else no chase kills and it
 * is the failed one. A failed chase is the broken bound's, cut where the sim gives up (`lapseTicks` of `role-budget-lapse.js`:
 * the observer's lapse, `INTENT_WINDOW` ticks with the prey off the rays or the hunter not closing; the reactive tier never
 * quits by itself) and at `MAX_TICKS` when the rule does not fire, which is the case at the defaults.
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter
 * @param {import('./role-budget-params.js').RoleParams} prey the prey
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @returns {{killCost: number, failCost: number, killTicks: number, failTicks: number}} the energy spent (and the kicks taken) and the
 *   ticks of each
 */
export function chaseCosts(hunter, prey, model) {
    const aware = gapAtAwareness(hunter, prey);
    const play = (/** @type {'broken' | 'straight'} */ bound, /** @type {number} */ maxTicks = MAX_TICKS) => {
        const options = frameOptions(hunter, prey, aware, { tier: 'reactive', bound, model });
        return chaseTimeline(hunter, prey, { ...options, maxTicks });
    };
    const broken = play('broken');
    const lapsed =
        broken.killTick === null && broken.lapse > 0 && broken.lapse < broken.ticks
            ? play('broken', broken.lapse)
            : broken;
    const kill = broken.killTick === null ? play('straight') : broken;
    const killing = kill.killTick === null ? lapsed : kill;
    const spent = (/** @type {import('./role-budget-timeline.js').Timeline} */ run) => run.hunterSpent + run.kick;
    return {
        killCost: spent(killing),
        failCost: spent(lapsed),
        killTicks: killing.ticks,
        failTicks: lapsed.ticks,
    };
}

/**
 * @param {import('./role-budget-forage.js').Context} hunter the hunter's context
 * @param {{budgets: Record<string, import('./role-budget-chase.js').ChaseBudget>, preys: Record<string, import('./role-budget-params.js').RoleParams>,
 *   mix: Record<string, number>, model: import('./role-budget-model.js').RoleModel}} against the budgets, the preys' numbers, the
 *   weight of each prey (summing to 1) and the model options
 * @returns {{income: number, cost: number, killCost: number, failCost: number, chaseTicks: number}} the mean of the prey in the mix: the
 *   income of a kill (`killIncome`), the cost of a chase that kills and of one that does not (`chaseCosts`), the cost of a chase at
 *   `catchShare` (`catchShare x killCost + (1 - catchShare) x failCost`) and its ticks at that share
 */
function perChase(hunter, { budgets, preys, mix, model }) {
    const sum = { income: 0, cost: 0, killCost: 0, failCost: 0, chaseTicks: 0 };
    const share = model.catchShare;
    for (const spec of Object.keys(budgets)) {
        const weight = mix[spec];
        const prey = preys[spec];
        const run = chaseCosts(hunter.p, prey, model);
        sum.income += weight * killIncome(hunter.p, prey);
        sum.killCost += weight * run.killCost;
        sum.failCost += weight * run.failCost;
        sum.cost += weight * (share * run.killCost + (1 - share) * run.failCost);
        sum.chaseTicks += weight * (share * run.killTicks + (1 - share) * run.failTicks);
    }
    return sum;
}

/**
 * @typedef {object} LivingBudget
 * @property {ReturnType<typeof rowOf>} row the matrix row `predator:living`
 * @property {Record<string, import('./role-budget-cell.js').Cell>} cells eat and breed
 * @property {{income: number, cost: number, killCost: number, failCost: number, chaseTicks: number, net: number, netAtFull: number}} chase
 *   the income of a kill, the cost of a chase at `catchShare`, of a chase that kills and of one that does not, its ticks, the net at
 *   `catchShare` and at 1
 * @property {{gate: number, birth: number, chases: number, perLife: number, spare: number, ticksPerChase: number}} split the gate,
 *   the energy born with, the chases to the gate, the chases a life holds, the spare ones and the mean ticks of one
 * @property {{rest: number, storeTicks: number}} resting the cost of a tick at rest and the ticks a full store lasts at it
 * @property {string | null} binding the step of least slack
 */

/**
 * The budget of a hunter's living. `eat` is the net energy per chase `catchShare x killIncome - (catchShare x killCost + (1 - catchShare) x failCost)`
 * (impossible at 0 or less even at `catchShare` 1, where it is `killIncome - killCost`); `breed` the chases to the split gate from the energy at birth at that net, against the
 * chases a life holds (`encountersPerLife` with the prey's density, `maxAgents x (1 - hunterShare) / area`), the slack the spare
 * chases in ticks at the mean ticks of a chase.
 * @param {import('./role-budget-forage.js').Context} hunter the hunter's context
 * @param {{budgets: Record<string, import('./role-budget-chase.js').ChaseBudget>, preys: Record<string, import('./role-budget-params.js').RoleParams>,
 *   mix: Record<string, number>, model: import('./role-budget-model.js').RoleModel}} against the hunter's budgets against each
 *   prey, the preys' numbers, their weights and the model
 * @returns {LivingBudget} the budget
 */
export function budgetLiving(hunter, against) {
    const { model } = against;
    const { p } = hunter;
    const chase = perChase(hunter, against);
    const net = model.catchShare * chase.income - chase.cost;
    const netAtFull = chase.income - chase.killCost;
    const birth = poorestBirth(p);
    const gate = splitGate(p);
    const preyDensity = (hunter.world.maxAgents * (1 - model.hunterShare)) / hunter.world.area;
    const perLife = encountersPerLife(hunter, model, preyDensity).perLife;
    const ticksPerChase = p.repro.maxAgeTicks / Math.max(perLife, 1e-9);
    const chases = net > 0 ? Math.max(0, gate - birth) / net : Infinity;
    const spare = perLife - chases;
    const cells = {
        eat: cell(netAtFull > 0 ? Math.max(0, net) : null, model, { unit: 'energy per chase' }),
        breed: cell(Number.isFinite(spare) && spare >= 0 ? Math.min(SLACK_CAP, spare * ticksPerChase) : null, model),
    };
    const rest = gaitCost(hunter, { speed: 0, energy: birth });
    const row = rowOf('predator:living', cells);
    return {
        row,
        cells,
        chase: { ...chase, net, netAtFull },
        split: { gate, birth, chases, perLife, spare, ticksPerChase },
        resting: { rest, storeTicks: p.sizing.max / rest },
        binding: row.binding,
    };
}
