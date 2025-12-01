// --- NEURAL NETWORK UTILITIES ---
// Preserves exact neural network architecture and operations

import { matrixMultiply, applySigmoid, randomGaussian } from './utils.js';
import { NN_WEIGHT_INIT_STD_DEV, NN_MUTATION_STD_DEV_RATIO, NN_MACRO_MUTATION_CHANCE, NN_WEIGHT_CLAMP_MIN, NN_WEIGHT_CLAMP_MAX, MUTATION_STRATEGY_DEFAULT, MUTATION_STRATEGY_GAUSSIAN, MUTATION_STRATEGY_CAUCHY, MUTATION_STRATEGY_POLYNOMIAL, ADAPTIVE_MUTATION_ENABLED, ADAPTIVE_MUTATION_MIN_RATE, ADAPTIVE_MUTATION_MAX_RATE, ADAPTIVE_MUTATION_FITNESS_PERCENTILE_LOW, ADAPTIVE_MUTATION_FITNESS_PERCENTILE_HIGH, CAUCHY_SCALE_PARAMETER, POLYNOMIAL_DISTRIBUTION_INDEX } from './constants.js';
import { queryArrayPool } from './array-pool.js';

// Pool for neural network computation arrays to reduce GC pressure
class NeuralArrayPool {
    constructor() {
        this.pools = new Map(); // size -> pool of arrays
    }

    acquire(size) {
        if (!this.pools.has(size)) {
            this.pools.set(size, []);
        }

        const pool = this.pools.get(size);
        if (pool.length > 0) {
            return pool.pop();
        }

        // Create new array of exact size
        return new Array(size);
    }

    release(array) {
        if (!array || !Array.isArray(array)) return;

        const size = array.length;
        if (!this.pools.has(size)) {
            this.pools.set(size, []);
        }

        const pool = this.pools.get(size);
        // Clear array contents but keep allocated space
        array.length = size; // Ensure correct size
        pool.push(array);
    }

    getStats() {
        const stats = {};
        for (const [size, pool] of this.pools.entries()) {
            stats[size] = pool.length;
        }
        return stats;
    }

    // Clear pools to prevent memory accumulation over long runs
    clearOldPools() {
        // Only keep pools for sizes that have been used recently
        // This prevents accumulation of pools for neural networks that no longer exist
        const currentTime = Date.now();
        const maxAge = 10 * 60 * 1000; // 10 minutes

        for (const [size, pool] of this.pools.entries()) {
            // Clear pools that are empty or have been unused for too long
            if (pool.length === 0) {
                this.pools.delete(size);
            }
            // Note: We could add timestamp tracking for more sophisticated cleanup,
            // but for now just clear empty pools
        }
    }
}

const neuralArrayPool = new NeuralArrayPool();

// Export for external access (used by memory cleanup)
export { neuralArrayPool };

export class NeuralNetwork {
    constructor(inputSize, hiddenSize, outputSize, weights = null, logger = null) {
        this.inputSize = inputSize;
        this.hiddenSize = hiddenSize;
        this.outputSize = outputSize;
        this.logger = logger;

        // CRITICAL: Validate weights dimensions match current architecture
        // Old saved agents may have different hiddenSize (e.g. 15 vs 20)
        // Check all rows have consistent column counts to prevent jagged arrays
        const validWeights = weights &&
            weights.weights1 &&
            weights.weights2 &&
            Array.isArray(weights.weights1) &&
            Array.isArray(weights.weights2) &&
            weights.weights1.length === inputSize + hiddenSize &&
            weights.weights2.length === hiddenSize &&
            weights.weights2.every(row => Array.isArray(row) && row.length === outputSize) &&
            weights.weights1.every(row => Array.isArray(row) && row.length === hiddenSize);

        if (validWeights) {
            // Weights match expected dimensions - safe to copy
            this.weights1 = this.copyMatrix(weights.weights1);
            this.weights2 = this.copyMatrix(weights.weights2);
        } else {
            // Weights missing, corrupted, or dimension mismatch - reinitialize
            if (weights) {
                (this.logger || console).warn('[NN-INIT] Discarding incompatible saved weights. Expected dims: w1=' + (inputSize + hiddenSize) + 'x' + hiddenSize + ', w2=' + hiddenSize + 'x' + outputSize +
                    '. Got: w1=' + (weights.weights1?.length || 0) + 'x??, w2=' + (weights.weights2?.length || 0) + 'x' + (weights.weights2?.[0]?.length || 0));
            }
            this.weights1 = this.initRandomWeights(inputSize + hiddenSize, hiddenSize);
            this.weights2 = this.initRandomWeights(hiddenSize, outputSize);
        }
    }

    initRandomWeights(rows, cols) {
        return Array.from({ length: rows }, () =>
            Array.from({ length: cols }, () => randomGaussian(0, NN_WEIGHT_INIT_STD_DEV))
        );
    }

