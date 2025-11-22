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
    const numObstacles = 25; // Increased to create more challenging environment and eliminate crash-prone agents
    const minRadius = 40;
    const maxRadius = 120;
    const minDistance = 350; // Reduced from 400 to allow tighter packing with better distribution
    const margin = 250; // Increased margin to keep obstacles away from world edges

    // Create a grid-based distribution for better spreading
    const gridCols = Math.ceil(Math.sqrt(numObstacles * 1.5)); // Slightly more columns than rows for better distribution
    const gridRows = Math.ceil(numObstacles / gridCols);
    const cellWidth = (WORLD_WIDTH - 2 * margin) / gridCols;
    const cellHeight = (WORLD_HEIGHT - 2 * margin) / gridRows;

    // Track which grid cells have obstacles
    const usedCells = new Set();

    for (let i = 0; i < numObstacles; i++) {
        let attempts = 100; // Increased attempts for better placement
        let valid = false;
        let x, y, radius;

        while (attempts > 0 && !valid) {
            let cellX, cellY;

            if (usedCells.size < gridCols * gridRows) {
                // Try to place in unused grid cells first
                do {
                    cellX = Math.floor(Math.random() * gridCols);
                    cellY = Math.floor(Math.random() * gridRows);
                } while (usedCells.has(`${cellX},${cellY}`) && usedCells.size < gridCols * gridRows);
            } else {
                // All cells used, place randomly
                cellX = Math.floor(Math.random() * gridCols);
                cellY = Math.floor(Math.random() * gridRows);
            }

            // Generate position within the grid cell with some randomness
            const cellOffsetX = (Math.random() - 0.5) * cellWidth * 0.6; // 60% of cell size for randomness
            const cellOffsetY = (Math.random() - 0.5) * cellHeight * 0.6;

            x = margin + cellX * cellWidth + cellWidth * 0.5 + cellOffsetX;
            y = margin + cellY * cellHeight + cellHeight * 0.5 + cellOffsetY;

            // Ensure within world bounds
            x = Math.max(margin, Math.min(WORLD_WIDTH - margin, x));
            y = Math.max(margin, Math.min(WORLD_HEIGHT - margin, y));

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
            // Mark grid cell as used
            const cellX = Math.floor((x - margin) / cellWidth);
            const cellY = Math.floor((y - margin) / cellHeight);
            usedCells.add(`${cellX},${cellY}`);

            // Calculate initial velocity away from nearby obstacles
            let avgNearbyX = 0;
            let avgNearbyY = 0;
            let nearbyCount = 0;
            const influenceRadius = 600; // How far obstacles influence initial direction

            for (const existing of obstacles) {
                const dist = distance(x, y, existing.x, existing.y);
                if (dist < influenceRadius && dist > 0) {
                    avgNearbyX += existing.x;
                    avgNearbyY += existing.y;
                    nearbyCount++;
                }
            }

            let vx, vy;
            if (nearbyCount > 0) {
                // Move away from center of mass of nearby obstacles
                avgNearbyX /= nearbyCount;
                avgNearbyY /= nearbyCount;

                const awayX = x - avgNearbyX;
                const awayY = y - avgNearbyY;
                const awayDist = Math.sqrt(awayX * awayX + awayY * awayY);

                if (awayDist > 0) {
                    // Normalize and set velocity away from nearby obstacles
                    vx = (awayX / awayDist) * 0.2; // Moderate speed away
                    vy = (awayY / awayDist) * 0.2;
                } else {
                    // Fallback to random if exactly at center
                    vx = (Math.random() - 0.5) * 0.15;
                    vy = (Math.random() - 0.5) * 0.15;
                }
            } else {
                // No nearby obstacles, random initial direction
                vx = (Math.random() - 0.5) * 0.15;
                vy = (Math.random() - 0.5) * 0.15;
            }

            // Create dynamic obstacle with movement properties
            obstacles.push({
                id: `obs_${i}_${Math.random().toString(36).substr(2, 5)}`,
                x, y, radius,
                vx: vx, // Direction away from nearby obstacles
                vy: vy,
                mass: radius * 0.1 // Larger obstacles are heavier
            });
        }
    }

    return obstacles;
}

