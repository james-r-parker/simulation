// The Phase 3 feature keys: the off values the frozen bench world pins, and the switch-on values the tracked
// `defaults` bench row and `alloc-check` run with (world-balance T40; T41 makes the on values the defaults).
import { FEATURE_RULES } from '../../js/sim/config-rules.js';

/**
 * The off value of every `FEATURE_RULES` key, plus `obstacleCount` and `hashCellSize`, which the switch-on retunes.
 * @type {Readonly<Record<string, any>>}
 */
export const FEATURES_OFF = Object.freeze({
    birthWindowTicks: 3000,
    carcassShare: 0.5,
    carcassTicks: 300,
    carcassesEnabled: false,
    coldMarginWidth: 600,
    digestTicks: 0,
    droughtChance: 0.25,
    eraSeasonTicks: 36000,
    erasEnabled: false,
    floorRescueAtZero: false,
    foodAreaCapacity: false,
    foodBackgroundShare: 0.2,
    foodPatchCapacity: 1,
    foodPatchCount: 0,
    foodPatchDepletion: 0.02,
    foodPatchRadius: 400,
    foodPatchRegrow: 0.0005,
    foodRegrowPerArea: 0.06,
    handlingThrust: 0.2,
    handlingTicks: 0,
    hashCellSize: 128,
    hebbianRate: 0,
    huntUpkeep: 0.002,
    invasionInterval: 180000,
    invasionSize: 12,
    leakEnabled: false,
    mateDistanceMax: Infinity,
    maxBirthsPerWindow: 0,
    obstacleCount: 25,
    refugeCount: 4,
    refugeSizeMax: 30,
    satiationShare: 0,
    sexesEnabled: false,
    specMutationRate: 0,
    splitCost: 50,
    terrainLayout: 'open',
    traitsEnabled: false,
    visionCost: 0.5,
    wallGapWidth: 300,
    wallGaps: 3,
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
    handlingTicks: 20,
    carcassesEnabled: true,
    terrainLayout: 'basins',
    obstacleCount: 0,
    specMutationRate: 0.002,
    foodPatchCount: 16,
    foodAreaCapacity: true,
    erasEnabled: true,
    leakEnabled: true,
    hebbianRate: 0.0001, // the 0.01 in the design doc pinned the 4-seed screen (world-balance T59) at the floor; 0.0001 escapes it
    traitsEnabled: true,
    sexesEnabled: true,
    maxBirthsPerWindow: 3,
    mateDistanceMax: 0.8,
    hashCellSize: 140,
});

/** @returns {string[]} the `FEATURE_RULES` keys missing from `FEATURES_OFF` (a new feature key not yet pinned) */
export function unpinnedFeatureKeys() {
    return Object.keys(FEATURE_RULES).filter((key) => !(key in FEATURES_OFF));
}