    copyMatrix(matrix) {
        return matrix.map(row => [...row]);
    }

    getWeights() {
        return { weights1: this.weights1, weights2: this.weights2 };
    }

    forward(inputs, hiddenState) {
        // Optimized: Direct computation without creating intermediate matrices
        // Combine inputs with previous hidden state (RNN input)
        const inputSize = inputs.length;
        const hiddenSize = hiddenState.length;
        const outputSize = this.outputSize;

        // CRITICAL: Validate weights dimensions before processing
        if (!this.weights1 || !Array.isArray(this.weights1) || this.weights1.length === 0) {
            (this.logger || console).error('[NN-ERROR] weights1 is invalid:', this.weights1);
            // Return safe fallback
            return {
                output: new Array(outputSize).fill(0.5),
                hiddenState: new Array(hiddenSize).fill(0)
            };
        }

        if (!this.weights2 || !Array.isArray(this.weights2) || this.weights2.length === 0) {
            (this.logger || console).error('[NN-ERROR] weights2 is invalid:', this.weights2);
            // Return safe fallback
            return {
                output: new Array(outputSize).fill(0.5),
                hiddenState: new Array(hiddenSize).fill(0)
            };
        }

        // First layer: inputs -> hidden (direct computation)
        const hidden = neuralArrayPool.acquire(hiddenSize);
        for (let i = 0; i < hiddenSize; i++) {
            let sum = 0;
            // Process inputs
            for (let j = 0; j < inputSize; j++) {
                // Validate weights1 row exists
                if (!this.weights1[j] || typeof this.weights1[j][i] !== 'number') {
                    (this.logger || console).error(`[NN-ERROR] weights1[${j}][${i}] is invalid. weights1 length: ${this.weights1.length}, expected: ${inputSize + hiddenSize}`);
                    sum += 0; // Skip invalid weight
                    continue;
                }
                sum += inputs[j] * this.weights1[j][i];
            }
            // Process hidden state
            for (let j = 0; j < hiddenSize; j++) {
                const weights1Index = inputSize + j;
                // Validate weights1 row exists
                if (!this.weights1[weights1Index] || typeof this.weights1[weights1Index][i] !== 'number') {
                    (this.logger || console).error(`[NN-ERROR] weights1[${weights1Index}][${i}] is invalid. weights1 length: ${this.weights1.length}, expected: ${inputSize + hiddenSize}`);
                    sum += 0; // Skip invalid weight
                    continue;
                }
                sum += hiddenState[j] * this.weights1[weights1Index][i];
            }
            hidden[i] = 1 / (1 + Math.exp(-sum)); // Sigmoid
        }

        // Second layer: hidden -> output (direct computation)
        const output = neuralArrayPool.acquire(outputSize);
        for (let i = 0; i < outputSize; i++) {
            let sum = 0;
            for (let j = 0; j < hiddenSize; j++) {
                // CRITICAL: Validate weights2 row exists before accessing
                if (!this.weights2[j]) {
                    (this.logger || console).error(`[NN-ERROR] weights2[${j}] is undefined. weights2 length: ${this.weights2.length}, expected hiddenSize: ${hiddenSize}, outputSize: ${outputSize}`);
                    (this.logger || console).error('[NN-ERROR] Full weights2 structure:', JSON.stringify(this.weights2.map((row, idx) => row ? `row${idx}:${row.length}` : `row${idx}:undefined`)));
                    sum += 0; // Skip this weight
                    continue;
                }
                if (typeof this.weights2[j][i] !== 'number') {
                    (this.logger || console).error(`[NN-ERROR] weights2[${j}][${i}] is not a number:`, this.weights2[j][i]);
                    sum += 0; // Skip invalid weight
                    continue;
                }
                sum += hidden[j] * this.weights2[j][i];
            }
            output[i] = 1 / (1 + Math.exp(-sum)); // Sigmoid
        }

        return {
            output: output,
            hiddenState: hidden,
            // Add release function to return arrays to pool
            release: () => {
                neuralArrayPool.release(output);
                neuralArrayPool.release(hidden);
            }
        };
    }

    // Calculate adaptive mutation rate based on fitness percentile
    static calculateAdaptiveMutationRate(baseRate, fitnessPercentile) {
        if (!ADAPTIVE_MUTATION_ENABLED || fitnessPercentile === null || fitnessPercentile === undefined) {
            return baseRate;
        }

        // Higher fitness = lower mutation rate (exploitation)
        // Lower fitness = higher mutation rate (exploration)
        let adaptiveRate;
        if (fitnessPercentile <= ADAPTIVE_MUTATION_FITNESS_PERCENTILE_LOW) {
            // Low fitness: high mutation (exploration)
            adaptiveRate = ADAPTIVE_MUTATION_MAX_RATE;
        } else if (fitnessPercentile >= ADAPTIVE_MUTATION_FITNESS_PERCENTILE_HIGH) {
            // High fitness: low mutation (exploitation)
            adaptiveRate = ADAPTIVE_MUTATION_MIN_RATE;
        } else {
            // Linear interpolation between min and max
            const range = ADAPTIVE_MUTATION_FITNESS_PERCENTILE_HIGH - ADAPTIVE_MUTATION_FITNESS_PERCENTILE_LOW;
            const position = (fitnessPercentile - ADAPTIVE_MUTATION_FITNESS_PERCENTILE_LOW) / range;
            adaptiveRate = ADAPTIVE_MUTATION_MAX_RATE - (ADAPTIVE_MUTATION_MAX_RATE - ADAPTIVE_MUTATION_MIN_RATE) * position;
        }

        // Blend with base rate (50% adaptive, 50% base)
        return baseRate * 0.5 + adaptiveRate * 0.5;
    }

