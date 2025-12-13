/**
 * @fileoverview Agent-related constants.
 * Physical properties, movement, energy, reproduction, neural network, fitness, and specialization.
 */

// ============================================================================
// AGENT PHYSICAL PROPERTIES
// ============================================================================
// Size, appearance, and base energy system

/**
 * Default visual radius of agents in pixels.
 * Base size before energy-based scaling is applied.
 * @type {number}
 * @constant
 * @default 25
 */
export const BASE_SIZE = 25;

/**
 * Minimum visual size agents can shrink to, regardless of energy level.
 * Prevents agents from becoming invisible when low on energy.
 * @type {number}
 * @constant
 * @default 20
 */
export const MIN_AGENT_SIZE = 20;

/**
 * How much energy affects agent size (higher energy = larger size).
 * Used to calculate visual size: size = BASE_SIZE + (energy / ENERGY_TO_SIZE_RATIO)
 * @type {number}
 * @constant
 * @default 250
 */
export const ENERGY_TO_SIZE_RATIO = 250;

/**
 * Starting energy for newly spawned agents.
 * @type {number}
 * @constant
 * @default 800
 */
export const INITIAL_AGENT_ENERGY = 800;

/**
 * Maximum energy an agent can accumulate.
 * @type {number}
 * @constant
 * @default 25000
 */
export const MAX_ENERGY = 25000;

/**
 * Minimum energy required to attempt reproduction.
 * Reduced to enable reproduction with food scarcity.
 * @type {number}
 * @constant
 * @default 200
 */
export const MIN_ENERGY_TO_REPRODUCE = 200;

/**
 * Base energy cost for reproduction attempts.
 * @type {number}
 * @constant
 * @default 15
 */
export const REPRODUCE_COST_BASE = 15;

/**
 * Energy given to newborn agents.
 * BALANCED: 75% of parent starting energy (600 vs parent's 800)
 * Prevents child energy exploit where children > parents
 * @type {number}
 * @constant
 * @default 600
 */
export const CHILD_STARTING_ENERGY = 600;

/**
 * Minimum energy required for asexual reproduction (splitting).
 * REBALANCED: Reduced from 1600 to 1200 to make strategic splitting viable.
 * Now requires ~5-7 food items (was 13-16), encouraging reproducer strategy.
 * Still requires skill to accumulate safely.
 * @type {number}
 * @constant
 * @default 1200
 */
export const MIN_ENERGY_FOR_SPLITTING = 1200;

/**
 * Target average age for agents in seconds.
 * Used for balance tracking and UI display.
 * @type {number}
 * @constant
 * @default 120
 */
export const TARGET_AGE_SECONDS = 120;

/**
 * Energy level above which agents suffer obesity penalties.
 * Prevents agents from hoarding too much energy.
 * INCREASED from 15000 to 20000 to allow splitting accumulation (Recommendation 7)
 * @type {number}
 * @constant
 * @default 20000
 */
export const OBESITY_THRESHOLD_ENERGY = 20000;

/**
 * Divisor for calculating obesity energy tax (higher = less tax).
 * Tax = (energy - OBESITY_THRESHOLD_ENERGY) / OBESITY_ENERGY_TAX_DIVISOR
 * INCREASED from 2000 to 3000 for gentler taxation (Recommendation 7)
 * @type {number}
 * @constant
 * @default 3000
 */
export const OBESITY_ENERGY_TAX_DIVISOR = 3000;

/**
 * Energy level that triggers low-energy visual warnings.
 * Agents below this threshold show red borders.
 * @type {number}
 * @constant
 * @default 100
 */
export const LOW_ENERGY_THRESHOLD = 100;

/**
 * Energy level below which agent is considered at critical death risk
 * @type {number}
 * @constant
 * @default 200
 */
export const DEATH_RISK_THRESHOLD = 200;

