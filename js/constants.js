/**
 * @fileoverview Centralized configuration constants for the blob evolution simulation.
 * All simulation parameters, thresholds, and configuration values are defined here.
 * Constants are organized into logical groups for easy maintenance and understanding.
 */

// ============================================================================
// SIMULATION CONFIGURATION
// ============================================================================
// Core world dimensions, performance settings, and simulation environment

/**
 * Total width of the simulation world in pixels.
 * @type {number}
 * @constant
 * @default 14400
 */
export const WORLD_WIDTH = 14400;

/**
 * Total height of the simulation world in pixels.
 * @type {number}
 * @constant
 * @default 8100
 */
export const WORLD_HEIGHT = 8100;

/**
 * Target frames per second for smooth animation and physics updates.
 * @type {number}
 * @constant
 * @default 60
 */
export const FPS_TARGET = 60;

/**
 * Minimum frames between automatic performance adjustments (15 seconds at 60 FPS).
 * Prevents rapid oscillation of performance settings.
 * @type {number}
 * @constant
 * @default 15000
 */
export const AUTO_ADJUST_COOLDOWN = 15000;

/**
 * Minimum number of agents that must exist at any time.
 * Prevents complete population extinction.
 * @type {number}
 * @constant
 * @default 5
 */
export const MIN_AGENTS = 5;

/**
 * Hard upper limit on total agent population.
 * Prevents performance degradation from too many agents.
 * @type {number}
 * @constant
 * @default 100
 */
export const MAX_AGENTS_LIMIT = 100;

/**
 * Minimum allowed game speed multiplier (slowest playback).
 * @type {number}
 * @constant
 * @default 0.5
 */
export const MIN_GAME_SPEED = 0.5;

/**
 * Maximum allowed game speed multiplier (fastest playback).
 * @type {number}
 * @constant
 * @default 10
 */
export const MAX_GAME_SPEED = 10;

/**
 * Memory usage threshold that triggers cleanup (150MB).
 * When memory usage exceeds this, cleanup routines are triggered.
 * @type {number}
 * @constant
 * @default 150 * 1024 * 1024
 */
export const MEMORY_PRESSURE_THRESHOLD = 150 * 1024 * 1024;

/**
 * Number of frames per season phase (environmental cycle).
 * 60 seconds at 60 FPS. Controls how long each season lasts.
 * @type {number}
 * @constant
 * @default 3600
 */
export const SEASON_LENGTH = 3600;

/**
 * Frame skip ratio for rendering (render 1 in N frames).
 * Higher values reduce rendering overhead but may make animation less smooth.
 * Set to 1 to render every frame, 2 to render every other frame, etc.
 * @type {number}
 * @constant
 * @default 2
 */
export const RENDER_FRAME_SKIP = 2;

/**
 * Enable or disable post-processing effects (bloom, motion blur, etc.).
 * Disabling can significantly improve performance on lower-end devices.
 * @type {boolean}
 * @constant
 * @default false
 */
export const POST_PROCESSING_ENABLED = true;

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
export const ROTATION_EFFICIENCY_AT_MAX_SPEED = 0.7;

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
 * @default 300
 */
export const INK_DURATION = 300;

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
        hiddenSize: 30,      // Size of neural network hidden layer (increased from 24 for better capacity - 25% increase)
        description: 'Specialized in finding and consuming food.',
        shape: 'circle',      // Standard efficient shape
        rotationOffset: 0     // No rotation needed
    },
    [SPECIALIZATION_TYPES.PREDATOR]: {
        color: 0xFF0033,      // Visual color for predator agents (neon red)
        numSensorRays: 24,    // Number of sensor rays for detecting environment
        maxRayDist: 350,      // Maximum distance sensor rays can detect
        hiddenSize: 38,       // Size of neural network hidden layer (increased from 30 for better capacity - 27% increase)
        description: 'Specialized in hunting other agents.',
        shape: 'triangle',    // Aggressive, sharp shape
        rotationOffset: -Math.PI / 2 // Point triangle forward (default points up/right depending on geom)
    },
    [SPECIALIZATION_TYPES.REPRODUCER]: {
        color: 0x00F0FF,     // Visual color for reproducer agents (neon cyan)
        numSensorRays: 16,    // Number of sensor rays for detecting environment
        maxRayDist: 250,      // Maximum distance sensor rays can detect
        hiddenSize: 28,       // Size of neural network hidden layer (increased from 22 for better capacity - 27% increase)
        description: 'Specialized in mating and creating offspring.',
        shape: 'hexagon',     // Organic, hive-like shape
        rotationOffset: 0
    },
    [SPECIALIZATION_TYPES.SCOUT]: {
        color: 0xFFFF00,      // Visual color for scout agents (neon yellow)
        numSensorRays: 24,    // Number of sensor rays for detecting environment
        maxRayDist: 400,      // Maximum distance sensor rays can detect
        hiddenSize: 25,       // Size of neural network hidden layer (increased from 20 for better capacity - 25% increase)
        description: 'Specialized in long-range sensing and exploration.',
        shape: 'diamond',     // Sleek, directional shape
        rotationOffset: 0
    },
    [SPECIALIZATION_TYPES.DEFENDER]: {
        color: 0xFF6600,      // Visual color for defender agents (neon orange)
        numSensorRays: 16,    // Number of sensor rays for detecting environment
        maxRayDist: 350,      // Maximum distance sensor rays can detect
        hiddenSize: 32,       // Size of neural network hidden layer (increased from 26 for better capacity - 23% increase)
        description: 'Specialized in defending territory and allies.',
        shape: 'square',      // Solid, blocky shape
        rotationOffset: Math.PI / 4 // Rotate 45 deg to make it a diamond/square mix or just flat
    }
};

// ============================================================================
// FOOD SYSTEM
// ============================================================================
// Spawning, energy values, decay, and visual properties

/**
 * Maximum number of food items that can exist simultaneously.
 * @type {number}
 * @constant
 * @default 300
 */
export const FOOD_SPAWN_CAP = 300;

/**
 * Probability per frame of attempting to spawn new food.
 * Reduced to lower energy buffer from 269.6% toward 150-200% target.
 * @type {number}
 * @constant
 * @default 0.02
 */
export const FOOD_SPAWN_RATE = 0.02;

/**
 * Probability that spawned food will be high-value type.
 * @type {number}
 * @constant
 * @default 0.1
 */
export const HIGH_VALUE_FOOD_CHANCE = 0.1;

/**
 * Probability that food spawns near living agents (helps learning).
 * @type {number}
 * @constant
 * @default 0.3
 */
export const FOOD_SPAWN_NEAR_AGENTS_CHANCE = 0.3;

/**
 * Minimum distance from agent to spawn food.
 * @type {number}
 * @constant
 * @default 200
 */
export const FOOD_SPAWN_NEAR_AGENT_DISTANCE_MIN = 200;

/**
 * Maximum distance from agent to spawn food.
 * @type {number}
 * @constant
 * @default 400
 */
export const FOOD_SPAWN_NEAR_AGENT_DISTANCE_MAX = 400;

/**
 * Base energy value of normal food.
 * Reduced to decrease food abundance and create more scarcity.
 * Further reduced to lower energy buffer toward target range.
 * @type {number}
 * @constant
 * @default 70
 */
export const FOOD_ENERGY_NORMAL_BASE = 70;

