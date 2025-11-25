// --- SIMULATION ENTITIES CONSTANTS (BALANCING) ---
// ALL VALUES PRESERVED EXACTLY FROM ORIGINAL

export const BASE_SIZE = 25; // Increased to ensure agents are always clearly visible (was 20, originally 10)
export const ENERGY_TO_SIZE_RATIO = 100;
export const MIN_AGENT_SIZE = 20; // Absolute minimum size agents can reach, regardless of energy
export const MAX_ENERGY = 10000; // Increased to allow more growth
export const MIN_ENERGY_TO_REPRODUCE = 150; // REDUCED from 250 to make reproduction more accessible for young agents
export const REPRODUCE_COST_BASE = 15;
export const CHILD_STARTING_ENERGY = 700; // CRITICAL FIX: Increased to 700 to ensure survival long enough to find food (was 150→400→700)
export const INITIAL_AGENT_ENERGY = 3000; // INCREASED from 2500 to 3000 to give agents more time to find food and learn
export const MATURATION_AGE_FRAMES = 600; // REDUCED from 900 (15s) to 600 (10s) - agents live ~10s on average, allow reproduction before death
export const REPRODUCTION_COOLDOWN_FRAMES = 60 * 5;
export const PREGNANCY_DURATION_FRAMES = 60 * 8;

export const RESPAWN_DELAY_FRAMES = 0;

export const OBESITY_THRESHOLD_ENERGY = 350;
export const OBESITY_ENERGY_TAX_DIVISOR = 2000; // Further reduced tax to allow longer lifespan

export const MAX_THRUST = 0.5;
export const MAX_ROTATION = 0.1;
export const MAX_VELOCITY = 10;
export const SPRINT_BONUS_THRUST = 0.5;
export const SPRINT_COST_PER_FRAME = 0.05; // CRITICAL FIX: Reduced from 0.25 to prevent energy starvation
export const SPRINT_THRESHOLD = 0.9;
export const FEAR_SPRINT_BONUS = 0.5;

export const OBSTACLE_COLLISION_PENALTY = 50; // Increased to 100 to severely punish crashing (was 25)
export const OBSTACLE_HIDING_RADIUS = 75;

export const DANGER_PHEROMONE_THRESHOLD = 30;
export const PHEROMONE_FADE_RATE = 0.005;
export const PHEROMONE_RADIUS = 60;
export const PHEROMONE_DIAMETER = PHEROMONE_RADIUS * 2;

export const FOOD_SPAWN_CAP = 300; // Reduced to 300 to create food scarcity (was 800)
export const HIGH_VALUE_FOOD_CHANCE = 0.1; // Increased from 0.05 to provide more high-value learning opportunities
export const DAMPENING_FACTOR = 0.95;

export const ROTATION_COST_MULTIPLIER = 0.1; // Increased to 0.1 to discourage spinning (was 0.05)
export const DIRECTION_CHANGE_FITNESS_FACTOR = 2.0; // Increased to 2.0 to heavily reward dynamic movement (was 0.5)

// --- MATH CONSTANTS ---
export const TWO_PI = Math.PI * 2;

// --- NEW ENERGY BALANCE FIXES ---
export const PASSIVE_LOSS = 0.03; // REDUCED from 0.05 to 0.03 to help agents live longer (was 0.000001 originally)
export const MOVEMENT_COST_MULTIPLIER = 0.008; // REDUCED from 0.01 to 0.008 to reduce movement energy cost (was 0.001 originally)

// World size - 16:9 aspect ratio to fit 1440p monitors
export const WORLD_WIDTH = 14400;
export const WORLD_HEIGHT = 8100;

// Exploration grid for tracking map coverage
export const EXPLORATION_GRID_WIDTH = 72;  // 200px per cell
export const EXPLORATION_GRID_HEIGHT = 40; // 202.5px per cell (close enough)
export const EXPLORATION_CELL_WIDTH = WORLD_WIDTH / EXPLORATION_GRID_WIDTH;
export const EXPLORATION_CELL_HEIGHT = WORLD_HEIGHT / EXPLORATION_GRID_HEIGHT;

// Low energy threshold for red border (visual only)
export const LOW_ENERGY_THRESHOLD = 100;

// Visual effect durations (in frames)
export const EFFECT_FADE_DURATION = 15; // How many frames effects last

