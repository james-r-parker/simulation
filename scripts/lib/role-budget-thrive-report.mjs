// The detail lines of the Phase 4 rows of `npm run role:budget` (the forager and the reproducer, a hunter's living, the first meal
// and the sitter): what stands under the matrix row. Every number is rounded here, never by a module.

/** @param {number} v a number @param {number} [digits] the decimals @returns {string} the number, `inf` when not finite */
const n = (v, digits = 1) => (Number.isFinite(v) ? v.toFixed(digits) : 'inf');

/**
 * @param {import('../../js/evo/role-budget-thrive.js').ThriveBudget} d the budget of a forager or reproducer row
 * @returns {string[]} its lines
 */
function thriveLines(d) {
    const { cycle, split, hunters } = d;
    return [
        `  meal cycle: ${n(cycle.cycleTicks)} ticks (digest ${n(cycle.cycleTicks - cycle.searchTicks, 0)}, then walking ${n(cycle.pathPerMeal, 0)} px of new food: ${n(cycle.handleTicks)} at the handling gait, ${n(cycle.grazeTicks)} grazing; density ${cycle.density.toExponential(3)}); income ${n(cycle.income, 0)}, net ${n(cycle.netPerMeal)} a meal, ${n(cycle.net, 2)} a tick`,
        `  split: gate ${n(split.gate, 0)} from ${n(split.birth, 0)} takes ${n(split.ticks, 0)} ticks of an adult life of ${split.life}; slack ${n(split.slack, 0)}`,
        `  hunters met in a life ${n(hunters.encounters, 0)}; flight slack ${n(hunters.flight, 0)} px; reactive hunter, broken bound ${n(hunters.reactiveBroken, 0)} px (perfect, straight ${n(hunters.perfectStraight, 0)} px, as context)`,
    ];
}

/**
 * @param {import('../../js/evo/role-budget-living.js').LivingBudget} d the budget of the hunter's living
 * @returns {string[]} its lines
 */
function livingLines(d) {
    const { chase, split, resting } = d;
    return [
        `  per chase: kill income ${n(chase.income)}, chase cost ${n(chase.cost)} over ${n(chase.chaseTicks, 0)} ticks; net ${n(chase.net)} at the catch share, ${n(chase.netAtFull)} at 1`,
        `  split: gate ${n(split.gate, 0)} from ${n(split.birth, 0)} takes ${n(split.chases, 1)} chases; a life holds ${n(split.perLife, 0)} (one per ${n(split.ticksPerChase, 0)} ticks), spare ${n(split.spare, 0)}`,
        `  at rest: ${n(resting.rest, 4)} a tick; a full store lasts ${n(resting.storeTicks, 0)} ticks with no kill`,
    ];
}

/**
 * @param {import('../../js/evo/role-budget-first-meal.js').FirstMealBudget} d the first-meal budget of a spec
 * @returns {string[]} its lines: the source, then a line per birth rule
 */
function firstMealLines(d) {
    const s = d.source;
    const head = `  source: ${n(s.n, 0)} of radius ${n(s.rho, 0)}, view strip ${n(s.strip, 0)}, holds ${n(s.holds, 0)} meals of ${n(s.meal.perMeal)} net`;
    const rules = Object.entries(d.rules).map(
        ([rule, r]) =>
            `  ${rule}: ${n(r.energy, 0)} energy walks ${n(r.speed, 2)} a tick for ${n(r.range, 0)} px; nearest edge ${n(r.reach.mean, 0)} px (p90 ${n(r.reach.p90, 0)}), reach share ${n(r.reach.share, 2)}; blind path ${n(r.find.path, 0)} px, find share ${n(r.find.share, 2)}; eat ${n(r.eat.meals, 1)} of ${n(r.eat.holds, 0)} meals`,
    );
    return [head, ...rules];
}

/**
 * @param {import('../../js/evo/role-budget-idle.js').IdleBudget} d the sitter's budget of a spec
 * @returns {string[]} its lines: a line per birth rule
 */
function idleLines(d) {
    return Object.entries(d.rules).map(
        ([rule, r]) =>
            `  ${rule}: ${n(r.energy, 0)} energy, sits ${n(r.idleLife, 0)} ticks, searches ${n(r.activeLife, 0)}; idle ratio ${n(r.ratio, 2)}; coldest ${n(r.coldest)}`,
    );
}

/**
 * @param {import('../../js/evo/role-budget-herd.js').HerdBudget} d the budget of a spec against a stampede
 * @returns {string[]} its lines: the typical and the worst case, then the tramples
 */
function herdLines(d) {
    const one = (/** @type {string} */ name, /** @type {import('../../js/evo/role-budget-herd.js').HerdCase} */ c) =>
        `  ${name}: sees the front ${n(c.sight, 0)} px off, ${n(c.warning, 0)} ticks before it arrives (${n(c.constant)} at a constant run speed), at ${n(c.arrival, 2)} px a tick; turns ${n(c.turn)} ticks; clears ${n(c.half, 0)} px sideways in ${c.clear.cruise} ticks (cruise) or ${c.clear.sprint} (sprint); straight ahead ${n(c.straight.ahead)} against the herd's peak ${c.straight.outrun ? '(outruns it)' : '(does not)'}`;
    const t = d.trample;
    return [
        ...(d.pulled
            ? ['  the herd ring is wider than 4 herd radii: its front is pulled back, so the formula is too fast']
            : []),
        ...(d.row.status === 'n/a' ? [`  not read: ${d.binding}`] : []),
        one('typical (facing the herd)', d.typical),
        one('worst (facing away, rear view)', d.worst),
        `  a trample takes ${n(t.arrival)} on arrival (${n(t.constant)} at the peak speed) and ${n(t.walk)} at the walk speed: ${t.survives} survived on arrival, ${t.walkSurvives} at the walk`,
    ];
}

/**
 * @param {string} name the row's name
 * @param {any} d the row's budget
 * @returns {string[] | null} the lines of a Phase 4 row, null for any other
 */
export function thriveDetail(name, d) {
    if (d.worst !== undefined) {
        return [name, ...herdLines(d)];
    }
    if (d.cycle !== undefined) {
        return [name, ...thriveLines(d)];
    }
    if (d.resting !== undefined) {
        return [name, ...livingLines(d)];
    }
    if (d.source !== undefined) {
        return [name, ...firstMealLines(d)];
    }
    return d.ratio !== undefined ? [name, ...idleLines(d)] : null;
}