/**
 * Random variance in normal food energy (± this amount).
 * @type {number}
 * @constant
 * @default 20
 */
export const FOOD_ENERGY_NORMAL_VARIANCE = 20;

/**
 * Base energy value of high-value food.
 * Reduced to decrease food abundance and create more scarcity.
 * Further reduced to lower energy buffer, maintaining 2:1 ratio with normal food.
 * @type {number}
 * @constant
 * @default 140
 */
export const FOOD_ENERGY_HIGH_BASE = 140;

/**
 * Random variance in high-value food energy (± this amount).
 * @type {number}
 * @constant
 * @default 50
 */
export const FOOD_ENERGY_HIGH_VARIANCE = 50;

/**
 * Visual radius of normal food in pixels (increased for better ray detection).
 * @type {number}
 * @constant
 * @default 20
 */
export const FOOD_SIZE_NORMAL = 20;

/**
 * Visual radius of high-value food in pixels (increased for better ray detection).
 * @type {number}
 * @constant
 * @default 30
 */
export const FOOD_SIZE_HIGH = 30;

/**
 * Minimum size normal food can shrink to during decay (increased for better ray detection).
 * @type {number}
 * @constant
 * @default 8
 */
export const FOOD_SIZE_MIN_NORMAL = 8;

/**
 * Minimum size high-value food can shrink to during decay (increased for better ray detection).
 * @type {number}
 * @constant
 * @default 12
 */
export const FOOD_SIZE_MIN_HIGH = 12;

/**
 * Base rate at which food loses energy per frame.
 * @type {number}
 * @constant
 * @default 0.002
 */
export const FOOD_ROT_RATE_BASE = 0.002;

/**
 * Random variance in food rot rate.
 * @type {number}
 * @constant
 * @default 0.003
 */
export const FOOD_ROT_RATE_VARIANCE = 0.003;

/**
 * Base maximum age of food before it disappears (in frames).
 * @type {number}
 * @constant
 * @default 10000
 */
export const FOOD_MAX_AGE_BASE = 10000;

/**
 * Random variance in food maximum age (± this amount).
 * @type {number}
 * @constant
 * @default 1000
 */
export const FOOD_MAX_AGE_VARIANCE = 1000;

// ============================================================================
// OBSTACLE SYSTEM
// ============================================================================
// Generation, placement, and interaction

/**
 * Actual number of obstacles spawned in the world.
 * @type {number}
 * @constant
 * @default 25
 */
export const OBSTACLE_COUNT = 25;

/**
 * Minimum radius of obstacles in pixels.
 * @type {number}
 * @constant
 * @default 40
 */
export const OBSTACLE_MIN_RADIUS = 40;

/**
 * Maximum radius of obstacles in pixels.
 * @type {number}
 * @constant
 * @default 120
 */
export const OBSTACLE_MAX_RADIUS = 120;

/**
 * Minimum distance obstacles must maintain from each other.
 * @type {number}
 * @constant
 * @default 350
 */
export const OBSTACLE_MIN_DISTANCE = 350;

/**
 * Distance from world edges where obstacles cannot spawn.
 * @type {number}
 * @constant
 * @default 250
 */
export const OBSTACLE_SPAWN_MARGIN = 250;

/**
 * Distance at which obstacles affect agent behavior.
 * @type {number}
 * @constant
 * @default 600
 */
export const OBSTACLE_INFLUENCE_RADIUS = 600;

/**
 * Maximum movement speed of obstacles.
 * @type {number}
 * @constant
 * @default 0.3
 */
export const OBSTACLE_MAX_SPEED = 0.3;

/**
 * Number of segments in obstacle path.
 * @type {number}
 * @constant
 * @default 8
 */
export const OBSTACLE_SEGMENTS = 8;

/**
 * Maximum obstacles GPU can handle (buffer size, not actual count).
 * @type {number}
 * @constant
 */
export const GPU_MAX_OBSTACLES = OBSTACLE_COUNT * OBSTACLE_SEGMENTS;

/**
 * Energy damage taken when colliding with obstacles.
 * @type {number}
 * @constant
 * @default 50
 */
export const OBSTACLE_COLLISION_PENALTY = 50;

/**
 * Distance within which agents can hide behind obstacles.
 * @type {number}
 * @constant
 * @default 75
 */
export const OBSTACLE_HIDING_RADIUS = 75;

// ============================================================================
// PHEROMONE SYSTEM
// ============================================================================
// Chemical trail system for communication and navigation

/**
 * Total pheromone markers allowed in the world.
 * @type {number}
 * @constant
 * @default 2000
 */
export const MAX_PHEROMONES_TOTAL = 2000;

/**
 * Maximum markers per pheromone type (food, danger, etc.).
 * @type {number}
 * @constant
 * @default 500
 */
export const MAX_PHEROMONES_PER_TYPE = 500;

/**
 * Maximum markers allowed in any given area.
 * @type {number}
 * @constant
 * @default 5
 */
export const MAX_PHEROMONES_PER_AREA = 5;

/**
 * Search radius when checking for existing pheromones.
 * @type {number}
 * @constant
 * @default 50
 */
export const PHEROMONE_RADIUS_CHECK = 50;

/**
 * Visual radius of pheromone markers in pixels.
 * @type {number}
 * @constant
 * @default 60
 */
export const PHEROMONE_RADIUS = 60;

/**
 * Calculated diameter for convenience.
 * @type {number}
 * @constant
 */
export const PHEROMONE_DIAMETER = PHEROMONE_RADIUS * 2;

/**
 * Rate at which pheromones lose intensity per frame.
 * @type {number}
 * @constant
 * @default 0.005
 */
export const PHEROMONE_FADE_RATE = 0.00167; // Reduced to 1/3 of original (0.005/3) so pheromones last 3x longer

/**
 * Intensity threshold above which pheromones signal danger.
 * @type {number}
 * @constant
 * @default 30
 */
export const DANGER_PHEROMONE_THRESHOLD = 30;

// ============================================================================
// AGENT VOICE/SHOUTING SYSTEM
// ============================================================================
// Instant communication system for urgent events

/**
 * Duration in frames that shouts remain audible.
 * @type {number}
 * @constant
 * @default 60
 */
export const SHOUT_DURATION_FRAMES = 60; // 1 second at 60 FPS

/**
 * Base hearing range in pixels (multiplied by shout intensity).
 * @type {number}
 * @constant
 * @default 200
 */
export const SHOUT_BASE_RANGE = 200;

/**
 * Probability per frame that a defender will shout when seeing a predator.
 * @type {number}
 * @constant
 * @default 0.3
 */
export const SHOUT_PREDATOR_ALERT_CHANCE = 0.3;

/**
 * Minimum threat level (0-1) to trigger predator alert shout.
 * @type {number}
 * @constant
 * @default 0.7
 */
export const SHOUT_PREDATOR_ALERT_THRESHOLD = 0.7;

/**
 * Probability per frame that a forager will shout when finding food.
 * @type {number}
 * @constant
 * @default 0.1
 */
export const SHOUT_FOOD_FOUND_CHANCE = 0.1;

/**
 * Probability per frame that an agent will shout when requesting help (low energy, under attack).
 * @type {number}
 * @constant
 * @default 0.05
 */
export const SHOUT_HELP_REQUEST_CHANCE = 0.05;