// Update obstacle positions and handle physics
export function updateObstacles(obstacles, worldWidth, worldHeight) {
    // Update positions
    for (const obstacle of obstacles) {
        obstacle.x += obstacle.vx;
        obstacle.y += obstacle.vy;
    }

    // Handle world boundary collisions (bounce off edges)
    for (const obstacle of obstacles) {
        // Left/right boundaries
        if (obstacle.x - obstacle.radius <= 0) {
            obstacle.x = obstacle.radius;
            obstacle.vx = Math.abs(obstacle.vx); // Bounce right
        } else if (obstacle.x + obstacle.radius >= worldWidth) {
            obstacle.x = worldWidth - obstacle.radius;
            obstacle.vx = -Math.abs(obstacle.vx); // Bounce left
        }

        // Top/bottom boundaries
        if (obstacle.y - obstacle.radius <= 0) {
            obstacle.y = obstacle.radius;
            obstacle.vy = Math.abs(obstacle.vy); // Bounce down
        } else if (obstacle.y + obstacle.radius >= worldHeight) {
            obstacle.y = worldHeight - obstacle.radius;
            obstacle.vy = -Math.abs(obstacle.vy); // Bounce up
        }
    }

    // Handle obstacle-obstacle collisions
    for (let i = 0; i < obstacles.length; i++) {
        for (let j = i + 1; j < obstacles.length; j++) {
            const obs1 = obstacles[i];
            const obs2 = obstacles[j];

            const dx = obs2.x - obs1.x;
            const dy = obs2.y - obs1.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const minDistance = obs1.radius + obs2.radius;

            if (distance < minDistance && distance > 0) {
                // Collision detected - separate obstacles and apply physics
                const overlap = minDistance - distance;
                const separationX = (dx / distance) * overlap * 0.5;
                const separationY = (dy / distance) * overlap * 0.5;

                // Separate obstacles
                obs1.x -= separationX;
                obs1.y -= separationY;
                obs2.x += separationX;
                obs2.y += separationY;

                // Calculate collision response (elastic collision)
                const relativeVx = obs1.vx - obs2.vx;
                const relativeVy = obs1.vy - obs2.vy;
                const dotProduct = relativeVx * dx + relativeVy * dy;

                if (dotProduct < 0) { // Only resolve if moving towards each other
                    const totalMass = obs1.mass + obs2.mass;
                    const impulse = (2 * dotProduct) / (totalMass * distance * distance);

                    // Apply impulse
                    const impulseX = impulse * dx;
                    const impulseY = impulse * dy;

                    obs1.vx -= (impulseX * obs2.mass) / totalMass;
                    obs1.vy -= (impulseY * obs2.mass) / totalMass;
                    obs2.vx += (impulseX * obs1.mass) / totalMass;
                    obs2.vy += (impulseY * obs1.mass) / totalMass;

                    // Add some damping to prevent infinite bouncing
                    obs1.vx *= 0.98;
                    obs1.vy *= 0.98;
                    obs2.vx *= 0.98;
                    obs2.vy *= 0.98;
                }
            }
        }
    }
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

// Find a completely safe spawn position for validation agents
function findSafeSpawnPosition(simulation) {
    const worldWidth = simulation.worldWidth;
    const worldHeight = simulation.worldHeight;
    const agentSize = 20; // Minimum safe distance from obstacles/agents

    for (let attempts = 0; attempts < 100; attempts++) {
        const x = Math.random() * (worldWidth - 100) + 50; // Avoid edges
        const y = Math.random() * (worldHeight - 100) + 50; // Avoid edges

        // Check distance from all obstacles
        let safeFromObstacles = true;
        for (const obstacle of simulation.obstacles) {
            const dx = x - obstacle.x;
            const dy = y - obstacle.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < obstacle.radius + agentSize + 50) { // Extra safety margin
                safeFromObstacles = false;
                break;
            }
        }

        if (!safeFromObstacles) continue;

        // Check distance from all agents
        let safeFromAgents = true;
        for (const agent of simulation.agents) {
            if (!agent.isDead) {
                const dx = x - agent.x;
                const dy = y - agent.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < agent.diameter + agentSize + 30) { // Safe distance from other agents
                    safeFromAgents = false;
                    break;
                }
            }
        }

        if (safeFromAgents) {
            return { x, y };
        }
    }

    // Fallback: use regular spawn avoidance
    console.warn('[VALIDATION] Could not find completely safe position, using fallback');
    return randomSpawnAvoidCluster(simulation);
}

