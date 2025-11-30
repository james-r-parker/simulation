// --- SIMULATION CONFIGURATION ---
// Core world and performance settings that define the simulation environment
export const WORLD_WIDTH = 14400; // Total width of the simulation world in pixels
export const WORLD_HEIGHT = 8100; // Total height of the simulation world in pixels
export const FPS_TARGET = 60; // Target frames per second for smooth animation and physics
export const AUTO_ADJUST_COOLDOWN = 15000; // Minimum frames between automatic performance adjustments (15 seconds at 60 FPS)
export const MIN_AGENTS = 5; // Minimum number of agents that must exist at any time
export const MAX_AGENTS_LIMIT = 100; // Hard upper limit on total agent population
export const MIN_GAME_SPEED = 0.5; // Minimum allowed game speed multiplier (slowest playback)
export const MAX_GAME_SPEED = 10; // Maximum allowed game speed multiplier (fastest playback)
export const MEMORY_PRESSURE_THRESHOLD = 150 * 1024 * 1024; // Memory usage threshold that triggers cleanup (150MB)
export const SEASON_LENGTH = 3600; // Number of frames per season phase (environmental cycle) - 60 seconds at 60 FPS

// --- AGENT CONSTANTS ---
// Physical and behavioral properties that define how agents look, move, and survive

// Size and appearance
export const BASE_SIZE = 25; // Default visual radius of agents in pixels
export const MIN_AGENT_SIZE = 20; // Minimum visual size agents can shrink to, regardless of energy level
export const ENERGY_TO_SIZE_RATIO = 250; // How much energy affects agent size (higher energy = larger size)

// Energy system
export const INITIAL_AGENT_ENERGY = 2500; // Starting energy for newly spawned agents
export const MAX_ENERGY = 25000; // Maximum energy an agent can accumulate
export const MIN_ENERGY_TO_REPRODUCE = 250; // Minimum energy required to attempt reproduction
export const REPRODUCE_COST_BASE = 15; // Base energy cost for reproduction attempts
export const CHILD_STARTING_ENERGY = 700; // Energy given to newborn agents

// Movement physics
export const MAX_THRUST = 0.5; // Maximum acceleration force agents can apply
export const MAX_ROTATION = 0.1; // Maximum turning speed in radians per frame
export const MAX_VELOCITY = 8; // Maximum speed an agent can reach
export const SPRINT_BONUS_THRUST = 0.5; // Additional thrust when sprinting
export const SPRINT_COST_PER_FRAME = 0.05; // Energy cost per frame when sprinting
export const SPRINT_THRESHOLD = 0.9; // Neural network output threshold to trigger sprinting
export const FEAR_SPRINT_BONUS = 0.5; // Extra thrust bonus when fleeing from threats

// Neural network and evolution
export const AGENT_MEMORY_FRAMES = 30; // Number of previous frames stored for temporal decision making (~0.5 seconds at 60fps)
export const BASE_MUTATION_RATE = 0.1; // Base probability of gene mutations during reproduction
export const AGENT_SPEED_FACTOR_BASE = 2; // Base multiplier for agent movement speed calculations
export const AGENT_SPEED_FACTOR_VARIANCE = 3; // Random variance range for speed factor inheritance

// Reproduction timing
export const REPRODUCTION_COOLDOWN_FRAMES = 60 * 5; // Frames an agent must wait between reproduction attempts (5 seconds)
export const PREGNANCY_DURATION_FRAMES = 60 * 8; // Frames required for pregnancy to complete (8 seconds)
export const MATURATION_AGE_FRAMES = 600; // Minimum age in frames before agents can reproduce (10 seconds)
export const RESPAWN_DELAY_FRAMES = 0; // Frames to wait before respawning dead agents

