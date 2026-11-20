// Adaptive difficulty (docs/designs/training-loop.md, Adaptive difficulty): a gated stage's `adapt` key moves one stage-world
// parameter at each gate checkpoint so the population wins about half of a steering drill's trials. The gate itself stays at
// full difficulty. A trainer control only: it reads a drill's win share and never reaches fitness. Pure.

/** The parameters `adapt.param` can move: `preySprint` is the `sprintBoost` of the prey specialisations and of the drill's fleer. */
export const ADAPT_PARAMS = Object.freeze(['preySprint']);
/**
 * The drills that can steer: a bite drill with a scripted fleer whose sprint is the config's (it sets no `arena` of its own,
 * so `sprintArena` in `js/evo/drill-scenarios.js` can set it).
 */
export const ADAPT_DRILLS = Object.freeze(['prey-ahead']);
/** The win share an `adapt` holds when it names no `target`. */
export const DEFAULT_TARGET = 0.5;

/**
 * @typedef {object} Adapt
 * @property {'preySprint'} param the parameter moved
 * @property {string} drill the drill whose champion win share steers it (one of `ADAPT_DRILLS`)
 * @property {number} from the start value
 * @property {number} to the end value (at most 1)
 * @property {number} step the change per checkpoint
 * @property {number} [target] the win share to hold (default `DEFAULT_TARGET`)
 */

/**
 * @param {Record<string, any>} adapt an entry's `adapt`
 * @param {string} where the entry's position and name, for errors
 * @returns {void}
 * @throws {Error} when `param` or `drill` is not one `adapt` supports
 */
function checkNames(adapt, where) {
    if (!ADAPT_PARAMS.includes(adapt.param)) {
        throw new Error(`${where}: "adapt.param" must be one of ${ADAPT_PARAMS.join(', ')}`);
    }
    if (!ADAPT_DRILLS.includes(adapt.drill)) {
        throw new Error(`${where}: "adapt.drill" must be one of ${ADAPT_DRILLS.join(', ')}`);
    }
}

/**
 * @param {Record<string, any>} a an entry's `adapt`
 * @param {string} where the entry's position and name, for errors
 * @returns {void}
 * @throws {Error} when `from`, `to` or `step` is out of range
 */
function checkRange(a, where) {
    for (const key of ['from', 'to']) {
        if (!(typeof a[key] === 'number' && a[key] >= 0 && a[key] <= 1)) {
            throw new Error(`${where}: "adapt.${key}" must be a number from 0 to 1`);
        }
    }
    if (a.from > a.to) {
        throw new Error(`${where}: "adapt.from" must not be above "adapt.to"`);
    }
    if (!(typeof a.step === 'number' && a.step > 0 && a.step <= 1)) {
        throw new Error(`${where}: "adapt.step" must be a number above 0, at most 1`);
    }
}

/**
 * @param {unknown} adapt an entry's `adapt`
 * @param {string} where the entry's position and name, for errors
 * @returns {void}
 * @throws {Error} naming the field that is missing or out of range
 */
export function validateAdapt(adapt, where) {
    if (typeof adapt !== 'object' || adapt === null || Array.isArray(adapt)) {
        throw new Error(`${where}: "adapt" must be an object`);
    }
    const a = /** @type {Record<string, any>} */ (adapt);
    checkNames(a, where);
    checkRange(a, where);
    if (a.target !== undefined && !(typeof a.target === 'number' && a.target > 0 && a.target < 1)) {
        throw new Error(`${where}: "adapt.target" must be a share above 0 and below 1`);
    }
}

/**
 * The value for the next generations: up a step toward `to` when the champions win more than `target` of the steering
 * drill's trials, down a step toward `from` when they win under half of it, held otherwise (or when no champion was drilled).
 * @param {Adapt} adapt the stage's `adapt`
 * @param {number} value the current value
 * @param {number | null} winShare the champions' pooled win share on `adapt.drill` at `value` (null: none drilled)
 * @returns {number} the next value, within `from` to `to`
 */
export function nextDifficulty(adapt, value, winShare) {
    const target = adapt.target ?? DEFAULT_TARGET;
    let next = value;
    if (winShare !== null && winShare > target) {
        next = value + adapt.step;
    } else if (winShare !== null && winShare < target / 2) {
        next = value - adapt.step;
    }
    // sums of steps drift in the last digits; the files and logs hold the value to nine places
    return Math.round(Math.min(adapt.to, Math.max(adapt.from, next)) * 1e9) / 1e9;
}

/**
 * @param {readonly {cells: Record<string, {wins: number, trials: number} | null>}[]} rows a drill table: a row per champion,
 *   then the reference
 * @param {number} genomeCount how many leading rows are champions
 * @param {string} drill the drill
 * @returns {number | null} the champions' pooled win share on it (null: none ran it)
 */
export function pooledWinShare(rows, genomeCount, drill) {
    const cells = rows.slice(0, genomeCount).flatMap((row) => (row.cells[drill] ? [row.cells[drill]] : []));
    const trials = cells.reduce((sum, c) => sum + c.trials, 0);
    return trials === 0 ? null : cells.reduce((sum, c) => sum + c.wins, 0) / trials;
}

/** The prey specialisations whose `sprintBoost` `preySprint` sets. */
const PREY_SPECIALISATIONS = Object.freeze(['forager', 'reproducer', 'scout', 'defender']);

/**
 * @param {Record<string, any>} overrides a stage's config overrides
 * @param {number} preySprint the adapted value
 * @returns {Record<string, any>} the overrides with `specialisations.{forager,reproducer,scout,defender}.sprintBoost` set to
 *   it, the stage's other keys (and its other specialisation keys) kept
 */
export function withPreySprint(overrides, preySprint) {
    const specialisations = { ...overrides.specialisations };
    for (const name of PREY_SPECIALISATIONS) {
        specialisations[name] = { ...specialisations[name], sprintBoost: preySprint };
    }
    return { ...overrides, specialisations };
}