/**
 * Probability per frame that a predator will shout when pursuing prey.
 * Enables pack hunting coordination.
 * @type {number}
 * @constant
 * @default 0.2
 */
export const SHOUT_ATTACK_COORDINATION_CHANCE = 0.2;

/**
 * Shout type identifiers.
 * @type {Object}
 * @constant
 */
export const SHOUT_TYPES = {
    PREDATOR_ALERT: 'predator_alert',
    FOOD_FOUND: 'food_found',
    HELP_REQUEST: 'help_request',
    MATE_CALL: 'mate_call',
    ATTACK_COORDINATION: 'attack_coordination'  // Predator pack hunting
};

/**
 * Pheromone colors by type (vibrant for visibility with post-processing).
 * @type {Object}
 * @constant
 */
export const PHEROMONE_COLORS = {
    danger: {
        base: 0xFF2020,      // Bright red
        emissive: 0xFF4400,  // Red-orange glow
        h: 0,                // Hue for HSL
        s: 100,              // Saturation
        l: 55                // Lightness
    },
    attack: {
        base: 0x00FF40,      // Vivid green
        emissive: 0x80FF00,  // Yellow-green glow
        h: 130,              // Hue for HSL
        s: 100,              // Saturation
        l: 50                // Lightness
    },
    reproduction: {
        base: 0xFF1493,      // Hot pink
        emissive: 0xFF00FF,  // Magenta glow
        h: 328,              // Hue for HSL
        s: 100,              // Saturation
        l: 54                // Lightness
    },
    ink: {
        base: 0x111111,      // Black/Dark Grey
        emissive: 0x000000,  // No emissive
        h: 0,                // Hue
        s: 0,                // Saturation
        l: 10                // Lightness
    }
};

/**
 * Pheromone emissive intensity multiplier for better bloom effect.
 * @type {number}
 * @constant
 * @default 2.0
 */
export const PHEROMONE_EMISSIVE_BOOST = 2.0;


// ============================================================================
// PHYSICS & COLLISION
// ============================================================================
// Dampening, separation, and combat mechanics

/**
 * Force applied to separate overlapping agents.
 * @type {number}
 * @constant
 * @default 1.0
 */
export const COLLISION_SEPARATION_STRENGTH = 1.0;

/**
 * Small random force to prevent collision sticking.
 * @type {number}
 * @constant
 * @default 0.05
 */
export const COLLISION_NUDGE_STRENGTH = 0.05;

/**
 * Maximum energy considered for collision damage calculation.
 * @type {number}
 * @constant
 * @default 1.0
 */
export const COLLISION_ENERGY_LOSS_CAP = 1.0;

/**
 * Percentage of energy lost in collisions.
 * @type {number}
 * @constant
 * @default 0.1
 */
export const COLLISION_ENERGY_LOSS_PERCENTAGE = 0.1;

/**
 * Buffer distance added to collision queries for movement between frames.
 * @type {number}
 * @constant
 * @default 20
 */
export const COLLISION_QUERY_BUFFER = 20;

/**
 * Reasonable estimate for collision queries - balances accuracy vs performance.
 * @type {number}
 * @constant
 * @default 100
 */
export const MAX_AGENT_SIZE_ESTIMATE = 100;

/**
 * Size ratio required for predator behavior (10% larger).
 * @type {number}
 * @constant
 * @default 1.1
 */
export const PREDATOR_SIZE_RATIO_THRESHOLD = 1.1;

/**
 * Size ratio threshold for prey vulnerability (10% smaller).
 * @type {number}
 * @constant
 * @default 0.909
 */
export const PREY_SIZE_RATIO_THRESHOLD = 0.909;

/**
 * Multiplier for collision separation calculations.
 * @type {number}
 * @constant
 * @default 0.5
 */
export const COLLISION_SEPARATION_MULTIPLIER = 0.5;

/**
 * Energy amount stolen when one agent bites another.
 * @type {number}
 * @constant
 * @default 5
 */
export const BITE_SIZE = 5;

/**
 * Velocity reduction when agents bounce off each other.
 * @type {number}
 * @constant
 * @default 0.8
 */
export const BOUNCE_ENERGY_LOSS = 0.8;

/**
 * Amount added to foodEaten counter when agents eat.
 * @type {number}
 * @constant
 * @default 0.1
 */
export const FOOD_EATEN_INCREMENT = 0.1;

/**
 * Energy damage taken when hitting world boundaries.
 * @type {number}
 * @constant
 * @default 50
 */
export const WALL_COLLISION_DAMAGE = 50;

/**
 * Velocity reduction factor when bouncing off edges.
 * @type {number}
 * @constant
 * @default 0.5
 */
export const EDGE_BOUNCE_DAMPING = 0.5;

/**
 * Default territory size for agents.
 * @type {number}
 * @constant
 * @default 200
 */
export const TERRITORY_RADIUS = 200;

/**
 * Minimum distance threshold for ray intersections.
 * @type {number}
 * @constant
 * @default 0.001
 */
export const RAY_DISTANCE_THRESHOLD = 0.001;

/**
 * Minimum value to avoid division by zero.
 * @type {number}
 * @constant
 * @default 0.0001
 */
export const DIVISION_BY_ZERO_THRESHOLD = 0.0001;

// ============================================================================
// GENE POOL OPTIMIZATION (RECOMMENDATIONS 3, 4, 8, 9, 10)
// ============================================================================
// Enhanced gene pool management for storing truly "best" agents

/**
 * Maximum size of gene pool (per specialization type).
 * Prevents pollution with mediocre agents.
 * @type {number}
 * @constant
 * @default 100
 */
export const GENE_POOL_MAX_SIZE = 100;

/**
 * Minimum fitness required to be considered for gene pool.
 * Agents below this threshold are never saved.
 * REBALANCED: Reduced from 2000 to 800 to align with harsh energy economy.
 * Previous threshold required 400+ seconds survival, now requires 80-120 seconds.
 * @type {number}
 * @constant
 * @default 800
 */
export const GENE_POOL_MIN_FITNESS = 1750;

/**
 * Fitness threshold for exceptional agents that are permanently protected.
 * Elite agents above this threshold are never removed from pool.
 * @type {number}
 * @constant
 * @default 5000
 */
export const GENE_POOL_ELITE_FITNESS_THRESHOLD = 5000;

/**
 * Maximum number of elite agents to protect permanently.
 * Ensures breakthrough strategies are preserved.
 * @type {number}
 * @constant
 * @default 20
 */
export const GENE_POOL_ELITE_PROTECTION_MAX = 20;

/**
 * When pool is full, replace worst agent if new agent is this much better (ratio).
 * 0.95 means new agent must have 95%+ of worst agent's fitness to replace.
 * @type {number}
 * @constant
 * @default 0.95
 */
export const GENE_POOL_REPLACEMENT_THRESHOLD = 0.95;

/**
 * Specialization quotas for gene pool diversity.
 * Ensures each specialization has representation in the pool.
 * @type {Object}
 * @constant
 */
export const GENE_POOL_SPECIALIZATION_QUOTAS = {
    forager: 0.30,      // 30% of pool
    predator: 0.20,     // 20% of pool
    reproducer: 0.20,   // 20% of pool
    scout: 0.15,        // 15% of pool
    defender: 0.15      // 15% of pool
};

