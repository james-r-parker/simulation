// The Phase 3 feature keys: the off values the frozen bench world pins, and the switch-on values the tracked
// `defaults` bench row and `alloc-check` run with (world-balance T40; T41 makes the on values the defaults).
import { FEATURE_RULES } from '../../js/sim/config-rules.js';

/**
 * The off value of every `FEATURE_RULES` key, plus `obstacleCount` and `hashCellSize`, which the switch-on retunes, and
 * the predator's `plantFoodValue` (1 before T41), so the frozen bench world keeps predators eating plants.
 * @type {Readonly<Record<string, any>>}
 */
export const FEATURES_OFF = Object.freeze({
    alarmThreshold: 0,
    birthWindowTicks: 3000,
    capBirthsEnabled: false,
    carcassShare: 0.5,
    carcassTicks: 300,
    coldMarginWidth: 0,
    digestTicks: 0,
    droughtChance: 0.25,
    eraSeasonTicks: 36000,
    floorRescueAtZero: false,
    predatorKillEnergy: 0,
    predatorRescueInterval: 600,
    predatorRescueMin: 0,
    foodBackgroundShare: 0.2,
    foodPatchCapacity: 1,
    foodPatchCount: 0,
    foodPatchDepletion: 0.02,
    foodPatchRadius: 400,
    foodPatchRegrow: 0.0005,
    foodRegrowPerArea: 0.06,
    handlingThrust: 0.2,
    handlingTicks: 0,
    hebbianRate: 0,
    huntCallThreshold: 0,
    huntUpkeep: 0.002,
    invasionInterval: 180000,
    invasionSize: 12,
    mateDistanceMax: Infinity,
    maxBirthsPerWindow: 0,
    meritBirthBoost: 0,
    meritChanceWeight: 0.25,
    meritChildBonus: 300,
    meritEscapeBonus: 60,
    meritHalf: 1000,
    meritHalfLife: 20000,
    meritMateBonus: 150,
    meritMateWeight: 0,
    meritSplitFloorPop: 80,
    splitDeliberateShareMin: 0,
    temperatureGainEat: 2,
    splitMaxPerLife: 0,
    mateRange: 100,
    reproductionCooldown: 300,
    childEnergyMin: 200,
    refugeCount: 0,
    refugeSizeMax: 30,
    satiationShare: 0,
    specialisations: { predator: { plantFoodValue: 1, passiveLossMultiplier: 1, splitMinEnergyMultiplier: 1 } },
    specMutationRate: 0,
    splitCapMargin: 50,
    splitDeliberateMin: 0,
    visionCost: 0.5,
    wallGapWidth: 300,
    wallGaps: 1,
    winterRegrow: 0.2,
});

/**
 * FEATURES_OFF with every feature at its switch-on value from the world-balance design doc.
 * @type {Readonly<Record<string, any>>}
 */
export const FEATURES_ON = Object.freeze({
    ...FEATURES_OFF,
    satiationShare: 0.95,
    digestTicks: 10,
    wallGaps: 3,
    refugeCount: 4,
    coldMarginWidth: 600,
    handlingTicks: 20,
    specMutationRate: 0.002,
    // The tuned defaults of fitness-and-selection T15d (the same values as config-defaults.js).
    predatorKillEnergy: 150,
    huntSizeRatio: 0.8,
    biteArc: 1.571,
    huntCallCost: 10,
    specialisations: {
        predator: { plantFoodValue: 0, passiveLossMultiplier: 0.6, splitMinEnergyMultiplier: 0.6, biteMultiplier: 8 },
    },
    foodPatchCount: 16,
    hebbianRate: 0.0001, // the 0.01 in the design doc pinned the 4-seed screen (world-balance T59) at the floor; 0.0001 escapes it
    maxBirthsPerWindow: 5,
    capBirthsEnabled: true,
    mateDistanceMax: 1.0,
    mateRange: 200,
    reproductionCooldown: 150,
    childEnergyMin: 100,
    hashCellSize: 140,
    predatorRescueMin: 3,
    predatorRescueInterval: 450,
    alarmThreshold: 0.65,
    huntCallThreshold: 0.65,
    // The merit keys (fitness-and-selection T16); T48b adopts the E41 finalist split-300: merit on, split gate at 300.
    meritChanceWeight: 0.25,
    meritMateBonus: 150,
    meritChildBonus: 300,
    meritEscapeBonus: 60,
    meritHalfLife: 20000,
    meritHalf: 1000,
    meritMateWeight: 0,
    meritBirthBoost: 0,
    splitDeliberateMin: 300,
    splitDeliberateShareMin: 0.2,
    temperatureGainEat: 1.5,
    meritSplitFloorPop: 80,
});

/** @returns {string[]} the `FEATURE_RULES` keys missing from `FEATURES_OFF` (a new feature key not yet pinned) */
export function unpinnedFeatureKeys() {
    return Object.keys(FEATURE_RULES).filter((key) => !(key in FEATURES_OFF));
}
