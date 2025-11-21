// --- SIMULATION ENTITIES CONSTANTS (BALANCING) ---
// ALL VALUES PRESERVED EXACTLY FROM ORIGINAL

export const BASE_SIZE = 10; // Increased from 5 to ensure agents are never smaller than food (size 8)
export const ENERGY_TO_SIZE_RATIO = 100;
export const MAX_ENERGY = 2500; // Increased to allow more growth
export const MIN_ENERGY_TO_REPRODUCE = 250;
export const REPRODUCE_COST_BASE = 15;
export const CHILD_STARTING_ENERGY = 700; // CRITICAL FIX: Increased to 700 to ensure survival long enough to find food (was 150→400→700)
export const INITIAL_AGENT_ENERGY = 3000; // Increased to 3000 for better initial exploration (was 2000→2500→3000) 
export const MATURATION_AGE_FRAMES = 900; // 15 seconds at 60 FPS - FRAME-BASED to be independent of game speed
export const REPRODUCTION_COOLDOWN_FRAMES = 60 * 5;
export const PREGNANCY_DURATION_FRAMES = 60 * 8;

export const RESPAWN_DELAY_FRAMES = 0;

export const OBESITY_THRESHOLD_ENERGY = 350;
export const OBESITY_ENERGY_TAX_DIVISOR = 500;

export const MAX_THRUST = 0.5;
export const MAX_ROTATION = 0.1;
export const MAX_VELOCITY = 10;
export const SPRINT_BONUS_THRUST = 0.5;
export const SPRINT_COST_PER_FRAME = 0.25; // Reduced from 0.4 to encourage sprinting away from danger
export const SPRINT_THRESHOLD = 0.9;
export const FEAR_SPRINT_BONUS = 0.5;

export const OBSTACLE_COLLISION_PENALTY = 25; // CRITICAL FIX: Halved to allow learning (was killing agents in 2-3 hits) 
export const OBSTACLE_HIDING_RADIUS = 75;

export const DANGER_PHEROMONE_THRESHOLD = 30;
export const PHEROMONE_FADE_RATE = 0.005;
export const PHEROMONE_RADIUS = 60;
export const PHEROMONE_DIAMETER = PHEROMONE_RADIUS * 2;

export const FOOD_SPAWN_CAP = 2000; // Increased to 2000 for smaller world (8x density increase)
export const HIGH_VALUE_FOOD_CHANCE = 0.1; // Increased from 0.05 to provide more high-value learning opportunities
export const DAMPENING_FACTOR = 0.95;

export const ROTATION_COST_MULTIPLIER = 0.3; // Reduced from 0.5 to encourage turning and exploration
export const DIRECTION_CHANGE_FITNESS_FACTOR = 0.1; // Reward for changing trajectory

// --- MATH CONSTANTS ---
export const TWO_PI = Math.PI * 2;

// --- NEW ENERGY BALANCE FIXES ---
export const PASSIVE_LOSS = 0.000001; // CRITICAL FIX: Halved to extend lifespan
export const MOVEMENT_COST_MULTIPLIER = 0.002; // CRITICAL FIX: Halved to enable exploration (was 72% of energy drain)

// World size - 16:9 aspect ratio to fit 1440p monitors
export const WORLD_WIDTH = 14400;
export const WORLD_HEIGHT = 8100;

// Low energy threshold for red border (visual only)
export const LOW_ENERGY_THRESHOLD = 100;

// Specialization types
export const SPECIALIZATION_TYPES = {
    FORAGER: 'forager',
    PREDATOR: 'predator',
    REPRODUCER: 'reproducer',
    SCOUT: 'scout',
    DEFENDER: 'defender'
};

// --- GENE POOL CONSTANTS ---
export const MIN_FITNESS_TO_SAVE_GENE_POOL = 6000;
export const MAX_AGENTS_TO_SAVE_PER_GENE_POOL = 10;
export const MIN_FOOD_EATEN_TO_SAVE_GENE_POOL = 3;
export const MIN_FRAMES_ALIVE_TO_SAVE_GENE_POOL = 600;

export const MAX_GENE_POOLS = 500; // Limit total stored gene pools

// --- VISUAL CONSTANTS ---
export const COLORS = {
    BACKGROUND: 0x050510, // Deep dark blue/black
    FOOD: {
        NORMAL: 0x39FF14, // Neon Green
        HIGH_VALUE: 0xFF00FF // Neon Magenta
    },
    OBSTACLE: 0x9D00FF, // Neon Purple
    AGENTS: {
        FORAGER: 0xCCFF00, // Neon Lime
        PREDATOR: 0xFF0033, // Neon Red
        REPRODUCER: 0x00F0FF, // Neon Cyan
        SCOUT: 0xFFFF00, // Neon Yellow
        DEFENDER: 0xFF6600 // Neon Orange
    },
    RAYS: {
        DEFAULT: 0x00FFFF, // Cyan
        ALIGNMENT: 0xFFFF00, // Neon Yellow
        FOOD: 0x39FF14, // Neon Green
        SMALLER: 0xCCFF00, // Neon Lime
        LARGER: 0xFF0033, // Neon Red
        OBSTACLE: 0x9D00FF, // Neon Purple
        EDGE: 0xFF6600, // Neon Orange
        SAME: 0x00F0FF // Neon Cyan
    }
};

// Agent specialization configurations
export const AGENT_CONFIGS = {
    [SPECIALIZATION_TYPES.FORAGER]: {
        color: COLORS.AGENTS.FORAGER,
        numSensorRays: 40,
        maxRayDist: 300, // Increased from 200
        hiddenSize: 20,
        description: 'Specialized in finding and consuming food.'
    },
    [SPECIALIZATION_TYPES.PREDATOR]: {
        color: COLORS.AGENTS.PREDATOR,
        numSensorRays: 50,
        maxRayDist: 450, // Increased from 300
        hiddenSize: 25,
        description: 'Specialized in hunting other agents.'
    },
    [SPECIALIZATION_TYPES.REPRODUCER]: {
        color: COLORS.AGENTS.REPRODUCER,
        numSensorRays: 30,
        maxRayDist: 250, // Increased from 150
        hiddenSize: 18,
        description: 'Specialized in mating and creating offspring.'
    },
    [SPECIALIZATION_TYPES.SCOUT]: {
        color: COLORS.AGENTS.SCOUT,
        numSensorRays: 60,
        maxRayDist: 600, // Increased from 400
        hiddenSize: 15,
        description: 'Specialized in long-range sensing and exploration.'
    },
    [SPECIALIZATION_TYPES.DEFENDER]: {
        color: COLORS.AGENTS.DEFENDER,
        numSensorRays: 35,
        maxRayDist: 350, // Increased from 250
        hiddenSize: 22,
        description: 'Specialized in defending territory and allies.'
    }
};

