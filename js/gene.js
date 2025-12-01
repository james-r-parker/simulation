// Gene-related functions moved from game.js

import { MIN_FITNESS_TO_SAVE_GENE_POOL, MAX_AGENTS_TO_SAVE_PER_GENE_POOL, MIN_FRAMES_ALIVE_TO_SAVE_GENE_POOL, MIN_SECONDS_ALIVE_TO_SAVE_GENE_POOL, MAX_VALIDATIONS_PER_PERIODIC_CHECK, CROSSOVER_TYPE_DEFAULT, CROSSOVER_TYPE_UNIFORM, CROSSOVER_TYPE_ONE_POINT, CROSSOVER_TYPE_MULTI_POINT, CROSSOVER_TYPE_FITNESS_WEIGHTED, CROSSOVER_TYPE_SBX, UNIFORM_CROSSOVER_PROBABILITY, MULTI_POINT_CROSSOVER_POINTS, FITNESS_WEIGHTED_CROSSOVER_ALPHA, SBX_DISTRIBUTION_INDEX, ELITE_FITNESS_WEIGHTED_CROSSOVER_CHANCE } from './constants.js';
import { updateDashboard } from './ui.js';
import { randomGaussian } from './utils.js';

// Helper function to validate matrix structure
function validateMatrices(a, b, logger) {
    if (!Array.isArray(a) || !Array.isArray(b) ||
        a.length === 0 || b.length === 0 ||
        !Array.isArray(a[0]) || !Array.isArray(b[0])) {
        logger.error('[GENE] Invalid matrix structure:', { a: a, b: b });
        return false;
    }

    const rowsA = a.length, colsA = a[0].length;
    const rowsB = b.length, colsB = b[0].length;

    if (rowsA !== rowsB || colsA !== colsB) {
        logger.error('[GENE] Matrix dimension mismatch:', { rowsA, colsA, rowsB, colsB });
        return false;
    }

    return true;
}

// Uniform crossover: per-weight random selection from parents
function uniformCrossoverMatrix(a, b, logger) {
    if (!validateMatrices(a, b, logger)) {
        return a.map(row => Array.isArray(row) ? [...row] : []);
    }

    const newMatrix = [];
    for (let i = 0; i < a.length; i++) {
        const newRow = [];
        for (let j = 0; j < a[i].length; j++) {
            // Random selection from parent A or B
            newRow.push(Math.random() < UNIFORM_CROSSOVER_PROBABILITY ? a[i][j] : b[i][j]);
        }
        newMatrix.push(newRow);
    }
    return newMatrix;
}

// One-point crossover: single split point (original implementation)
function onePointCrossoverMatrix(a, b, logger) {
    if (!validateMatrices(a, b, logger)) {
        return a.map(row => Array.isArray(row) ? [...row] : []);
    }

    const splitRow = Math.floor(Math.random() * a.length);
    const newMatrix = [];
    for (let i = 0; i < a.length; i++) {
        try {
            if (i < splitRow) {
                newMatrix.push(Array.isArray(a[i]) ? [...a[i]] : []);
            } else {
                newMatrix.push(Array.isArray(b[i]) ? [...b[i]] : []);
            }
        } catch (error) {
            logger.error('[GENE] Error during crossover at row', i, ':', error);
            newMatrix.push(Array.isArray(a[i]) ? [...a[i]] : []);
        }
    }
    return newMatrix;
}

// Multi-point crossover: multiple split points
function multiPointCrossoverMatrix(a, b, logger) {
    if (!validateMatrices(a, b, logger)) {
        return a.map(row => Array.isArray(row) ? [...row] : []);
    }

    // Generate sorted split points
    const splitPoints = [];
    for (let i = 0; i < MULTI_POINT_CROSSOVER_POINTS; i++) {
        splitPoints.push(Math.floor(Math.random() * a.length));
    }
    splitPoints.sort((x, y) => x - y);
    splitPoints.push(a.length); // Add end point

    const newMatrix = [];
    let useA = true;
    let pointIndex = 0;

    for (let i = 0; i < a.length; i++) {
        if (i >= splitPoints[pointIndex]) {
            pointIndex++;
            useA = !useA;
        }
        try {
            newMatrix.push(useA ? [...a[i]] : [...b[i]]);
        } catch (error) {
            logger.error('[GENE] Error during multi-point crossover at row', i, ':', error);
            newMatrix.push(Array.isArray(a[i]) ? [...a[i]] : []);
        }
    }
    return newMatrix;
}