// Energy management
export const PASSIVE_LOSS = 0.01; // Energy lost per frame just by existing (metabolic cost)
export const MOVEMENT_COST_MULTIPLIER = 0.02; // Energy cost multiplier for movement (velocity * this)
export const ROTATION_COST_MULTIPLIER = 0.1; // Energy cost multiplier for rotation (rotation speed * this)
export const DIRECTION_CHANGE_FITNESS_FACTOR = 2.0; // Multiplier for fitness scoring based on directional changes
export const TEMPERATURE_MAX = 100; // Maximum temperature
export const TEMPERATURE_MIN = 0; // Minimum temperature
export const TEMPERATURE_START = 55; // Starting temperature
export const TEMPERATURE_GAIN_MOVE = 0.025; // Temperature gain per frame at max speed
export const TEMPERATURE_GAIN_EAT = 4; // Temperature gain when eating
export const TEMPERATURE_LOSS_PASSIVE = 0.015; // Temperature loss per frame
export const TEMPERATURE_PASSIVE_LOSS_FACTOR = 15.0; // Max multiplier for passive energy loss at 0 temperature

// Temperature-dependent behavior constants
export const TEMPERATURE_OPTIMAL_MIN = 40; // Minimum temperature for optimal performance
export const TEMPERATURE_OPTIMAL_MAX = 65; // Maximum temperature for optimal performance
export const TEMPERATURE_COLD_STRESS_THRESHOLD = 30; // Temperature below which severe cold stress occurs
export const TEMPERATURE_HEAT_STRESS_THRESHOLD = 85; // Temperature above which severe heat stress occurs
export const TEMPERATURE_COLD_MODERATE_THRESHOLD = 40; // Temperature below which moderate cold effects occur
export const TEMPERATURE_HEAT_MODERATE_THRESHOLD = 70; // Temperature above which moderate heat effects occur
export const TEMPERATURE_EFFICIENCY_OPTIMAL = 1.0; // Movement efficiency at optimal temperatures
export const TEMPERATURE_EFFICIENCY_COLD_MODERATE = 0.7; // Movement efficiency in moderate cold
export const TEMPERATURE_EFFICIENCY_HEAT_MODERATE = 0.8; // Movement efficiency in moderate heat
export const TEMPERATURE_EFFICIENCY_COLD_SEVERE = 0.3; // Movement efficiency in severe cold
export const TEMPERATURE_EFFICIENCY_HEAT_SEVERE = 0.4; // Movement efficiency in severe heat
export const TEMPERATURE_REPRODUCTION_SUPPRESSION_EXTREME = 0.3; // Chance of reproduction suppression in extreme temperatures

// Seasonal environmental cycle constants
export const SEASON_SPRING_TEMP_MODIFIER = -5; // Temperature modifier during spring
export const SEASON_SUMMER_TEMP_MODIFIER = 15; // Temperature modifier during summer
export const SEASON_FALL_TEMP_MODIFIER = 5; // Temperature modifier during fall
export const SEASON_WINTER_TEMP_MODIFIER = -15; // Temperature modifier during winter
export const SEASON_SPRING_REPRODUCTION_BONUS = 1.5; // Reproduction rate multiplier in spring (breeding season)
export const SEASON_SUMMER_REPRODUCTION_BONUS = 1.2; // Reproduction rate multiplier in summer
export const SEASON_FALL_REPRODUCTION_BONUS = 0.7; // Reproduction rate multiplier in fall
export const SEASON_WINTER_REPRODUCTION_BONUS = 0.3; // Reproduction rate multiplier in winter
export const SEASON_SUMMER_ENERGY_DRAIN = 1.3; // Energy drain multiplier in summer
export const SEASON_FALL_ENERGY_DRAIN = 1.1; // Energy drain multiplier in fall
export const SEASON_WINTER_ENERGY_DRAIN = 1.8; // Energy drain multiplier in winter
export const SEASON_SPRING_MUTATION_MULTIPLIER = 1.1; // Mutation rate multiplier in spring
export const SEASON_SUMMER_MUTATION_MULTIPLIER = 1.0; // Mutation rate multiplier in summer
export const SEASON_FALL_MUTATION_MULTIPLIER = 1.0; // Mutation rate multiplier in fall
export const SEASON_WINTER_MUTATION_MULTIPLIER = 0.8; // Mutation rate multiplier in winter