/**
 * Minimum population median fitness multiplier for pruning stagnant genes.
 * Genes with fitness < (median × this) are removed during periodic pruning.
 * @type {number}
 * @constant
 * @default 0.5
 */
export const GENE_POOL_PRUNE_MULTIPLIER = 0.5;

/**
 * Frames between gene pool pruning cycles (~3 minutes at 60fps).
 * @type {number}
 * @constant
 * @default 10000
 */
export const GENE_POOL_PRUNE_INTERVAL = 10000;


// ============================================================================
// NEURAL NETWORK EVOLUTION
// ============================================================================
// Initialization, mutation strategies, and crossover

/**
 * Standard deviation for random weight initialization.
 * @type {number}
 * @constant
 * @default 0.1
 */
export const NN_WEIGHT_INIT_STD_DEV = 0.1;

/**
 * Mutation strength as ratio of initial weight std dev.
 * @type {number}
 * @constant
 * @default 0.3
 */
export const NN_MUTATION_STD_DEV_RATIO = 0.3;

/**
 * Probability of major structural mutations.
 * @type {number}
 * @constant
 * @default 0.02
 */
export const NN_MACRO_MUTATION_CHANCE = 0.02;

/**
 * Standard Gaussian mutation (exploration).
 * @type {string}
 * @constant
 */
export const MUTATION_STRATEGY_GAUSSIAN = 'gaussian';

/**
 * Cauchy distribution (longer tails, better for escaping local optima).
 * @type {string}
 * @constant
 */
export const MUTATION_STRATEGY_CAUCHY = 'cauchy';

/**
 * Polynomial mutation (self-adaptive).
 * @type {string}
 * @constant
 */
export const MUTATION_STRATEGY_POLYNOMIAL = 'polynomial';

/**
 * Default mutation strategy.
 * @type {string}
 * @constant
 */
export const MUTATION_STRATEGY_DEFAULT = MUTATION_STRATEGY_GAUSSIAN;

/**
 * Enable fitness-based adaptive mutation rates.
 * @type {boolean}
 * @constant
 * @default true
 */
export const ADAPTIVE_MUTATION_ENABLED = true;

/**
 * Minimum mutation rate (4% for high-fitness agents).
 * @type {number}
 * @constant
 * @default 0.04
 */
export const ADAPTIVE_MUTATION_MIN_RATE = 0.04;

/**
 * Maximum mutation rate (15% for low-fitness agents).
 * @type {number}
 * @constant
 * @default 0.15
 */
export const ADAPTIVE_MUTATION_MAX_RATE = 0.15;

/**
 * Below this percentile = high mutation.
 * @type {number}
 * @constant
 * @default 0.25
 */
export const ADAPTIVE_MUTATION_FITNESS_PERCENTILE_LOW = 0.25;

/**
 * Above this percentile = low mutation.
 * @type {number}
 * @constant
 * @default 0.75
 */
export const ADAPTIVE_MUTATION_FITNESS_PERCENTILE_HIGH = 0.75;

/**
 * Scale parameter for Cauchy distribution.
 * @type {number}
 * @constant
 * @default 0.1
 */
export const CAUCHY_SCALE_PARAMETER = 0.1;

/**
 * Distribution index for polynomial mutation (higher = more local).
 * @type {number}
 * @constant
 * @default 20
 */
export const POLYNOMIAL_DISTRIBUTION_INDEX = 20;

/**
 * Minimum allowed neural network weight value.
 * @type {number}
 * @constant
 * @default -3
 */
export const NN_WEIGHT_CLAMP_MIN = -3;

/**
 * Maximum allowed neural network weight value.
 * @type {number}
 * @constant
 * @default 3
 */
export const NN_WEIGHT_CLAMP_MAX = 3;

/**
 * Per-weight random selection from parents.
 * @type {string}
 * @constant
 */
export const CROSSOVER_TYPE_UNIFORM = 'uniform';

/**
 * Single split point (current default).
 * @type {string}
 * @constant
 */
export const CROSSOVER_TYPE_ONE_POINT = 'one_point';

/**
 * Multiple split points.
 * @type {string}
 * @constant
 */
export const CROSSOVER_TYPE_MULTI_POINT = 'multi_point';

/**
 * Blend based on parent fitness.
 * @type {string}
 * @constant
 */
export const CROSSOVER_TYPE_FITNESS_WEIGHTED = 'fitness_weighted';

/**
 * Simulated Binary Crossover (real-valued optimization).
 * @type {string}
 * @constant
 */
export const CROSSOVER_TYPE_SBX = 'sbx';

/**
 * Default crossover strategy.
 * @type {string}
 * @constant
 */
export const CROSSOVER_TYPE_DEFAULT = CROSSOVER_TYPE_UNIFORM;

/**
 * Probability of selecting from parent A in uniform crossover.
 * @type {number}
 * @constant
 * @default 0.5
 */
export const UNIFORM_CROSSOVER_PROBABILITY = 0.5;

/**
 * Number of split points for multi-point crossover.
 * @type {number}
 * @constant
 * @default 3
 */
export const MULTI_POINT_CROSSOVER_POINTS = 3;

/**
 * Blending factor for fitness-weighted crossover (0.6 = 60% from better parent).
 * @type {number}
 * @constant
 * @default 0.6
 */
export const FITNESS_WEIGHTED_CROSSOVER_ALPHA = 0.6;

/**
 * Distribution index for SBX (higher = more exploration).
 * @type {number}
 * @constant
 * @default 20
 */
export const SBX_DISTRIBUTION_INDEX = 20;

/**
 * 30% chance for elite parents to use fitness-weighted crossover.
 * @type {number}
 * @constant
 * @default 0.3
 */
export const ELITE_FITNESS_WEIGHTED_CROSSOVER_CHANCE = 0.3;

/**
 * Roulette wheel selection.
 * @type {string}
 * @constant
 */
export const SELECTION_TYPE_FITNESS_PROPORTIONAL = 'fitness_proportional';

/**
 * Tournament selection.
 * @type {string}
 * @constant
 */
export const SELECTION_TYPE_TOURNAMENT = 'tournament';

/**
 * Rank-based selection.
 * @type {string}
 * @constant
 */
export const SELECTION_TYPE_RANK_BASED = 'rank_based';

/**
 * Random selection (current default).
 * @type {string}
 * @constant
 */
export const SELECTION_TYPE_RANDOM = 'random';

/**
 * Default for parent 1.
 * @type {string}
 * @constant
 */
export const SELECTION_TYPE_DEFAULT_PARENT1 = SELECTION_TYPE_TOURNAMENT;

/**
 * Default for parent 2.
 * @type {string}
 * @constant
 */
export const SELECTION_TYPE_DEFAULT_PARENT2 = SELECTION_TYPE_FITNESS_PROPORTIONAL;

/**
 * Number of candidates in tournament selection.
 * @type {number}
 * @constant
 * @default 4
 */
export const TOURNAMENT_SIZE = 4;

/**
 * Probability of selecting best in tournament (0.7 = 70% chance).
 * @type {number}
 * @constant
 * @default 0.7
 */
export const TOURNAMENT_PROBABILITY = 0.7;

/**
 * Selection pressure for rank-based (higher = more bias toward top).
 * @type {number}
 * @constant
 * @default 2.0
 */
