// The forager and the reproducer against a hunter (docs/designs/role-budget.md, "Phase 4 steps"): eat, breed and run, each a
// slack. `eat` is the net energy of the three-gait meal cycle, `breed` the ticks to the split gate against the adult life, `run`
// Phase 1's catch margin of the nearest hunter against this body, read with the hunters met in a life. Pure.

import { SLACK_CAP, cell, rowOf } from './role-budget-cell.js';
import { forageCycle, patchFoodDensity, splitGate } from './role-budget-forage.js';
import { viewReach } from './role-budget-senses.js';

export { bestRangeSpeed, patchFoodDensity, splitGate } from './role-budget-forage.js';

/** The steps of the row, in order. */
export const THRIVE_STEPS = Object.freeze(['eat', 'breed', 'run']);

/**
 * @param {import('./role-budget-forage.js').Context} ctx the context
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @returns {number} the food items per px2 the row reads: the model's `foodDensity`, else `patchFoodDensity`
 */
export function densityOf(ctx, model) {
    return model.foodDensity ?? patchFoodDensity(ctx.world);
}

/**
 * @param {import('./role-budget-forage.js').Context} ctx the context of the hunter
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @param {number} [density] the density of the bodies met, per px2 (default the hunters: `maxAgents x hunterShare / area`)
 * @returns {{density: number, perLife: number}} the density and `encountersPerLife = density x 2 viewReach x cruise speed x
 *   life`: the strip a hunter walking at its cruise cap sweeps, sideways reach, over `maxAgeTicks`
 */
export function encountersPerLife(ctx, model, density = (ctx.world.maxAgents * model.hunterShare) / ctx.world.area) {
    const { p } = ctx;
    return { density, perLife: density * 2 * viewReach(p, Math.PI / 2) * p.cap.cruise * p.repro.maxAgeTicks };
}

/**
 * @param {import('./role-budget-params.js').RoleParams} p the spec's numbers
 * @returns {number} the energy it is born with when poorest: the smaller of a founder's and an entrant's (a child is born with
 *   half its mother's, which is at the gate or more)
 */
export function poorestBirth(p) {
    return Math.min(p.repro.founderEnergy, p.repro.entrantEnergy);
}

/**
 * @param {import('./role-budget-forage.js').Context} ctx the context of the prey
 * @param {{chase: import('./role-budget-chase.js').ChaseBudget, hunter: import('./role-budget-forage.js').Context,
 *   model: import('./role-budget-model.js').RoleModel}} against the budget of the nearest hunter against it, the hunter's
 *   context and the model
 * @returns {{cell: import('./role-budget-cell.js').Cell, encounters: number, flight: number}} the `run` cell: its margin is
 *   the ticks the forager may lose before the hunter's catch margin exceeds its flight slack (`reactionTicks` of the hunter's
 *   creep, in px); impossible only when a life meets a hunter (`encountersPerLife` at least 1) that closes on it
 */
function runCell(ctx, { chase, hunter, model }) {
    const { perLife } = encountersPerLife(hunter, model);
    const speed = hunter.p.cap.cruise;
    const flight = model.reactionTicks * speed;
    if (perLife >= 1 && chase.catchable && chase.catchMargin > flight) {
        return { cell: cell(null, model, { distance: chase.catchMargin - flight }), encounters: perLife, flight };
    }
    const ticks = perLife < 1 ? SLACK_CAP : Math.min(SLACK_CAP, Math.floor((flight - chase.catchMargin) / speed));
    return { cell: cell(ticks, model, { distance: flight - chase.catchMargin }), encounters: perLife, flight };
}

/**
 * @typedef {object} ThriveBudget
 * @property {ReturnType<typeof rowOf>} row the matrix row `<spec>:predator`
 * @property {Record<string, import('./role-budget-cell.js').Cell>} cells eat, breed and run
 * @property {ReturnType<typeof forageCycle>} cycle the meal cycle
 * @property {{gate: number, birth: number, ticks: number, life: number, slack: number}} split the split gate, the energy
 *   born with, the ticks to the gate (Infinity with no net gain), the adult life and the slack in ticks, uncapped
 * @property {{encounters: number, flight: number}} hunters the hunters met in a life and the forager's flight slack in px
 * @property {string | null} binding the step of least slack
 */

/**
 * The budget of a forager or a reproducer in a world with hunters.
 * @param {import('./role-budget-forage.js').Context} ctx the context of the forager or the reproducer
 * @param {{chase: import('./role-budget-chase.js').ChaseBudget, hunter: import('./role-budget-forage.js').Context,
 *   model: import('./role-budget-model.js').RoleModel}} against the hunter's budget against it, the hunter and the model
 * @returns {ThriveBudget} the budget
 */
export function budgetThrive(ctx, against) {
    const { model } = against;
    const { p } = ctx;
    const birth = poorestBirth(p);
    const cycle = forageCycle(ctx, { density: densityOf(ctx, model), energy: birth });
    const gate = splitGate(p);
    const ticks = cycle.net > 0 ? Math.max(0, gate - birth) / cycle.net : Infinity;
    const life = p.repro.maxAgeTicks - p.repro.maturityTicks;
    const slack = life - ticks;
    const run = runCell(ctx, against);
    const cells = {
        eat: cell(cycle.net > 0 ? cycle.net * 100 : null, model, { unit: 'energy per 100 ticks' }),
        breed: cell(Number.isFinite(slack) && slack >= 0 ? Math.min(SLACK_CAP, slack) : null, model),
        run: run.cell,
    };
    const row = rowOf(`${p.spec}:predator`, cells);
    return {
        row,
        cells,
        cycle,
        split: { gate, birth, ticks, life, slack },
        hunters: { encounters: run.encounters, flight: run.flight },
        binding: row.binding,
    };
}