// Nutrient cycling and decomposition constants
export const FERTILE_ZONE_MAX_COUNT = 100; // Maximum number of fertile zones allowed
export const FERTILE_ZONE_FERTILITY_FACTOR = 0.05; // Energy-to-fertility conversion factor for dead agents
export const FERTILE_ZONE_MAX_FERTILITY = 50; // Maximum fertility value for any zone
export const FERTILE_ZONE_DECAY_RATE = 0.001; // Fertility decay rate per frame
export const FERTILE_ZONE_MIN_FERTILITY = 1; // Minimum fertility to create a zone
export const FERTILE_ZONE_SIZE_FACTOR = 3; // Zone radius multiplier based on agent size
export const FERTILE_ZONE_MIN_RADIUS = 50; // Minimum zone radius
export const FERTILE_ZONE_SPAWN_CHANCE = 0.4; // Chance to spawn food in fertile zones vs random
export const FERTILE_ZONE_INFLUENCE_DISTANCE = 200; // Distance within which fertile zones affect food spawning

// Kin recognition and social behavior constants
export const KIN_RELATEDNESS_SELF = 1.0; // Relatedness value for self
export const KIN_RELATEDNESS_PARENT_CHILD = 0.5; // Relatedness between parent and child
export const KIN_RELATEDNESS_SIBLINGS = 0.5; // Relatedness between siblings
export const KIN_RELATEDNESS_GRANDPARENT = 0.25; // Relatedness for grandparents/grandchildren/aunts/uncles
export const KIN_RELATEDNESS_DISTANT = 0.125; // Relatedness for distant relatives
export const KIN_RELATEDNESS_MAX_GENERATION_DIFF = 2; // Maximum generation difference for relatedness calculation
export const KIN_PREDATION_REDUCTION_THRESHOLD = 0.25; // Minimum relatedness to trigger predation reduction
export const KIN_ATTACK_PREVENTION_CHANCE = 0.25; // Base chance to prevent attack on siblings
export const KIN_ATTACK_PREVENTION_PARENT = 0.5; // Chance to prevent attack on parent/child

// Seasonal food scarcity factors
export const SEASON_SPRING_FOOD_SCARCITY = 1.2; // Food abundance after winter
export const SEASON_SUMMER_FOOD_SCARCITY = 1.0; // Normal food availability in summer
export const SEASON_FALL_FOOD_SCARCITY = 0.8; // Resources becoming scarce in fall
export const SEASON_WINTER_FOOD_SCARCITY = 0.4; // Severe food scarcity in winter

// Collision and damage
export const WALL_COLLISION_DAMAGE = 50; // Energy damage taken when hitting world boundaries
export const EDGE_BOUNCE_DAMPING = 0.5; // Velocity reduction factor when bouncing off edges

// --- FOOD CONSTANTS ---
// Settings for food spawning, energy values, and decay mechanics

// Spawning system
export const FOOD_SPAWN_CAP = 300; // Maximum number of food items that can exist simultaneously
export const FOOD_SPAWN_RATE = 0.12; // Probability per frame of attempting to spawn new food
export const HIGH_VALUE_FOOD_CHANCE = 0.1; // Probability that spawned food will be high-value type
export const FOOD_SPAWN_NEAR_AGENTS_CHANCE = 0.3; // Probability that food spawns near living agents (helps learning)
export const FOOD_SPAWN_NEAR_AGENT_DISTANCE_MIN = 200; // Minimum distance from agent to spawn food
export const FOOD_SPAWN_NEAR_AGENT_DISTANCE_MAX = 400; // Maximum distance from agent to spawn food

// Energy values (agents gain these when eating food)
export const FOOD_ENERGY_NORMAL_BASE = 500; // Base energy value of normal food
export const FOOD_ENERGY_NORMAL_VARIANCE = 20; // Random variance in normal food energy (± this amount)
export const FOOD_ENERGY_HIGH_BASE = 1000; // Base energy value of high-value food
export const FOOD_ENERGY_HIGH_VARIANCE = 50; // Random variance in high-value food energy (± this amount)

export const OBESITY_THRESHOLD_ENERGY = 15000; // Energy level above which agents suffer obesity penalties
export const OBESITY_ENERGY_TAX_DIVISOR = 2000; // Divisor for calculating obesity energy tax (higher = less tax)

