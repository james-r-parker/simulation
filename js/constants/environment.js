/**
 * @fileoverview Environment-related constants.
 * Obstacles, pheromones, seasons, fertile zones, and kin recognition.
 */

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
