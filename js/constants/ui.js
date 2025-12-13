/**
 * @fileoverview UI and performance constants.
 * Toast durations, timeouts, and performance limits.
 */

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

