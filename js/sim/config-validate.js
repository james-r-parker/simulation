// Validates a merged config against a table of per-key rules and the cross-key rules; throws on the first violation.

import { brainLayout } from './brain-layout.js';

const MAX_SEED = 4294967295; // 2^32 - 1
const MAX_WEIGHT_FLOATS = 16777216; // 2^24: 64 MB of float32 weights
const SEASON_COUNT = 4;
const SEASON_KEYS = ['foodScarcity', 'energyDrain', 'reproductionBonus'];
const SPECIALISATION_KEYS = ['forager', 'predator', 'reproducer', 'scout', 'defender'];
const SPECIALISATION_FIELDS = [
    'index',
    'visionRange',
    'canHunt',
    'moveCostMultiplier',
    'biteTakenMultiplier',
    'cooldownMultiplier',
];

/**
 * @typedef {object} Rule
 * @property {'int' | 'num' | 'bool' | 'seasons' | 'specialisations'} type the value type
 * @property {number} [min] inclusive lower bound
 * @property {number} [gt] exclusive lower bound
 * @property {number} [max] inclusive upper bound
 * @property {number} [lt] exclusive upper bound
 */

/**
 * @param {number} min inclusive lower bound
 * @param {number} [max] inclusive upper bound
 * @returns {Rule}
 */
const int = (min, max = Infinity) => ({ type: 'int', min, max });
/**
 * @param {number} min inclusive lower bound
 * @param {number} [max] inclusive upper bound
 * @returns {Rule}
 */
const num = (min, max = Infinity) => ({ type: 'num', min, max });
/** @returns {Rule} a finite number above zero */
const positive = () => ({ type: 'num', gt: 0 });
/** @type {Rule} */
const BOOL = { type: 'bool' };
/** @type {Rule} */
const UNIT = num(0, 1);

/** @type {Record<string, Rule>} */
const RULES = {
    seed: int(0, MAX_SEED),
    worldWidth: num(1000, 100000),
    worldHeight: num(1000, 100000),
    maxAgents: int(1, 4096),
    initialAgents: int(0),
    minAgents: int(0),
    immigrationInterval: int(0),
    maxFood: int(1, 20000),
    initialFood: int(0),
    foodSpawnRate: num(0),
    foodEnergy: positive(),
    foodEnergyVariance: num(0),
    highFoodChance: UNIT,
    highFoodEnergy: positive(),
    highFoodEnergyVariance: num(0),
    foodRadius: positive(),
    highFoodRadius: positive(),
    foodMaxAge: int(1),
    obstacleCount: int(0, 100),
    obstacleMinRadius: positive(),
    obstacleMaxRadius: positive(),
    obstacleMaxSpeed: num(0),
    obstacleDamage: num(0),
    wallDamage: num(0),
    rayCount: int(1, 64),
    brainHidden: int(1, 128),
    maxThrust: num(0),
    maxTurn: num(0),
    maxVelocity: num(0),
    damping: UNIT,
    sprintMultiplier: num(0),
    sprintCost: num(0),
    initialEnergy: positive(),
    maxEnergy: positive(),
    passiveLoss: num(0),
    movementCost: num(0),
    turnCost: num(0),
    sizeEnergyLoss: num(0),
    baseSize: positive(),
    minSize: positive(),
    energyToSize: positive(),
    biteEnergy: num(0),
    huntSizeRatio: num(1),
    mateMinEnergy: num(0),
    mateCost: num(0),
    mateRange: num(0),
    childEnergyShare: { type: 'num', gt: 0, lt: 1 },
    childEnergyMin: positive(),
    splitMinEnergy: num(0),
    maxAgeTicks: int(1),
    reproductionCooldown: int(0),
    pregnancyTicks: int(1),
    maturityTicks: int(0),
    seasonLength: int(SEASON_COUNT),
    seasons: { type: 'seasons' },
    fertileZoneMax: int(0),
    fertileZoneSpawnChance: UNIT,
    fertileZoneDecay: UNIT,
    pheromoneCellSize: positive(),
    pheromoneDecay: UNIT,
    pheromoneDiffusion: UNIT,
    pheromoneDeposit: num(0),
    pheromoneMax: num(0),
    hashCellSize: positive(),
    maxContacts: int(1),
    eventCapacity: int(1),
    specialisations: { type: 'specialisations' },
    checkInvariants: BOOL,
    restitution: UNIT,
    splitCooldownMultiplier: num(0),
    mateChanceScale: positive(),
    foodTargetPerAgent: num(0),
    foodTargetMin: num(0),
    foodRefillBoost: num(0),
    foodSurplusRate: num(0),
    foodSpawnAgentDivisor: positive(),
    fertileZoneRadius: positive(),
    fertileZoneFertility: num(0),
    placementTries: int(1),
};

/** Pairs `[smaller, larger]`: the first key's value must not exceed the second's. */
const AT_MOST = [
    ['initialAgents', 'maxAgents'],
    ['minAgents', 'maxAgents'],
    ['initialFood', 'maxFood'],
    ['obstacleMinRadius', 'obstacleMaxRadius'],
    ['initialEnergy', 'maxEnergy'],
    ['minSize', 'baseSize'],
];

/**
 * @param {string} path the key path
 * @param {unknown} value the offending value
 * @param {string} rule what was expected
 * @returns {never}
 */
function fail(path, value, rule) {
    throw new Error(`config${path === '' ? '' : '.'}${path} is ${JSON.stringify(value)}; expected ${rule}`);
}