/**
 * Energy level below which agents prioritize food-seeking over mating.
 * Agents above this threshold can pursue mating, below prioritize food.
 * @type {number}
 * @constant
 * @default 500
 */
export const MODERATE_ENERGY_THRESHOLD = 500;

// ============================================================================
// AGENT MOVEMENT PHYSICS
// ============================================================================
// Thrust, rotation, velocity, momentum, and sprint mechanics

/**
 * Maximum acceleration force agents can apply per frame.
 * @type {number}
 * @constant
 * @default 0.5
 */
export const MAX_THRUST = 0.7;

/**
 * Maximum turning speed in radians per frame.
 * @type {number}
 * @constant
 * @default 0.1
 */
export const MAX_ROTATION = 0.2;

/**
 * Maximum speed an agent can reach in pixels per frame.
 * @type {number}
 * @constant
 * @default 8
 */
export const MAX_VELOCITY = 8;

/**
 * Additional thrust when sprinting.
 * @type {number}
 * @constant
 * @default 0.5
 */
export const SPRINT_BONUS_THRUST = 0.75;

/**
 * Energy cost per frame when sprinting.
 * @type {number}
 * @constant
 * @default 0.05
 */
export const SPRINT_COST_PER_FRAME = 0.05;

/**
 * Neural network output threshold to trigger sprinting (legacy).
 * Now used for cost threshold in directional sprint system.
 * @type {number}
 * @constant
 * @default 0.9
 */
export const SPRINT_THRESHOLD = 0.9;

/**
 * Extra thrust bonus when fleeing from threats.
 * @type {number}
 * @constant
 * @default 0.5
 */
export const FEAR_SPRINT_BONUS = 0.8;

/**
 * Reduced deadzone for finer speed control (reduced from 0.1).
 * Thrust values below this are ignored to prevent jittery movement.
 * @type {number}
 * @constant
 * @default 0.05
 */
export const THRUST_DEADZONE = 0.05;

/**
 * How quickly thrust ramps up towards target (0-1, higher = faster).
 * Increased from 0.2 for more responsive movement.
 * @type {number}
 * @constant
 * @default 0.35
 */
export const ACCELERATION_SMOOTHING = 0.75;

/**
 * Normal deceleration rate when reducing thrust (reduced from 0.15 for smoother stops).
 * @type {number}
 * @constant
 * @default 0.12
 */
export const DECELERATION_RATE_NORMAL = 0.12;

/**
 * Active braking deceleration rate (when thrust near zero).
 * Reduced from 0.35 for smoother braking.
 * @type {number}
 * @constant
 * @default 0.25
 */
export const DECELERATION_RATE_BRAKING = 0.25;

/**
 * Emergency stop deceleration rate (when danger detected).
 * Reduced from 0.5 for smoother emergency stops.
 * @type {number}
 * @constant
 * @default 0.4
 */
export const DECELERATION_RATE_EMERGENCY = 0.4;

/**
 * Rotation carryover factor (how much rotation persists).
 * Increased from 0.7 for smoother rotation.
 * @type {number}
 * @constant
 * @default 0.75
 */
export const ROTATION_MOMENTUM = 0.75;

/**
 * Rotation efficiency at max speed (30% reduction, harder to turn at high speeds).
 * Prevents agents from turning too easily at high speeds.
 * @type {number}
 * @constant
 * @default 0.7
 */
export const ROTATION_EFFICIENCY_AT_MAX_SPEED = 0.9;

/**
 * Sprint intensity multiplier (1.0 to 1.5x max thrust).
 * Used in directional sprint system.
 * @type {number}
 * @constant
 * @default 0.5
 */
export const SPRINT_BONUS_MULTIPLIER = 0.5;

/**
 * Minimum sprint intensity to cost energy (below this = free).
 * @type {number}
 * @constant
 * @default 0.3
 */
export const SPRINT_COST_INTENSITY_THRESHOLD = 0.3;

/**
 * Velocity carryover factor (how much velocity persists before new thrust).
 * @type {number}
 * @constant
 * @default 0.85
 */
