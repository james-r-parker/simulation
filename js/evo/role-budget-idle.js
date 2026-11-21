// The sitter (docs/designs/role-budget.md, "The sitter"): a body that never moves against one that searches. Selection removes
// the sitter only if sitting kills sooner than searching does, so the row reads both lives from each birth energy. Pure.

import { rowOf } from './role-budget-cell.js';
import { bestRangeSpeed, lifeOf, splitGate } from './role-budget-forage.js';

/** The steps of the row. */
export const IDLE_STEPS = Object.freeze(['sit']);

/** The ratio of a sitter's life to a searcher's up to which the cell is `tight`; above it, `impossible`. */
export const TIGHT_RATIO = 2;

/**
 * @param {import('./role-budget-params.js').RoleParams} p the spec's numbers
 * @returns {Record<'founder' | 'entrant' | 'child', number>} the energy of each birth rule
 */
export function birthEnergies(p) {
    return {
        founder: p.repro.founderEnergy,
        entrant: p.repro.entrantEnergy,
        child: splitGate(p) * p.repro.childShare,
    };
}

/**
 * @typedef {object} IdleLine one birth rule's reading
 * @property {number} energy the energy born with
 * @property {number} idleLife the ticks a body with `THRUST`, `TURN` and `SPRINT` at 0 survives (capped at `maxAgeTicks`)
 * @property {number} activeLife the ticks the same body survives searching at `bestRangeSpeed`
 * @property {number} ratio `idleLife / activeLife`
 * @property {number} coldest the lowest temperature the sitter reaches
 */

/**
 * @param {import('./role-budget-forage.js').Context} ctx the context
 * @param {number} energy the energy born with
 * @returns {IdleLine} the sitter's life and the searcher's
 */
export function idleLine(ctx, energy) {
    const idle = lifeOf(ctx, { energy, speed: 0 });
    const active = lifeOf(ctx, { energy, speed: bestRangeSpeed(ctx, energy) });
    return {
        energy,
        idleLife: idle.ticks,
        activeLife: active.ticks,
        ratio: idle.ticks / active.ticks,
        coldest: idle.heat,
    };
}

/**
 * The cell of a ratio: `ok` at or under 1, `tight` up to `TIGHT_RATIO`, `impossible` above; its margin is the ticks the searcher
 * outlives the sitter by (negative when the sitter lives longer), null when impossible.
 * @param {IdleLine} line one birth rule's reading
 * @returns {import('./role-budget-cell.js').Cell} the cell
 */
function idleCell(line) {
    const status = line.ratio <= 1 ? 'ok' : line.ratio <= TIGHT_RATIO ? 'tight' : 'impossible';
    return {
        margin: status === 'impossible' ? null : line.activeLife - line.idleLife,
        unit: 'ticks',
        distance: null,
        status,
        capped: false,
        binding: false,
    };
}

/**
 * @typedef {object} IdleBudget
 * @property {ReturnType<typeof rowOf>} row the matrix row `<spec>:idle`
 * @property {Record<string, import('./role-budget-cell.js').Cell>} cells the one cell, `sit`: the worst birth rule's
 * @property {Record<'founder' | 'entrant' | 'child', IdleLine>} rules the reading of each birth rule
 * @property {number} ratio the largest `idleRatio` of the three
 * @property {string | null} binding the step of least slack
 */

/**
 * @param {import('./role-budget-forage.js').Context} ctx the context of the spec
 * @returns {IdleBudget} the budget: a founder, a floor entrant and a child each sit and search from their birth energy, and the
 *   row reads the largest ratio
 */
export function budgetIdle(ctx) {
    const energies = birthEnergies(ctx.p);
    const rules = /** @type {IdleBudget['rules']} */ (
        Object.fromEntries(Object.entries(energies).map(([rule, energy]) => [rule, idleLine(ctx, energy)]))
    );
    const top = Object.values(rules).reduce((a, b) => (b.ratio > a.ratio ? b : a));
    const cells = { sit: idleCell(top) };
    const row = rowOf(`${ctx.p.spec}:idle`, cells);
    return { row, cells, rules, ratio: top.ratio, binding: row.binding };
}