// Visual appearance
export const FOOD_SIZE_NORMAL = 20; // Visual radius of normal food in pixels (increased for better ray detection)
export const FOOD_SIZE_HIGH = 30; // Visual radius of high-value food in pixels (increased for better ray detection)
export const FOOD_SIZE_MIN_NORMAL = 8; // Minimum size normal food can shrink to during decay (increased for better ray detection)
export const FOOD_SIZE_MIN_HIGH = 12; // Minimum size high-value food can shrink to during decay (increased for better ray detection)

// Decay system (food spoils over time)
export const FOOD_ROT_RATE_BASE = 0.002; // Base rate at which food loses energy per frame
export const FOOD_ROT_RATE_VARIANCE = 0.003; // Random variance in food rot rate
export const FOOD_MAX_AGE_BASE = 10000; // Base maximum age of food before it disappears (in frames)
export const FOOD_MAX_AGE_VARIANCE = 1000; // Random variance in food maximum age (± this amount)

// --- OBSTACLE CONSTANTS ---
// Dynamic obstacles that move around and create navigation challenges

// Generation and placement
export const OBSTACLE_COUNT = 25; // Actual number of obstacles spawned in the world
export const OBSTACLE_MIN_RADIUS = 40; // Minimum radius of obstacles in pixels
export const OBSTACLE_MAX_RADIUS = 120; // Maximum radius of obstacles in pixels
export const OBSTACLE_MIN_DISTANCE = 350; // Minimum distance obstacles must maintain from each other
export const OBSTACLE_SPAWN_MARGIN = 250; // Distance from world edges where obstacles cannot spawn
export const OBSTACLE_INFLUENCE_RADIUS = 600; // Distance at which obstacles affect agent behavior
export const OBSTACLE_MAX_SPEED = 0.3; // Maximum movement speed of obstacles
export const OBSTACLE_SEGMENTS = 8; // Number of segments in obstacle path
export const GPU_MAX_OBSTACLES = OBSTACLE_COUNT * OBSTACLE_SEGMENTS; // Maximum obstacles GPU can handle (buffer size, not actual count)

// Interaction penalties
export const OBSTACLE_COLLISION_PENALTY = 50; // Energy damage taken when colliding with obstacles
export const OBSTACLE_HIDING_RADIUS = 75; // Distance within which agents can hide behind obstacles

// --- PHEROMONE CONSTANTS ---
// Chemical trail system that agents use for communication and navigation

// Limits and performance
export const MAX_PHEROMONES_TOTAL = 2000; // Total pheromone markers allowed in the world
export const MAX_PHEROMONES_PER_TYPE = 500; // Maximum markers per pheromone type (food, danger, etc.)
export const MAX_PHEROMONES_PER_AREA = 5; // Maximum markers allowed in any given area
export const PHEROMONE_RADIUS_CHECK = 50; // Search radius when checking for existing pheromones

// Visual and behavioral properties
export const PHEROMONE_RADIUS = 60; // Visual radius of pheromone markers in pixels
export const PHEROMONE_DIAMETER = PHEROMONE_RADIUS * 2; // Calculated diameter for convenience
export const PHEROMONE_FADE_RATE = 0.005; // Rate at which pheromones lose intensity per frame
export const DANGER_PHEROMONE_THRESHOLD = 30; // Intensity threshold above which pheromones signal danger

// --- RENDERER CONSTANTS ---
// GPU rendering performance and visual effect settings

// Camera and viewport
export const VIEW_SIZE_RATIO = 0.4; // Portion of world visible in camera (0.4 = 40% of world size)

// Visual effects
export const EFFECT_DURATION_BASE = 7; // Base duration for visual effects in frames
export const EFFECT_FADE_DURATION = 15; // How many frames visual effects take to fade out

// GPU batching
export const MAX_INSTANCES_PER_BATCH = 200; // Maximum objects rendered in a single GPU batch

