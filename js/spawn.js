// Spawning functions moved from game.js

import {
    WORLD_WIDTH, WORLD_HEIGHT, INITIAL_AGENT_ENERGY,
    FOOD_SPAWN_CAP, HIGH_VALUE_FOOD_CHANCE,
    SPECIALIZATION_TYPES, RESPAWN_DELAY_FRAMES, MAX_ENERGY,
    VALIDATION_REQUIRED_RUNS
} from './constants.js';
import { Agent } from './agent.js';
import { Food } from './food.js';
import { PheromonePuff } from './pheromone.js';
import { distance, randomGaussian } from './utils.js';
import { crossover } from './gene.js';

export function generateObstacles(simulation) {
    const obstacles = [];
    const numObstacles = 12; // Increased for larger 16:9 world
    const minRadius = 40;
    const maxRadius = 120;
    const minDistance = 400; // Minimum distance between obstacles
    const margin = 200; // Keep obstacles away from world edges

    for (let i = 0; i < numObstacles; i++) {
        let attempts = 50;
        let valid = false;
        let x, y, radius;

        while (attempts > 0 && !valid) {
            // Generate random position with margin from edges
            x = margin + Math.random() * (WORLD_WIDTH - 2 * margin);
            y = margin + Math.random() * (WORLD_HEIGHT - 2 * margin);

            // Varied sizes - use a distribution that favors medium sizes but allows extremes
            const sizeRoll = Math.random();
            if (sizeRoll < 0.2) {
                // 20% chance for small obstacles
                radius = minRadius + Math.random() * 20;
            } else if (sizeRoll < 0.7) {
                // 50% chance for medium obstacles
                radius = minRadius + 30 + Math.random() * 40;
            } else {
                // 30% chance for large obstacles
                radius = minRadius + 60 + Math.random() * (maxRadius - minRadius - 60);
            }

            // Check if this position is far enough from existing obstacles
            valid = true;
            for (const existing of obstacles) {
                const dist = distance(x, y, existing.x, existing.y);
                if (dist < existing.radius + radius + minDistance) {
                    valid = false;
                    break;
                }
            }

            attempts--;
        }

        if (valid) {
            // Ensure each obstacle has a unique ID for logging purposes
            obstacles.push({ id: `obs_${i}_${Math.random().toString(36).substr(2, 5)}`, x, y, radius });
        }
    }

    return obstacles;
}

export function updateFoodScalingFactor(simulation) {
    const P_default = 20;
    const P_new = simulation.maxAgents;
    const populationScaleFactor = P_new / P_default;
    simulation.finalFoodSpawnMultiplier = simulation.foodSpawnRate * populationScaleFactor;
}

export function randomSpawnAvoidCluster(simulation) {
    let x, y, safe = false;
    const attempts = 10;
    for (let i = 0; i < attempts; i++) {
        x = Math.random() * simulation.worldWidth;
        y = Math.random() * simulation.worldHeight;
        safe = true;

        if (simulation.obstacles.some(o => distance(x, y, o.x, o.y) < o.radius + 50)) {
            safe = false;
            continue;
        }
        if (simulation.agents.some(a => distance(x, y, a.x, a.y) < 50)) {
            safe = false;
            continue;
        }
        if (simulation.food.some(f => distance(x, y, f.x, f.y) < 5)) {
            safe = false;
            continue;
        }
        if (safe) break;
    }
    return { x, y };
}

export function spawnAgent(simulation, options = {}) {
    const {
        gene = null,
        x,
        y,
        energy = INITIAL_AGENT_ENERGY,
        parent = null,
        mutationRate = null
    } = options;

    let startX, startY;
    const startEnergy = energy;

    if (x !== undefined && y !== undefined) {
        startX = x;
        startY = y;
    } else {
        const pos = randomSpawnAvoidCluster(simulation);
        startX = pos.x;
        startY = pos.y;
    }

    const agent = new Agent(gene, startX, startY, startEnergy, simulation.logger, parent, simulation);
    if (mutationRate) {
        agent.mutate(mutationRate);
    }

    simulation.agentSpawnQueue.push(agent);
}

export function spawnFood(simulation) {
    if (simulation.food.length >= FOOD_SPAWN_CAP) return;

    // Calculate living agents for spawn chance
    const livingAgents = simulation.agents.filter(a => !a.isDead).length;

    // More generous food spawning: base chance with moderate population scaling
    // Reduced the population penalty factor from 1.5x to 2x maxAgents for less aggressive reduction
    const populationFactor = Math.max(0.2, 1 - (livingAgents / (simulation.maxAgents * 2)));
    const foodSpawnChance = 0.15 * simulation.finalFoodSpawnMultiplier * simulation.foodScarcityFactor * populationFactor;

    if (Math.random() > foodSpawnChance) return;

    let x, y, isHighValue = false;
    const pos = randomSpawnAvoidCluster(simulation);
    x = pos.x;
    y = pos.y;

    if (Math.random() < HIGH_VALUE_FOOD_CHANCE) isHighValue = true;

    simulation.food.push(new Food(x, y, isHighValue));
}