// Fitness-weighted crossover: blend weights based on parent fitness
function fitnessWeightedCrossoverMatrix(a, b, fitnessA, fitnessB, logger) {
    if (!validateMatrices(a, b, logger)) {
        return a.map(row => Array.isArray(row) ? [...row] : []);
    }

    // Calculate blending weights (alpha from constants, but adjust based on fitness ratio)
    const totalFitness = fitnessA + fitnessB;
    if (totalFitness <= 0) {
        // Fallback to equal blending if fitnesses are invalid
        const alpha = FITNESS_WEIGHTED_CROSSOVER_ALPHA;
        const newMatrix = [];
        for (let i = 0; i < a.length; i++) {
            const newRow = [];
            for (let j = 0; j < a[i].length; j++) {
                newRow.push(a[i][j] * alpha + b[i][j] * (1 - alpha));
            }
            newMatrix.push(newRow);
        }
        return newMatrix;
    }

    // Better parent contributes more
    const fitnessRatio = fitnessA / totalFitness;
    const alpha = FITNESS_WEIGHTED_CROSSOVER_ALPHA * fitnessRatio + (1 - FITNESS_WEIGHTED_CROSSOVER_ALPHA) * (1 - fitnessRatio);
    const adjustedAlpha = fitnessA > fitnessB ? alpha : 1 - alpha;

    const newMatrix = [];
    for (let i = 0; i < a.length; i++) {
        const newRow = [];
        for (let j = 0; j < a[i].length; j++) {
            newRow.push(a[i][j] * adjustedAlpha + b[i][j] * (1 - adjustedAlpha));
        }
        newMatrix.push(newRow);
    }
    return newMatrix;
}

// Simulated Binary Crossover (SBX): real-valued optimization technique
function sbxCrossoverMatrix(a, b, logger) {
    if (!validateMatrices(a, b, logger)) {
        return a.map(row => Array.isArray(row) ? [...row] : []);
    }

    const eta = SBX_DISTRIBUTION_INDEX;
    const newMatrix = [];

    for (let i = 0; i < a.length; i++) {
        const newRow = [];
        for (let j = 0; j < a[i].length; j++) {
            const x1 = a[i][j];
            const x2 = b[i][j];
            const u = Math.random();

            let beta;
            if (u <= 0.5) {
                beta = Math.pow(2 * u, 1 / (eta + 1));
            } else {
                beta = Math.pow(1 / (2 * (1 - u)), 1 / (eta + 1));
            }

            const c1 = 0.5 * ((1 + beta) * x1 + (1 - beta) * x2);
            const c2 = 0.5 * ((1 - beta) * x1 + (1 + beta) * x2);

            // Randomly choose one of the two children
            newRow.push(Math.random() < 0.5 ? c1 : c2);
        }
        newMatrix.push(newRow);
    }
    return newMatrix;
}

export function crossover(weightsA, weightsB, logger, crossoverType = null, fitnessA = null, fitnessB = null) {
    // Validate that both weight objects have the required structure
    if (!weightsA || !weightsB ||
        !weightsA.weights1 || !weightsA.weights2 ||
        !weightsB.weights1 || !weightsB.weights2) {
        logger.error('[GENE] Invalid weights structure:', { weightsA, weightsB });
        return { weights1: [], weights2: [] };
    }

    // Determine crossover type
    let type = crossoverType || CROSSOVER_TYPE_DEFAULT;

    // For elite parents (high fitness), occasionally use fitness-weighted
    if (fitnessA !== null && fitnessB !== null && 
        Math.random() < ELITE_FITNESS_WEIGHTED_CROSSOVER_CHANCE &&
        (fitnessA > 0 || fitnessB > 0)) {
        const avgFitness = (fitnessA + fitnessB) / 2;
        // Consider "elite" if average fitness is positive (adjust threshold as needed)
        if (avgFitness > 0) {
            type = CROSSOVER_TYPE_FITNESS_WEIGHTED;
        }
    }

    // Select crossover strategy
    let crossoverMatrixFn;
    switch (type) {
        case CROSSOVER_TYPE_UNIFORM:
            crossoverMatrixFn = uniformCrossoverMatrix;
            break;
        case CROSSOVER_TYPE_ONE_POINT:
            crossoverMatrixFn = onePointCrossoverMatrix;
            break;
        case CROSSOVER_TYPE_MULTI_POINT:
            crossoverMatrixFn = multiPointCrossoverMatrix;
            break;
        case CROSSOVER_TYPE_FITNESS_WEIGHTED:
            crossoverMatrixFn = (a, b, logger) => fitnessWeightedCrossoverMatrix(a, b, fitnessA || 0, fitnessB || 0, logger);
            break;
        case CROSSOVER_TYPE_SBX:
            crossoverMatrixFn = sbxCrossoverMatrix;
            break;
        default:
            crossoverMatrixFn = uniformCrossoverMatrix; // Default to uniform
    }

    return {
        weights1: crossoverMatrixFn(weightsA.weights1, weightsB.weights1, logger),
        weights2: crossoverMatrixFn(weightsA.weights2, weightsB.weights2, logger),
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

    // Sort by raw fitness for best agent selection (only living agents)
    const livingAgents = simulation.agents.filter(a => !a.isDead);
    livingAgents.sort((a, b) => b.fitness - a.fitness);
    simulation.bestAgent = livingAgents[0] || null;

    // Track population changes for smoothing
    const currentPopulation = livingAgents.length;
    simulation.recentPopulationHistory.push(currentPopulation);
    if (simulation.recentPopulationHistory.length > 10) { // Keep last 10 measurements
        simulation.recentPopulationHistory.shift();
    }

    // Calculate population change rate (for spawn smoothing)
    if (simulation.recentPopulationHistory.length >= 5) {
        const recent = simulation.recentPopulationHistory.slice(-3);
        const older = simulation.recentPopulationHistory.slice(-5, -2);
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

        if (olderAvg > 0) {
            simulation.populationChangeRate = (recentAvg - olderAvg) / olderAvg; // -1 to 1
            simulation.populationChangeRate = Math.max(-1, Math.min(1, simulation.populationChangeRate)); // Clamp
        }
    }

    simulation.generation++;

    // Track fitness for adaptive mutation and charting
    const bestFitness = simulation.bestAgent ? simulation.bestAgent.fitness : 0;
    
    // Calculate average and median fitness (reuse livingAgents from above)
    let averageFitness = 0;
    let medianFitness = 0;
    
    if (livingAgents.length > 0) {
        const fitnesses = livingAgents.map(a => a.fitness).sort((a, b) => a - b);
        averageFitness = fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length;
        
        // Calculate median
        const mid = Math.floor(fitnesses.length / 2);
        if (fitnesses.length % 2 === 0) {
            medianFitness = (fitnesses[mid - 1] + fitnesses[mid]) / 2;
        } else {
            medianFitness = fitnesses[mid];
        }
    }
    
    // Track all three metrics
    simulation.fitnessHistory.push(bestFitness);
    simulation.averageFitnessHistory.push(averageFitness);
    simulation.medianFitnessHistory.push(medianFitness);
    
    if (simulation.fitnessHistory.length > simulation.fitnessHistorySize) {
        simulation.fitnessHistory.shift();
        simulation.averageFitnessHistory.shift();
        simulation.medianFitnessHistory.shift();
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
            simulation.mutationRate = simulation.baseMutationRate * (0.8 + stagnationFactor * 0.4); // 0.8x to 1.2x base rate (more stable)
            simulation.mutationRate = Math.max(0.06, Math.min(0.12, simulation.mutationRate)); // Clamp to stable range (6%-12%)
        }
    }
}

