/**
 * @fileoverview Physics and collision constants.
 * Dampening, separation, and combat mechanics.
 */

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