export function spawnPheromone(simulation, x, y, type) {
    // Safety check - don't spawn if simulation is null or invalid
    if (!simulation || !simulation.pheromones || !Array.isArray(simulation.pheromones)) {
        return;
    }

    // Implement pheromone limits to prevent memory accumulation
    const MAX_PHEROMONES = 2000; // Maximum total pheromones
    const MAX_PHEROMONES_PER_TYPE = 500; // Maximum per pheromone type
    const PHEROMONE_RADIUS_CHECK = 50; // Check radius for nearby pheromones
    const MAX_PHEROMONES_PER_AREA = 5; // Maximum pheromones in check radius

    // Global pheromone limit - remove oldest if exceeded
    if (simulation.pheromones.length >= MAX_PHEROMONES) {
        // Remove oldest pheromone (first in array)
        if (simulation.pheromones.length > 0) {
            simulation.pheromones.shift();
        }
    }

    // Count pheromones by type
    const typeCounts = simulation.pheromones.reduce((counts, p) => {
        counts[p.type] = (counts[p.type] || 0) + 1;
        return counts;
    }, {});

    // Per-type limit - don't spawn if type limit exceeded
    if (typeCounts[type] >= MAX_PHEROMONES_PER_TYPE) {
        return;
    }

    // Local area limit - check for nearby pheromones of same type
    const nearbySameType = simulation.pheromones.filter(p =>
        p.type === type &&
        Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2) < PHEROMONE_RADIUS_CHECK
    );

    if (nearbySameType.length >= MAX_PHEROMONES_PER_AREA) {
        return;
    }

    const puff = new PheromonePuff(x, y, type);
    simulation.pheromones.push(puff);
}

export function repopulate(simulation) {
    // Count only living agents for population limit
    const livingAgents = simulation.agents.filter(a => !a.isDead).length;
    if (livingAgents >= simulation.maxAgents) return;

    simulation.respawnTimer++;
    if (simulation.respawnTimer < RESPAWN_DELAY_FRAMES) return;

    // Calculate how many agents to spawn to fill the population
    const agentsToSpawn = Math.min(simulation.maxAgents - livingAgents, 10); // Cap at 10 per frame for performance

    for (let i = 0; i < agentsToSpawn; i++) {
        // Priority 1: Use validation candidates if available
        if (simulation.validationQueue.size > 0) {
            // Get first validation candidate
            const firstKey = simulation.validationQueue.keys().next().value;
            const validationEntry = simulation.validationQueue.get(firstKey);

            // Create agent with the candidate's genes for re-testing
            const validationGene = {
                weights: validationEntry.weights,
                geneId: validationEntry.geneId,
                specializationType: validationEntry.specializationType,
                parent: null // No parent reference for validation spawns
            };

            console.log(`[VALIDATION] Respawning validation candidate ${firstKey} for test run ${validationEntry.attempts + 1}/3 (stored weights)`);
            spawnAgent(simulation, { gene: validationGene, energy: INITIAL_AGENT_ENERGY });

            // Remove from validation queue (will be re-added when this agent dies)
            simulation.validationQueue.delete(firstKey);
            continue;
        }

        const roll = Math.random();

        // 30% chance for Elitism
        if (roll < 0.3) {
            const gene = simulation.db.getRandomAgent();
            if (gene) {
                spawnAgent(simulation, { gene: gene, mutationRate: simulation.mutationRate / 4 });
            } else {
                spawnAgent(simulation, { gene: null });
            }
        }
        // 45% chance for Sexual Selection (increased from 30%)
        else if (roll < 0.75) {
            const matingPair = simulation.db.getMatingPair();
            if (matingPair) {
                const childWeights = crossover(matingPair.parent1.weights, matingPair.parent2.weights);
                spawnAgent(simulation, { gene: { weights: childWeights, parent: matingPair.parent1 } });
            } else {
                // Fallback to random if selection fails
                spawnAgent(simulation, { gene: null });
            }
        }
        // 20% chance for Random Generation (increased from 10%)
        else if (roll < 0.95) {
            spawnAgent(simulation, { gene: null });
        }
        // 5% chance for Novelty Spawning (NEW) - random specialization with moderate mutation
        else {
            const parent = simulation.db.getRandomAgent();
            if (parent) {
                const allTypes = Object.values(SPECIALIZATION_TYPES);
                const novelSpecialization = allTypes[Math.floor(Math.random() * allTypes.length)];
                spawnAgent(simulation, { gene: { ...parent.gene, specializationType: novelSpecialization }, mutationRate: simulation.mutationRate / 2, parent: parent });
            }
            else {
                spawnAgent(simulation, { gene: null });
            }
        }
    }

    simulation.respawnTimer = 0;
}
