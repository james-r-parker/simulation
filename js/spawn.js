// Spawning functions moved from game.js

import {
    WORLD_WIDTH, WORLD_HEIGHT, INITIAL_AGENT_ENERGY,
    FOOD_SPAWN_CAP, HIGH_VALUE_FOOD_CHANCE,
    FOOD_SPAWN_NEAR_AGENTS_CHANCE, FOOD_SPAWN_NEAR_AGENT_DISTANCE_MIN, FOOD_SPAWN_NEAR_AGENT_DISTANCE_MAX,
    SPECIALIZATION_TYPES, RESPAWN_DELAY_FRAMES, MAX_ENERGY,
    VALIDATION_REQUIRED_RUNS, MAX_AGENTS_TO_SPAWN_PER_FRAME,
    OBSTACLE_COUNT, OBSTACLE_MIN_RADIUS, OBSTACLE_MAX_RADIUS,
    OBSTACLE_MIN_DISTANCE, OBSTACLE_SPAWN_MARGIN, OBSTACLE_INFLUENCE_RADIUS,
    OBSTACLE_MAX_SPEED,
    MAX_PHEROMONES_TOTAL, MAX_PHEROMONES_PER_TYPE, PHEROMONE_RADIUS_CHECK, MAX_PHEROMONES_PER_AREA
} from './constants.js';
import { Agent } from './agent.js';
import { Food } from './food.js';
import { PheromonePuff } from './pheromone.js';
import { distance, randomGaussian } from './utils.js';
import { crossover } from './gene.js';

export function generateObstacles(simulation) {
    const obstacles = [];
    const numObstacles = OBSTACLE_COUNT; // Increased to create more challenging environment and eliminate crash-prone agents
    const minRadius = OBSTACLE_MIN_RADIUS;
    const maxRadius = OBSTACLE_MAX_RADIUS;
    const minDistance = OBSTACLE_MIN_DISTANCE; // Reduced from 400 to allow tighter packing with better distribution
    const margin = OBSTACLE_SPAWN_MARGIN; // Increased margin to keep obstacles away from world edges

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
                } while (usedCells.has(`${cellX},${cellY} `) && usedCells.size < gridCols * gridRows);
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
            usedCells.add(`${cellX},${cellY} `);

            // Calculate initial velocity away from nearby obstacles
            let avgNearbyX = 0;
            let avgNearbyY = 0;
            let nearbyCount = 0;
            const influenceRadius = OBSTACLE_INFLUENCE_RADIUS; // How far obstacles influence initial direction

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
                id: `obs_${i}_${Math.random().toString(36).substr(2, 5)} `,
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
        if (simulation.agents.some(a => distance(x, y, a.x, a.y) < 35)) {
            safe = false;
            continue;
        }
        if (simulation.food.some(f => distance(x, y, f.x, f.y) < 15)) {
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

    // PERFORMANCE: Manual counting instead of filter() to avoid array allocation
    let livingAgentsCount = 0;
    for (let i = 0; i < simulation.agents.length; i++) {
        if (!simulation.agents[i].isDead) livingAgentsCount++;
    }

    // GUARANTEE ENOUGH FOOD:
    // We want to maintain a healthy ratio of food to agents (e.g., 1.5 food items per agent)
    // If food is below this target, we BOOST the spawn rate.
    const targetFoodCount = Math.max(50, livingAgentsCount * 1.5); // Minimum 50 food items

    let currentFoodCount = 0;
    for (let i = 0; i < simulation.food.length; i++) {
        if (!simulation.food[i].isDead) currentFoodCount++;
    }

    let spawnMultiplier = 1.0;
    if (currentFoodCount < targetFoodCount) {
        // Boost spawning if we are below target
        // The lower we are, the higher the boost (up to 5x)
        const deficit = 1 - (currentFoodCount / targetFoodCount);
        spawnMultiplier = 1.0 + (deficit * 4.0);
    } else {
        // If we have enough food, we can slow down slightly, but don't starve them
        spawnMultiplier = 0.5;
    }

    // Base spawn chance adjusted by multiplier
    // simulation.finalFoodSpawnMultiplier comes from config/sliders
    const foodSpawnChance = simulation.finalFoodSpawnMultiplier * simulation.foodScarcityFactor * spawnMultiplier;

    // Hard cap check is still useful to prevent infinite memory usage, but we rely on ratio mostly
    if (simulation.food.length >= FOOD_SPAWN_CAP && currentFoodCount >= targetFoodCount) return;

    if (Math.random() > foodSpawnChance) return;

    let x, y;

    // IMPROVED: Configurable chance to spawn food near agents to help them find food more easily
    // This helps agents learn food-seeking behavior by making food more accessible
    if (livingAgentsCount > 0 && Math.random() < FOOD_SPAWN_NEAR_AGENTS_CHANCE) {
        // Build array of living agents with valid positions (only when needed)
        const activeAgents = [];
        for (let i = 0; i < simulation.agents.length; i++) {
            const a = simulation.agents[i];
            if (!a.isDead && typeof a.x === 'number' && typeof a.y === 'number' && isFinite(a.x) && isFinite(a.y)) {
                activeAgents.push(a);
            }
        }
        if (activeAgents.length > 0) {
            // Spawn near a random living agent (distance from constants)
            const randomAgent = activeAgents[Math.floor(Math.random() * activeAgents.length)];
            if (randomAgent) {
                const angle = Math.random() * Math.PI * 2;
                const spawnDistance = FOOD_SPAWN_NEAR_AGENT_DISTANCE_MIN +
                    Math.random() * (FOOD_SPAWN_NEAR_AGENT_DISTANCE_MAX - FOOD_SPAWN_NEAR_AGENT_DISTANCE_MIN);
                x = randomAgent.x + Math.cos(angle) * spawnDistance;
                y = randomAgent.y + Math.sin(angle) * spawnDistance;

                // Ensure within world bounds
                x = Math.max(50, Math.min(simulation.worldWidth - 50, x));
                y = Math.max(50, Math.min(simulation.worldHeight - 50, y));

                // Check if position is safe (not in obstacle or too close to other food)
                let safe = true;
                if (simulation.obstacles && simulation.obstacles.some(o => o && distance(x, y, o.x, o.y) < o.radius + 30)) {
                    safe = false;
                }
                if (simulation.food && simulation.food.some(f => f && !f.isDead && distance(x, y, f.x, f.y) < 20)) {
                    safe = false;
                }

                // If not safe, fall back to random spawn
                if (!safe) {
                    const pos = randomSpawnAvoidCluster(simulation);
                    x = pos.x;
                    y = pos.y;
                }
            } else {
                // Agent was invalid, fall back to random spawn
                const pos = randomSpawnAvoidCluster(simulation);
                x = pos.x;
                y = pos.y;
            }
        } else {
            // No active agents with valid positions, fall back to random spawn
            const pos = randomSpawnAvoidCluster(simulation);
            x = pos.x;
            y = pos.y;
        }
    } else {
        // 70% random spawn (original behavior)
        const pos = randomSpawnAvoidCluster(simulation);
        x = pos.x;
        y = pos.y;
    }

    simulation.food.push(new Food(x, y));
}

