// --- NEURAL NETWORK UTILITIES ---
// Preserves exact neural network architecture and operations

import { matrixMultiply, applySigmoid, randomGaussian } from './utils.js';

export class NeuralNetwork {
    constructor(inputSize, hiddenSize, outputSize, weights = null) {
        this.inputSize = inputSize;
        this.hiddenSize = hiddenSize;
        this.outputSize = outputSize;

        // CRITICAL: Validate weights dimensions match current architecture
        // Old saved agents may have different hiddenSize (e.g. 15 vs 20)
        const validWeights = weights &&
            weights.weights1 &&
            weights.weights2 &&
            weights.weights1.length === inputSize + hiddenSize &&
            weights.weights2.length === hiddenSize &&
            weights.weights2[0] &&
            weights.weights2[0].length === outputSize;

        if (validWeights) {
            // Weights match expected dimensions - safe to copy
            this.weights1 = this.copyMatrix(weights.weights1);
            this.weights2 = this.copyMatrix(weights.weights2);
        } else {
            // Weights missing, corrupted, or dimension mismatch - reinitialize
            if (weights) {
                console.warn('[NN-INIT] Discarding incompatible saved weights. Expected dims: w1=' + (inputSize + hiddenSize) + 'x' + hiddenSize + ', w2=' + hiddenSize + 'x' + outputSize +
                    '. Got: w1=' + (weights.weights1?.length || 0) + 'x??, w2=' + (weights.weights2?.length || 0) + 'x' + (weights.weights2?.[0]?.length || 0));
            }
            this.weights1 = this.initRandomWeights(inputSize + hiddenSize, hiddenSize);
            this.weights2 = this.initRandomWeights(hiddenSize, outputSize);
        }
    }

    initRandomWeights(rows, cols) {
        return Array.from({ length: rows }, () =>
            Array.from({ length: cols }, () => randomGaussian(0, 0.1))
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
            console.error('[NN-ERROR] weights1 is invalid:', this.weights1);
            // Return safe fallback
            return {
                output: new Array(outputSize).fill(0.5),
                hiddenState: new Array(hiddenSize).fill(0)
            };
        }

        if (!this.weights2 || !Array.isArray(this.weights2) || this.weights2.length === 0) {
            console.error('[NN-ERROR] weights2 is invalid:', this.weights2);
            // Return safe fallback
            return {
                output: new Array(outputSize).fill(0.5),
                hiddenState: new Array(hiddenSize).fill(0)
            };
        }

        // First layer: inputs -> hidden (direct computation)
        const hidden = new Array(hiddenSize);
        for (let i = 0; i < hiddenSize; i++) {
            let sum = 0;
            // Process inputs
            for (let j = 0; j < inputSize; j++) {
                // Validate weights1 row exists
                if (!this.weights1[j] || typeof this.weights1[j][i] !== 'number') {
                    console.error(`[NN-ERROR] weights1[${j}][${i}] is invalid. weights1 length: ${this.weights1.length}, expected: ${inputSize + hiddenSize}`);
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
                    console.error(`[NN-ERROR] weights1[${weights1Index}][${i}] is invalid. weights1 length: ${this.weights1.length}, expected: ${inputSize + hiddenSize}`);
                    sum += 0; // Skip invalid weight
                    continue;
                }
                sum += hiddenState[j] * this.weights1[weights1Index][i];
            }
            hidden[i] = 1 / (1 + Math.exp(-sum)); // Sigmoid
        }

        // Second layer: hidden -> output (direct computation)
        const output = new Array(outputSize);
        for (let i = 0; i < outputSize; i++) {
            let sum = 0;
            for (let j = 0; j < hiddenSize; j++) {
                // CRITICAL: Validate weights2 row exists before accessing
                if (!this.weights2[j]) {
                    console.error(`[NN-ERROR] weights2[${j}] is undefined. weights2 length: ${this.weights2.length}, expected hiddenSize: ${hiddenSize}, outputSize: ${outputSize}`);
                    console.error('[NN-ERROR] Full weights2 structure:', JSON.stringify(this.weights2.map((row, idx) => row ? `row${idx}:${row.length}` : `row${idx}:undefined`)));
                    sum += 0; // Skip this weight
                    continue;
                }
                if (typeof this.weights2[j][i] !== 'number') {
                    console.error(`[NN-ERROR] weights2[${j}][${i}] is not a number:`, this.weights2[j][i]);
                    sum += 0; // Skip invalid weight
                    continue;
                }
                sum += hidden[j] * this.weights2[j][i];
            }
            output[i] = 1 / (1 + Math.exp(-sum)); // Sigmoid
        }

        return {
            output: output,
            hiddenState: hidden
        };
    }

    mutate(mutationRate) {
        const stdDev = mutationRate * 0.3;
        const macroStdDev = mutationRate * 3.0;

        const mutateMatrix = (matrix) => matrix.map(row => row.map(w => {
            let newW = w + randomGaussian(0, stdDev);

            if (Math.random() < 0.02) {
                newW += randomGaussian(0, macroStdDev);
            }

            return Math.max(-3, Math.min(3, newW));
        }));

        this.weights1 = mutateMatrix(this.weights1);
        this.weights2 = mutateMatrix(this.weights2);
    }
}