export const VELOCITY_MOMENTUM = 0.85;

/**
 * Velocity reduction factor applied each frame (friction).
 * @type {number}
 * @constant
 * @default 0.95
 */
export const DAMPENING_FACTOR = 0.95;

/**
 * Stronger friction applied when agent is not thrusting.
 * @type {number}
 * @constant
 * @default 0.90
 */
export const BRAKING_FRICTION = 0.90;

// ============================================================================
// AGENT ENERGY MANAGEMENT
// ============================================================================
// Passive loss, movement costs, and temperature system

/**
 * Energy lost per frame just by existing (metabolic cost).
 * PHASE 3: Reduced from 0.08 to 0.06 to enable interesting behaviors.
 * Gives agents ~33% more time to hunt, split, and coordinate.
 * Average lifespan increases from 6.7s to 9-11s.
 * @type {number}
 * @constant
 * @default 0.06
 */
export const PASSIVE_LOSS = 0.06;

/**
 * Energy cost multiplier for movement (velocity * this).
 * @type {number}
 * @constant
 * @default 0.03
 */
export const MOVEMENT_COST_MULTIPLIER = 0.03;

/**
 * Energy cost multiplier for rotation (rotation speed * this).
 * @type {number}
 * @constant
 * @default 0.1
 */
export const ROTATION_COST_MULTIPLIER = 0.1;

/**
 * Energy loss per frame based on agent size.
 * Larger agents lose more energy passively.
 * @type {number}
 * @constant
 * @default 0.00025
 */
export const AGENT_SIZE_ENERGY_LOSS_MULTIPLIER = 0.00025;

/**
 * Maximum temperature value.
 * @type {number}
 * @constant
 * @default 100
 */
export const TEMPERATURE_MAX = 100;

/**
 * Minimum temperature value.
 * @type {number}
 * @constant
 * @default 0
 */
export const TEMPERATURE_MIN = 0;

/**
 * Starting temperature (closer to optimal range center).
 * @type {number}
 * @constant
 * @default 50
 */
export const TEMPERATURE_START = 50;

/**
 * Temperature gain per frame at max speed.
 * @type {number}
 * @constant
 * @default 0.025
 */
export const TEMPERATURE_GAIN_MOVE = 0.025;

/**
 * Temperature gain when eating (reduced from 4 to prevent rapid heat stress).
 * @type {number}
 * @constant
 * @default 2
 */
export const TEMPERATURE_GAIN_EAT = 2;

/**
 * Temperature loss per frame.
 * @type {number}
 * @constant
 * @default 0.015
 */
export const TEMPERATURE_LOSS_PASSIVE = 0.015;

/**
 * Max multiplier for passive energy loss at 0 temperature.
 * REDUCED from 7.0 to 4.0 for better balance (Recommendation 5).
 * Prevents harsh feedback loops where cold agents die before learning.
 * @type {number}
 * @constant
 * @default 4.0
 */
export const TEMPERATURE_PASSIVE_LOSS_FACTOR = 4.0;

/**
 * Minimum temperature for optimal performance.
 * @type {number}
 * @constant
 * @default 40
 */
export const TEMPERATURE_OPTIMAL_MIN = 40;

/**
 * Maximum temperature for optimal performance.
 * @type {number}
 * @constant
 * @default 65
 */
export const TEMPERATURE_OPTIMAL_MAX = 65;

/**
 * Temperature below which severe cold stress occurs.
 * @type {number}
 * @constant
 * @default 30
 */
export const TEMPERATURE_COLD_STRESS_THRESHOLD = 30;

/**
 * Temperature above which severe heat stress occurs.
 * @type {number}
 * @constant
 * @default 85
 */
export const TEMPERATURE_HEAT_STRESS_THRESHOLD = 85;

/**
 * Temperature below which moderate cold effects occur.
 * @type {number}
 * @constant
 * @default 40
 */
