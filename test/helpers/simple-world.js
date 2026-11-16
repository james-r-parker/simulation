/**
 * The knobs a unit-test world switches off so that one rule can be seen alone, over the defaults: no meal limits
 * (satiation, digestion, handling), no predator rescue, call thresholds, kill line above an empty store, hunt economy or specialisation drift, no food
 * patches, no mate distance limit, no birth budget or cap, an old-style mating range and cooldown, no merit split gate, shark wait or birth reserve on splits,
 * no learning, no eat choice (grazing, fat and strike costs), and a terrain of one wall gap without refuges or a cold margin. A test spreads it first and sets only
 * the keys it is about.
 * @type {Readonly<Record<string, any>>}
 */
export const SIMPLE_WORLD = Object.freeze({
    alarmThreshold: 0,
    capBirthsEnabled: false,
    childEnergyMin: 200,
    coldMarginWidth: 0,
    digestTicks: 0,
    fatSlowShare: 0,
    foodPatchCount: 0,
    grazeThrust: 1,
    handlingTicks: 0,
    hebbianRate: 0,
    huntCallThreshold: 0,
    killShare: 0,
    mateDistanceMax: Infinity,
    mateRange: 100,
    maxBirthsPerWindow: 0,
    refugeCount: 0,
    herdCount: 0,
    reproductionCooldown: 300,
    satiationShare: 0,
    specMutationRate: 0,
    splitMateScarceTicks: 0,
    birthReserve: 0,
    strikeMissCost: 0,
    instinctWeight: 0,
    specialisations: {
        predator: {
            plantFoodValue: 1,
            passiveLossMultiplier: 1,
            splitMinEnergyMultiplier: 1,
            maxEnergyMultiplier: 1,
            biteMultiplier: 8,
        },
    },
    splitDeliberateMin: 0,
    splitDeliberateShareMin: 0,
    temperatureGainEat: 2,
    wallGaps: 1,
});
