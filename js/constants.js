// --- SIMULATION ENTITIES CONSTANTS (BALANCING) ---
// ALL VALUES PRESERVED EXACTLY FROM ORIGINAL

export const BASE_SIZE = 5;
export const ENERGY_TO_SIZE_RATIO = 100;
export const MAX_ENERGY = 2500; // Increased to allow more growth
export const MIN_ENERGY_TO_REPRODUCE = 250; 
export const REPRODUCE_COST_BASE = 15; 
export const CHILD_STARTING_ENERGY = 150; // Increased so offspring survive longer
export const INITIAL_AGENT_ENERGY = 2000; // Increased so agents can learn before dying 
export const MATURATION_AGE_SECONDS = 15; 
export const REPRODUCTION_COOLDOWN_FRAMES = 60 * 5; 
export const PREGNANCY_DURATION_FRAMES = 60 * 8; 

export const RESPAWN_DELAY_FRAMES = 0; 

export const OBESITY_THRESHOLD_ENERGY = 350; 
export const OBESITY_ENERGY_TAX_DIVISOR = 500; 

export const MAX_THRUST = 0.5; 
export const MAX_ROTATION = 0.1; 
export const MAX_VELOCITY = 10; 
export const SPRINT_BONUS_THRUST = 0.5;
export const SPRINT_COST_PER_FRAME = 0.4; // Reduced from 0.8 to allow more sprinting
export const SPRINT_THRESHOLD = 0.9;
export const FEAR_SPRINT_BONUS = 0.5;

export const OBSTACLE_COLLISION_PENALTY = 50; // Reduced to be less punishing while learning 
export const OBSTACLE_HIDING_RADIUS = 75; 

export const DANGER_PHEROMONE_THRESHOLD = 30;
export const PHEROMONE_FADE_RATE = 0.005;
export const PHEROMONE_RADIUS = 60;

export const FOOD_SPAWN_CAP = 900; // Increased to give agents more food to find
export const HIGH_VALUE_FOOD_CHANCE = 0.05;
export const DAMPENING_FACTOR = 0.95; 

export const ROTATION_COST_MULTIPLIER = 0.5; 

// --- NEW ENERGY BALANCE FIXES ---
export const PASSIVE_LOSS = 0.000002; // Reduced by 60% to give agents more time
export const MOVEMENT_COST_MULTIPLIER = 0.004; // Reduced by 50% to allow more exploration

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
export const MIN_FITNESS_TO_SAVE_GENE_POOL = 200;

// Agent specialization configurations
export const AGENT_CONFIGS = {
    [SPECIALIZATION_TYPES.FORAGER]: {
        color: 0x00ff00, // Green
        numSensorRays: 40,
        maxRayDist: 200,
        hiddenSize: 20,
        description: 'Specialized in finding and consuming food.'
    },
    [SPECIALIZATION_TYPES.PREDATOR]: {
        color: 0xff0000, // Red
        numSensorRays: 50,
        maxRayDist: 300,
        hiddenSize: 25,
        description: 'Specialized in hunting other agents.'
    },
    [SPECIALIZATION_TYPES.REPRODUCER]: {
        color: 0x0000ff, // Blue
        numSensorRays: 30,
        maxRayDist: 150,
        hiddenSize: 18,
        description: 'Specialized in mating and creating offspring.'
    },
    [SPECIALIZATION_TYPES.SCOUT]: {
        color: 0xffff00, // Yellow
        numSensorRays: 60,
        maxRayDist: 400,
        hiddenSize: 15,
        description: 'Specialized in long-range sensing and exploration.'
    },
    [SPECIALIZATION_TYPES.DEFENDER]: {
        color: 0xffa500, // Orange
        numSensorRays: 35,
        maxRayDist: 250,
        hiddenSize: 22,
        description: 'Specialized in defending territory and allies.'
    }
};

