// The model options of the role budget (docs/designs/role-budget.md, "Body numbers"): what a budget needs beyond the
// config. Frozen, validated, and written into every report. Pure: no world, no RNG.

/**
 * @typedef {object} RoleModel
 * @property {number} reactionTicks ticks from a stimulus on a ray to the brain's output changing the body
 * @property {number} hearThreshold the `heard` loudness a brain acts on
 * @property {number} breakAngle the turn through which a breaking prey forces the hunter
 * @property {number} tightTicks the slack under which a cell is `tight`
 * @property {'rationed' | 'always'} preySprint how the prey spends its sprint
 * @property {number} hunterShare the share of the population that hunts
 * @property {number | null} foodDensity food items per px2 inside a patch, null to derive it from the config
 * @property {number} naiveEffort the constant sprint effort of the `naive` tier
 * @property {number} catchShare the share of chases a hunter wins
 */

/** @type {Readonly<RoleModel>} */
export const MODEL_DEFAULTS = Object.freeze({
    reactionTicks: 2,
    hearThreshold: 0.1,
    breakAngle: Math.PI / 2,
    tightTicks: 5,
    preySprint: 'rationed',
    hunterShare: 0.1,
    foodDensity: null,
    naiveEffort: 0.5,
    catchShare: 0.3,
});

/** @type {Record<string, (value: unknown) => boolean>} the test of each option's value */
const VALID = {
    reactionTicks: (v) => Number.isInteger(v) && /** @type {number} */ (v) >= 0,
    hearThreshold: (v) => typeof v === 'number' && v > 0 && v < 1,
    breakAngle: (v) => typeof v === 'number' && v > 0 && v <= Math.PI,
    tightTicks: (v) => typeof v === 'number' && v >= 0,
    preySprint: (v) => v === 'rationed' || v === 'always',
    hunterShare: (v) => typeof v === 'number' && v >= 0 && v <= 1,
    foodDensity: (v) => v === null || (typeof v === 'number' && v > 0),
    naiveEffort: (v) => typeof v === 'number' && v > 0 && v <= 1,
    catchShare: (v) => typeof v === 'number' && v > 0 && v <= 1,
};

/**
 * @param {Record<string, unknown>} [model] overrides of `MODEL_DEFAULTS`
 * @returns {Readonly<RoleModel>} the defaults with the overrides applied, frozen
 * @throws {Error} naming the first key that is not an option or whose value is out of range
 */
export function validateModel(model = {}) {
    for (const [key, value] of Object.entries(model)) {
        if (!Object.hasOwn(VALID, key)) {
            throw new Error(`role-budget model: unknown option "${key}"; known: ${Object.keys(VALID).join(', ')}`);
        }
        if (!VALID[key](value)) {
            throw new Error(`role-budget model: bad value for "${key}": ${JSON.stringify(value)}`);
        }
    }
    return Object.freeze(/** @type {RoleModel} */ ({ ...MODEL_DEFAULTS, ...model }));
}