export const TEMPERATURE_COLD_MODERATE_THRESHOLD = 40;

/**
 * Temperature above which moderate heat effects occur.
 * @type {number}
 * @constant
 * @default 70
 */
export const TEMPERATURE_HEAT_MODERATE_THRESHOLD = 70;

/**
 * Movement efficiency at optimal temperatures.
 * @type {number}
 * @constant
 * @default 1.0
 */
export const TEMPERATURE_EFFICIENCY_OPTIMAL = 1.0;

/**
 * Movement efficiency in moderate cold.
 * @type {number}
 * @constant
 * @default 0.7
 */
export const TEMPERATURE_EFFICIENCY_COLD_MODERATE = 0.7;

/**
 * Movement efficiency in moderate heat.
 * @type {number}
 * @constant
 * @default 0.8
 */
export const TEMPERATURE_EFFICIENCY_HEAT_MODERATE = 0.8;

/**
 * Movement efficiency in severe cold.
 * @type {number}
 * @constant
 * @default 0.3
 */
export const TEMPERATURE_EFFICIENCY_COLD_SEVERE = 0.3;

/**
 * Movement efficiency in severe heat.
 * @type {number}
 * @constant
 * @default 0.4
 */
export const TEMPERATURE_EFFICIENCY_HEAT_SEVERE = 0.4;

/**
 * Chance of reproduction suppression in extreme temperatures.
 * @type {number}
 * @constant
 * @default 0.3
 */
export const TEMPERATURE_REPRODUCTION_SUPPRESSION_EXTREME = 0.3;

// ============================================================================
// AGENT REPRODUCTION
// ============================================================================
// Timing, costs, cooldowns, and maturation

/**
 * Frames an agent must wait between reproduction attempts (5 seconds).
 * @type {number}
 * @constant
 * @default 60 * 5
 */
export const REPRODUCTION_COOLDOWN_FRAMES = 60 * 5;

/**
 * Frames required for pregnancy to complete (8 seconds).
 * @type {number}
 * @constant
 * @default 60 * 8
 */
export const PREGNANCY_DURATION_FRAMES = 60 * 8;

/**
 * Minimum age in frames before agents can reproduce (10 seconds).
 * @type {number}
 * @constant
 * @default 600
 */
export const MATURATION_AGE_FRAMES = 600;

/**
 * Frames to wait before respawning dead agents.
 * @type {number}
 * @constant
 * @default 0
 */
export const RESPAWN_DELAY_FRAMES = 0;

// ============================================================================
// AGENT NEURAL NETWORK & EVOLUTION
// ============================================================================
// Memory, goals, mutation, and evolution parameters

/**
 * Number of previous frames stored for temporal decision making (~1 second at 60fps).
 * @type {number}
 * @constant
 * @default 60
 */
export const AGENT_MEMORY_FRAMES = 60;

/**
 * Frames to remember target after losing sight (~3 seconds at 60fps).
 * @type {number}
 * @constant
 * @default 180
 */
export const TARGET_ATTENTION_SPAN_FRAMES = 180;

/**
 * Goal tracking constants (numeric for performance).
 * Used internally by neural network for decision making.
 * @type {Object}
 * @constant
 */
export const GOALS = {
    FIND_FOOD: 0,
    FIND_MATE: 1,
    AVOID_DANGER: 2,
    REST: 3
};

/**
 * Base probability of gene mutations during reproduction.
 * @type {number}
 * @constant
 * @default 0.1
 */
export const BASE_MUTATION_RATE = 0.1;

/**
 * Base multiplier for agent movement speed calculations.
 * @type {number}
 * @constant
 * @default 2
 */
export const AGENT_SPEED_FACTOR_BASE = 2;

/**
 * Random variance range for speed factor inheritance.
 * @type {number}
 * @constant
 * @default 3
 */
export const AGENT_SPEED_FACTOR_VARIANCE = 3;

