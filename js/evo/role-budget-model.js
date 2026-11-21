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
 * @property {number} defenderGap the distance a scout stands from the forager it warns, in px (the 0.5 of `callRadius` of the hearing anchor)
 * @property {number | null} escortGap the distance of the defender from the caller when a hunter closes, in px, null to derive it
 *   (`escortGap` of js/evo/role-budget-escort.js: the guard stands one body radius clear of the caller)
 * @property {number} smokeGap the centre gap at which a body releases smoke, in px
 * @property {boolean} reliableSight whether the hunter acts only on a prey that two neighbouring rays cannot both miss
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
    defenderGap: 150,
    escortGap: null,
    smokeGap: 240,
    reliableSight: false,
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
    defenderGap: (v) => typeof v === 'number' && v > 0,
    escortGap: (v) => v === null || (typeof v === 'number' && v > 0),
    smokeGap: (v) => typeof v === 'number' && v > 0,
    reliableSight: (v) => typeof v === 'boolean',
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