// Specialization types
export const SPECIALIZATION_TYPES = {
    FORAGER: 'forager',
    PREDATOR: 'predator',
    REPRODUCER: 'reproducer',
    SCOUT: 'scout',
    DEFENDER: 'defender'
};

// --- GENE POOL CONSTANTS ---
// TEMPORARILY RELAXED CRITERIA: Adjusted to current performance level - will raise as agents improve
export const MIN_FITNESS_TO_SAVE_GENE_POOL = 10000; // TEMPORARILY REDUCED from 4000 to 3000 to allow agents to qualify
export const MAX_AGENTS_TO_SAVE_PER_GENE_POOL = 10;
export const MIN_FOOD_EATEN_TO_SAVE_GENE_POOL = 10; // TEMPORARILY REDUCED from 6 to 4 (was 5 originally)
export const MIN_FRAMES_ALIVE_TO_SAVE_GENE_POOL = 1200; // TEMPORARILY REDUCED from 1200 (20s) to 900 (15s) - was 600 (10s) originally
export const MIN_EXPLORATION_PERCENTAGE_TO_SAVE_GENE_POOL = 3.0; // TEMPORARILY REDUCED from 3.0% to 2.0% - allows more agents to qualify
export const MIN_TURNS_TOWARDS_FOOD_TO_SAVE_GENE_POOL = 1; // TEMPORARILY REDUCED from 1.0 to 0.5 - shows some navigation learning

export const MAX_GENE_POOLS = 500; // Limit total stored gene pools

// Validation queue constants
export const VALIDATION_REQUIRED_RUNS = 3; // Total runs needed for validation
export const VALIDATION_FITNESS_THRESHOLD = 10000; // Excellent tier - agents with 5000+ fitness get validation opportunity (good agents at 3000+ just get saved, temporarily relaxed)
export const MAX_VALIDATION_QUEUE_SIZE = 50; // Maximum agents in validation queue

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
        DEFAULT: 0x00FFFF, // Cyan (for hits)
        NO_HIT: 0x666666, // Dull gray for rays that hit nothing
        ALIGNMENT: 0xFFFF00, // Neon Yellow
        FOOD: 0x39FF14, // Neon Green
        SMALLER: 0xCCFF00, // Neon Lime
        LARGER: 0xFF0033, // Neon Red
        OBSTACLE: 0x9D00FF, // Neon Purple
        EDGE: 0xFF6600, // Neon Orange
        SAME: 0x00F0FF // Neon Cyan
    },
    EFFECTS: {
        COLLISION: 0xFF0033, // Red glow for obstacle collisions
        EATING: 0x39FF14    // Green glow for eating food
    }
};

// Agent specialization configurations
export const AGENT_CONFIGS = {
    [SPECIALIZATION_TYPES.FORAGER]: {
        color: COLORS.AGENTS.FORAGER,
        numSensorRays: 24,  // FURTHER REDUCED for performance
        maxRayDist: 400, // INCREASED from 300 to 400 to help foragers find food more easily
        hiddenSize: 20,
        description: 'Specialized in finding and consuming food.'
    },
    [SPECIALIZATION_TYPES.PREDATOR]: {
        color: COLORS.AGENTS.PREDATOR,
        numSensorRays: 32,  // FURTHER REDUCED for performance
        maxRayDist: 450, // Increased from 300
        hiddenSize: 25,
        description: 'Specialized in hunting other agents.'
    },
    [SPECIALIZATION_TYPES.REPRODUCER]: {
        color: COLORS.AGENTS.REPRODUCER,
        numSensorRays: 24,  // FURTHER REDUCED for performance
        maxRayDist: 250, // Increased from 150
        hiddenSize: 18,
        description: 'Specialized in mating and creating offspring.'
    },
    [SPECIALIZATION_TYPES.SCOUT]: {
        color: COLORS.AGENTS.SCOUT,
        numSensorRays: 32,  // FURTHER REDUCED for performance
        maxRayDist: 600, // Increased from 400
        hiddenSize: 15,
        description: 'Specialized in long-range sensing and exploration.'
    },
    [SPECIALIZATION_TYPES.DEFENDER]: {
        color: COLORS.AGENTS.DEFENDER,
        numSensorRays: 24,  // FURTHER REDUCED for performance
        maxRayDist: 350, // Increased from 250
        hiddenSize: 22,
        description: 'Specialized in defending territory and allies.'
    }
};