// ============================================================================
// AGENT FITNESS & BEHAVIOR
// ============================================================================
// Fitness thresholds, movement rewards, and navigation tracking

/**
 * Multiplier for fitness scoring based on directional changes.
 * @type {number}
 * @constant
 * @default 2.0
 */
export const DIRECTION_CHANGE_FITNESS_FACTOR = 2.0;

/**
 * Minimum distance traveled to get movement rewards.
 * Prevents tiny movements from accumulating fitness.
 * @type {number}
 * @constant
 * @default 100
 */
export const MIN_DISTANCE_FOR_MOVEMENT_REWARDS = 100;

/**
 * Minimum angle change in radians to count for directionChanged (~5.7 degrees).
 * @type {number}
 * @constant
 * @default 0.1
 */
export const MIN_ANGLE_CHANGE_FOR_FITNESS = 0.1;

/**
 * Minimum speed change to count for speedChanged.
 * @type {number}
 * @constant
 * @default 0.15
 */
export const MIN_SPEED_CHANGE_FOR_FITNESS = 0.15;

/**
 * Minimum turn angle for navigation rewards (~8.6 degrees).
 * @type {number}
 * @constant
 * @default 0.15
 */
export const MIN_NAVIGATION_TURN_FOR_FITNESS = 0.15;

/**
 * Minimum distance improvement to count as food approach.
 * @type {number}
 * @constant
 * @default 5
 */
export const MIN_FOOD_APPROACH_DISTANCE = 5;

/**
 * Fitness reward multipliers for various behaviors.
 * These constants control how much each behavior contributes to fitness.
 * @type {Object}
 * @constant
 */
export const FITNESS_MULTIPLIERS = {
    // Core survival behaviors (REBALANCED for variety)
    FOOD_EATEN: 150,              // Points per food item eaten
    OFFSPRING: 200,               // Points per offspring produced (INCREASED for reproducers)
    KILLS: 500,                   // Points per agent killed
    PREDATOR_SUCCESS_BONUS: 400,  // Additional bonus for predator specialization (INCREASED from 150)

    // Exploration and movement
    EXPLORATION: 200,             // Points per 1% of map explored (increased from 100)
    CLEVER_TURNS: 15,             // Points per clever turn (reduced from 50 to prevent dominance)
    EFFICIENCY: 20,               // Points per efficiency unit (distance/energy, increased from 15)
    EFFICIENCY_BONUS_MAX: 0.5,    // Max multiplier bonus for energy efficiency (Recommendation 3)

    // Navigation behaviors (NO LONGER normalized by distance - Recommendation 4)
    TURNS_TOWARDS_FOOD: 8,        // Points per turn towards food
    TURNS_AWAY_FROM_OBSTACLES: 8, // Points per turn away from obstacles
    FOOD_APPROACHES: 15,          // Points per food approach

    // Movement patterns (NO LONGER normalized by distance - Recommendation 4)
    DIRECTION_CHANGES: 0.5,       // Points per direction change (reduced from 1.0, no distance normalization)
    SPEED_CHANGES: 0.25,          // Points per speed change (reduced from 0.5, no distance normalization)

    // Advanced behaviors
    SUCCESSFUL_ESCAPES: 75,       // Points per successful escape
    GOALS_COMPLETED: 100,         // Points per completed goal
    REPRODUCTION_ATTEMPT: 5,      // Points per reproduction attempt (even if unsuccessful)
    FIT_OFFSPRING_BONUS: 300,     // Points per offspring that becomes validated (Recommendation 12)

    // Temperature system (REDUCED PENALTY - Recommendation 13)
    TEMPERATURE_BONUS_MAX: 100,   // Maximum temperature bonus points
    TEMPERATURE_PENALTY_MAX: 100, // Maximum temperature penalty points

    // Synergy bonuses
    REPRODUCTION_FOOD_SYNERGY: 10,  // Multiplier for (offspring × 2 + foodEaten) synergy

    // Job Performance Bonuses (REBALANCED for interesting behaviors)
    JOB_PERFORMANCE_KILLS: 800,             // Predator: bonus per kill (unchanged)
    JOB_PERFORMANCE_PURSUIT_ATTEMPT: 2,     // NEW: Predator pursuit attempts
    JOB_PERFORMANCE_FLOCKING: 3.0,          // Scout/Forager: alignment (INCREASED from 2.0)
    JOB_PERFORMANCE_GUARDING: 8,            // Defender: guarding bonus (unchanged)
    JOB_PERFORMANCE_PURSUIT: 5,             // Predator: high-speed pursuit (unchanged)
    JOB_PERFORMANCE_EXPLORATION: 3.0,       // Scout: exploration multiplier (unchanged)
    JOB_PERFORMANCE_REPRODUCTION: 400       // Reproducer split bonus (INCREASED from 250)
};