export const RANK_BASED_SELECTION_PRESSURE = 2.0;

/**
 * Enable diversity checks to avoid inbreeding.
 * @type {boolean}
 * @constant
 * @default true
 */
export const DIVERSITY_AWARE_SELECTION_ENABLED = true;

/**
 * Minimum genetic distance required between parents (0-1 scale).
 * @type {number}
 * @constant
 * @default 0.1
 */
export const MIN_GENETIC_DISTANCE = 0.1;

// ============================================================================
// GENE POOL MANAGEMENT
// ============================================================================
// Qualification thresholds, storage limits, and validation

/**
 * Maximum agents saved per gene pool generation.
 * @type {number}
 * @constant
 * @default 10
 */
export const MAX_AGENTS_TO_SAVE_PER_GENE_POOL = 10;

/**
 * Minimum food items consumed to qualify.
 * 
 * REBALANCED: Reduced from 2 to 1 to align with harsh energy economy.
 * With PASSIVE_LOSS = 0.08, agents struggle to find even 1-2 food items.
 * @type {number}
 * @constant
 * @default 1
 */
export const MIN_FOOD_EATEN_TO_SAVE_GENE_POOL = 2;

/**
 * Minimum lifespan in frames to qualify.
 * 
 * REBALANCED: Reduced from 720 (12s) to 300 (5s) to align with reality.
 * Most agents die within 30-120 seconds due to harsh energy economy.
 * 5 seconds is enough to demonstrate basic survival competence.
 * @type {number}
 * @constant
 * @default 300
 */
export const MIN_FRAMES_ALIVE_TO_SAVE_GENE_POOL = 600;

/**
 * Minimum lifespan in seconds (33.33s).
 * @type {number}
 * @constant
 */
export const MIN_SECONDS_ALIVE_TO_SAVE_GENE_POOL = MIN_FRAMES_ALIVE_TO_SAVE_GENE_POOL / FPS_TARGET;

/**
 * Minimum world exploration percentage required.
 * 
 * REBALANCED: Reduced from 0.5% to 0.25% to align with short lifespans.
 * With 5-30 second lifespans, agents can't explore much.
 * Still ensures some movement, not just stationary survival.
 * @type {number}
 * @constant
 * @default 0.25
 */
export const MIN_EXPLORATION_PERCENTAGE_TO_SAVE_GENE_POOL = 0.25;

/**
 * Minimum successful food-seeking behaviors.
 * 
 * Reduced from 15 to 10 - with current scarcity, avg is 6.47, max observed is 55.3.
 * Still ensures active navigation towards food sources.
 * Note: This is raw count, not normalized (normalization happens in fitness calc).
 * @type {number}
 * @constant
 * @default 10
 */
export const MIN_TURNS_TOWARDS_FOOD_TO_SAVE_GENE_POOL = 3;

/**
 * Maximum number of gene pools stored in database.
 * @type {number}
 * @constant
 * @default 500
 */
export const MAX_GENE_POOLS = 500;

/**
 * Number of test runs required for validation.
 * @type {number}
 * @constant
 * @default 3
 */
export const VALIDATION_REQUIRED_RUNS = 3;

/**
 * Maximum agents waiting for validation.
 * @type {number}
 * @constant
 * @default 50
 */
export const MAX_VALIDATION_QUEUE_SIZE = 500;

/**
 * Energy given to validation agents (boosted from INITIAL_AGENT_ENERGY for fairer testing).
 * BALANCED: 1.5x starting energy (1200 vs 800) for validation testing
 * @type {number}
 * @constant
 * @default 1200
 */
export const VALIDATION_AGENT_ENERGY = 1750;

/**
 * Fitness threshold for partial credit system (4/5 criteria with exceptional fitness).
 * 
 * Agents with exceptional fitness (top performers) can qualify with 4/5 criteria.
 * Set to 18,000 to ensure only truly exceptional agents get this benefit.
 * This is ~50% higher than the base threshold, representing top 10-20% of agents.
 * @type {number}
 * @constant
 * @default 18000
 */
export const EXCEPTIONAL_FITNESS_THRESHOLD = 2000;

// ============================================================================
// SEASONAL ENVIRONMENTAL CYCLE
// ============================================================================
// Temperature modifiers, reproduction bonuses, energy drain, and food scarcity

/**
 * Temperature modifier during spring.
 * @type {number}
 * @constant
 * @default -5
 */
export const SEASON_SPRING_TEMP_MODIFIER = -5;

/**
 * Temperature modifier during summer.
 * @type {number}
 * @constant
 * @default 15
 */
export const SEASON_SUMMER_TEMP_MODIFIER = 15;

/**
 * Temperature modifier during fall.
 * @type {number}
 * @constant
 * @default 5
 */
export const SEASON_FALL_TEMP_MODIFIER = 5;

/**
 * Temperature modifier during winter.
 * @type {number}
 * @constant
 * @default -15
 */
export const SEASON_WINTER_TEMP_MODIFIER = -15;

/**
 * Reproduction rate multiplier in spring (breeding season).
 * @type {number}
 * @constant
 * @default 1.5
 */
export const SEASON_SPRING_REPRODUCTION_BONUS = 1.5;

/**
 * Reproduction rate multiplier in summer.
 * @type {number}
 * @constant
 * @default 1.2
 */
export const SEASON_SUMMER_REPRODUCTION_BONUS = 1.2;

/**
 * Reproduction rate multiplier in fall.
 * @type {number}
 * @constant
 * @default 0.7
 */
export const SEASON_FALL_REPRODUCTION_BONUS = 0.7;

/**
 * Reproduction rate multiplier in winter.
 * @type {number}
 * @constant
 * @default 0.3
 */
export const SEASON_WINTER_REPRODUCTION_BONUS = 0.3;

/**
 * Energy drain multiplier in summer.
 * @type {number}
 * @constant
 * @default 1.3
 */
export const SEASON_SUMMER_ENERGY_DRAIN = 1.3;

/**
 * Energy drain multiplier in fall.
 * @type {number}
 * @constant
 * @default 1.1
 */
export const SEASON_FALL_ENERGY_DRAIN = 1.1;

/**
 * Energy drain multiplier in winter.
 * @type {number}
 * @constant
 * @default 1.8
 */
export const SEASON_WINTER_ENERGY_DRAIN = 1.8;

/**
 * Mutation rate multiplier in spring.
 * @type {number}
 * @constant
 * @default 1.1
 */
export const SEASON_SPRING_MUTATION_MULTIPLIER = 1.1;

/**
 * Mutation rate multiplier in summer.
 * @type {number}
 * @constant
 * @default 1.0
 */
export const SEASON_SUMMER_MUTATION_MULTIPLIER = 1.0;

/**
 * Mutation rate multiplier in fall.
 * @type {number}
 * @constant
 * @default 1.0
 */
export const SEASON_FALL_MUTATION_MULTIPLIER = 1.0;

/**
 * Mutation rate multiplier in winter.
 * @type {number}
 * @constant
 * @default 0.8
 */
export const SEASON_WINTER_MUTATION_MULTIPLIER = 0.8;

/**
 * Food abundance after winter.
 * @type {number}
 * @constant
 * @default 1.2
 */
export const SEASON_SPRING_FOOD_SCARCITY = 1.2;

/**
 * Normal food availability in summer.
 * @type {number}
 * @constant
 * @default 1.0
 */
