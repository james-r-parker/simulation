// The default simulation config: every tunable with its legacy source constant named in a trailing comment.

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
    seed: 1, // new
    worldWidth: 14400, // WORLD_WIDTH
    worldHeight: 8100, // WORLD_HEIGHT
    maxAgents: 500, // new
    initialAgents: 100, // new
    minAgents: 40, // the restart size: the floor guard refills the world to this
    floorTrigger: 8, // the floor guard acts only when fewer than this many are alive (natural-selection T3); 0 turns it off
    maxFood: 1600, // tuned, E20 (legacy FOOD_SPAWN_CAP 800)
    initialFood: 300, // new
    foodSpawnRate: 0.02, // FOOD_SPAWN_RATE
    foodEnergy: 100, // FOOD_ENERGY_NORMAL_BASE, raised for the reachable-births economy
    foodEnergyVariance: 20, // FOOD_ENERGY_NORMAL_VARIANCE
    highFoodChance: 0.1, // HIGH_VALUE_FOOD_CHANCE
    highFoodEnergy: 140, // FOOD_ENERGY_HIGH_BASE
    highFoodEnergyVariance: 50, // FOOD_ENERGY_HIGH_VARIANCE
    foodRadius: 20, // FOOD_SIZE_NORMAL
    highFoodRadius: 30, // FOOD_SIZE_HIGH
    foodMaxAge: 10000, // FOOD_MAX_AGE_BASE
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
    biteCost: 8, // natural-selection T5a: the biter's kick per landed bite; 8 keeps a typical kick near a sixth of a 40-energy bite, stage 6's survival screen tunes it
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
        { foodScarcity: 1.2, energyDrain: 1.0, reproductionBonus: 1.5, temperatureModifier: -5 }, // spring, SEASON_*
        { foodScarcity: 1.0, energyDrain: 1.3, reproductionBonus: 1.2, temperatureModifier: 15 }, // summer, SEASON_*
        { foodScarcity: 0.8, energyDrain: 1.1, reproductionBonus: 0.7, temperatureModifier: 5 }, // autumn, SEASON_*
        { foodScarcity: 0.4, energyDrain: 1.8, reproductionBonus: 0.3, temperatureModifier: -15 }, // winter, SEASON_*
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
    eventCapacity: 4096, // new
    specialisations: {
        // AGENT_CONFIGS maxRayDist; modifiers: SCOUT_ENERGY_COST_MULTIPLIER, DEFENDER_DAMAGE_REDUCTION, new
        forager: {
            index: 0,
            visionRange: 300,
            canHunt: false,
            moveCostMultiplier: 1,
            biteTakenMultiplier: 1,
            cooldownMultiplier: 1,
            biteMultiplier: 1,
            turnMultiplier: 1,
            plantFoodValue: 1, // new: share of a food item's energy this specialisation gains (world-balance.md T45)
            meatFoodValue: 0.3, // new: share of a carcass's energy this specialisation gains (world-balance.md T54)
            sprintBoost: 1,
            passiveLossMultiplier: 1, // new: scales the standing (passive, size and vision) energy loss (fitness-and-selection T15f)
            splitMinEnergyMultiplier: 1, // new: scales splitMinEnergy for this specialisation (fitness-and-selection T15f)
            kickMultiplier: 1, // natural-selection T5a: scales the kick a biter takes when it bites this specialisation
        },
        predator: {
            index: 1,
            visionRange: 350,
            canHunt: true,
            moveCostMultiplier: 1,
            biteTakenMultiplier: 1,
            cooldownMultiplier: 1,
            biteMultiplier: 8, // tuned, fitness-and-selection T15o (E47)
            turnMultiplier: 0.7,
            plantFoodValue: 0, // new: share of a food item's energy this specialisation gains; 0 for predators (world-balance.md T45, from T41)
            meatFoodValue: 1, // new: share of a carcass's energy this specialisation gains (world-balance.md T54)
            sprintBoost: 1.6,
            passiveLossMultiplier: 0.6, // tuned, fitness-and-selection T15d (scales the standing (passive, size and vision) energy loss, T15f)
            splitMinEnergyMultiplier: 0.6, // tuned, fitness-and-selection T15d (scales splitMinEnergy for this specialisation, T15f)
            kickMultiplier: 1, // natural-selection T5a: scales the kick a biter takes when it bites this specialisation
        },
        reproducer: {
            index: 2,
            visionRange: 250,
            canHunt: false,
            moveCostMultiplier: 1,
            biteTakenMultiplier: 1,
            cooldownMultiplier: 0.5,
            biteMultiplier: 1,
            turnMultiplier: 1,
            plantFoodValue: 1, // new: share of a food item's energy this specialisation gains (world-balance.md T45)
            meatFoodValue: 0.3, // new: share of a carcass's energy this specialisation gains (world-balance.md T54)
            sprintBoost: 1,
            passiveLossMultiplier: 1, // new: scales the standing (passive, size and vision) energy loss (fitness-and-selection T15f)
            splitMinEnergyMultiplier: 1, // new: scales splitMinEnergy for this specialisation (fitness-and-selection T15f)
            kickMultiplier: 1, // natural-selection T5a: scales the kick a biter takes when it bites this specialisation
        },
        scout: {
            index: 3,
            visionRange: 400,
            canHunt: false,
            moveCostMultiplier: 1, // natural-selection: no longer cheaper to move (was 0.7)
            biteTakenMultiplier: 1.5, // natural-selection: the scout pays for far sight, every bite on it lands 1.5 times harder (was 1)
            cooldownMultiplier: 1,
            biteMultiplier: 1,
            turnMultiplier: 1,
            plantFoodValue: 1, // new: share of a food item's energy this specialisation gains (world-balance.md T45)
            meatFoodValue: 0.3, // new: share of a carcass's energy this specialisation gains (world-balance.md T54)
            sprintBoost: 1,
            passiveLossMultiplier: 1.3, // natural-selection: the scout pays 30% more to stand (was 1); new: scales the standing (passive, size and vision) energy loss (fitness-and-selection T15f)
            splitMinEnergyMultiplier: 1, // new: scales splitMinEnergy for this specialisation (fitness-and-selection T15f)
            kickMultiplier: 1, // natural-selection T5a: scales the kick a biter takes when it bites this specialisation
        },
        defender: {
            index: 4,
            visionRange: 350,
            canHunt: false,
            moveCostMultiplier: 1.2, // natural-selection: the defender is costly to be, a fifth more to move (was 1)
            biteTakenMultiplier: 0.5,
            cooldownMultiplier: 1,
            biteMultiplier: 1,
            turnMultiplier: 1,
            plantFoodValue: 1, // new: share of a food item's energy this specialisation gains (world-balance.md T45)
            meatFoodValue: 0.3, // new: share of a carcass's energy this specialisation gains (world-balance.md T54)
            sprintBoost: 1,
            passiveLossMultiplier: 1, // new: scales the standing (passive, size and vision) energy loss (fitness-and-selection T15f)
            splitMinEnergyMultiplier: 1, // new: scales splitMinEnergy for this specialisation (fitness-and-selection T15f)
            kickMultiplier: 2, // natural-selection T5a: a bite on a defender costs the biter twice the kick
        },
    },
    checkInvariants: false, // new
    restitution: 0.5, // new
    splitCooldownMultiplier: 1.5, // new
    mateChanceScale: 1.5, // new
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
    specMutationRate: 0.002, // new: chance a child takes another specialisation; above 0 also turns on huntUpkeep and the random-elite floor and seeder rule (T51)
    huntUpkeep: 0.002, // new: energy per tick a canHunt agent pays, only while specMutationRate is above 0 (T51)
    handlingThrust: 0.2, // new: thrust multiplier while handling a meal (T50)
    carcassTicks: 300, // new: ticks a carcass lasts before it expires (T54)
    carcassShare: 0.5, // new: share of an agent's energy at death that its carcass holds (T54)
    wallGaps: 3, // new: gaps in the wall, basins only (T52)
    wallGapWidth: 200, // new: width of each wall gap in px (T52; 200 since the big bang, from 300)
    refugeCount: 8, // new: refuges of rocks that only agents below refugeSizeMax fit into (T52; 8 since the big bang, from 4)
    refugeCluster: 2, // new: refuge rings per group; a group shares a band and sits in a row (natural-selection.md T10f)
    refugeSizeMax: 30, // new: the largest agent radius that fits a refuge's gaps (T52)
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
    predatorKillEnergy: 150, // tuned, fitness-and-selection T15d (energy the biter gains on a fatal bite, T15f)
    alarmThreshold: 0.65, // tuned, fitness-and-selection T15d (the alarm output must exceed it, T15m)
    huntCallThreshold: 0.65, // tuned, fitness-and-selection T15d (the hunt output must exceed it, T15m)
    foodPatchCount: 16, // new: permanent food patches; 0 is off (world-balance T34, 16 from T41)
    foodPatchRadius: 400, // new
    foodPatchCapacity: 1, // new: the largest stock of a patch
    foodPatchDepletion: 0.02, // new: stock taken by each food eaten inside a patch
    foodPatchRegrow: 0.0005, // new: logistic regrowth rate per tick
    foodBackgroundShare: 0.2, // new: the share of food spawns that ignore the patches
    foodRegrowPerArea: 0.06, // new: items per tick per 1,000,000 px2 of world, through the patches
    eraSeasonTicks: 36000, // new: ticks per season (a year is 4 x this)
    winterRegrow: 0.2, // new: patch regrowth multiplier in winter (summer is 1.5)
    droughtChance: 0.25, // new: chance per year that one basin's patches stop regrowing for the summer
    visionCost: 0.5, // new: extra passive loss per unit of vision trait above 1, as a share of passiveLoss
    hebbianRate: 0.0001, // new: lifetime learning rate of the hidden-to-output block; 0 is off (world-balance T32, 0.0001 from T41)
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
});
