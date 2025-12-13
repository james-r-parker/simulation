/**
 * @fileoverview Rendering and visual constants.
 * Colors, materials, and camera settings.
 */

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