export const SEASON_SUMMER_FOOD_SCARCITY = 1.0;

/**
 * Resources becoming scarce in fall.
 * @type {number}
 * @constant
 * @default 0.8
 */
export const SEASON_FALL_FOOD_SCARCITY = 0.8;

/**
 * Severe food scarcity in winter.
 * @type {number}
 * @constant
 * @default 0.4
 */
export const SEASON_WINTER_FOOD_SCARCITY = 0.4;

// ============================================================================
// NUTRIENT CYCLING & DECOMPOSITION
// ============================================================================
// Fertile zones created from dead agents

/**
 * Maximum number of fertile zones allowed.
 * @type {number}
 * @constant
 * @default 100
 */
export const FERTILE_ZONE_MAX_COUNT = 100;

/**
 * Size-to-fertility conversion factor for dead agents.
 * Fertility is based on agent size (biomass) since dead agents have 0 energy.
 * @type {number}
 * @constant
 * @default 0.05
 */
export const FERTILE_ZONE_FERTILITY_FACTOR = 0.05;

/**
 * Maximum fertility value for any zone.
 * @type {number}
 * @constant
 * @default 50
 */
export const FERTILE_ZONE_MAX_FERTILITY = 50;

/**
 * Fertility decay rate per frame.
 * @type {number}
 * @constant
 * @default 0.001
 */
export const FERTILE_ZONE_DECAY_RATE = 0.001;

/**
 * Minimum fertility to create a zone.
 * @type {number}
 * @constant
 * @default 1
 */
export const FERTILE_ZONE_MIN_FERTILITY = 1;

/**
 * Zone radius multiplier based on agent size.
 * @type {number}
 * @constant
 * @default 3
 */
export const FERTILE_ZONE_SIZE_FACTOR = 3;

/**
 * Minimum zone radius.
 * @type {number}
 * @constant
 * @default 50
 */
export const FERTILE_ZONE_MIN_RADIUS = 50;

/**
 * Chance to spawn food in fertile zones vs random.
 * @type {number}
 * @constant
 * @default 0.4
 */
export const FERTILE_ZONE_SPAWN_CHANCE = 0.4;

/**
 * Distance within which fertile zones affect food spawning.
 * @type {number}
 * @constant
 * @default 200
 */
export const FERTILE_ZONE_INFLUENCE_DISTANCE = 200;

/**
 * Temperature effect multiplier on fertile zone creation.
 * Warmer temperatures (positive modifier) increase decomposition rate and fertility.
 * Colder temperatures (negative modifier) decrease decomposition rate and fertility.
 * Applied as: fertility = baseFertility * (1.0 + temperatureModifier * TEMP_EFFECT_MULTIPLIER)
 * @type {number}
 * @constant
 * @default 0.02
 */
export const FERTILE_ZONE_TEMP_EFFECT_MULTIPLIER = 0.02;

// ============================================================================
// KIN RECOGNITION & SOCIAL BEHAVIOR
// ============================================================================
// Relatedness calculations and social interactions

/**
 * Relatedness value for self.
 * @type {number}
 * @constant
 * @default 1.0
 */
export const KIN_RELATEDNESS_SELF = 1.0;

/**
 * Relatedness between parent and child.
 * @type {number}
 * @constant
 * @default 0.5
 */
export const KIN_RELATEDNESS_PARENT_CHILD = 0.5;

/**
 * Relatedness between siblings.
 * @type {number}
 * @constant
 * @default 0.5
 */
export const KIN_RELATEDNESS_SIBLINGS = 0.5;

/**
 * Relatedness for grandparents/grandchildren/aunts/uncles.
 * @type {number}
 * @constant
 * @default 0.25
 */
export const KIN_RELATEDNESS_GRANDPARENT = 0.25;

/**
 * Relatedness for distant relatives.
 * @type {number}
 * @constant
 * @default 0.125
 */
export const KIN_RELATEDNESS_DISTANT = 0.125;

/**
 * Maximum generation difference for relatedness calculation.
 * @type {number}
 * @constant
 * @default 2
 */
export const KIN_RELATEDNESS_MAX_GENERATION_DIFF = 2;

/**
 * Minimum relatedness to trigger predation reduction.
 * @type {number}
 * @constant
 * @default 0.25
 */
export const KIN_PREDATION_REDUCTION_THRESHOLD = 0.25;

/**
 * Base chance to prevent attack on siblings.
 * @type {number}
 * @constant
 * @default 0.25
 */
export const KIN_ATTACK_PREVENTION_CHANCE = 0.25;

/**
 * Chance to prevent attack on parent/child.
 * @type {number}
 * @constant
 * @default 0.5
 */
export const KIN_ATTACK_PREVENTION_PARENT = 0.5;

// ============================================================================
// RENDERING & VISUAL
// ============================================================================
// Colors, materials, post-processing, and camera settings

/**
 * Portion of world visible in camera (0.4 = 40% of world size).
 * @type {number}
 * @constant
 * @default 0.4
 */
export const VIEW_SIZE_RATIO = 0.4;

/**
 * Base duration for visual effects in frames.
 * @type {number}
 * @constant
 * @default 7
 */
export const EFFECT_DURATION_BASE = 7;

/**
 * How many frames visual effects take to fade out.
 * @type {number}
 * @constant
 * @default 15
 */
export const EFFECT_FADE_DURATION = 15;

/**
 * Maximum objects rendered in a single GPU batch.
 * @type {number}
 * @constant
 * @default 200
 */
export const MAX_INSTANCES_PER_BATCH = 200;

/**
 * Default camera Z position.
 * @type {number}
 * @constant
 * @default 1000
 */
export const CAMERA_Z_POSITION = 1000;

/**
 * Camera far clipping plane.
 * @type {number}
 * @constant
 * @default 10000
 */
export const CAMERA_FAR_PLANE = 10000;

/**
 * Border size relative to agent body (increased from 1.1 for better visibility).
 * @type {number}
 * @constant
 * @default 1.15
 */
export const AGENT_BORDER_SIZE_MULTIPLIER = 1.15;

/**
 * Minimum border size for visibility.
 * @type {number}
 * @constant
 * @default 12
 */
export const AGENT_MINIMUM_BORDER_SIZE = 12;

/**
 * Color palette for all visual elements in the simulation (hex colors).
 * @type {Object}
 * @constant
 */
export const COLORS = {
    BACKGROUND: 0x050510, // Deep space background color
    FOOD: {
        NORMAL: 0x00FF00,      // Standard food items (pure bright green)
        HIGH_VALUE: 0xFF00FF    // Rare high-energy food items (neon magenta)
    },
    OBSTACLE: 0x9D00FF,        // Moving obstacles that agents must avoid (neon purple)
    AGENTS: {
        FORAGER: 0xCCFF00,     // Food-specialized agents (neon lime)
        PREDATOR: 0xFF0033,    // Hunting-specialized agents (neon red)
        REPRODUCER: 0x00F0FF,  // Breeding-specialized agents (neon cyan)
        SCOUT: 0xFFFF00,       // Exploration-specialized agents (neon yellow)
        DEFENDER: 0xFF6600     // Territory defense-specialized agents (neon orange)
    },
    RAYS: {
        DEFAULT: 0x00FFFF,      // Default sensor ray color when hitting objects (cyan)
        NO_HIT: 0xFFFFFF,      // Color when sensor rays hit nothing (bright white)
        ALIGNMENT: 0xFFFF00,   // Rays detecting alignment with other agents (neon yellow)
        FOOD: 0x39FF14,        // Rays detecting food sources (neon green)
        SMALLER: 0x00F0FF,     // Rays detecting smaller agents (neon cyan)
        LARGER: 0xFF0033,      // Rays detecting larger agents (neon red)
        OBSTACLE: 0x9D00FF,    // Rays detecting obstacles (neon purple)
        EDGE: 0xCCCCCC,        // Rays detecting world boundaries (light gray)
        SAME: 0xFFFF00         // Rays detecting agents of same specialization (neon yellow)
    },
    EFFECTS: {
        COLLISION: 0xFF0033,   // Visual effect when agents hit obstacles (red glow)
        EATING: 0x39FF14       // Visual effect when agents consume food (green glow)
    }
};