export function spawnAgent(simulation, options = {}) {
    const {
        gene = null,
        x,
        y,
        energy = INITIAL_AGENT_ENERGY,
        parent = null,
        mutationRate = null,
        isValidationAgent = false // Special handling for validation agents
    } = options;

    let startX, startY;
    const startEnergy = energy;

    if (x !== undefined && y !== undefined) {
        startX = x;
        startY = y;
    } else if (isValidationAgent) {
        // Validation agents get safer spawning - avoid all agents and obstacles
        const pos = findSafeSpawnPosition(simulation);
        startX = pos.x;
        startY = pos.y;
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
    return agent; // Return the agent for tracking validation agents
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

    // Check genetic diversity - force random spawning if diversity is critically low
    const livingAgentList = simulation.agents.filter(a => !a.isDead);
    const geneIds = livingAgentList.map(a => a.geneId);
    const uniqueGeneIds = new Set(geneIds.filter(id => id)).size; // Filter out falsy values

    // Calculate how many agents to spawn to fill the population
    const agentsToSpawn = Math.min(simulation.maxAgents - livingAgents, 20); // Cap at 10 per frame for performance

    for (let i = 0; i < agentsToSpawn; i++) {
        // Proactive diversity maintenance: always reserve some slots for random generation
        const randomChance = Math.max(0.3, 0.8 - (uniqueGeneIds / simulation.maxAgents)); // 30-80% chance based on diversity
        if (Math.random() < randomChance) {
            // Random generation for diversity
            spawnAgent(simulation, { gene: null });
            continue;
        }

        // Priority 1: Use validation candidates if available
        if (simulation.validationManager.validationQueue.size > 0) {
            // Find first non-active validation candidate
            let firstKey = null;
            for (const [geneId, entry] of simulation.validationManager.validationQueue.entries()) {
                if (!entry.isActiveTest) {
                    firstKey = geneId;
                    break;
                }
            }

            if (!firstKey) {
                //console.log(`[VALIDATION] All validation candidates are currently active - skipping validation spawn`);
                // Skip to normal spawning
            } else {
                const validationEntry = simulation.validationManager.validationQueue.get(firstKey);

                // Create agent with the candidate's genes for re-testing
                const validationGene = {
                    weights: validationEntry.weights,
                    geneId: validationEntry.geneId,
                    specializationType: validationEntry.specializationType,
                    parent: null // No parent reference for validation spawns
                };

            // Limit active validation agents to prevent population domination (max 5% of population)
            const maxValidationAgents = Math.max(1, Math.floor(simulation.maxAgents * 0.05));
            if (simulation.validationManager.activeValidationAgents >= maxValidationAgents) {
                    //console.log(`[VALIDATION] Skipping validation spawn - ${simulation.validationManager.activeValidationAgents}/${maxValidationAgents} active validation agents`);
                    // Don't continue to next agent spawn - let normal population fill the gap
                    break;
                }

                console.log(`[VALIDATION] Respawning validation candidate ${firstKey} for test run ${validationEntry.attempts + 1}/3 (stored weights)`);
                // Give validation agents extra energy and safe spawning to ensure they can complete their runs
                const validationAgent = spawnAgent(simulation, {
                    gene: validationGene,
                    energy: INITIAL_AGENT_ENERGY * 3, // Triple energy for validation
                    isValidationAgent: true
                });
                if (validationAgent) {
                    simulation.validationManager.activeValidationAgents++;
                    console.log(`[VALIDATION] Active validation agents: ${simulation.validationManager.activeValidationAgents}/${maxValidationAgents}`);
                }

                // Mark as actively being tested to prevent duplicate spawns
                validationEntry.isActiveTest = true;
                console.log(`[VALIDATION] Marked ${firstKey} as active test (run ${validationEntry.attempts + 1})`);
                continue;
            }
        }

        const roll = Math.random();

        // 25% chance for Elitism (from successful gene pool)
        if (roll < 0.25) {
            const gene = simulation.db.getRandomAgent();
            if (gene) {
                spawnAgent(simulation, { gene: gene, mutationRate: simulation.mutationRate / 4 });
            } else {
                spawnAgent(simulation, { gene: null });
            }
        }
        // 25% chance for Sexual Selection (crossover from gene pool)
        else if (roll < 0.5) {
            const matingPair = simulation.db.getMatingPair();
            if (matingPair) {
                const childWeights = crossover(matingPair.parent1.weights, matingPair.parent2.weights);
                spawnAgent(simulation, { gene: { weights: childWeights, parent: matingPair.parent1 } });
            } else {
                // Fallback to random if selection fails
                spawnAgent(simulation, { gene: null });
            }
        }
        // 25% chance for Random Generation (fresh genetic material)
        else if (roll < 0.75) {
            spawnAgent(simulation, { gene: null });
        }
        // 25% chance for Novelty Spawning (explore specializations)
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