/**
 * Fitness penalty multipliers for negative behaviors.
 * @type {Object}
 * @constant
 */
export const FITNESS_PENALTIES = {
    CIRCULAR_MOVEMENT: 20,        // Points per consecutive turn (unchanged)
    OBSTACLE_HIT: 300,            // Points per obstacle collision (REDUCED from 500 for learning)
    WALL_HIT: 75,                 // Points per wall collision (REDUCED from 100)
    INACTIVITY: 2,                // Points per second of inactivity (unchanged)
    MINIMAL_MOVEMENT: 50,         // Maximum penalty for barely moving (unchanged)
    EFFICIENCY_LOW: 150           // Penalty for low efficiency (REDUCED from 200)
};

/**
 * Survival bonus multipliers.
 * @type {Object}
 * @constant
 */
export const SURVIVAL_BONUSES = {
    BASE_MULTIPLIER: 5,           // Points per second of survival (increased from 1 to reward longevity)
    BASE_CAP: 500,                 // Maximum base survival bonus
    EXTENDED_THRESHOLD: 500,       // Seconds before survival bonus kicks in (increased from 30)
    EXTENDED_DIVISOR: 10           // Divisor for extended survival bonus
};

// ============================================================================
// NEW FITNESS CATEGORY SYSTEM
// ============================================================================
// Transparent 3-category fitness scoring for better debuggability and balance

/**
 * Fitness category weights.
 * Total fitness = (Survival × 0.3) + (Action × 0.3) + (Specialization × 0.4)
 * @type {Object}
 * @constant
 */
export const FITNESS_CATEGORIES = {
    SURVIVAL_WEIGHT: 0.3,         // 30% of total fitness
    ACTION_WEIGHT: 0.3,           // 30% of total fitness
    SPECIALIZATION_WEIGHT: 0.4    // 40% of total fitness (job performance matters most)
};

/**
 * Survival score components - staying alive and healthy.
 * @type {Object}
 * @constant
 */
export const SURVIVAL_SCORING = {
    AGE_MULTIPLIER: 5,                    // Points per second alive
    TEMPERATURE_EFFICIENCY_BONUS: 100,    // Max bonus for maintaining optimal temp
    DAMAGE_AVOIDANCE_BONUS: 0.5,          // Per frame without collision
    ENERGY_EFFICIENCY_MULTIPLIER: 20      // Distance / Energy ratio reward
};

/**
 * Action score components - interacting with the world.
 * @type {Object}
 * @constant
 */
export const ACTION_SCORING = {
    FOOD_EATEN: 150,                      // Per food item consumed
    EXPLORATION_PERCENT: 200,             // Per 1% of map explored
    MOVEMENT_DISTANCE: 0.5,               // Per pixel traveled (meaningful movement only)
    GOAL_COMPLETION: 100,                 // Per goal successfully completed
    NAVIGATION_QUALITY: 8                 // Turns towards food, away from obstacles
};

/**
 * Specialization score components - job-specific performance.
 * Each agent type has unique scoring criteria.
 * @type {Object}
 * @constant
 */
