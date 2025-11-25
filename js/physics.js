// Physics and collision functions moved from game.js

import {
    PHEROMONE_RADIUS, PHEROMONE_DIAMETER, OBSTACLE_HIDING_RADIUS,
    MAX_ENERGY, OBESITY_THRESHOLD_ENERGY, MAX_VELOCITY, TWO_PI,
    MIN_ENERGY_TO_REPRODUCE, MATURATION_AGE_FRAMES
} from './constants.js';
import { Rectangle } from './quadtree.js';
import { distance } from './utils.js';
import { PheromonePuff } from './pheromone.js';
import { Agent } from './agent.js';
import { queryArrayPool, hitTypeArrayPool } from './array-pool.js';
import { rectanglePool } from './rectangle-pool.js';

export function checkCollisions(simulation) {
    // OPTIMIZED: Collision detection using distance squared to avoid sqrt
    // Limit collision checks per agent to avoid O(n²) scaling
    const numAgents = simulation.agents.length;

    // Clear processed collision tracking for this frame
    for (let i = 0; i < numAgents; i++) {
        const agent = simulation.agents[i];
        if (agent && agent.processedCollisions) {
            agent.processedCollisions.clear();
        }
    }

    // Reuse pre-allocated collision query range
    const collisionQueryRange = simulation.collisionQueryRange;

    for (let i = 0; i < numAgents; i++) {
        const agent = simulation.agents[i];
        if (!agent || agent.isDead) continue;

        const agentSize = agent.size;

        // USE QUADTREE for ALL collision detection - rebuilt every iteration for accuracy
        // Query range based on maximum possible collision distance (agent sizes + buffer)
        const maxOtherAgentSize = 50; // Conservative estimate of largest agent size
        const queryRange = agentSize + maxOtherAgentSize + 20; // Buffer for movement between frames
        collisionQueryRange.x = agent.x;
        collisionQueryRange.y = agent.y;
        collisionQueryRange.w = queryRange;
        collisionQueryRange.h = queryRange;

        const nearby = simulation.quadtree.query(collisionQueryRange);

        // Process all nearby entities for collisions
        const nearbyLen = nearby.length;
        for (let j = 0; j < nearbyLen; j++) {
            const other = nearby[j];
            if (agent === other || other.isDead || other instanceof PheromonePuff) continue;

            // Only check agent-to-agent collisions for now (food handled separately)
            if (!(other instanceof Agent)) continue;

            const dx = agent.x - other.x;
            const dy = agent.y - other.y;
            const distSq = dx * dx + dy * dy;
            const otherSize = other.size;
            const combinedSize = agentSize + otherSize;
            const combinedSizeSq = combinedSize * combinedSize;

            // Use squared distance for comparison (faster, no sqrt needed)
            if (distSq < combinedSizeSq) {
                agent.collisions++; // Increment collision counter
                other.collisions++; // Both agents get collision credit

                // Simple bump physics to prevent overlap
                const overlap = combinedSize - Math.sqrt(distSq);
                if (overlap > 0) {
                    const dist = Math.sqrt(distSq) || 1;
                    const pushX = (dx / dist) * overlap * 0.5;
                    const pushY = (dy / dist) * overlap * 0.5;

                    // Apply stronger separation to make collisions more visible
                    const separationStrength = 1.0; // Full separation
                    const oldAgentX = agent.x, oldAgentY = agent.y;
                    const oldOtherX = other.x, oldOtherY = other.y;

                    agent.x += pushX * separationStrength;
                    agent.y += pushY * separationStrength;
                    other.x -= pushX * separationStrength;
                    other.y -= pushY * separationStrength;

                    // Trigger collision visual effect (red glow) for both agents tied to game speed
                    if (simulation.renderer) {
                        simulation.renderer.addVisualEffect(agent, 'collision', simulation.gameSpeed);
                        simulation.renderer.addVisualEffect(other, 'collision', simulation.gameSpeed);
                    }

                    // Prevent checking the same collision pair again in this frame
                    // by marking this agent pair as already processed
                    if (!agent.processedCollisions) agent.processedCollisions = new Set();
                    if (!other.processedCollisions) other.processedCollisions = new Set();

                    const pairKey = agent.geneId < other.geneId ?
                        `${agent.geneId}-${other.geneId}` : `${other.geneId}-${agent.geneId}`;

                    if (!agent.processedCollisions.has(pairKey)) {
                        agent.processedCollisions.add(pairKey);
                        other.processedCollisions.add(pairKey);
                    } else {
                        // Skip this collision as it was already processed
                        continue;
                    }
                }
                // Agent collision logging disabled for performance

                // === SEXUAL REPRODUCTION (MATING) ===
                // Check for mating opportunities when agents collide
                if (agent.wantsToReproduce && other.wantsToReproduce &&
                    agent.energy > MIN_ENERGY_TO_REPRODUCE && other.energy > MIN_ENERGY_TO_REPRODUCE) {

                    // Attempt mating (tryMate handles all other validation)
                    if (agent.tryMate(other)) {
                        console.log(`[REPRODUCTION] 💕 Mating: ${agent.geneId} + ${other.geneId}`);

                        // Show toast notification
                        if (simulation.toast) {
                            simulation.toast.showReproduction('mate', agent.geneId, other.geneId);
                        }
                    }
                }

                if (agent.wantsToAttack && agentSize > other.size * 1.1) {
                    agent.energy += other.energy * 0.8;
                    agent.kills++;
                    agent.fitness += 20; // Reward for successful kill
                    other.isDead = true;
                    simulation.logger.log(`[COMBAT] Agent ${agent.geneId} killed agent ${other.geneId}.`);
                }
            }
        }

        // PERFORMANCE: Release array back to pool after use
        queryArrayPool.release(nearby);

        // OPTIMIZED: Use quadtree for food collision detection
        // Query for nearby food within collision range
        const foodQueryRange = agentSize + 10; // Max food size is ~5, add buffer
        collisionQueryRange.x = agent.x;
        collisionQueryRange.y = agent.y;
        collisionQueryRange.w = foodQueryRange;
        collisionQueryRange.h = foodQueryRange;

        const nearbyFood = simulation.quadtree.query(collisionQueryRange);

        for (let j = 0; j < nearbyFood.length; j++) {
            const food = nearbyFood[j];
            // Check if this is food (has isFood property)
            if (!food || !food.isFood || food.isDead) continue;

            const dx = agent.x - food.x;
            const dy = agent.y - food.y;
            const distSq = dx * dx + dy * dy;
            const foodSize = food.size || 5;
            const combinedSize = agentSize + foodSize;
            const combinedSizeSq = combinedSize * combinedSize;

            // Use squared distance for comparison (faster, no sqrt needed)
            if (distSq < combinedSizeSq) {
                agent.energy += food.energyValue;
                agent.foodEaten++;
                agent.fitness += 15; // Immediate fitness reward for food
                food.isDead = true;

                // Trigger eating visual effect (green glow) tied to game speed
                if (simulation.renderer) {
                    simulation.renderer.addVisualEffect(agent, 'eating', simulation.gameSpeed);
                }
            }
        }

        // PERFORMANCE: Release array back to pool after use
        queryArrayPool.release(nearbyFood);

        // OPTIMIZED: Use quadtree for obstacle collision detection
        // Query for nearby obstacles within collision range
        const maxObstacleRadius = 100; // Conservative estimate of largest obstacle
        const obstacleQueryRange = agentSize + maxObstacleRadius + 20; // Buffer
        collisionQueryRange.x = agent.x;
        collisionQueryRange.y = agent.y;
        collisionQueryRange.w = obstacleQueryRange;
        collisionQueryRange.h = obstacleQueryRange;

        const nearbyObstacles = simulation.quadtree.query(collisionQueryRange);

        for (let j = 0; j < nearbyObstacles.length; j++) {
            const obstacle = nearbyObstacles[j];
            // Check if this is an obstacle (not food, not agent, has radius)
            if (!obstacle || obstacle.isFood || obstacle instanceof Agent || obstacle.radius === undefined) continue;

            const dx = agent.x - obstacle.x;
            const dy = agent.y - obstacle.y;
            const distSq = dx * dx + dy * dy;
            const combinedSize = agentSize + obstacle.radius;
            const combinedSizeSq = combinedSize * combinedSize;

            if (distSq < combinedSizeSq) {
                // Collision with obstacle - take damage and bounce
                const dist = Math.sqrt(distSq) || 1;
                const overlap = combinedSize - dist;

                if (overlap > 0) {
                    // Separate agent from obstacle
                    const pushX = (dx / dist) * overlap;
                    const pushY = (dy / dist) * overlap;
                    agent.x += pushX;
                    agent.y += pushY;

                    // Bounce the agent (reverse velocity direction)
                    const bounceFactor = 0.8; // Energy loss on bounce

                    // Check if agent died from collision
                    if (agent.energy <= 0) {
                        agent.isDead = true;
                    }

                    // Trigger collision visual effect (red glow) tied to game speed
                    if (simulation.renderer) {
                        simulation.renderer.addVisualEffect(agent, 'collision', simulation.gameSpeed);
                    }

                    // Slightly nudge the obstacle in response to collision
                    const nudgeStrength = 0.05; // Small nudge
                    const nudgeAngle = Math.random() * Math.PI * 2; // Random direction
                    obstacle.vx += Math.cos(nudgeAngle) * nudgeStrength;
                    obstacle.vy += Math.sin(nudgeAngle) * nudgeStrength;

                    // Dampen obstacle velocity slightly after nudge to prevent runaway
                    const obstacleSpeed = Math.sqrt(obstacle.vx * obstacle.vx + obstacle.vy * obstacle.vy);
                    const maxObstacleSpeed = 0.3; // Keep obstacles moving slowly
                    if (obstacleSpeed > maxObstacleSpeed) {
                        obstacle.vx = (obstacle.vx / obstacleSpeed) * maxObstacleSpeed;
                        obstacle.vy = (obstacle.vy / obstacleSpeed) * maxObstacleSpeed;
                    }

                    // Only process one obstacle collision per agent per frame
                    break;
                }
            }
        }

        // PERFORMANCE: Release array back to pool after use
        queryArrayPool.release(nearbyObstacles);
    }
}

