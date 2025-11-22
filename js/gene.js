// Gene-related functions moved from game.js

import { MIN_FITNESS_TO_SAVE_GENE_POOL, MAX_AGENTS_TO_SAVE_PER_GENE_POOL } from './constants.js';
import { updateDashboard } from './ui.js';

export function crossover(weightsA, weightsB) {
    const crossoverMatrix = (a, b) => {
        const rows = a.length, cols = a[0].length;
        const splitRow = Math.floor(Math.random() * rows);
        const newMatrix = [];
        for (let i = 0; i < rows; i++) {
            if (i < splitRow) newMatrix.push([...a[i]]);
            else newMatrix.push([...b[i]]);
        }
        return newMatrix;
    };

    return {
        weights1: crossoverMatrix(weightsA.weights1, weightsB.weights1),
        weights2: crossoverMatrix(weightsA.weights2, weightsB.weights2),
    };
}

export function updateGenePools(simulation) {

    // Normalized fitness (relative to population)
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

    // Update gene pools (top 10 per gene ID)
    // CRITICAL FIX: Lower threshold from 50 to 20, remove foodEaten requirement, increase pool size to 10
    const agentsByGene = {};
    simulation.agents.forEach(agent => {
        // Filter: only save agents with fitness >= 20 (was 50) and framesAlive >= 600 (10 seconds at 60 FPS)
        // FRAME-BASED to be independent of game speed
        if (agent.fit) {
            if (!agentsByGene[agent.geneId]) {
                agentsByGene[agent.geneId] = [];
            }
            agentsByGene[agent.geneId].push(agent);
        }
    });

    // Queue all qualifying agents for saving (database will handle grouping and pool management)
    for (const geneAgents of Object.values(agentsByGene)) {
        for (const agent of geneAgents) {
            simulation.db.queueSaveAgent(agent);
        }
    }

    // Update dashboard every generation for better visibility
    updateDashboard(simulation);
}
