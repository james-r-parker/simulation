// Gene-related functions moved from game.js

import { MIN_FITNESS_TO_SAVE_GENE_POOL, MAX_AGENTS_TO_SAVE_PER_GENE_POOL, VALIDATION_FITNESS_THRESHOLD, MIN_FRAMES_ALIVE_TO_SAVE_GENE_POOL } from './constants.js';
import { updateDashboard } from './ui.js';

export function crossover(weightsA, weightsB) {
    const crossoverMatrix = (a, b) => {
        // Validate that both matrices are proper 2D arrays
        if (!Array.isArray(a) || !Array.isArray(b) ||
            a.length === 0 || b.length === 0 ||
            !Array.isArray(a[0]) || !Array.isArray(b[0])) {
            console.error('[GENE] Invalid matrix structure:', { a: a, b: b });
            // Return a copy of matrix a as fallback
            return a.map(row => Array.isArray(row) ? [...row] : []);
        }

        const rowsA = a.length, colsA = a[0].length;
        const rowsB = b.length, colsB = b[0].length;

        // Ensure matrices have compatible dimensions
        if (rowsA !== rowsB || colsA !== colsB) {
            console.error('[GENE] Matrix dimension mismatch:', { rowsA, colsA, rowsB, colsB });
            // Return a copy of matrix a as fallback
            return a.map(row => [...row]);
        }

        const splitRow = Math.floor(Math.random() * rowsA);
        const newMatrix = [];
        for (let i = 0; i < rowsA; i++) {
            try {
                if (i < splitRow) {
                    newMatrix.push(Array.isArray(a[i]) ? [...a[i]] : []);
                } else {
                    newMatrix.push(Array.isArray(b[i]) ? [...b[i]] : []);
                }
            } catch (error) {
                console.error('[GENE] Error during crossover at row', i, ':', error);
                // Fallback: use matrix a for this row
                newMatrix.push(Array.isArray(a[i]) ? [...a[i]] : []);
            }
        }
        return newMatrix;
    };

    // Validate that both weight objects have the required structure
    if (!weightsA || !weightsB ||
        !weightsA.weights1 || !weightsA.weights2 ||
        !weightsB.weights1 || !weightsB.weights2) {
        console.error('[GENE] Invalid weights structure:', { weightsA, weightsB });
        // Return a fallback with empty weights - the neural network will initialize randomly
        return { weights1: [], weights2: [] };
    }

    return {
        weights1: crossoverMatrix(weightsA.weights1, weightsB.weights1),
        weights2: crossoverMatrix(weightsA.weights2, weightsB.weights2),
    };
}

export function updateFitnessTracking(simulation) {
    // UI and fitness tracking only - no gene pool saving (handled by validation system)

    // Normalized fitness (relative to population) for UI display
    if (simulation.agents.length > 1) {
        const fitnesses = simulation.agents.map(a => a.fitness);
        const mean = fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length;
        const variance = fitnesses.reduce((sum, f) => sum + Math.pow(f - mean, 2), 0) / fitnesses.length;
        const stdDev = Math.sqrt(variance);

        if (stdDev > 0) {
            // Normalize fitness: (fitness - mean) / stdDev
            simulation.agents.forEach(a => {
                a.normalizedFitness = (a.fitness - mean) / stdDev;
            });
        } else {
            simulation.agents.forEach(a => a.normalizedFitness = 0);
        }
    } else {
        simulation.agents.forEach(a => a.normalizedFitness = a.fitness);
    }

    // Sort by raw fitness for best agent selection
    simulation.agents.sort((a, b) => b.fitness - a.fitness);
    simulation.bestAgent = simulation.agents[0] || null;
    simulation.generation++;

    // Track fitness for adaptive mutation
    const bestFitness = simulation.bestAgent ? simulation.bestAgent.fitness : 0;
    simulation.fitnessHistory.push(bestFitness);
    if (simulation.fitnessHistory.length > simulation.fitnessHistorySize) {
        simulation.fitnessHistory.shift();
    }

    // Adaptive mutation rate
    if (simulation.fitnessHistory.length >= 6) {
        const recent = simulation.fitnessHistory.slice(-3);
        const older = simulation.fitnessHistory.slice(-6, -3);
        if (older.length >= 3) {
            const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
            const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
            const improvementRate = (recentAvg - olderAvg) / (Math.abs(olderAvg) || 1);

            // High mutation when stagnating, lower when improving
            // improvementRate > 0 means improving, < 0 means declining
            const stagnationFactor = Math.max(0, 1 - improvementRate * 2); // 0 to 1
            simulation.mutationRate = simulation.baseMutationRate * (0.7 + stagnationFactor * 0.6); // 0.7x to 1.3x base rate (less aggressive)
            simulation.mutationRate = Math.max(0.05, Math.min(0.15, simulation.mutationRate)); // Clamp to narrower range (5%-15%)
        }
    }
}

export function updatePeriodicValidation(simulation) {
    // Add high-performing living agents to validation queue (periodic validation)
    // This gives long-lived successful agents a chance to enter validation without dying

    simulation.agents.forEach(agent => {
        // Check if agent is performing well and not already in validation
        if (agent.fitness >= VALIDATION_FITNESS_THRESHOLD &&
            agent.framesAlive >= MIN_FRAMES_ALIVE_TO_SAVE_GENE_POOL &&
            !simulation.validationQueue.has(agent.geneId)) {

            // Add to validation queue (periodic validation)
            console.log(`[VALIDATION] 📊 Periodic check: Adding living agent ${agent.geneId} (fitness: ${agent.fitness.toFixed(1)}) to validation`);
            simulation.addToValidationQueue(agent, true);

            console.log(`[VALIDATION] Added living agent ${agent.geneId} to validation queue (fitness: ${agent.fitness.toFixed(1)})`);
        }
    });

    // Call fitness tracking (UI updates, best agent selection, adaptive mutation)
    updateFitnessTracking(simulation);

    // Update dashboard every generation for better visibility
    updateDashboard(simulation);
}

export function updateGenePools(simulation) {
    // DISABLED: Gene pool saving now handled by validation queue system
    // This function now only does fitness tracking for UI purposes

    // Call periodic validation (adds living agents to validation queue)
    updatePeriodicValidation(simulation);
}