// Color palette for all visual elements in the simulation (hex colors)
export const COLORS = {
    BACKGROUND: 0x050510, // Deep space background color
    FOOD: {
        NORMAL: 0x39FF14, // Standard food items (neon green)
        HIGH_VALUE: 0xFF00FF // Rare high-energy food items (neon magenta)
    },
    OBSTACLE: 0x9D00FF, // Moving obstacles that agents must avoid (neon purple)
    AGENTS: {
        FORAGER: 0xCCFF00, // Food-specialized agents (neon lime)
        PREDATOR: 0xFF0033, // Hunting-specialized agents (neon red)
        REPRODUCER: 0x00F0FF, // Breeding-specialized agents (neon cyan)
        SCOUT: 0xFFFF00, // Exploration-specialized agents (neon yellow)
        DEFENDER: 0xFF6600 // Territory defense-specialized agents (neon orange)
    },
    RAYS: {
        DEFAULT: 0x00FFFF, // Default sensor ray color when hitting objects (cyan)
        NO_HIT: 0x666666, // Color when sensor rays hit nothing (dull gray)
        ALIGNMENT: 0xFFFF00, // Rays detecting alignment with other agents (neon yellow)
        FOOD: 0x39FF14, // Rays detecting food sources (neon green)
        SMALLER: 0xCCFF00, // Rays detecting smaller agents (neon lime)
        LARGER: 0xFF0033, // Rays detecting larger agents (neon red)
        OBSTACLE: 0x9D00FF, // Rays detecting obstacles (neon purple)
        EDGE: 0xFF6600, // Rays detecting world boundaries (neon orange)
        SAME: 0x00F0FF // Rays detecting agents of same specialization (neon cyan)
    },
    EFFECTS: {
        COLLISION: 0xFF0033, // Visual effect when agents hit obstacles (red glow)
        EATING: 0x39FF14 // Visual effect when agents consume food (green glow)
    }
};

// --- PHYSICS CONSTANTS ---
// Low-level physics simulation parameters for movement and collisions

// Movement physics
export const DAMPENING_FACTOR = 0.95; // Velocity reduction factor applied each frame (friction)
export const BRAKING_FRICTION = 0.90; // Stronger friction applied when agent is not thrusting

// Collision system
export const COLLISION_SEPARATION_STRENGTH = 1.0; // Force applied to separate overlapping agents
export const COLLISION_NUDGE_STRENGTH = 0.05; // Small random force to prevent collision sticking
export const COLLISION_ENERGY_LOSS_CAP = 1.0; // Maximum energy considered for collision damage calculation
export const COLLISION_ENERGY_LOSS_PERCENTAGE = 0.1; // Percentage of energy lost in collisions
export const COLLISION_QUERY_BUFFER = 20; // Buffer distance added to collision queries for movement between frames
export const MAX_AGENT_SIZE_ESTIMATE = 100; // Reasonable estimate for collision queries - balances accuracy vs performance
export const PREDATOR_SIZE_RATIO_THRESHOLD = 1.1; // Size ratio required for predator behavior (10% larger)
export const PREY_SIZE_RATIO_THRESHOLD = 0.909; // Size ratio threshold for prey vulnerability (10% smaller)
export const COLLISION_SEPARATION_MULTIPLIER = 0.5; // Multiplier for collision separation calculations

// Combat mechanics
export const BITE_SIZE = 5; // Energy amount stolen when one agent bites another
export const BOUNCE_ENERGY_LOSS = 0.8; // Velocity reduction when agents bounce off each other
export const FOOD_EATEN_INCREMENT = 0.1; // Amount added to foodEaten counter when agents eat

// Agent territory and spatial constants
export const TERRITORY_RADIUS = 200; // Default territory size for agents
export const RAY_DISTANCE_THRESHOLD = 0.001; // Minimum distance threshold for ray intersections
export const DIVISION_BY_ZERO_THRESHOLD = 0.0001; // Minimum value to avoid division by zero

// --- NEURAL NETWORK CONSTANTS ---
// Parameters controlling neural network initialization, mutation, and evolution

// Initialization
export const NN_WEIGHT_INIT_STD_DEV = 0.1; // Standard deviation for random weight initialization

// Mutation system
export const NN_MUTATION_STD_DEV_RATIO = 0.3; // Mutation strength as ratio of initial weight std dev
export const NN_MACRO_MUTATION_CHANCE = 0.02; // Probability of major structural mutations

// Weight constraints
export const NN_WEIGHT_CLAMP_MIN = -3; // Minimum allowed neural network weight value
export const NN_WEIGHT_CLAMP_MAX = 3; // Maximum allowed neural network weight value

