/**
 * @fileoverview Food system constants.
 * Spawning, energy values, decay, and visual properties.
 */

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
