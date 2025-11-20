// --- NEURAL NETWORK UTILITIES ---
// Preserves exact neural network architecture and operations

import { matrixMultiply, applySigmoid } from './utils.js';

export class NeuralNetwork {
    constructor(inputSize, hiddenSize, outputSize, weights = null) {
        this.inputSize = inputSize;
        this.hiddenSize = hiddenSize;
        this.outputSize = outputSize;
        
        if (weights && weights.weights1.length === inputSize) {
            this.weights1 = this.copyMatrix(weights.weights1);
            this.weights2 = this.copyMatrix(weights.weights2);
        } else {
            this.weights1 = this.initRandomWeights(inputSize, hiddenSize);
            this.weights2 = this.initRandomWeights(hiddenSize, outputSize);
        }
    }

    initRandomWeights(rows, cols) {
        return Array.from({ length: rows }, () =>
            Array.from({ length: cols }, () => this.randomGaussian(0, 0.1))
        );
    }

    randomGaussian(mean = 0, stdDev = 1) {
        let u = 0, v = 0;
        while (u === 0) u = Math.random(); 
        while (v === 0) v = Math.random();
        const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        return z * stdDev + mean;
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
        
        // First layer: inputs -> hidden (direct computation)
        const hidden = new Array(hiddenSize);
        for (let i = 0; i < hiddenSize; i++) {
            let sum = 0;
            // Process inputs
            for (let j = 0; j < inputSize; j++) {
                sum += inputs[j] * this.weights1[j][i];
            }
            // Process hidden state
            for (let j = 0; j < hiddenSize; j++) {
                sum += hiddenState[j] * this.weights1[inputSize + j][i];
            }
            hidden[i] = 1 / (1 + Math.exp(-sum)); // Sigmoid
        }
        
        // Second layer: hidden -> output (direct computation)
        const output = new Array(outputSize);
        for (let i = 0; i < outputSize; i++) {
            let sum = 0;
            for (let j = 0; j < hiddenSize; j++) {
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
            let newW = w + this.randomGaussian(0, stdDev);
            
            if (Math.random() < 0.02) { 
                newW += this.randomGaussian(0, macroStdDev);
            }
            
            return Math.max(-3, Math.min(3, newW));
        }));

        this.weights1 = mutateMatrix(this.weights1);
        this.weights2 = mutateMatrix(this.weights2);
    }
}