/**
 * Emissive color palette for cyberpunk glow effects (slightly brighter/more saturated).
 * @type {Object}
 * @constant
 */
export const EMISSIVE_COLORS = {
    FOOD: {
        NORMAL: 0x00FF00,      // Pure bright green for food glow
        HIGH_VALUE: 0xFF1AFF   // Brighter neon magenta for high-value food
    },
    OBSTACLE: 0xBD1AFF,        // Brighter neon purple for obstacles
    AGENTS: {
        FORAGER: 0xE6FF1A,     // Brighter neon lime
        PREDATOR: 0xFF1A4D,   // Brighter neon red
        REPRODUCER: 0x1AFFFF, // Brighter neon cyan
        SCOUT: 0xFFFF1A,      // Brighter neon yellow
        DEFENDER: 0xFF7A1A    // Brighter neon orange
    },
    RAYS: {
        DEFAULT: 0x1AFFFF,     // Brighter cyan
        NO_HIT: 0xFFFFFF,     // Bright white
        ALIGNMENT: 0xFFFF1A,  // Brighter yellow
        FOOD: 0x4AFF2E,        // Brighter green
        SMALLER: 0x1AFFFF,     // Brighter cyan
        LARGER: 0xFF1A4D,     // Brighter red
        OBSTACLE: 0xBD1AFF,    // Brighter purple
        EDGE: 0xFFFFFF,       // Bright white
        SAME: 0xFFFF1A        // Brighter yellow
    },
    EFFECTS: {
        COLLISION: 0xFF1A4D,  // Brighter red glow
        EATING: 0x4AFF2E,      // Brighter green glow
        DEATH: 0x8B008B,       // Dark magenta/purple for dramatic death effect
        SHOUT: 0x00FFFF,       // Bright cyan for generic shout/communication effects (fallback)
        SHOUT_PREDATOR_ALERT: 0xFF3333,  // Bright red for predator alert shouts (danger)
        SHOUT_FOOD_FOUND: 0x00FF00,      // Bright green for food found shouts
        SHOUT_HELP_REQUEST: 0xFFAA00,    // Orange/yellow for help request shouts
        SHOUT_MATE_CALL: 0xFF00FF        // Bright magenta/pink for mate call shouts
    }
};

/**
 * Post-processing configuration for visual effects.
 * @type {Object}
 * @constant
 */
export const POST_PROCESSING = {
    BLOOM: {
        STRENGTH: 0.20,        // Bloom intensity (minimal - only for very bright elements)
        RADIUS: 0.1,             // Bloom spread radius (very tight to reduce fuzziness)
        THRESHOLD: 0.75        // Brightness threshold for bloom (very high - only bloom extremely bright areas like food)
    },
    VIGNETTE: {
        ENABLED: true,         // Enabled when POST_PROCESSING_ENABLED is true
        OFFSET: 1,             // Vignette offset
        DARKNESS: 0.1          // Vignette darkness (reduced from 0.5 for subtler effect)
    },
    CHROMATIC_ABERRATION: {
        ENABLED: true,         // Enabled when POST_PROCESSING_ENABLED is true
        OFFSET: 0.001          // Chromatic aberration offset (reduced from 0.001 for subtler effect)
    },
    MOTION_BLUR: {
        ENABLED: true,         // Enabled when POST_PROCESSING_ENABLED is true
        STRENGTH: 0.3,         // Motion blur strength (0-1)
        SAMPLES: 8             // Number of blur samples (higher = smoother but slower)
    }
};

/**
 * Material properties for cyberpunk glassy aesthetic.
 * @type {Object}
 * @constant
 */
export const MATERIAL_PROPERTIES = {
    AGENT: {
        EMISSIVE_INTENSITY: 1.8,  // Glow intensity for agent bodies
        METALNESS: 0.4,           // Glassy/metallic look
        ROUGHNESS: 0.2,            // Smooth/glossy surface
        OPACITY: 0.9,              // Slight transparency
        TRANSPARENT: true
    },
    AGENT_BORDER: {
        EMISSIVE_INTENSITY: 2.2,   // Higher glow for borders
        METALNESS: 0.5,
        ROUGHNESS: 0.15,
        OPACITY: 0.95,
        TRANSPARENT: true
    },
    FOOD: {
        EMISSIVE_INTENSITY: 2.5,   // High glow for food
        METALNESS: 0.2,
        ROUGHNESS: 0.2,
        OPACITY: 0.9,
        TRANSPARENT: true
    },
    PHEROMONE: {
        EMISSIVE_INTENSITY: 1.5,
        METALNESS: 0.1,
        ROUGHNESS: 0.3,
        OPACITY: 0.6,
        TRANSPARENT: true
    },
    OBSTACLE: {
        EMISSIVE_INTENSITY: 1.8,
        METALNESS: 0.4,
        ROUGHNESS: 0.2,
        OPACITY: 0.95,
        TRANSPARENT: false
    },
    EFFECT: {
        EMISSIVE_INTENSITY: 2.0,
        METALNESS: 0.3,
        ROUGHNESS: 0.25,
        TRANSPARENT: true
    }
};

// ============================================================================
// UI & PERFORMANCE
// ============================================================================
// Toast durations, timeouts, and performance limits

/**
 * Validation passed toast duration (ms).
 * @type {number}
 * @constant
 * @default 8000
 */
export const TOAST_DURATION_SUCCESS = 8000;

/**
 * Validation failed toast duration (ms).
 * @type {number}
 * @constant
 * @default 6000
 */
export const TOAST_DURATION_FAILURE = 6000;

/**
 * Normal toast duration (ms).
 * @type {number}
 * @constant
 * @default 5000
 */
export const TOAST_DURATION_NORMAL = 5000;

/**
 * Short toast duration (ms).
 * @type {number}
 * @constant
 * @default 3000
 */
export const TOAST_DURATION_SHORT = 3000;

/**
 * Reproduction toast duration (ms).
 * @type {number}
 * @constant
 * @default 4000
 */
export const TOAST_DURATION_REPRODUCTION = 4000;

/**
 * Cooldown between validation attempts (ms).
 * @type {number}
 * @constant
 * @default 5000
 */
export const VALIDATION_COOLDOWN_MS = 5000;

/**
 * Remove stale entries after 10 minutes (ms).
 * @type {number}
 * @constant
 * @default 10 * 60 * 1000
 */