export function spawnPheromone(simulation, x, y, type) {
    // Safety check - don't spawn if simulation is null or invalid
    if (!simulation || !simulation.pheromones || !Array.isArray(simulation.pheromones)) {
        return;
    }

    // Implement pheromone limits to prevent memory accumulation
    const MAX_PHEROMONES = MAX_PHEROMONES_TOTAL; // Maximum total pheromones
    const MAX_PHEROMONES_PER_TYPE_LIMIT = MAX_PHEROMONES_PER_TYPE; // Maximum per pheromone type
    const PHEROMONE_RADIUS_CHECK_VAL = PHEROMONE_RADIUS_CHECK; // Check radius for nearby pheromones
    const MAX_PHEROMONES_PER_AREA_LIMIT = MAX_PHEROMONES_PER_AREA; // Maximum pheromones in check radius

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
    if (typeCounts[type] >= MAX_PHEROMONES_PER_TYPE_LIMIT) {
        return;
    }

    // Local area limit - check for nearby pheromones of same type
    const nearbySameType = simulation.pheromones.filter(p =>
        p.type === type &&
        Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2) < PHEROMONE_RADIUS_CHECK_VAL
    );

    if (nearbySameType.length >= MAX_PHEROMONES_PER_AREA_LIMIT) {
        return;
    }

    const puff = new PheromonePuff(x, y, type);
    simulation.pheromones.push(puff);
}