export const SPECIALIZATION_SCORING = {
    // Predator: Hunting effectiveness (INCREASED to reward kills)
    PREDATOR_DAMAGE_DEALT: 10,            // Per point of damage dealt
    PREDATOR_KILLS: 800,                  // Per successful kill (INCREASED from 500)
    PREDATOR_PURSUIT_TIME: 5,             // Per frame actively pursuing prey (INCREASED from 2)

    // Forager: Food gathering efficiency (INCREASED cooperation rewards)
    FORAGER_FOOD_EFFICIENCY: 1.5,         // Multiplier for energy gained vs spent
    FORAGER_GATHERING_RATE: 100,          // Bonus for food per minute rate
    FORAGER_SHARING_BONUS: 50,            // Per food found shout (INCREASED from 25)

    // Scout: Exploration and information (INCREASED cooperation rewards)
    SCOUT_UNIQUE_SECTORS: 5,              // Per unique sector visited
    SCOUT_INFORMATION_SHARING: 50,        // Per shout made (alerts) (INCREASED from 25)
    SCOUT_VISION_UTILIZATION: 2,          // Bonus for using long-range vision

    // Defender: Protection and territory (INCREASED to reward active defense)
    DEFENDER_DAMAGE_MITIGATED: 25,        // Per point of damage prevented (INCREASED from 15)
    DEFENDER_TIME_NEAR_ALLIES: 2,         // Per frame near allies (guarding) (INCREASED from 1)
    DEFENDER_PREDATOR_INTERCEPTION: 250,  // Per predator confronted (INCREASED from 100)
    DEFENDER_PATROL_BONUS: 0.5,           // Per frame actively patrolling territory

    // Reproducer: Reproduction success (INCREASED to reward strategic splitting)
    REPRODUCER_OFFSPRING: 300,            // Per offspring created (INCREASED from 200)
    REPRODUCER_OFFSPRING_SURVIVAL: 300,   // Per offspring that survives 30+ seconds
    REPRODUCER_SPLIT_BONUS: 400           // Per asexual split (INCREASED from 250)
};

// ============================================================================
// AGENT SPECIALIZATION
// ============================================================================
// Types, configurations, and visual appearance

/**
 * Agent specialization types.
 * Each type has unique neural network and sensor configurations.
 * @type {Object}
 * @constant
 */
export const SPECIALIZATION_TYPES = {
    FORAGER: 'forager',    // Food-finding specialists
    PREDATOR: 'predator',  // Hunting specialists
    REPRODUCER: 'reproducer', // Breeding specialists
    SCOUT: 'scout',        // Exploration specialists
    DEFENDER: 'defender'    // Territory defense specialists
};

// ============================================================================
// SPECIALIZATION TUNING
// ============================================================================

/**
 * Predator adrenaline speed multiplier.
 * @type {number}
 * @constant
 * @default 1.3
 */
export const PREDATOR_ADRENALINE_SPEED_MULT = 1.3;

/**
 * Predator adrenaline ray length multiplier.
 * @type {number}
 * @constant
 * @default 1.5
 */
export const PREDATOR_ADRENALINE_RAY_MULT = 1.5;

/**
 * Predator adrenaline decay rate per frame.
 * @type {number}
 * @constant
 * @default 0.01
 */
export const PREDATOR_ADRENALINE_DECAY = 0.01;

/**
 * Damage reduction factor for Defenders against Predators.
 * @type {number}
 * @constant
 * @default 0.5
 */
export const DEFENDER_DAMAGE_REDUCTION = 0.5;

/**
 * Energy cost multiplier for Scouts.
 * @type {number}
 * @constant
 * @default 0.7
 */
export const SCOUT_ENERGY_COST_MULTIPLIER = 0.7;

/**
 * Chance for Scouts to shout when finding food.
 * @type {number}
 * @constant
 * @default 0.5
 */
