// The cross-check of the Phase 4 budget against the sim (docs/designs/role-budget.md, "Cross-check against the sim"): the sitter
// and the walker, the forager in a grid of food, the hunter's chase as a living, and the shares of the first meal, each played
// beside its formula. The scene and the formula start from the same state, so a difference is the formula's.

import { formulaChase } from './role-budget-check.js';
import { gapAtAwareness } from './role-budget-frame.js';
import { PREY_SPECS } from './role-budget-chase.js';
import { phase4Budget } from './role-budget-matrix-thrive.js';
import { roleParams } from './role-budget-params.js';
import { inTicks, signReading, ticksReading } from './role-budget-defence-check.js';
import { bestRangeSpeed, contextOf, forageCycle } from './role-budget-forage.js';
import { densityOf, poorestBirth } from './role-budget-thrive.js';
import { playFirstMeal } from './role-scenes-first-meal.js';
import { playForaging, playIdle, playLiving } from './role-scenes-thrive.js';

/** The tolerances of the plan's "Cross-check against the sim" table. */
export const THRIVE_TOLERANCE = Object.freeze({
    sitter: 0.005,
    walker: 0.02,
    forage: 0.3,
    living: 0.05,
    reachShare: 0.2,
    findShare: 0.15,
});

/**
 * @param {string} row the row
 * @param {string} what the reading
 * @param {[number | null, number | null]} values the formula's and the scene's numbers
 * @param {{relative?: number, absolute?: number}} allowed the tolerance: a share of the scene's value, or a fixed amount
 * @returns {import('./role-budget-defence-check.js').DefenceReading} the reading
 */
export function rateReading(row, what, [formula, scene], { relative, absolute }) {
    const allowed = relative === undefined ? (absolute ?? 0) : relative * Math.abs(scene ?? 0);
    const drift = formula === null || scene === null ? formula !== scene : Math.abs(formula - scene) > allowed;
    const tolerance = relative === undefined ? `${absolute} absolute` : `${relative * 100}%`;
    return { row, what, formula, scene, tolerance, drift };
}

/**
 * A reading where the formula is an upper bound: it must not read lower than the scene by more than `absolute`.
 * @param {string} row the row
 * @param {string} what the reading
 * @param {[number, number]} values the formula's and the scene's numbers
 * @param {number} absolute the amount the scene may exceed the formula by
 * @returns {import('./role-budget-defence-check.js').DefenceReading} the reading
 */
export function upperReading(row, what, [formula, scene], absolute) {
    return {
        row,
        what,
        formula,
        scene,
        tolerance: `an upper bound, ${absolute} absolute`,
        drift: scene > formula + absolute,
    };
}

/**
 * @param {Readonly<Record<string, any>>} world the default world's config
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @returns {import('./role-budget-defence-check.js').DefenceReading[]} the sitter's and the walker's lives from each birth energy,
 *   formula and scene
 */
export function idleReadings(world, model) {
    const spec = 'forager';
    const budget = phase4Budget(`${spec}:idle`, { config: world, model, budgets: {} });
    const ctx = contextOf(world, spec, roleParams(world, spec, {}, { age: 'juvenile' }));
    return Object.entries(budget.rules).flatMap(([rule, line]) => {
        const speed = bestRangeSpeed(ctx, line.energy);
        const sat = playIdle(world, { spec, energy: line.energy, speed: 0 });
        const walked = playIdle(world, { spec, energy: line.energy, speed });
        return [
            rateReading(`${spec}:idle`, `${rule} sits`, [line.idleLife, sat.ticks.life], {
                relative: THRIVE_TOLERANCE.sitter,
            }),
            rateReading(`${spec}:idle`, `${rule} searches`, [line.activeLife, walked.ticks.life], {
                relative: THRIVE_TOLERANCE.walker,
            }),
        ];
    });
}

/**
 * @param {Readonly<Record<string, any>>} world the default world's config
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @returns {import('./role-budget-defence-check.js').DefenceReading[]} the forager's net rate once settled in a grid of food,
 *   formula and scene
 */