// --- GENE POOL CONSTANTS ---
// Criteria for saving successful agents to the persistent gene pool

// Qualification thresholds
export const MIN_FITNESS_TO_SAVE_GENE_POOL = 5000; // Minimum fitness score required to save agent genes (reduced from 10000)
export const MAX_AGENTS_TO_SAVE_PER_GENE_POOL = 10; // Maximum agents saved per gene pool generation
export const MIN_FOOD_EATEN_TO_SAVE_GENE_POOL = 4; // Minimum food items consumed to qualify
export const MIN_FRAMES_ALIVE_TO_SAVE_GENE_POOL = 2000; // Minimum lifespan in frames to qualify
export const MIN_SECONDS_ALIVE_TO_SAVE_GENE_POOL = MIN_FRAMES_ALIVE_TO_SAVE_GENE_POOL / FPS_TARGET; // Minimum lifespan in seconds (33.33s)
export const MIN_EXPLORATION_PERCENTAGE_TO_SAVE_GENE_POOL = 0.5; // Minimum world exploration percentage required (reduced from 1.1%)
export const MIN_TURNS_TOWARDS_FOOD_TO_SAVE_GENE_POOL = 10; // Minimum successful food-seeking behaviors

// Storage limits
export const MAX_GENE_POOLS = 500; // Maximum number of gene pools stored in database

// Validation system (rigorous testing for elite agents)
export const VALIDATION_REQUIRED_RUNS = 3; // Number of test runs required for validation
export const MAX_VALIDATION_QUEUE_SIZE = 50; // Maximum agents waiting for validation
export const VALIDATION_AGENT_ENERGY = 3000; // Energy given to validation agents (boosted from INITIAL_AGENT_ENERGY for fairer testing)
export const EXCEPTIONAL_FITNESS_THRESHOLD = 15000; // Fitness threshold for partial credit system (4/5 criteria with exceptional fitness)
export const INACTIVE_TEMPERATURE_PENALTY = 0.5; // Penalty multiplier for agents with avg temperature < 1 (50% penalty instead of zero)

// --- MATH CONSTANTS ---
// Pre-calculated mathematical values for performance
export const TWO_PI = Math.PI * 2; // Full circle in radians (2π)

// --- MISC CONSTANTS ---
// Exploration tracking system for agent fitness scoring
export const EXPLORATION_GRID_WIDTH = 72; // Number of grid cells across world width
export const EXPLORATION_GRID_HEIGHT = 40; // Number of grid cells across world height
export const EXPLORATION_CELL_WIDTH = WORLD_WIDTH / EXPLORATION_GRID_WIDTH; // Width of each exploration cell
export const EXPLORATION_CELL_HEIGHT = WORLD_HEIGHT / EXPLORATION_GRID_HEIGHT; // Height of each exploration cell

// Visual indicators
export const LOW_ENERGY_THRESHOLD = 100; // Energy level that triggers low-energy visual warnings

// Agent specialization system
export const SPECIALIZATION_TYPES = {
    FORAGER: 'forager', // Food-finding specialists
    PREDATOR: 'predator', // Hunting specialists
    REPRODUCER: 'reproducer', // Breeding specialists
    SCOUT: 'scout', // Exploration specialists
    DEFENDER: 'defender' // Territory defense specialists
};