export function repopulate(simulation) {
    // PERFORMANCE: Manual count instead of filter() to avoid array allocation
    let livingAgents = 0;
    for (let i = 0; i < simulation.agents.length; i++) {
        if (!simulation.agents[i].isDead) livingAgents++;
    }
    if (livingAgents >= simulation.maxAgents) return;

    simulation.respawnTimer++;
    if (simulation.respawnTimer < RESPAWN_DELAY_FRAMES) return;

    // Check genetic diversity - force random spawning if diversity is critically low
    // Build list and count unique genes only when needed
    const geneIds = [];
    for (let i = 0; i < simulation.agents.length; i++) {
        const agent = simulation.agents[i];
        if (!agent.isDead && agent.geneId) {
            geneIds.push(agent.geneId);
        }
    }
    const uniqueGeneIds = new Set(geneIds).size;

    // Calculate how many agents to spawn to fill the population
    const agentsToSpawn = Math.min(simulation.maxAgents - livingAgents, MAX_AGENTS_TO_SPAWN_PER_FRAME);

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
            // Calculate how many validation agents we can spawn this frame (up to 5 or remaining slots)
            const maxValidationAgents = Math.max(1, Math.floor(simulation.maxAgents * 0.05));
            const availableSlots = maxValidationAgents - simulation.validationManager.activeValidationAgents;
            const maxToSpawnThisFrame = Math.min(5, availableSlots); // Cap at 5 per frame to prevent overwhelming the system

            if (maxToSpawnThisFrame <= 0) {
                //console.log(`[VALIDATION] Skipping validation spawn - ${ simulation.validationManager.activeValidationAgents }/${maxValidationAgents} active validation agents`);
                // Don't continue to next agent spawn - let normal population fill the gap
            } else {
                // Find non-active validation candidates (up to the limit we can spawn)
                const candidatesToSpawn = [];
                for (const [geneId, entry] of simulation.validationManager.validationQueue.entries()) {
                    if (!entry.isActiveTest && !simulation.validationManager.isSpawnLocked(geneId) && candidatesToSpawn.length < maxToSpawnThisFrame) {
                        // Try to acquire spawn lock
                        if (simulation.validationManager.acquireSpawnLock(geneId)) {
                            candidatesToSpawn.push({ geneId, entry });
                        }
                    }
                }

                // Spawn all collected validation candidates
                for (const { geneId, entry } of candidatesToSpawn) {
                    // Double-check we haven't exceeded the limit (in case of concurrent modifications)
                    if (simulation.validationManager.activeValidationAgents >= maxValidationAgents) {
                        console.log(`[VALIDATION] Stopping batch spawn - reached max validation agents limit`);
                        break;
                    }

                    // Create agent with the candidate's genes for re-testing
                    const validationGene = {
                        weights: entry.weights,
                        geneId: entry.geneId,
                        specializationType: entry.specializationType,
                        parent: null // No parent reference for validation spawns
                    };

                    console.log(`[VALIDATION] Respawning validation candidate ${geneId} for test run ${entry.attempts + 1}/3 (stored weights)`);
                    // Give validation agents extra energy and safe spawning to ensure they can complete their runs
                    const validationAgent = spawnAgent(simulation, {
                        gene: validationGene,
                        energy: INITIAL_AGENT_ENERGY * 3, // Triple energy for validation
                        isValidationAgent: true
                    });
                    if (validationAgent) {
                        simulation.validationManager.activeValidationAgents++;
                        console.log(`[VALIDATION] Active validation agents: ${simulation.validationManager.activeValidationAgents}/${maxValidationAgents}`);

                        // Mark as actively being tested to prevent duplicate spawns
                        entry.isActiveTest = true;
                        console.log(`[VALIDATION] Marked ${geneId} as active test (run ${entry.attempts + 1})`);
                    } else {
                        // Release spawn lock if spawning failed
                        simulation.validationManager.releaseSpawnLock(geneId);
                        console.log(`[VALIDATION] Failed to spawn validation agent for ${geneId}, released spawn lock`);
                    }
                }

                // If we spawned validation agents, continue to next spawn slot
                if (candidatesToSpawn.length > 0) {
                    continue;
                }
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
                // CRITICAL: Don't pass neural network structure params - let agent use config defaults
                const childGene = {
                    weights: childWeights,
                    specializationType: matingPair.parent1.specializationType,
                    geneId: matingPair.parent1.geneId
                    // Don't pass numSensorRays, hiddenSize, etc - they should come from config
                };
                spawnAgent(simulation, { gene: childGene });
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

                // CRITICAL: If specialization changes, don't pass parent weights or structure
                const usesParentGene = novelSpecialization === parent.specializationType;
                const childGene = {
                    weights: usesParentGene ? parent.weights : null,
                    specializationType: novelSpecialization,
                    geneId: usesParentGene ? parent.geneId : null
                    // Don't pass numSensorRays, hiddenSize etc - incompatible if spec changed
                };
                spawnAgent(simulation, {
                    gene: childGene,
                    mutationRate: usesParentGene ? simulation.mutationRate / 2 : null
                });
            }
            else {
                spawnAgent(simulation, { gene: null });
            }
        }
    }

    simulation.respawnTimer = 0;
}
