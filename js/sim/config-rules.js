// The rule helpers config validation uses, and the rules for the world-balance feature keys (satiation, handling,
// food patches, the floor rescue and the Phase 3 biology), each feature off at its default.

/**
 * @typedef {object} Rule
 * @property {'int' | 'num' | 'bool' | 'enum' | 'seasons' | 'specialisations'} type the value type
 * @property {readonly string[]} [values] the allowed strings of an `enum`
 * @property {number} [min] inclusive lower bound
 * @property {number} [gt] exclusive lower bound
 * @property {number} [max] inclusive upper bound
 * @property {number} [lt] exclusive upper bound
 * @property {boolean} [infinite] true when `Infinity` is also a valid value
 */

/**
 * @param {number} min inclusive lower bound
 * @param {number} [max] inclusive upper bound
 * @returns {Rule}
 */
export const int = (min, max = Infinity) => ({ type: 'int', min, max });
/**
 * @param {number} min inclusive lower bound
 * @param {number} [max] inclusive upper bound
 * @returns {Rule}
 */
export const num = (min, max = Infinity) => ({ type: 'num', min, max });
/** @returns {Rule} a finite number above zero */
export const positive = () => ({ type: 'num', gt: 0 });
/** @type {Rule} */
export const BOOL = { type: 'bool' };
/** @type {Rule} */
export const UNIT = num(0, 1);
/** @type {Record<string, Rule>} the world-balance feature keys */
export const FEATURE_RULES = {
    satiationShare: num(0, 1),
    digestTicks: int(0, 30),
    handlingTicks: int(0, 30),
    handlingThrust: num(0, 1),
    carcassesEnabled: BOOL,
    carcassTicks: int(1),
    carcassShare: num(0, 1),
    terrainLayout: { type: 'enum', values: ['open', 'basins'] },
    wallGaps: int(0, 8),
    wallGapWidth: positive(),
    refugeCount: int(0, 8),
    refugeSizeMax: positive(),
    coldMarginWidth: num(0),
    specMutationRate: num(0, 1),
    huntUpkeep: num(0),
    floorRescueAtZero: BOOL,
    predatorRescueMin: int(0, 50),
    predatorRescueInterval: int(1, 6000),
    foodPatchCount: int(0, 256),
    foodPatchRadius: positive(),
    foodPatchCapacity: positive(),
    foodPatchDepletion: num(0),
    foodPatchRegrow: UNIT,
    foodBackgroundShare: UNIT,
    foodAreaCapacity: BOOL,
    foodRegrowPerArea: num(0),
    erasEnabled: BOOL,
    eraSeasonTicks: int(1),
    winterRegrow: num(0),
    droughtChance: UNIT,
    invasionInterval: int(0),
    invasionSize: int(0),
    leakEnabled: BOOL,
    hebbianRate: num(0, 1),
    traitsEnabled: BOOL,
    visionCost: num(0),
    sexesEnabled: BOOL,
    birthWindowTicks: int(1),
    maxBirthsPerWindow: int(0, 16),
    capBirthsEnabled: BOOL,
    splitCapMargin: int(0),
    mateDistanceMax: { type: 'num', gt: 0, infinite: true },
};
