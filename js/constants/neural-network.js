/**
 * @fileoverview Neural network evolution constants.
 * Initialization, mutation strategies, and crossover.
 */

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
export const ADAPTIVE_MUTATION_MIN_RATE = 0.01;

/**
 * Maximum mutation rate (15% for low-fitness agents).
 * @type {number}
 * @constant
 * @default 0.15
 */
export const ADAPTIVE_MUTATION_MAX_RATE = 0.20;

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