export const SCOUT_FOOD_ALERT_CHANCE = 0.5;

/**
 * Ink Cloud duration in frames.
 * @type {number}
 * @constant
 * @default 150
 */
export const INK_DURATION = 150;

/**
 * Ink Cloud size (radius).
 * @type {number}
 * @constant
 * @default 80
 */
export const INK_SIZE = 80;

/**
 * Ink Cloud fade rate per frame.
 * @type {number}
 * @constant
 * @default 0.003
 */
export const INK_FADE_RATE = 0.003;

/**
 * Ink Cloud blindness threshold (intensity required to cause blindness).
 * @type {number}
 * @constant
 * @default 0.3
 */
export const INK_BLINDNESS_THRESHOLD = 0.3;

/**
 * Ink Cloud blindness factor (how much vision is reduced).
 * @type {number}
 * @constant
 * @default 0.1
 */
export const INK_BLINDNESS_FACTOR = 0.1;

/**
 * Agent specialization configurations.
 * Each specialization has unique neural network size and sensor capabilities.
 * @type {Object}
 * @constant
 */
export const AGENT_CONFIGS = {
    [SPECIALIZATION_TYPES.FORAGER]: {
        color: 0xCCFF00,      // Visual color for forager agents (neon lime)
        numSensorRays: 16,    // Number of sensor rays for detecting environment
        maxRayDist: 300,      // Maximum distance sensor rays can detect
        hiddenSize: 64,      // Size of neural network hidden layer (increased to 64 for brain capacity)
        description: 'Specialized in finding and consuming food.',
        shape: 'circle',      // Standard efficient shape
        rotationOffset: 0     // No rotation needed
    },
    [SPECIALIZATION_TYPES.PREDATOR]: {
        color: 0xFF0033,      // Visual color for predator agents (neon red)
        numSensorRays: 24,    // Number of sensor rays for detecting environment
        maxRayDist: 350,      // Maximum distance sensor rays can detect
        hiddenSize: 64,       // Size of neural network hidden layer (increased to 64 for brain capacity)
        description: 'Specialized in hunting other agents.',
        shape: 'triangle',    // Aggressive, sharp shape
        rotationOffset: -Math.PI / 2 // Point triangle forward (default points up/right depending on geom)
    },
    [SPECIALIZATION_TYPES.REPRODUCER]: {
        color: 0x00F0FF,     // Visual color for reproducer agents (neon cyan)
        numSensorRays: 16,    // Number of sensor rays for detecting environment
        maxRayDist: 250,      // Maximum distance sensor rays can detect
        hiddenSize: 64,       // Size of neural network hidden layer (increased to 64 for brain capacity)
        description: 'Specialized in mating and creating offspring.',
        shape: 'hexagon',     // Organic, hive-like shape
        rotationOffset: 0
    },
    [SPECIALIZATION_TYPES.SCOUT]: {
        color: 0xFFFF00,      // Visual color for scout agents (neon yellow)
        numSensorRays: 24,    // Number of sensor rays for detecting environment
        maxRayDist: 400,      // Maximum distance sensor rays can detect
        hiddenSize: 64,       // Size of neural network hidden layer (increased to 64 for brain capacity)
        description: 'Specialized in long-range sensing and exploration.',
        shape: 'diamond',     // Sleek, directional shape
        rotationOffset: 0
    },
    [SPECIALIZATION_TYPES.DEFENDER]: {
        color: 0xFF6600,      // Visual color for defender agents (neon orange)
        numSensorRays: 16,    // Number of sensor rays for detecting environment
        maxRayDist: 350,      // Maximum distance sensor rays can detect
        hiddenSize: 64,       // Size of neural network hidden layer (increased to 64 for brain capacity)
        description: 'Specialized in defending territory and allies.',
        shape: 'square',      // Solid, blocky shape
        rotationOffset: Math.PI / 4 // Rotate 45 deg to make it a diamond/square mix or just flat
    }
};

