// The lane catalogue (docs/designs/body-genes.md, "The lane catalogue"): every number that describes a body, fixed for
// its life. A lane's base is its global config key times the spec's field for it times the spec's `body` override;
// `laneBases` returns every base without a world. Pure data and arithmetic: no world, no readers.

import { SPEC_COUNT, SPEC_NAMES } from './specs.js';

/**
 * @typedef {object} Lane
 * @property {string} name the key's name, or the spec field's name for a lane with no key
 * @property {string} family the family the lane is listed under
 * @property {string | null} key the global config key, null for a lane that has none
 * @property {string | null} field the spec field that scales it, null for a lane that has none
 * @property {number} base the lane's own base, the factor of a lane with neither key nor field (1 for every other)
 * @property {'ratio' | 'offset'} kind `offset` for the six temperature thresholds, which a body shifts by a sum
 * @property {boolean} moved whether every sim reader reads the lane and no longer the config key
 */

/** The six temperature thresholds: the one sum, `key + body.heatBand`. */
const THRESHOLDS = [
    'temperatureColdStress',
    'temperatureColdModerate',
    'temperatureOptimalMin',
    'temperatureOptimalMax',
    'temperatureHeatModerate',
    'temperatureHeatStress',
];

/**
 * The lanes whose sim readers read the lane and no longer the config key (body-genes.md Phase 1, T3, T13 and T13a):
 * the movement, heat and energy lanes the first traits shift, the two cost lanes and the senses of the new traits. The rest move family by family in Phase 5.
 */
const MOVED = new Set([
    'maxVelocity',
    'maxThrust',
    'maxTurn',
    'sprintCost',
    'sprintDrain',
    'sprintRefill',
    'fatSlowShare',
    'visionRange',
    'maxEnergy',
    'passiveLoss',
    'baseSize',
    'childEnergyShare',
    'temperatureGainMove',
    'temperatureLossPassive',
    'heatSpeedCap',
    'sprintHeat',
    'antennaReach',
    'refugeSenseRange',
    'hearing',
    'smokeSight',
    // status-effects T2: the cost lanes and the numbers of the body effects, read through `liveOf` and the effect table.
    'sizeEnergyLoss',
    'visionCost',
    'movementCost',
    'turnCost',
    'juvenileBurn',
    // status-effects T3: the feeding effects' numbers.
    'grazeThrust',
    'handlingThrust',
    'handlingTicks',
    'digestTicks',
    'sickThrust',
    'sickDrain',
    'diseaseDrain',
    // status-effects T4: the seen alarm's bite share.
    'alarmBiteShare',
    'biteTakenMultiplier',
    'temperaturePassiveLossFactor',
    'temperatureEfficiencyColdSevere',
    'temperatureEfficiencyColdModerate',
    'temperatureEfficiencyHeatModerate',
    'temperatureEfficiencyHeatSevere',
    // body-genes Phase 5 T40: the combat readers (feeding, bite rule, kill body, defender repel).
    'biteEnergy',
    'biteCost',
    'recoilEnergy',
    'huntSizeRatio',
    'biteArc',
    'strikeMissCost',
    'killShare',
    'killGorgeCap',
    'killGorgeShare',
    'defenderRepelEnergy',
    'defenderRepelCost',
    'defenderRepelImpulse',
    'kickMultiplier',
    'predatorRestTicks',
    // body-genes Phase 5 T41: the reproduction and life-history readers (mating, splits, births, age, territory).
    'juvenileTicks',
    'mateSizeRatio',
    'mateDistanceMax',
    'mateMinEnergy',
    'mateCost',
    'mateRange',
    'childEnergyMin',
    'splitMinEnergy',
    'birthWindowTicks',
    'maxBirthsPerWindow',
    'reproductionCooldown',
    'splitCooldownMultiplier',
    'pregnancyTicks',
    'maturityTicks',
    'maxAgeTicks',
    'birthReserve',
    'splitDeliberateMin',
    'splitDeliberateShareMin',
    'splitMaxPerLife',
    'splitMateScarceTicks',
    'territoryRadius',
    'territoryMax',
    // body-genes Phase 5 T42: the signalling readers (calls, the smoke release, the pheromone deposit, the timers).
    'callRadius',
    'callTicks',
    'alarmCost',
    'huntCallCost',
    'alarmThreshold',
    'huntCallThreshold',
    'smokeCost',
    'smokeRadius',
    'smokeTicks',
    'smokeCooldown',
    'smokeThreshold',
    'pheromoneDeposit',
    // body-genes Phase 5 T43: the energy, sickness, reward and food readers (size, upkeep, the store's satiation, the
    // toxin and disease, the reward trace, the food values and the juvenile plant share, the eat's heat).
    'minSize',
    'huntUpkeep',
    'satiationShare',
    'juvenilePlantShare',
    'sickDose',
    'doseDecay',
    'lethalDose',
    'diseaseTicks',
    'plantFoodValue',
    'meatFoodValue',
    'temperatureGainEat',
    'rewardGain',
    'rewardBase',
    'rewardDecay',
    ...THRESHOLDS,
]);

