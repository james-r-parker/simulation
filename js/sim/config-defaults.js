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
    minAgents: 20, // new
    immigrationInterval: 600, // new
    maxFood: 800, // FOOD_SPAWN_CAP
    initialFood: 300, // new
    foodSpawnRate: 0.02, // FOOD_SPAWN_RATE
    foodEnergy: 70, // FOOD_ENERGY_NORMAL_BASE
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
    movementCost: 0.03, // MOVEMENT_COST_MULTIPLIER
    turnCost: 0.1, // ROTATION_COST_MULTIPLIER
    sizeEnergyLoss: 0.00025, // AGENT_SIZE_ENERGY_LOSS_MULTIPLIER
    baseSize: 25, // BASE_SIZE
    minSize: 20, // MIN_AGENT_SIZE
    energyToSize: 250, // ENERGY_TO_SIZE_RATIO
    biteEnergy: 5, // BITE_SIZE
    huntSizeRatio: 1.1, // PREDATOR_SIZE_RATIO_THRESHOLD
    mateMinEnergy: 200, // MIN_ENERGY_TO_REPRODUCE
    mateCost: 15, // REPRODUCE_COST_BASE
    childEnergy: 600, // CHILD_STARTING_ENERGY
    splitMinEnergy: 1200, // MIN_ENERGY_FOR_SPLITTING
    maxAgeTicks: 36000, // new
    reproductionCooldown: 300, // REPRODUCTION_COOLDOWN_FRAMES
    pregnancyTicks: 480, // PREGNANCY_DURATION_FRAMES
    maturityTicks: 600, // MATURATION_AGE_FRAMES
    seasonLength: 3600, // SEASON_LENGTH
    seasons: [
        { foodScarcity: 1.2, energyDrain: 1.0, reproductionBonus: 1.5 }, // spring, SEASON_*
        { foodScarcity: 1.0, energyDrain: 1.3, reproductionBonus: 1.2 }, // summer, SEASON_*
        { foodScarcity: 0.8, energyDrain: 1.1, reproductionBonus: 0.7 }, // autumn, SEASON_*
        { foodScarcity: 0.4, energyDrain: 1.8, reproductionBonus: 0.3 }, // winter, SEASON_*
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
        },
        predator: {
            index: 1,
            visionRange: 350,
            canHunt: true,
            moveCostMultiplier: 1,
            biteTakenMultiplier: 1,
            cooldownMultiplier: 1,
        },
        reproducer: {
            index: 2,
            visionRange: 250,
            canHunt: false,
            moveCostMultiplier: 1,
            biteTakenMultiplier: 1,
            cooldownMultiplier: 0.5,
        },
        scout: {
            index: 3,
            visionRange: 400,
            canHunt: false,
            moveCostMultiplier: 0.7,
            biteTakenMultiplier: 1,
            cooldownMultiplier: 1,
        },
        defender: {
            index: 4,
            visionRange: 350,
            canHunt: false,
            moveCostMultiplier: 1,
            biteTakenMultiplier: 0.5,
            cooldownMultiplier: 1,
        },
    },
    checkInvariants: false, // new
    restitution: 0.5, // new
    splitCooldownMultiplier: 1.5, // new
    mateChanceScale: 1.5, // new
    foodTargetPerAgent: 1.5, // new
    foodTargetMin: 50, // new
    foodRefillBoost: 4, // new
    foodSurplusRate: 0.2, // new
    foodSpawnAgentDivisor: 20, // new
    fertileZoneRadius: 150, // new
    fertileZoneFertility: 0.05, // FERTILE_ZONE_FERTILITY_FACTOR
    placementTries: 100, // new
});