export function foragingReadings(world, model) {
    const spec = 'forager';
    const row = `${spec}:predator`;
    const p = roleParams(world, spec);
    const ctx = contextOf(world, spec, p);
    const birth = poorestBirth(p);
    const cycle = forageCycle(ctx, { density: densityOf(ctx, model), energy: birth });
    const scene = playForaging(world, { spec, density: cycle.density, energy: birth, stop: 0.75 * p.sizing.max });
    return [
        rateReading(row, 'net energy a tick from the fourth meal', [cycle.net, scene.outcome.netPerTick], {
            relative: THRIVE_TOLERANCE.forage,
        }),
    ];
}

/**
 * @param {Readonly<Record<string, any>>} arena an `arenaConfig`
 * @returns {import('./role-budget-defence-check.js').DefenceReading[]} for each prey, the chase's kill tick and the hunter's net
 *   energy, formula and scene, and the chases to the gate from each net
 */
export function livingReadings(arena) {
    const hunter = roleParams(arena, 'predator');
    const gate = Math.max(hunter.repro.splitMin, hunter.repro.birthReserve / (1 - hunter.repro.childShare));
    const birth = Math.min(hunter.repro.founderEnergy, hunter.repro.entrantEnergy);
    return PREY_SPECS.flatMap((prey) => {
        const row = 'predator:living';
        const distance = gapAtAwareness(hunter, roleParams(arena, prey));
        const f = formulaChase(arena, { hunter: 'predator', prey, distance, bearing: 0, straight: false });
        const s = playLiving(arena, { prey, gate, birth });
        const both = f.net !== null && s.outcome.net !== null;
        return [
            ticksReading(row, `${prey}: kill tick`, [f.killTick, s.ticks.killTick], inTicks(2)),
            both
                ? rateReading(row, `${prey}: net energy of the chase`, [f.net, s.outcome.net], {
                      relative: THRIVE_TOLERANCE.living,
                  })
                : signReading(row, `${prey}: a kill or none`, [f.killTick !== null, s.ticks.killTick !== null]),
        ];
    });
}

/**
 * @param {Readonly<Record<string, any>>} world the default world's config
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @param {{count?: number}} [options] the bodies per scene (256)
 * @returns {import('./role-budget-defence-check.js').DefenceReading[]} the forager's reach and find shares for each birth rule,
 *   formula against the scene (uniform flora: the formulas do not model the species mixture)
 */
export function firstMealReadings(world, model, { count = 256 } = {}) {
    const spec = 'forager';
    const row = `${spec}:first-meal`;
    const budget = phase4Budget(row, { config: world, model, budgets: {} });
    return Object.entries(budget.rules).flatMap(([rule, line]) => {
        const at = /** @type {'founder' | 'entrant' | 'child'} */ (rule);
        const reach = playFirstMeal(world, { spec, rule: at, mode: 'reach', count }).outcome.share;
        const find = playFirstMeal(world, { spec, rule: at, mode: 'find', count }).outcome.share;
        return [
            rateReading(row, `${rule}: reach share`, [line.reach.share, reach], {
                absolute: THRIVE_TOLERANCE.reachShare,
            }),
            upperReading(
                row,
                `${rule}: find share (a free plane: rocks and walls only lower it)`,
                [line.find.share, find],
                THRIVE_TOLERANCE.findShare,
            ),
        ];
    });
}

/**
 * The Phase 4 cross-check: every reading, and how many are outside their tolerance.
 * @param {Readonly<Record<string, any>>} arena an `arenaConfig`
 * @param {Readonly<Record<string, any>>} world the default world's config
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @param {{count?: number}} [options] the bodies per first-meal scene (256)
 * @returns {{readings: import('./role-budget-defence-check.js').DefenceReading[], drift: number}} the readings and the drift count
 */
export function thriveCheck(arena, world, model, options = {}) {
    const readings = [
        ...idleReadings(world, model),
        ...foragingReadings(world, model),
        ...livingReadings(arena),
        ...firstMealReadings(world, model, options),
    ];
    return { readings, drift: readings.filter((r) => r.drift).length };
}