/** The spec fields that scale a lane that has a key, by the key (one lane, not two). */
const FIELD_OF = {
    maxTurn: 'turnMultiplier',
    movementCost: 'moveCostMultiplier',
    sprintDrain: 'sprintDrainMultiplier',
    passiveLoss: 'passiveLossMultiplier',
    maxEnergy: 'maxEnergyMultiplier',
    biteEnergy: 'biteMultiplier',
    reproductionCooldown: 'cooldownMultiplier',
    splitMinEnergy: 'splitMinEnergyMultiplier',
};

/**
 * Per family: the config keys that are lanes, then the spec fields that are lanes of their own (no key), then the lanes
 * a trait adds (`added`: no key and no field, the name to its base).
 */
/** @type {Record<string, {keys: string, fields: string, added?: Record<string, number>}>} */
const FAMILIES = {
    movement: {
        keys: 'maxThrust maxTurn maxVelocity sprintCost sprintDrain sprintRefill sprintRestThrust sprintFloor handlingThrust grazeThrust fatSlowShare sickThrust predatorRestTicks',
        fields: 'sprintBoost',
    },
    senses: {
        keys: 'antennaAngle antennaReach refugeSenseRange',
        fields: 'visionRange rearVisionShare',
        added: { hearing: 1, smokeSight: 1, nerve: 1 },
    },
    energy: {
        keys: 'handlingTicks maxEnergy passiveLoss movementCost turnCost sizeEnergyLoss visionCost huntUpkeep baseSize minSize energyToSize satiationShare digestTicks juvenileBurn juvenilePlantShare sickDose sickDrain doseDecay lethalDose diseaseDrain diseaseTicks',
        fields: 'plantFoodValue meatFoodValue',
    },
    heat: {
        keys: `temperatureGainMove temperatureGainEat temperatureLossPassive temperaturePassiveLossFactor ${THRESHOLDS.join(' ')} temperatureEfficiencyColdSevere temperatureEfficiencyColdModerate temperatureEfficiencyHeatModerate temperatureEfficiencyHeatSevere heatSpeedCap sprintHeat`,
        fields: '',
    },
    combat: {
        keys: 'biteEnergy biteCost recoilEnergy huntSizeRatio biteArc strikeMissCost killShare killGorgeCap killGorgeShare alarmBiteShare defenderRepelEnergy defenderRepelCost defenderRepelImpulse',
        fields: 'biteTakenMultiplier kickMultiplier',
    },
    life: {
        keys: 'juvenileTicks mateSizeRatio mateDistanceMax mateMinEnergy mateCost mateRange childEnergyShare childEnergyMin splitMinEnergy birthWindowTicks maxBirthsPerWindow reproductionCooldown splitCooldownMultiplier pregnancyTicks maturityTicks maxAgeTicks birthReserve splitDeliberateMin splitDeliberateShareMin splitMaxPerLife splitMateScarceTicks territoryRadius territoryMax',
        fields: '',
    },
    signalling: {
        keys: 'callRadius callTicks alarmCost huntCallCost alarmThreshold huntCallThreshold smokeCost smokeRadius smokeTicks smokeCooldown smokeThreshold pheromoneDeposit',
        fields: '',
    },
    learning: { keys: 'hebbianRate rewardGain rewardBase rewardDecay', fields: '' },
};

/**
 * The body settings that are not lanes, each with its reason: the medium's and the scale's constants, and the flag
 * that stays a flag.
 * @type {Readonly<Record<string, string>>}
 */
export const NOT_LANES = Object.freeze({
    sprintMultiplier: 'the unit of `sprintBoost`',
    temperatureMax: 'the scale of temperature',
    temperatureStart: 'the scale of temperature',
    canHunt: 'a flag, not a number',
});

/** @type {readonly Lane[]} the lanes, family by family, keys first */
export const LANES = Object.freeze(
    Object.entries(FAMILIES).flatMap(([family, { keys, fields, added = {} }]) => [
        ...keys.split(' ').map((key) =>
            Object.freeze({
                name: key,
                family,
                key,
                field: /** @type {Record<string, string>} */ (FIELD_OF)[key] ?? null,
                base: 1,
                kind: THRESHOLDS.includes(key) ? 'offset' : 'ratio',
                moved: MOVED.has(key),
            }),
        ),
        ...fields
            .split(' ')
            .filter((field) => field !== '')
            .map((field) =>
                Object.freeze({
                    name: field,
                    family,
                    key: null,
                    field,
                    base: 1,
                    kind: 'ratio',
                    moved: MOVED.has(field),
                }),
            ),
        ...Object.entries(added).map(([name, base]) =>
            Object.freeze({ name, family, key: null, field: null, base, kind: 'ratio', moved: MOVED.has(name) }),
        ),
    ]),
);

