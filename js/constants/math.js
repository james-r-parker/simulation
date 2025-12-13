/**
 * @fileoverview Math and utility constants.
 * Pre-calculated mathematical values, exploration grid, and neural network background.
 */

import { WORLD_WIDTH, WORLD_HEIGHT } from './simulation.js';

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