// Check if an agent has a validated ancestor in its lineage
export function hasValidatedAncestor(agent, simulation) {
    let currentGene = agent.gene;

    // Walk up the parent chain (limit to 3 generations to avoid infinite loops)
    for (let depth = 0; depth < 3 && currentGene; depth++) {
        if (currentGene.geneId && simulation.validatedLineages.has(currentGene.geneId)) {
            return true; // Found a validated ancestor
        }
        // Move to parent
        currentGene = currentGene.parent;
    }

    return false; // No validated ancestors found
}

export function updatePeriodicValidation(simulation, logger) {
    // Add high-performing living agents to validation queue (periodic validation)
    // This gives long-lived successful agents a chance to enter validation without dying

    // Limit how many new validations we add per cycle
    let validationsAdded = 0;

    simulation.agents.forEach(agent => {
        if (!agent.isDead && agent.nn) { // Safety check: ensure agent has neural network
            try {
                agent.calculateFitness();
                // Check if agent is comprehensively fit and not already in validation
                if (agent.fit &&
                    !simulation.validationManager.isInValidation(agent.geneId) &&
                    !hasValidatedAncestor(agent, simulation) &&
                    !simulation.db.pool[agent.geneId] && // Skip if already in gene pool
                    validationsAdded < MAX_VALIDATIONS_PER_PERIODIC_CHECK) {

                    // Additional safety check: Ensure neural network can provide valid weights
                    try {
                        const testWeights = agent.getWeights();
                        const isValidWeights = testWeights &&
                            typeof testWeights === 'object' &&
                            testWeights.weights1 && testWeights.weights2 &&
                            Array.isArray(testWeights.weights1) && Array.isArray(testWeights.weights2) &&
                            testWeights.weights1.length > 0 && testWeights.weights2.length > 0;

                        if (!isValidWeights) {
                            logger.warn(`[VALIDATION] ⚠️ Periodic validation: Skipping agent ${agent.geneId} - invalid neural network weights format`);
                            logger.warn(`[VALIDATION] Expected: {weights1: [...], weights2: [...]}, Got:`, testWeights);
                            return; // Continue to next agent
                        }
                    } catch (error) {
                        logger.warn(`[VALIDATION] ⚠️ Periodic validation: Skipping agent ${agent.geneId} - error getting weights: ${error.message}`);
                        return; // Continue to next agent
                    }

                    // Add to validation queue (periodic validation)
                    logger.info(`[VALIDATION] 📊 Periodic check: Adding fit living agent ${agent.geneId} (fitness: ${agent.fitness.toFixed(1)}) to validation`);
                    simulation.validationManager.addToValidationQueue(agent, true);
                    validationsAdded++;
                }
            } catch (error) {
                logger.warn(`[VALIDATION] ⚠️ Failed to process agent ${agent.geneId || 'unknown'} in periodic validation:`, error);
            }
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