/**
 * Describes a numeric rule in words for error messages.
 * @param {Rule} rule the rule
 * @returns {string}
 */
function describe(rule) {
    const kind = rule.type === 'int' ? 'an integer' : 'a finite number';
    const lower = rule.gt !== undefined ? `> ${rule.gt}` : `>= ${rule.min}`;
    if (rule.lt !== undefined) {
        return `${kind} ${lower} and < ${rule.lt}`;
    }
    return rule.max !== undefined && rule.max !== Infinity ? `${kind} ${lower} and <= ${rule.max}` : `${kind} ${lower}`;
}

/**
 * @param {number} n the value
 * @param {Rule} rule the rule
 * @returns {boolean} true when `n` is within the rule's bounds
 */
function inBounds(n, rule) {
    const lowOk = rule.gt !== undefined ? n > rule.gt : n >= /** @type {number} */ (rule.min);
    return lowOk && n <= (rule.max ?? Infinity) && n < (rule.lt ?? Infinity);
}

/**
 * Checks one scalar against a rule.
 * @param {string} path the key path
 * @param {unknown} value the value
 * @param {Rule} rule the rule
 * @returns {void}
 */
function checkScalar(path, value, rule) {
    if (rule.type === 'bool') {
        if (typeof value !== 'boolean') {
            fail(path, value, 'a boolean');
        }
        return;
    }
    const typeOk = rule.type === 'int' ? Number.isInteger(value) : Number.isFinite(value);
    const n = /** @type {number} */ (value);
    if (!typeOk || !inBounds(n, rule)) {
        fail(path, value, describe(rule));
    }
}

/**
 * Checks that `value` is a plain object with exactly the keys `expected`.
 * @param {string} path the key path
 * @param {unknown} value the value
 * @param {string[]} expected the exact key set
 * @returns {void}
 */
function checkExactKeys(path, value, expected) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        fail(path, value, 'an object');
    }
    const object = /** @type {Record<string, unknown>} */ (value);
    for (const key of Object.keys(object)) {
        if (!expected.includes(key)) {
            fail(path === '' ? key : `${path}.${key}`, object[key], `no such key (known: ${expected.join(', ')})`);
        }
    }
    for (const key of expected) {
        if (!(key in object)) {
            fail(path === '' ? key : `${path}.${key}`, undefined, 'a value (missing key)');
        }
    }
}

/**
 * @param {unknown} seasons the `seasons` value
 * @returns {void}
 */
function checkSeasons(seasons) {
    if (!Array.isArray(seasons) || seasons.length !== SEASON_COUNT) {
        fail('seasons', seasons, `an array of exactly ${SEASON_COUNT} season objects`);
    }
    seasons.forEach((season, i) => {
        checkExactKeys(`seasons[${i}]`, season, SEASON_KEYS);
        for (const key of SEASON_KEYS) {
            checkScalar(`seasons[${i}].${key}`, season[key], num(0));
        }
    });
}

/**
 * @param {unknown} specialisations the `specialisations` value
 * @returns {void}
 */
function checkSpecialisations(specialisations) {
    checkExactKeys('specialisations', specialisations, SPECIALISATION_KEYS);
    const table = /** @type {Record<string, Record<string, unknown>>} */ (specialisations);
    SPECIALISATION_KEYS.forEach((name, order) => {
        const path = `specialisations.${name}`;
        checkExactKeys(path, table[name], SPECIALISATION_FIELDS);
        const entry = table[name];
        if (entry.index !== order) {
            fail(`${path}.index`, entry.index, `${order} (fixed by key order)`);
        }
        checkScalar(`${path}.canHunt`, entry.canHunt, BOOL);
        for (const field of SPECIALISATION_FIELDS.filter((f) => f !== 'index' && f !== 'canHunt')) {
            checkScalar(`${path}.${field}`, entry[field], positive());
        }
    });
}

/**
 * @param {Record<string, any>} config the config
 * @returns {void}
 */
function checkRelations(config) {
    for (const [small, large] of AT_MOST) {
        if (config[small] > config[large]) {
            fail(small, config[small], `<= ${large} (${config[large]})`);
        }
    }
}

/**
 * @param {Record<string, any>} config the config
 * @returns {void}
 */
function checkCrossKey(config) {
    const floats = config.maxAgents * brainLayout(config).weightCount;
    if (floats > MAX_WEIGHT_FLOATS) {
        fail(
            'maxAgents',
            config.maxAgents,
            `at most ${MAX_WEIGHT_FLOATS} / weightCount (maxAgents x weightCount is ${floats})`,
        );
    }
    const largest = Math.max(
        config.baseSize + config.maxEnergy / config.energyToSize,
        config.foodRadius,
        config.highFoodRadius,
    );
    if (largest >= config.hashCellSize) {
        fail('hashCellSize', config.hashCellSize, `> the largest radius (${largest})`);
    }
}

/**
 * Validates a merged config; throws on the first violation naming the key path, the value and the rule.
 * @param {Record<string, any>} config the config to check
 * @returns {void}
 * @throws {Error} on an unknown or missing key, a wrong type, an out-of-range value or a broken cross-key rule
 */
export function validateConfig(config) {
    checkExactKeys('', config, Object.keys(RULES));
    for (const [key, rule] of Object.entries(RULES)) {
        if (rule.type === 'seasons') {
            checkSeasons(config[key]);
        } else if (rule.type === 'specialisations') {
            checkSpecialisations(config[key]);
        } else {
            checkScalar(key, config[key], rule);
        }
    }
    checkRelations(config);
    checkCrossKey(config);
}