// Convert GPU ray tracing results to neural network inputs
// Now uses GPU pheromone detection results instead of CPU
export function convertGpuRayResultsToInputs(simulation, gpuRayResults, gpuAgents, maxRaysPerAgent) {
    if (!gpuRayResults || gpuRayResults.length === 0 || gpuAgents.length === 0) {
        return;
    }

    simulation.currentFrameGpuAgentIds.clear();
    simulation.rayHits = 0;

    for (let agentIdx = 0; agentIdx < gpuAgents.length; agentIdx++) {
        const agent = gpuAgents[agentIdx];
        if (!agent) continue;

        // Reuse pre-allocated arrays from Agent
        agent.inputs.length = 0;
        // agent.rayData is pre-allocated, so we don't clear it, we just overwrite
        const inputs = agent.inputs;
        const rayData = agent.rayData;
        let rayDataIndex = 0;

        // Use this agent's specific number of rays, but cap it at the max the GPU can handle
        const numSensorRays = agent.numSensorRays;
        const numAlignmentRays = agent.numAlignmentRays;
        const raysToProcess = Math.min(numSensorRays, maxRaysPerAgent);


        if (numSensorRays === 0) {
            // Agent might have 0 rays by design, give it default inputs
            agent.lastInputs = [0, 0, 0, 0, 0, 0.5, 0.5, 0, 0, 0, 0];
            // Don't clear lastRayData if we want to reuse it, but here it's a fallback
            continue;
        }

        const sensorAngleStep = TWO_PI / numSensorRays;
        const maxRayDist = agent.maxRayDist;

        for (let rayIdx = 0; rayIdx < raysToProcess; rayIdx++) {
            const globalRayIdx = agentIdx * maxRaysPerAgent + rayIdx;
            const offset = globalRayIdx * 4; // Each ray result is 4 floats

            if (offset + 3 >= gpuRayResults.length) {
                simulation.logger.error(`GPU result buffer out of bounds for sensor ray`, { agentIdx, rayIdx, offset });
                continue;
            }

            const distance = gpuRayResults[offset];
            const hitType = gpuRayResults[offset + 1];
            const entityId = gpuRayResults[offset + 2];
            const entitySize = gpuRayResults[offset + 3]; // Read entity size for agent differentiation

            const isHit = hitType > 0 && distance < maxRayDist;

            // Debug: Log GPU raw results for first few rays (disabled - working correctly)
            // if (agentIdx === 0 && rayIdx < 10 && this.frameCount % 60 === 0) {
            //     const hitTypeNames = {0: 'none', 1: 'edge', 2: 'food', 3: 'agent', 4: 'obstacle'};
            //     this.logger.log(`[GPU-RAY-DEBUG] Agent 0, Ray ${rayIdx}: hitType=${hitType} (${hitTypeNames[hitType] || 'unknown'}), dist=${distance.toFixed(1)}, maxDist=${maxRayDist}`);
            // }

            const normalizedDist = 1.0 - (Math.min(distance, maxRayDist) / maxRayDist);

            if (isNaN(normalizedDist)) {
                simulation.logger.error('[GPU-CONVERT] normalizedDist became NaN!', {
                    agentId: agent.geneId,
                    agentSpecialization: agent.specializationType,
                    rawDistance: distance,
                    agentMaxRayDist: maxRayDist
                });
                // Set to a safe value to prevent crashing the NN
                inputs.push(0);
            } else {
                inputs.push(normalizedDist);
            }

            // PERFORMANCE: Use pooled array instead of allocating new one
            const hitTypeArray = hitTypeArrayPool.acquire();
            let hitTypeName = 'none';
            if (isHit) {
                simulation.rayHits++;
                if (hitType === 1) { // Wall
                    hitTypeArray[0] = 0; hitTypeArray[1] = 0; hitTypeArray[2] = 0; hitTypeArray[3] = 1; hitTypeName = 'edge';
                } else if (hitType === 2) { // Food
                    hitTypeArray[0] = 1; hitTypeArray[1] = 0; hitTypeArray[2] = 0; hitTypeArray[3] = 0; hitTypeName = 'food';
                } else if (hitType === 3) { // Agent - differentiate by size
                    const agentSize = agent.size;
                    if (entitySize > agentSize * 1.1) {
                        // Larger agent (threat/predator)
                        hitTypeArray[0] = 0; hitTypeArray[1] = 1; hitTypeArray[2] = 0; hitTypeArray[3] = 0; hitTypeName = 'larger';
                    } else if (entitySize < agentSize * 0.9) {
                        // Smaller agent (prey)
                        hitTypeArray[0] = 0; hitTypeArray[1] = 0; hitTypeArray[2] = 1; hitTypeArray[3] = 0; hitTypeName = 'smaller';
                    } else {
                        // Same size agent
                        hitTypeArray[0] = 0; hitTypeArray[1] = 1; hitTypeArray[2] = 1; hitTypeArray[3] = 0; hitTypeName = 'same';
                    }
                } else if (hitType === 4) { // Obstacle
                    hitTypeArray[0] = 0; hitTypeArray[1] = 0; hitTypeArray[2] = 0; hitTypeArray[3] = 1; hitTypeName = 'obstacle';
                }
            }
            inputs.push(...hitTypeArray);

            // PERFORMANCE: Return array to pool
            hitTypeArrayPool.release(hitTypeArray);

            const angle = agent.angle + (rayIdx - numSensorRays / 2) * sensorAngleStep;

            // OPTIMIZED: Reuse rayData object
            if (rayDataIndex < rayData.length) {
                const ray = rayData[rayDataIndex++];
                ray.angle = angle;
                ray.dist = distance;
                ray.hit = isHit;
                ray.type = 'sensor';
                ray.hitType = hitTypeName;
                ray.hitTypeValue = hitType;
            } else {
                // Fallback if needed
                rayData.push({
                    angle,
                    dist: distance,
                    hit: isHit,
                    type: 'sensor',
                    hitType: hitTypeName,
                    hitTypeValue: hitType
                });
                rayDataIndex++;
            }
        }

        // --- Process alignment rays (simplified - just add normalized distances) ---
        // Alignment rays are not currently supported by GPU shader, so we add placeholder values
        // These should match what the CPU path would calculate
        for (let rayIdx = 0; rayIdx < numAlignmentRays; rayIdx++) {
            // For now, use a default value of 0.5 (mid-range) as placeholder
            // TODO: Implement proper alignment ray tracing in GPU shader
            inputs.push(0.5);

            const angle = agent.angle + (rayIdx - numAlignmentRays / 2) * (TWO_PI / numAlignmentRays);

            // OPTIMIZED: Reuse rayData object for alignment rays too
            if (rayDataIndex < rayData.length) {
                const ray = rayData[rayDataIndex++];
                ray.angle = angle;
                ray.dist = maxRayDist * 0.5; // Approximate mid-range
                ray.hit = false;
                ray.type = 'alignment';
                ray.hitType = 'none';
            } else {
                rayData.push({
                    angle,
                    dist: maxRayDist * 0.5, // Approximate mid-range
                    hit: false,
                    type: 'alignment',
                    hitType: 'none'
                });
                rayDataIndex++;
            }
        }

        // CRITICAL: Trim rayData to the actual number of rays used
        // This prevents stale data from previous frames if the number of rays decreased
        if (rayData.length > rayDataIndex) {
            rayData.length = rayDataIndex;
        }

        // Update references
        agent.lastInputs = inputs;
        agent.lastRayData = rayData;

        // --- Add other inputs (pheromones, energy, etc.) ---
        // Detect pheromones using quadtree proximity search
        let dangerSmell = 0;
        let attackSmell = 0;
        let inShadow = false;

        // Pheromone detection
        const smellRadius = rectanglePool.acquire(
            agent.x - PHEROMONE_RADIUS,
            agent.y - PHEROMONE_RADIUS,
            PHEROMONE_DIAMETER,
            PHEROMONE_DIAMETER
        );
        const nearbyPuffs = simulation.quadtree.query(smellRadius);
        for (const entity of nearbyPuffs) {
            if (entity.data instanceof PheromonePuff) {
                const pheromone = entity.data;
                const dist = distance(agent.x, agent.y, pheromone.x, pheromone.y);
                if (dist < PHEROMONE_RADIUS) {
                    const intensity = 1.0 - (dist / PHEROMONE_RADIUS);
                    if (pheromone.type === 'danger') {
                        dangerSmell = Math.max(dangerSmell, intensity);
                    } else if (pheromone.type === 'attack') {
                        attackSmell = Math.max(attackSmell, intensity);
                    }
                }
            }
        }

        // PERFORMANCE: Release rectangle and array back to pools
        rectanglePool.release(smellRadius);
        queryArrayPool.release(nearbyPuffs);

        // OPTIMIZED: Use quadtree for obstacle shadow detection
        const shadowQueryRect = rectanglePool.acquire(
            agent.x - agent.maxRayDist,
            agent.y - agent.maxRayDist,
            agent.maxRayDist * 2,
            agent.maxRayDist * 2
        );
        const nearbyObstaclesForShadow = simulation.quadtree.query(shadowQueryRect);

        for (const point of nearbyObstaclesForShadow) {
            const obs = point;
            // Check if this is an obstacle
            if (!obs || obs.isFood || obs instanceof Agent || obs.radius === undefined) continue;

            const dist = distance(agent.x, agent.y, obs.x, obs.y);
            if (dist < obs.radius + OBSTACLE_HIDING_RADIUS) {
                inShadow = true;
                break;
            }
        }

        // PERFORMANCE: Release rectangle and array back to pools
        rectanglePool.release(shadowQueryRect);
        queryArrayPool.release(nearbyObstaclesForShadow);

        agent.dangerSmell = dangerSmell;
        agent.attackSmell = attackSmell;

        // Debug: Log pheromone detection for first agent (disabled by default)
        // if (agentIdx === 0 && (dangerSmell > 0 || attackSmell > 0) && this.frameCount % 60 === 0) {
        //     this.logger.log(`[PHEROMONE-GPU-DEBUG] Agent 0 detected:`, {
        //         dangerSmell: dangerSmell.toFixed(2),
        //         attackSmell: attackSmell.toFixed(2),
        //         nearbyPheromones: nearbyPuffs.filter(e => e.data instanceof PheromonePuff).length
        //     });
        // }

        const currentSpeed = Math.sqrt(agent.vx * agent.vx + agent.vy * agent.vy);
        const velocityAngle = Math.atan2(agent.vy, agent.vx);
        const angleDifference = (velocityAngle - agent.angle + Math.PI * 3) % TWO_PI - Math.PI;

        inputs.push((MAX_ENERGY - agent.energy) / MAX_ENERGY); // Hunger
        inputs.push(Math.min(agent.dangerSmell, 1)); // Fear
        inputs.push(Math.min(agent.attackSmell + (agent.energy / OBESITY_THRESHOLD_ENERGY), 1)); // Aggression
        inputs.push(agent.energy / MAX_ENERGY); // Energy ratio
        inputs.push(Math.min(agent.age / 60, 1)); // Age ratio
        inputs.push(currentSpeed / MAX_VELOCITY); // Speed ratio
        inputs.push(angleDifference / Math.PI); // Velocity-angle difference
        inputs.push(inShadow ? 1 : 0); // In obstacle shadow

        // Recent memory (temporal awareness) - adds 8 inputs
        inputs.push(agent.previousVelocities[1].vx / MAX_VELOCITY); // Previous velocity X (1 frame ago)
        inputs.push(agent.previousVelocities[1].vy / MAX_VELOCITY); // Previous velocity Y (1 frame ago)
        inputs.push(agent.previousVelocities[2].vx / MAX_VELOCITY); // Previous velocity X (2 frames ago)
        inputs.push(agent.previousVelocities[2].vy / MAX_VELOCITY); // Previous velocity Y (2 frames ago)
        inputs.push((agent.previousEnergies[0] - agent.energy) / MAX_ENERGY); // Energy delta (last frame)
        inputs.push(Math.min(agent.previousDanger[1], 1)); // Previous danger (1 frame ago)
        inputs.push(Math.min(agent.previousAggression[1], 1)); // Previous aggression (1 frame ago)
        inputs.push((agent.previousEnergies[1] - agent.previousEnergies[2]) / MAX_ENERGY); // Energy delta (2 frames ago)

        agent.lastInputs = inputs;
        agent.lastRayData = rayData;

        if (inputs.some(isNaN)) {
            simulation.logger.error('[GPU PERCEPTION] NaN detected in GPU perception inputs', { agentId: agent.geneId, inputs });
        }
    }
}
