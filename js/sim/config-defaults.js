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
    minAgents: 100, // the floor; world-balance lowers it to 40 at the Phase 4 switch-on (T41)
    immigrationInterval: 600, // new
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
    obstacleCount: 25, // OBSTACLE_COUNT
    obstacleMinRadius: 40, // OBSTACLE_MIN_RADIUS
    obstacleMaxRadius: 120, // OBSTACLE_MAX_RADIUS
    obstacleMaxSpeed: 0.3, // OBSTACLE_MAX_SPEED
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
    maxEnergy: 25000, // MAX_ENERGY
    passiveLoss: 0.06, // PASSIVE_LOSS
    movementCost: 0.015, // MOVEMENT_COST_MULTIPLIER x 0.5
    turnCost: 0.1, // ROTATION_COST_MULTIPLIER
    sizeEnergyLoss: 0.00025, // AGENT_SIZE_ENERGY_LOSS_MULTIPLIER
    baseSize: 25, // BASE_SIZE
    minSize: 20, // MIN_AGENT_SIZE
    energyToSize: 250, // ENERGY_TO_SIZE_RATIO
    biteEnergy: 5, // BITE_SIZE
    huntSizeRatio: 1.01, // tuned, E20 and jaws (legacy PREDATOR_SIZE_RATIO_THRESHOLD 1.1)
    mateSizeRatio: 1.3, // new: the widest size ratio between two mates, apart from the hunt ratio (B14)
    mateMinEnergy: 200, // MIN_ENERGY_TO_REPRODUCE
    mateCost: 15, // REPRODUCE_COST_BASE
    mateRange: 100, // new: the largest edge-to-edge gap between two mates
    childEnergyShare: 0.5, // new: the share of its energy a mother gives a child
    childEnergyMin: 200, // new: the smallest gift a mating birth may make
    splitMinEnergy: 900, // MIN_ENERGY_FOR_SPLITTING, lowered to 900
    maxAgeTicks: 36000, // new
    reproductionCooldown: 300, // REPRODUCTION_COOLDOWN_FRAMES
    pregnancyTicks: 480, // PREGNANCY_DURATION_FRAMES
    maturityTicks: 600, // MATURATION_AGE_FRAMES
    seasonLength: 3600, // SEASON_LENGTH
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
    hashCellSize: 128, // new
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
        },
        predator: {
            index: 1,
            visionRange: 350,
            canHunt: true,
            moveCostMultiplier: 1,
            biteTakenMultiplier: 1,
            cooldownMultiplier: 1,
            biteMultiplier: 4,
            turnMultiplier: 0.7,
            plantFoodValue: 1, // new: share of a food item's energy this specialisation gains (world-balance.md T45)
            meatFoodValue: 1, // new: share of a carcass's energy this specialisation gains (world-balance.md T54)
            sprintBoost: 1.6,
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
        },
        scout: {
            index: 3,
            visionRange: 400,
            canHunt: false,
            moveCostMultiplier: 0.7,
            biteTakenMultiplier: 1,
            cooldownMultiplier: 1,
            biteMultiplier: 1,
            turnMultiplier: 1,
            plantFoodValue: 1, // new: share of a food item's energy this specialisation gains (world-balance.md T45)
            meatFoodValue: 0.3, // new: share of a carcass's energy this specialisation gains (world-balance.md T54)
            sprintBoost: 1,
        },
        defender: {
            index: 4,
            visionRange: 350,
            canHunt: false,
            moveCostMultiplier: 1,
            biteTakenMultiplier: 0.5,
            cooldownMultiplier: 1,
            biteMultiplier: 1,
            turnMultiplier: 1,
            plantFoodValue: 1, // new: share of a food item's energy this specialisation gains (world-balance.md T45)
            meatFoodValue: 0.3, // new: share of a carcass's energy this specialisation gains (world-balance.md T54)
            sprintBoost: 1,
        },
    },
    checkInvariants: false, // new
    restitution: 0.5, // new
    splitCooldownMultiplier: 1.5, // new
    mateChanceScale: 1.5, // new
    foodTargetPerAgent: 12, // tuned, E20
    foodTargetMin: 50, // new
    foodRefillBoost: 4, // new
    foodSurplusRate: 0.2, // new
    foodSpawnAgentDivisor: 20, // new
    fertileZoneRadius: 150, // new
    fertileZoneFertility: 0.05, // FERTILE_ZONE_FERTILITY_FACTOR
    placementTries: 100, // new
    temperatureMax: 100, // TEMPERATURE_MAX
    temperatureStart: 50, // TEMPERATURE_START
    temperatureGainMove: 0.01, // TEMPERATURE_GAIN_MOVE (tuned, E17)
    temperatureGainEat: 2, // TEMPERATURE_GAIN_EAT
    satiationShare: 0, // new: at or above this share of maxEnergy an agent cannot eat; 0 is off (world-balance T49)
    digestTicks: 0, // new: ticks after a meal before the next; 0 is off, at most TIMER_CAP (T49)
    handlingTicks: 0, // new: ticks after a meal at reduced thrust; 0 is off, at most TIMER_CAP (T50)
    handlingThrust: 0.2, // new: thrust multiplier while handling a meal (T50)
    carcassesEnabled: false, // new: a dead agent leaves a meat food item; false is off (world-balance T54)
    carcassTicks: 300, // new: ticks a carcass lasts before it expires (T54)
    carcassShare: 0.5, // new: share of an agent's energy at death that its carcass holds (T54)
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
    biteArc: Math.PI / 4, // new: half-angle of the forward bite arc, radians
    antennaAngle: 0.8, // new: radians either side of the heading
    antennaReach: 150, // new: 1.5 pheromone cells
    callRadius: 300, // SHOUT_BASE_RANGE (200)
    callTicks: 60, // SHOUT_DURATION_FRAMES
    alarmCost: 0.5, // tuned, E20
    huntCallCost: 0.5, // tuned, E20
    smokeCost: 20, // new
    smokeRadius: 80, // new
    smokeTicks: 180, // new
    smokeCooldown: 600, // new
    smokeThreshold: 0.8, // new: the smoke output must exceed it
    packWindow: 120, // new: ticks between two biters for a shared kill
    maxClouds: 32, // new
    floorRescueAtZero: false, // new: the floor and the seeder pick only a specialisation with 0 alive
    foodPatchCount: 0, // new: permanent food patches; 0 is off
    foodPatchRadius: 400, // new
    foodPatchCapacity: 1, // new: the largest stock of a patch
    foodPatchDepletion: 0.02, // new: stock taken by each food eaten inside a patch
    foodPatchRegrow: 0.0005, // new: logistic regrowth rate per tick
    foodBackgroundShare: 0.2, // new: the share of food spawns that ignore the patches
    traitsEnabled: false, // new: evolvable size, vision and child share (world-balance T33)
    visionCost: 0.5, // new: extra passive loss per unit of vision trait above 1, as a share of passiveLoss
    hebbianRate: 0, // new: lifetime learning rate of the hidden-to-output block; 0 is off (world-balance T32)
    leakEnabled: false, // new: leaky hidden units and the memory read-back inputs (world-balance T31)
});
