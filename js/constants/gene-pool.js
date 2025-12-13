/**
 * @fileoverview Gene pool management constants.
 * Optimization, qualification thresholds, storage limits, and validation.
 */

import { INITIAL_AGENT_ENERGY } from './agents.js';

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
 * @default 1.0
 */
export const GENE_POOL_REPLACEMENT_THRESHOLD = 1.0;

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
 * Minimum lifespan in seconds (10 seconds).
 * Based on real time, not frame count, since agents track age using Date.now().
 * @type {number}
 * @constant
 * @default 10
 */
export const MIN_SECONDS_ALIVE_TO_SAVE_GENE_POOL = 10;

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
export const VALIDATION_AGENT_ENERGY = INITIAL_AGENT_ENERGY * 1.5;

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

