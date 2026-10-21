// The Phase 3 feature keys: the off values the frozen bench world pins, and the switch-on values the tracked
// `defaults` bench row and `alloc-check` run with (world-balance T40; T41 makes the on values the defaults).
import { FEATURE_RULES } from '../../js/sim/config-rules.js';

/** The off value of every `FEATURE_RULES` key, plus `obstacleCount` and `hashCellSize`, which the switch-on retunes. */
export const FEATURES_OFF = Object.freeze({
    satiationShare: 0,
    digestTicks: 0,
    handlingTicks: 0,
    handlingThrust: 0.2,
    carcassesEnabled: false,
    carcassTicks: 300,
    carcassShare: 0.5,
    terrainLayout: 'open',
    wallGaps: 3,
    wallGapWidth: 300,
    refugeCount: 4,
    refugeSizeMax: 30,
    coldMarginWidth: 600,
    specMutationRate: 0,
    huntUpkeep: 0.002,
    floorRescueAtZero: false,
    foodPatchCount: 0,
    foodPatchRadius: 400,
    foodPatchCapacity: 1,
    foodPatchDepletion: 0.02,
    foodPatchRegrow: 0.0005,
    foodBackgroundShare: 0.2,
    foodAreaCapacity: false,
    foodRegrowPerArea: 0.06,
    erasEnabled: false,
    eraSeasonTicks: 36000,
    winterRegrow: 0.2,
    droughtChance: 0.25,
    invasionInterval: 180000,
    invasionSize: 12,
    leakEnabled: false,
    hebbianRate: 0,
    traitsEnabled: false,
    visionCost: 0.5,
    sexesEnabled: false,
    splitCost: 50,
    birthWindowTicks: 3000,
    maxBirthsPerWindow: 0,
    mateDistanceMax: Infinity,
    obstacleCount: 25,
    hashCellSize: 128,
});

/** FEATURES_OFF with every feature at its switch-on value from the world-balance design doc. */
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
    hebbianRate: 0.01,
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