    // Generate Cauchy-distributed random number
    static randomCauchy(scale = CAUCHY_SCALE_PARAMETER) {
        // Cauchy distribution: CDF^-1(U) where U is uniform [0,1]
        const u = Math.random() - 0.5;
        return scale * Math.tan(Math.PI * u);
    }

    // Polynomial mutation for real-valued optimization
    static polynomialMutation(value, lowerBound, upperBound, eta = POLYNOMIAL_DISTRIBUTION_INDEX) {
        const delta1 = (value - lowerBound) / (upperBound - lowerBound);
        const delta2 = (upperBound - value) / (upperBound - lowerBound);
        const u = Math.random();
        let deltaq;

        if (u < 0.5) {
            const xy = 1 - delta1;
            const val = 2 * u + (1 - 2 * u) * Math.pow(xy, eta + 1);
            deltaq = Math.pow(val, 1 / (eta + 1)) - 1;
        } else {
            const xy = 1 - delta2;
            const val = 2 * (1 - u) + 2 * (u - 0.5) * Math.pow(xy, eta + 1);
            deltaq = 1 - Math.pow(val, 1 / (eta + 1));
        }

        const mutated = value + deltaq * (upperBound - lowerBound);
        return Math.max(lowerBound, Math.min(upperBound, mutated));
    }

    mutate(mutationRate, strategy = null, fitnessPercentile = null) {
        // Apply adaptive mutation rate if enabled
        let effectiveRate = mutationRate;
        if (ADAPTIVE_MUTATION_ENABLED && fitnessPercentile !== null && fitnessPercentile !== undefined) {
            effectiveRate = NeuralNetwork.calculateAdaptiveMutationRate(mutationRate, fitnessPercentile);
        }

        // Determine mutation strategy
        const mutationStrategy = strategy || MUTATION_STRATEGY_DEFAULT;
        const stdDev = effectiveRate * NN_MUTATION_STD_DEV_RATIO;
        const macroStdDev = effectiveRate * 3.0;

        let mutateMatrix;
        switch (mutationStrategy) {
            case MUTATION_STRATEGY_CAUCHY:
                // Cauchy mutation: longer tails for better escape from local optima
                mutateMatrix = (matrix) => matrix.map(row => row.map(w => {
                    let newW = w + NeuralNetwork.randomCauchy(stdDev);
                    if (Math.random() < NN_MACRO_MUTATION_CHANCE) {
                        newW += NeuralNetwork.randomCauchy(macroStdDev);
                    }
                    return Math.max(NN_WEIGHT_CLAMP_MIN, Math.min(NN_WEIGHT_CLAMP_MAX, newW));
                }));
                break;

            case MUTATION_STRATEGY_POLYNOMIAL:
                // Polynomial mutation: self-adaptive for real-valued optimization
                mutateMatrix = (matrix) => matrix.map(row => row.map(w => {
                    let newW = NeuralNetwork.polynomialMutation(w, NN_WEIGHT_CLAMP_MIN, NN_WEIGHT_CLAMP_MAX);
                    if (Math.random() < NN_MACRO_MUTATION_CHANCE) {
                        // Apply additional Gaussian mutation for macro mutations
                        newW += randomGaussian(0, macroStdDev);
                        newW = Math.max(NN_WEIGHT_CLAMP_MIN, Math.min(NN_WEIGHT_CLAMP_MAX, newW));
                    }
                    return newW;
                }));
                break;

            case MUTATION_STRATEGY_GAUSSIAN:
            default:
                // Gaussian mutation: standard approach (original)
                mutateMatrix = (matrix) => matrix.map(row => row.map(w => {
                    let newW = w + randomGaussian(0, stdDev);
                    if (Math.random() < NN_MACRO_MUTATION_CHANCE) {
                        newW += randomGaussian(0, macroStdDev);
                    }
                    return Math.max(NN_WEIGHT_CLAMP_MIN, Math.min(NN_WEIGHT_CLAMP_MAX, newW));
                }));
                break;
        }

        this.weights1 = mutateMatrix(this.weights1);
        this.weights2 = mutateMatrix(this.weights2);
    }
}