/** The number of lanes. */
export const LANE_COUNT = LANES.length;

/**
 * @param {string} name a lane's name
 * @returns {string} its row name in `world.agentRows`, so a freed slot is zeroed with the rest
 */
export const laneRowName = (name) => `lanes.${name}`;

/** The `body` key that shifts the six thresholds, in degrees. */
export const HEAT_BAND = 'heatBand';

/**
 * @param {readonly Lane[]} lanes a lane list
 * @returns {boolean} whether the heat readers have moved (every threshold lane is moved)
 */
function heatMoved(lanes) {
    const thresholds = lanes.filter((lane) => lane.kind === 'offset');
    return thresholds.length > 0 && thresholds.every((lane) => lane.moved);
}

/**
 * Says what is wrong with one entry of a spec's `body` map.
 * @param {string} name the entry's name
 * @param {unknown} value the entry's value
 * @param {readonly Lane[]} lanes the lane list
 * @returns {string | null} the problem, or null when the entry is valid
 */
function entryProblem(name, value, lanes) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return `a finite number at ${name}`;
    }
    if (name === HEAT_BAND) {
        return heatMoved(lanes)
            ? null
            : `no ${HEAT_BAND} override yet: the temperature readers still read the config keys`;
    }
    const lane = lanes.find((candidate) => candidate.name === name);
    if (lane === undefined) {
        return `a lane name or ${HEAT_BAND} (${name} is neither)`;
    }
    if (lane.kind === 'offset') {
        return `no override of ${name}: shift the thresholds with ${HEAT_BAND}`;
    }
    if (!lane.moved) {
        return `no override of ${name} yet: its sim readers still read the config key`;
    }
    return value >= 0 ? null : `a number at least 0 at ${name}`;
}

/**
 * Says what is wrong with a spec's `body` map: a name that is not a lane (or `heatBand`), an override of a lane whose
 * readers have not moved, a threshold named directly, or a value below 0 (a degree count for
 * `heatBand`).
 * @param {unknown} body the `body` value
 * @param {readonly Lane[]} [lanes] the lane list (a parameter for tests)
 * @returns {string | null} what was expected, or null when the map is valid
 */
export function bodyProblem(body, lanes = LANES) {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        return 'an object from a lane name to a multiplier';
    }
    for (const [name, value] of Object.entries(body)) {
        const problem = entryProblem(name, value, lanes);
        if (problem !== null) {
            return problem;
        }
    }
    return null;
}

/**
 * The largest base of a lane over every spec: a world-level size (an array's stride) reads it, since an array cannot
 * differ by body.
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {string} name a lane's name
 * @returns {number}
 */
export function laneMaxOverSpecs(config, name) {
    return Math.max(...SPEC_NAMES.map((specName) => laneBases(config, specName)[name]));
}

/**
 * Whether a lane is above 0 for some spec's base. Traits only scale a lane by positive ratios, so a lane at 0 for every
 * spec stays 0 in every body: a world-level gate (a feature that exists only when its lane can be on) reads this once.
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {string} name a lane's name
 * @returns {boolean}
 */
export function laneOnForAnySpec(config, name) {
    return SPEC_NAMES.some((specName) => laneBases(config, specName)[name] > 0);
}

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {string} specName a specialisation name
 * @returns {Record<string, number>} every lane's base for that spec: `key x field x body` (a threshold is
 *   `key + body.heatBand`), a key or field a lane lacks counting as 1
 */
export function laneBases(config, specName) {
    const entry = config.specialisations[specName];
    const body = entry.body;
    /** @type {Record<string, number>} */
    const bases = {};
    for (const lane of LANES) {
        if (lane.kind === 'offset') {
            bases[lane.name] = config[/** @type {string} */ (lane.key)] + (body[HEAT_BAND] ?? 0);
        } else {
            const key = lane.key === null ? 1 : config[lane.key];
            const field = lane.field === null ? 1 : entry[lane.field];
            bases[lane.name] = key * field * lane.base * (body[lane.name] ?? 1);
        }
    }
    return bases;
}

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @returns {Float64Array} every spec's lane bases, `LANE_COUNT` per spec in `LANES` order, specs in index order
 */
export function laneTable(config) {
    const table = new Float64Array(SPEC_COUNT * LANE_COUNT);
    SPEC_NAMES.forEach((specName, spec) => {
        const bases = laneBases(config, specName);
        LANES.forEach((lane, i) => {
            table[spec * LANE_COUNT + i] = bases[lane.name];
        });
    });
    return table;
}