export const VALIDATION_CLEANUP_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Maximum agents to add to validation per periodic check.
 * @type {number}
 * @constant
 * @default 2
 */
export const MAX_VALIDATIONS_PER_PERIODIC_CHECK = 2;

/**
 * GPU initialization timeout (ms).
 * @type {number}
 * @constant
 * @default 15000
 */
export const GPU_INIT_TIMEOUT_MS = 15000;

/**
 * Database worker request timeout (ms).
 * @type {number}
 * @constant
 * @default 5000
 */
export const WORKER_REQUEST_TIMEOUT_MS = 5000;

/**
 * Maximum agents to spawn in a single frame during repopulation (balanced for smooth spawning).
 * @type {number}
 * @constant
 * @default 8
 */
export const MAX_AGENTS_TO_SPAWN_PER_FRAME = 8;

/**
 * Frames to wait between individual agent spawns (prevents jarring batch spawning).
 * @type {number}
 * @constant
 * @default 2
 */
export const SPAWN_STAGGER_FRAMES = 2;

/**
 * Frames for spawn growth effect (120 = 2 seconds at 60 FPS).
 * @type {number}
 * @constant
 * @default 120
 */
export const SPAWN_GROWTH_DURATION_FRAMES = 120;

/**
 * Starting scale for spawn growth (30% of final size).
 * @type {number}
 * @constant
 * @default 0.3
 */
export const SPAWN_GROWTH_MIN_SCALE = 0.3;

/**
 * Ending scale for spawn growth (100% of final size).
 * @type {number}
 * @constant
 * @default 1.0
 */
export const SPAWN_GROWTH_MAX_SCALE = 1.0;

/**
 * Size interpolation speed (5% per frame).
 * @type {number}
 * @constant
 * @default 0.05
 */
export const SPAWN_SIZE_INTERPOLATION_SPEED = 0.05;

/**
 * Maximum rays per agent across all specializations (GPU buffer size).
 * @type {number}
 * @constant
 * @default 50
 */
export const GPU_MAX_RAYS_PER_AGENT = 50;

/**
 * Initial point pool allocation size.
 * @type {number}
 * @constant
 * @default 5000
 */
export const POINT_POOL_SIZE = 5000;

// ============================================================================
// MATH & UTILITIES
// ============================================================================
// Pre-calculated mathematical values and exploration grid

/**
 * Full circle in radians (2π).
 * @type {number}
 * @constant
 */
export const TWO_PI = Math.PI * 2;

/**
 * Number of grid cells across world width.
 * @type {number}
 * @constant
 * @default 72
 */
export const EXPLORATION_GRID_WIDTH = 72;

/**
 * Number of grid cells across world height.
 * @type {number}
 * @constant
 * @default 40
 */
export const EXPLORATION_GRID_HEIGHT = 40;

/**
 * Width of each exploration cell.
 * @type {number}
 * @constant
 */
export const EXPLORATION_CELL_WIDTH = WORLD_WIDTH / EXPLORATION_GRID_WIDTH;

/**
 * Height of each exploration cell.
 * @type {number}
 * @constant
 */
export const EXPLORATION_CELL_HEIGHT = WORLD_HEIGHT / EXPLORATION_GRID_HEIGHT;

// ============================================================================
// NEURAL NETWORK BACKGROUND SYSTEM
// ============================================================================
// Configuration for the animated neural network background

/**
 * Background size multiplier relative to world size.
 * Background extends this many times beyond the world boundaries.
 * @type {number}
 * @constant
 * @default 10
 */
export const BACKGROUND_SIZE_MULTIPLIER = 10;

/**
 * Total background width (WORLD_WIDTH * BACKGROUND_SIZE_MULTIPLIER).
 * @type {number}
 * @constant
 */
export const BACKGROUND_WIDTH = WORLD_WIDTH * BACKGROUND_SIZE_MULTIPLIER;

/**
 * Total background height (WORLD_HEIGHT * BACKGROUND_SIZE_MULTIPLIER).
 * @type {number}
 * @constant
 */
export const BACKGROUND_HEIGHT = WORLD_HEIGHT * BACKGROUND_SIZE_MULTIPLIER;

/**
 * Number of neuron nodes in the neural network background.
 * @type {number}
 * @constant
 * @default 8000
 */
export const NEURAL_NODES_COUNT = 8000;

/**
 * Maximum distance for neuron connections (synapses).
 * Closer nodes will be connected with animated lines.
 * @type {number}
 * @constant
 * @default 800
 */
export const NEURAL_CONNECTION_DISTANCE = 800;

/**
 * Maximum number of connections per neuron to prevent performance issues.
 * @type {number}
 * @constant
 * @default 6
 */
export const MAX_CONNECTIONS_PER_NODE = 6;

/**
 * Parallax movement multiplier (0.1 = moves 10% as fast as camera).
 * Creates depth effect where background moves slower than foreground.
 * @type {number}
 * @constant
 * @default 0.08
 */
export const NEURAL_PARALLAX_FACTOR = 0.08;

/**
 * Base neuron size in pixels.
 * @type {number}
 * @constant
 * @default 3
 */
export const NEURAL_NODE_SIZE = 3;

/**
 * Synapse (connection line) width in pixels.
 * @type {number}
 * @constant
 * @default 1.5
 */
export const NEURAL_SYNAPSE_WIDTH = 1.5;

/**
 * Animation speed for neuron pulsing (radians per frame).
 * @type {number}
 * @constant
 * @default 0.02
 */
export const NEURAL_PULSE_SPEED = 0.05;

/**
 * Animation speed for energy flow along synapses (pixels per frame).
 * @type {number}
 * @constant
 * @default 2
 */
export const NEURAL_ENERGY_FLOW_SPEED = 4;

/**
 * Maximum opacity for neural elements (0-1 range).
 * Keeps background subtle and non-distracting.
 * @type {number}
 * @constant
 * @default 0.08
 */
export const NEURAL_MAX_OPACITY = 0.08;

/**
 * Probability of random spark flashes per frame (0-1 range).
 * Higher values = more frequent flashes.
 * @type {number}
 * @constant
 * @default 0.02
 */
export const NEURAL_SPARK_PROBABILITY = 0.05;

/**
 * Speed of traveling waves along synapses (pixels per frame).
 * Controls how fast firing effects travel.
 * @type {number}
 * @constant
 * @default 0.08
 */
export const NEURAL_FIRING_SPEED = 0.15;

/**
 * Number of simultaneous wave patterns for complex firing.
 * More waves = more complex firing patterns.
 * @type {number}
 * @constant
 * @default 3
 */
export const NEURAL_WAVE_COUNT = 3;

/**
 * Neural network color palette - deep blues and cyans for cyberpunk neural theme.
 * @type {Object}
 * @constant
 */
export const NEURAL_COLORS = {
    NODES: {
        PRIMARY: 0x00FFFF,    // Bright cyan neurons
        SECONDARY: 0x0088FF,  // Electric blue
        ACCENT: 0x8800FF      // Deep purple
    },
    SYNAPSES: {
        ACTIVE: 0x00FFFF,     // Flowing energy (cyan)
        INACTIVE: 0x004488,   // Dormant connections (dark blue)
        ENERGY: 0xFFFFFF      // Bright energy particles (white)
    },
    GLOW: 0x00FFFF           // Outer glow effect (cyan)
};
