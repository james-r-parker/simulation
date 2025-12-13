/**
 * @fileoverview Simulation configuration constants.
 * Core world dimensions, performance settings, and simulation environment.
 */

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