// Agent specialization configurations - each specialization has unique neural network size and sensor capabilities
export const AGENT_CONFIGS = {
    [SPECIALIZATION_TYPES.FORAGER]: {
        color: COLORS.AGENTS.FORAGER, // Visual color for forager agents
        numSensorRays: 16, // Number of sensor rays for detecting environment
        maxRayDist: 300, // Maximum distance sensor rays can detect
        hiddenSize: 20, // Size of neural network hidden layer
        description: 'Specialized in finding and consuming food.'
    },
    [SPECIALIZATION_TYPES.PREDATOR]: {
        color: COLORS.AGENTS.PREDATOR, // Visual color for predator agents
        numSensorRays: 24, // Number of sensor rays for detecting environment
        maxRayDist: 350, // Maximum distance sensor rays can detect
        hiddenSize: 25, // Size of neural network hidden layer
        description: 'Specialized in hunting other agents.'
    },
    [SPECIALIZATION_TYPES.REPRODUCER]: {
        color: COLORS.AGENTS.REPRODUCER, // Visual color for reproducer agents
        numSensorRays: 16, // Number of sensor rays for detecting environment
        maxRayDist: 250, // Maximum distance sensor rays can detect
        hiddenSize: 18, // Size of neural network hidden layer
        description: 'Specialized in mating and creating offspring.'
    },
    [SPECIALIZATION_TYPES.SCOUT]: {
        color: COLORS.AGENTS.SCOUT, // Visual color for scout agents
        numSensorRays: 24, // Number of sensor rays for detecting environment
        maxRayDist: 400, // Maximum distance sensor rays can detect
        hiddenSize: 15, // Size of neural network hidden layer
        description: 'Specialized in long-range sensing and exploration.'
    },
    [SPECIALIZATION_TYPES.DEFENDER]: {
        color: COLORS.AGENTS.DEFENDER, // Visual color for defender agents
        numSensorRays: 16, // Number of sensor rays for detecting environment
        maxRayDist: 350, // Maximum distance sensor rays can detect
        hiddenSize: 22, // Size of neural network hidden layer
        description: 'Specialized in defending territory and allies.'
    }
};

// --- UI CONSTANTS ---
export const TOAST_DURATION_SUCCESS = 8000; // Validation passed toast duration (ms)
export const TOAST_DURATION_FAILURE = 6000; // Validation failed toast duration (ms)
export const TOAST_DURATION_NORMAL = 5000; // Normal toast duration (ms)
export const TOAST_DURATION_SHORT = 3000; // Short toast duration (ms)
export const TOAST_DURATION_REPRODUCTION = 4000; // Reproduction toast duration (ms)

// --- VALIDATION TIMING ---
export const VALIDATION_COOLDOWN_MS = 5000; // Cooldown between validation attempts (ms)
export const VALIDATION_CLEANUP_TIMEOUT_MS = 10 * 60 * 1000; // Remove stale entries after 10 minutes (ms)
export const MAX_VALIDATIONS_PER_PERIODIC_CHECK = 2; // Maximum agents to add to validation per periodic check

// --- CAMERA SETTINGS ---
export const CAMERA_Z_POSITION = 1000; // Default camera Z position
export const CAMERA_FAR_PLANE = 10000; // Camera far clipping plane

// --- RENDERING CONSTANTS ---
export const AGENT_BORDER_SIZE_MULTIPLIER = 1.1; // Border size relative to agent body
export const AGENT_MINIMUM_BORDER_SIZE = 12; // Minimum border size for visibility
export const POINT_POOL_SIZE = 5000; // Initial point pool allocation size

// --- TIMEOUT CONSTANTS ---
export const GPU_INIT_TIMEOUT_MS = 15000; // GPU initialization timeout (ms)
export const WORKER_REQUEST_TIMEOUT_MS = 5000; // Database worker request timeout (ms)

// --- ADDITIONAL PERFORMANCE CONSTANTS ---
export const AGENT_SIZE_ENERGY_LOSS_MULTIPLIER = 0.00025; // Energy loss per frame based on agent size
export const MAX_AGENTS_TO_SPAWN_PER_FRAME = 8; // Maximum agents to spawn in a single frame during repopulation (balanced for smooth spawning)
export const SPAWN_STAGGER_FRAMES = 2; // Frames to wait between individual agent spawns (prevents jarring batch spawning)
export const SPAWN_GROWTH_DURATION_FRAMES = 120; // Frames for spawn growth effect (120 = 2 seconds at 60 FPS)
export const SPAWN_GROWTH_MIN_SCALE = 0.3; // Starting scale for spawn growth (30% of final size)
export const SPAWN_GROWTH_MAX_SCALE = 1.0; // Ending scale for spawn growth (100% of final size)
export const SPAWN_SIZE_INTERPOLATION_SPEED = 0.05; // Size interpolation speed (5% per frame)
export const GPU_MAX_RAYS_PER_AGENT = 50; // Maximum rays per agent across all specializations (GPU buffer size)
