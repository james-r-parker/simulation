// The default simulation config: every tunable with its legacy source constant named in a trailing comment.

import { DISEASE_DEFAULTS } from './config-disease.js';
import { FLORA_DEFAULTS } from './config-flora.js';
import { HERD_DEFAULTS } from './config-herds.js';
import { SPECIALISATION_DEFAULTS } from './config-spec-rules.js';

/**
 * Freezes an object tree in place.
 * @param {object} value the object or array to freeze
 * @returns {object} `value`
 */
function deepFreeze(value) {
    for (const child of Object.values(value)) {
        if (child !== null && typeof child === 'object') {
            deepFreeze(child);
        }
    }
    return Object.freeze(value);
}

/** @type {Readonly<Record<string, any>>} */
export const DEFAULTS = deepFreeze({
    flora: FLORA_DEFAULTS,
    ...HERD_DEFAULTS,
    ...DISEASE_DEFAULTS,
    floraPatchMax: 32,
    patchDieTicks: 36000,
    seedBankTicks: 432000,
    sproutRate: 0.000005,
    seedStock: 0.3,
    floraMutation: 0.08,
    pollenTicks: 3000,
    seedCooldownTicks: 6000,
    seedRadiusScale: 1.5,
    myceliumLife: 144000,
    myceliumMax: 200,
    myceliumRadius: 150,
    toxinDose: 1.2,
    toxinCost: 1.2,
    sickDose: 0.3,
    sickThrust: 0.4,
    sickDrain: 0.02,
    doseDecay: 0.0008,
    lethalDose: 1,
    seed: 1, // new
    worldWidth: 14400, // WORLD_WIDTH
    worldHeight: 8100, // WORLD_HEIGHT
    maxAgents: 500, // new
    initialAgents: 100, // new
    minAgents: 40, // the restart size: the floor guard refills the world to this
    floorTrigger: 8, // the floor guard acts only when fewer than this many are alive (natural-selection T3); 0 turns it off
    maxFood: 3600, // E112 (was 2400, E95; 1600, E20; legacy FOOD_SPAWN_CAP 800): room for the short-lived caps
    initialFood: 300, // new
    foodSpawnRate: 0.02, // FOOD_SPAWN_RATE
    foodEnergy: 100, // FOOD_ENERGY_NORMAL_BASE, raised for the reachable-births economy
    foodRadius: 20, // FOOD_SIZE_NORMAL
    obstacleDamage: 50, // OBSTACLE_COLLISION_PENALTY
    wallDamage: 50, // WALL_COLLISION_DAMAGE
    rayCount: 16, // new
    brainHidden: 32, // new
    maxThrust: 0.7, // MAX_THRUST
    maxTurn: 0.2, // MAX_ROTATION
    maxVelocity: 8, // MAX_VELOCITY
    damping: 0.95, // DAMPENING_FACTOR
    sprintMultiplier: 0.5, // SPRINT_BONUS_MULTIPLIER
    sprintCost: 0.05, // SPRINT_COST_PER_FRAME
    sprintStoreEnabled: false, // fair-chase Phase 1: a sprint spends a per-agent store (js/sim/sprint-store.js); off until Phase 3 adopts or T8a deletes it
    sprintDrain: 0.01, // fair-chase: store drained a tick while SPRINT is above 0, times the spec's sprintDrainMultiplier (100 ticks from full)
    sprintRefill: 0.002, // fair-chase: store refilled a tick while SPRINT is at or under 0 and THRUST under sprintRestThrust
    sprintRestThrust: 0.2, // fair-chase: the THRUST output under which a body rests and its store refills
    sprintFloor: 0.3, // fair-chase: under this store the sprint's factor falls linearly to 0 at an empty store
    initialEnergy: 800, // INITIAL_AGENT_ENERGY
    entrantEnergy: 200, // natural-selection T4: a floor or immigrant seeder entrant starts poor; 0 means initialEnergy
    maxEnergy: 2000, // natural-selection economy (was MAX_ENERGY 25000): a small store, so a mother has little to lose to a winter before she is dead
    passiveLoss: 0.06, // PASSIVE_LOSS
    movementCost: 0.015, // MOVEMENT_COST_MULTIPLIER x 0.5
    turnCost: 0.1, // ROTATION_COST_MULTIPLIER
    sizeEnergyLoss: 0.00025, // AGENT_SIZE_ENERGY_LOSS_MULTIPLIER
    baseSize: 25, // BASE_SIZE
    minSize: 20, // MIN_AGENT_SIZE
    energyToSize: 250, // ENERGY_TO_SIZE_RATIO
    biteEnergy: 5, // BITE_SIZE
    biteCost: 8, // natural-selection T5a: the biter's kick per landed bite; 8 keeps a typical kick near a sixth of a 40-energy bite; the survival screen (E67) found the cost is not the predator lever and kept 8
    recoilEnergy: 20, // natural-selection T5b: a hunter that lunges at kin or something too big loses this once a tick (half of a 40-energy bite)
    huntSizeRatio: 0.8, // tuned, fitness-and-selection T15d (was 1.01, tuned E20 and jaws; legacy PREDATOR_SIZE_RATIO_THRESHOLD 1.1)
    mateSizeRatio: 1.3, // new: the widest size ratio between two mates, apart from the hunt ratio (B14)
    mateDistanceMax: 1.0, // new: mates must be genetically closer than this; Infinity is off (T36, 0.8 from T41, 1.0 from T78)
    mateMinEnergy: 200, // MIN_ENERGY_TO_REPRODUCE
    mateCost: 15, // REPRODUCE_COST_BASE
    mateRange: 200, // new: the largest edge-to-edge gap between two mates (100 before T78)
    childEnergyShare: 0.5, // new: the share of its energy a mother gives a child
    childEnergyMin: 100, // new: the smallest gift a mating birth may make (200 before T78)
    splitMinEnergy: 900, // MIN_ENERGY_FOR_SPLITTING, lowered to 900
    birthWindowTicks: 3000, // new: the span the birth budget counts a mother's births over (world-balance T47)
    maxBirthsPerWindow: 5, // new: births (mating or splitting) a mother may have per span; 0 is off, 5 from T78 (3 from T41)
    capBirthsEnabled: true, // new: at maxAgents a due pregnancy waits and retries, and splits stop splitCapMargin short (world-balance T68)
    splitCapMargin: 50, // new: slots below maxAgents kept for pregnancies when capBirthsEnabled is on
    maxAgeTicks: 72000, // natural-selection: two seasons of life, twice eraSeasonTicks (was 36000)
    reproductionCooldown: 150, // REPRODUCTION_COOLDOWN_FRAMES (300 before T78)
    pregnancyTicks: 480, // PREGNANCY_DURATION_FRAMES
    maturityTicks: 600, // MATURATION_AGE_FRAMES
    seasons: [
        { energyDrain: 1.0, temperatureModifier: -5 }, // spring, SEASON_*
        { energyDrain: 1.3, temperatureModifier: 15 }, // summer, SEASON_*
        { energyDrain: 1.1, temperatureModifier: 5 }, // autumn, SEASON_*
        { energyDrain: 1.8, temperatureModifier: -15 }, // winter, SEASON_*
    ],
    fertileZoneMax: 100, // FERTILE_ZONE_MAX_COUNT
    fertileZoneSpawnChance: 0.4, // FERTILE_ZONE_SPAWN_CHANCE
    fertileZoneDecay: 0.001, // FERTILE_ZONE_DECAY_RATE
    pheromoneCellSize: 100, // new
    pheromoneDecay: 0.00167, // PHEROMONE_FADE_RATE
    pheromoneDiffusion: 0.05, // new
    pheromoneDeposit: 1, // new
    pheromoneMax: 5, // new
    hashCellSize: 140, // new
    maxContacts: 2000, // new
    eventCapacity: 8192, // megafauna: includes five events per herd animal and two per herd
    specialisations: SPECIALISATION_DEFAULTS,
    checkInvariants: false, // new
    restitution: 0.5, // new
    splitCooldownMultiplier: 1.5, // new
    fertileZoneRadius: 150, // new
    fertileZoneFertility: 0.05, // FERTILE_ZONE_FERTILITY_FACTOR
    placementTries: 100, // new
    temperatureMax: 100, // TEMPERATURE_MAX
    temperatureStart: 50, // TEMPERATURE_START
    temperatureGainMove: 0.01, // TEMPERATURE_GAIN_MOVE (tuned, E17)
    temperatureGainEat: 1.5, // TEMPERATURE_GAIN_EAT (2 before T48g)
    satiationShare: 0.95, // new: at or above this share of maxEnergy an agent cannot eat; 0 is off (world-balance T49, on from T41)
    digestTicks: 10, // new: ticks after a meal before the next; 0 is off, at most TIMER_CAP (T49)
    handlingTicks: 20, // new: ticks after a meal at reduced thrust; 0 is off, at most TIMER_CAP (T50)
    specMutationRate: 0.02, // new: chance a child takes another specialisation; above 0 also turns on huntUpkeep and the random-elite floor and seeder rule (T51)
    huntUpkeep: 0.002, // new: energy per tick a canHunt agent pays, only while specMutationRate is above 0 (T51)
    handlingThrust: 0.2, // new: thrust multiplier while handling a meal (T50)
    grazeThrust: 0.6, // eat-choice G1b (E171, E172): thrust multiplier while a non-hunter holds BITE above 0; 1 is off
    fatSlowShare: 0.5, // eat-choice G2: a full store slows thrust and turn by this share; 0 is off
    strikeMissCost: 1, // eat-choice G4: energy a hunter loses on a tick it holds BITE with no body in its jaws; 0 is off
    carcassFadeTicks: 1500, // honest-budgets E175: ticks a blob carcass takes to fade linearly to 0; a herd carcass keeps its own life
    killShare: 0.25, // honest-budgets E175 (was 0): a bite is fatal at or under this share of the victim's maximum energy; 0 is a kill at an empty store
    killGorgeCap: 2000, // honest-budgets E175: the most energy a killer takes from the body it just killed (read only above killShare 0)
    killGorgeShare: 0.4, // honest-budgets Phase 6 (E179): the most share of the victim's remaining energy a killer takes; the rest stays as a carcass; 1 is cap-only
    impactDamage: 0, // honest-budgets Phase 3: energy per unit of speed above impactDeadband that a wall or rock impact costs; 0 is off
    impactDeadband: 2, // honest-budgets Phase 3: the speed into a wall or rock an impact is free up to (read only above impactDamage 0)
    carcassShare: 0.8, // new: share of an agent's energy at death that its carcass holds (T54)
    wallGaps: 3, // new: gaps in the wall, basins only (T52)
    wallGapWidth: 200, // new: width of each wall gap in px (T52; 200 since the big bang, from 300)
    refugeCount: 8, // new: refuges of rocks that only agents below refugeSizeMax fit into (T52; 8 since the big bang, from 4)
    refugeCluster: 2, // new: refuge rings per group; a group shares a band and sits in a row (natural-selection.md T10f)
    refugeSizeMax: 30, // new: the largest agent radius that fits a refuge's gaps (T52)
    refugeSenseRange: 2500, // new: px over which refugeNear falls from 1 at the ring edge to 0 (refuge.md T24)
    coldMarginWidth: 600, // new: width of the cold bands along the north and south edges, where passive loss doubles (T52)
    temperatureLossPassive: 0.0075, // TEMPERATURE_LOSS_PASSIVE
    temperatureSeasonSlope: 0.03, // new: scales SEASON_*_TEMP_MODIFIER
    temperaturePassiveLossFactor: 2, // TEMPERATURE_PASSIVE_LOSS_FACTOR (tuned, E17)
    temperatureColdStress: 30, // TEMPERATURE_COLD_STRESS_THRESHOLD
    temperatureColdModerate: 40, // TEMPERATURE_COLD_MODERATE_THRESHOLD
    temperatureOptimalMin: 40, // TEMPERATURE_OPTIMAL_MIN
    temperatureOptimalMax: 65, // TEMPERATURE_OPTIMAL_MAX
    temperatureHeatModerate: 70, // TEMPERATURE_HEAT_MODERATE_THRESHOLD
    temperatureHeatStress: 85, // TEMPERATURE_HEAT_STRESS_THRESHOLD
    temperatureEfficiencyColdSevere: 0.3, // TEMPERATURE_EFFICIENCY_COLD_SEVERE
    temperatureEfficiencyColdModerate: 0.7, // TEMPERATURE_EFFICIENCY_COLD_MODERATE
    temperatureEfficiencyHeatModerate: 0.9, // TEMPERATURE_EFFICIENCY_HEAT_MODERATE (tuned, E17)
    temperatureEfficiencyHeatSevere: 0.6, // TEMPERATURE_EFFICIENCY_HEAT_SEVERE (tuned, E17)
    biteArc: 1.571, // tuned, fitness-and-selection T15d (was Math.PI / 4; half-angle of the forward bite arc, radians)
    antennaAngle: 0.8, // new: radians either side of the heading
    antennaReach: 150, // new: 1.5 pheromone cells
    callRadius: 300, // SHOUT_BASE_RANGE (200)
    callTicks: 60, // SHOUT_DURATION_FRAMES
    alarmCost: 5, // natural-selection: a call is not free (was 0.5, tuned E20)
    huntCallCost: 10, // tuned, fitness-and-selection T15d (was 0.5, tuned E20)
    smokeCost: 20, // new
    smokeRadius: 80, // new
    smokeTicks: 180, // new
    smokeCooldown: 600, // new
    smokeThreshold: 0.8, // new: the smoke output must exceed it
    packWindow: 120, // new: ticks between two biters for a shared kill
    maxClouds: 32, // new
    alarmThreshold: 0.65, // tuned, fitness-and-selection T15d (the alarm output must exceed it, T15m)
    huntCallThreshold: 0.65, // tuned, fitness-and-selection T15d (the hunt output must exceed it, T15m)
    foodPatchCount: 16, // new: permanent food patches; 0 is off (world-balance T34, 16 from T41)
    foodPatchRadius: 400, // new
    foodPatchCapacity: 83000, // honest-budgets E174 (was 1): the largest stock of a patch, in energy; its items reserve it and a meal spends it
    foodPatchRegrow: 0.0005, // new: logistic regrowth rate per tick
    foodBackgroundShare: 0.02, // honest-budgets E174 (was 0.2): the share of food spawns that ignore the patches
    foodRegrowPerArea: 0.09, // E95 (was 0.06): items per tick per 1,000,000 px2 of world, through the patches
    eraSeasonTicks: 36000, // new: ticks per season (a year is 4 x this)
    winterRegrow: 0.2, // new: patch regrowth multiplier in winter (summer is 1.5)
    droughtChance: 0.25, // new: chance per year that one basin's patches stop regrowing for the summer
    visionCost: 0.5, // new: extra passive loss per unit of vision trait above 1, as a share of passiveLoss
    hebbianRate: 0.0001, // new: lifetime learning rate of the hidden-to-output block; 0 is off (world-balance T32, 0.0001 from T41)
    mutationRate: 'invsqrt', // brain plan big bang (H1): a probability per gene, a number, 'invsqrt' (1 / sqrt(weightCount), about 67 genes per birth) or 'genes:<k>'; 1 mutates every gene
    unitKnockoutRate: 0, // unit-knockout Phase 1: probability per mutated birth of knocking out one hidden unit (off by default)
    weightDecay: 0.005, // brain plan big bang (H2): per birth shrink of the wIn rows of silent inputs (the world's input-activity mask); 0 is off
    instinctWeight: 1, // brain plan big bang, survival screen (instinct): the innate reflex prior of a random genome (js/evo/instinct.js), as a newborn animal has reflexes before it learns; 0 is random genomes
    traitMutationSigma: 0.1, // body-genes T33: the step of a trait gene's mutation (the constant TRAIT_SIGMA before)
    traitGeneClamp: 3, // body-genes T33: a trait gene is clamped to plus or minus this after mutation; tanh(3) is 0.995, so a gene cannot drift into the flat part of the curve
    sizeTurn: 0, // body-genes T13: the size trait's cost, the turn rate x r^-sizeTurn; 0 is off
    speedHeat: 0, // body-genes T13: the speed trait's cost, the heat gain of movement x r^speedHeat; 0 is off
    heatSpeedCap: 1, // body-genes T13: the cap on speed / maxVelocity in the heat gain of movement (a lane); 1 is today, where a body over the cruise cap warms no faster
    sprintHeat: 0, // body-genes T13: heat added per sprinting tick at sprint-store ratio 1 (a lane), times the sprint delivered; 0 is off
    sprintStoreHeat: 0, // body-genes T13: the sprint-store trait's cost, sprintHeat x r^sprintStoreHeat; 0 is off
    fatSlow: 0, // body-genes T13: the fat trait's cost, fatSlowShare x r^fatSlow; 0 is off
    burnThrust: 0, // body-genes T13: the burn trait's cost, thrust x r^burnThrust (a body that burns less has less power); 0 is off
    leakGeneStart: 0, // brain plan big bang (H3): a random genome's leak genes; 0 gives a 0.5 (memory from generation 0), was 3 (0.955)
    leakMin: 0.02, // brain plan big bang (H7): the smallest leak rate (a half-life of 34 ticks, was 0.05 and 13.5); a unit with a very negative leak gene still moves 2% toward its target per tick
    meritMateBonus: 150, // new: fitness-and-selection T16 (merit, off)
    meritChildBonus: 300, // new: fitness-and-selection T16 (merit, off)
    meritEscapeBonus: 60, // new: fitness-and-selection T16 (merit, off)
    meritHalfLife: 20000, // new: fitness-and-selection T16 (merit, off)
    meritHalf: 1000, // new: fitness-and-selection T16 (merit, off)
    mateRank: 'rank', // natural-selection T8: a male's within-specialisation percentile, by deliberate kills (hunters) or deliberate meal share; 'offspring' ranks by matured children
    meritBirthBoost: 0, // new: fitness-and-selection T16 (merit, off)
    splitDeliberateMin: 300, // new: fitness-and-selection T16; 300 from T48b (the E41 finalist split-300)
    splitDeliberateShareMin: 0.2, // new: fitness-and-selection T48d; own deliberate meals over meals needed to split, 0 is off; 0.2 from T48g
    splitMaxPerLife: 0, // new: fitness-and-selection T48d; splits per lifetime, 0 is unlimited
    alarmBiteShare: 1, // honest-budgets Phase 5: the share of a bite's energy that moves while the victim's alarm is seen (a threat was on its rays at the call); 1 is the full bite
    birthReserve: 300, // honest-budgets Phase 4 (E177): a birth that would leave the mother under this energy is blocked; 0 is off
    juvenileBurn: 0.6, // realistic-keepers T4: multiplier on the standing, movement and turn cost of a juvenile hunter, in [0, 1]
    kinPullWeight: 0.5, // realistic-keepers T4: the kin thrust and turn cells of a hunter are raised to at least this x instinctWeight, in [0, 4]
    juvenileTicks: 3000, // hunter-learning: a canHunt young is juvenile while ageTicks is below this; the detectors' age bands use it too
    juvenilePlantShare: 0, // honest-budgets Phase 6: plant food share a canHunt agent takes while ageTicks is below juvenileTicks; 0 is off
    specFlipNoHunt: false, // honest-budgets Phase 6: when true, specMutationRate flips never cross canHunt (forager hidden weights never seed a hunter)
    territoryRadius: 600, // hunter-learning: the territory radius in world units
    territoryMax: 1, // hunter-learning: other mature hunters a breeding hunter tolerates in its territory
    predatorRestTicks: 60, // realistic-keepers T2, adopted at T22: ticks a hunter's thrust is forced to 0 after its bite kills; 0 is off
    rewardGain: 4, // realistic-keepers T5: gain of the trace on the Hebbian rate
    rewardBase: 0.25, // realistic-keepers T5: share of the plain rate that applies with no reward
    rewardDecay: 0.02, // realistic-keepers T5: per-tick decay of the trace
    splitMateScarceTicks: 600, // natural-selection Phase 4: ticks without a possible mate in view before an agent may split (sharks, Komodo dragons); 0 is no wait
    defenderRepelEnergy: 0, // prey-guilds Phase 2: energy a defender's active repel drains from a canHunt target in jaws; 0 is off
    defenderRepelCost: 0, // prey-guilds Phase 2: energy a defender pays when landing an active repel
    defenderRepelImpulse: 0, // prey-guilds Phase 2: knockback velocity added to the repelled hunter along the defender-to-hunter vector
    scoutCallRadiusMultiplier: 1, // prey-guilds Phase 3: multiplier on `callRadius` when a scout (spec 3) calls alarm; 1 is off
    scoutAlarmCostMultiplier: 1, // prey-guilds Phase 3: multiplier on `alarmCost` when a scout (spec 3) calls alarm; 1 is off
    coldStackRate: 0, // status-effects T9: the standing cost `chilled` adds a stack (passiveLoss x (1 + rate x stacks)); 0 is off
    coldStackTicks: 60, // status-effects T9: ticks under `temperatureOptimalMin` that add one `chilled` stack
    coldRecoverTicks: 15, // status-effects T9: ticks at or above `temperatureOptimalMin` that take one `chilled` stack off
    woundThrust: 0, // status-effects T9: the thrust a `wounded` stack takes off (maxThrust x (1 - woundThrust x stacks)); 0 is off
    woundTicks: 300, // status-effects T9: ticks a `wounded` stack lasts
    panicThrust: 0, // status-effects T9: the thrust and sprint boost a `panicked` stack adds, times the body's nerve; 0 is off
    panicBurn: 0, // status-effects T9: the passive cost and heat gain a `panicked` stack adds, times the body's nerve; 0 is off
    panicTicks: 60, // status-effects T9: ticks a `panicked` body is panicked (it is `shaken` when this ends)
    shakenThrust: 0, // status-effects T9: the thrust a `shaken` body loses after a panic; 0 is off
    shakenTicks: 120, // status-effects T9: ticks a body is `shaken`, times its nerve
    hearThreshold: 0.1, // status-effects T10: the loudness at or above which a heard call raises an effect (`rallied`, `alert`); role-budget.md reads it too
    rallyThrust: 0, // status-effects T10: the thrust and sprint boost a `rallied` stack adds, times the body's nerve; 0 is off
    rallyBurn: 0, // status-effects T10: the passive cost and heat gain a `rallied` stack adds, times the body's nerve; 0 is off
    rallyTicks: 120, // status-effects T10: ticks a `rallied` stack lasts, and how recent the caller's bite must be for an `answered` kill
    answeredBite: 0, // status-effects T10: the bite energy an `answered` stack adds (biteEnergy x (1 + answeredBite x stacks)); 0 is off
    answeredTicks: 120, // status-effects T10: ticks an `answered` stack lasts
    hoarseCost: 0, // status-effects T10: the rise in alarm and hunt call cost a `hoarse` stack adds; 0 is off
    hoarseTicks: 60, // status-effects T10: ticks a `hoarse` stack lasts
});
