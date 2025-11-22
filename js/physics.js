// Physics and collision functions moved from game.js

import {
    PHEROMONE_RADIUS, PHEROMONE_DIAMETER, OBSTACLE_HIDING_RADIUS,
    MAX_ENERGY, OBESITY_THRESHOLD_ENERGY, MAX_VELOCITY, TWO_PI
} from './constants.js';
import { Rectangle } from './quadtree.js';
import { distance } from './utils.js';
import { PheromonePuff } from './pheromone.js';
import { Agent } from './agent.js';

export function checkCollisions(simulation) {
    // OPTIMIZED: Collision detection using distance squared to avoid sqrt
    // Limit collision checks per agent to avoid O(n²) scaling
    const numAgents = simulation.agents.length;
    for (let i = 0; i < numAgents; i++) {
        const agent = simulation.agents[i];
        if (!agent || agent.isDead) continue;

        const agentSize = agent.size;
        // Reuse pre-allocated Rectangle
        simulation.collisionQueryRange.x = agent.x;
        simulation.collisionQueryRange.y = agent.y;
        simulation.collisionQueryRange.w = agent.diameter;
        simulation.collisionQueryRange.h = agent.diameter;

        const nearby = simulation.quadtree.query(simulation.collisionQueryRange);

        // Limit checks per agent for performance (check closest entities first)
        let checked = 0;
        const maxChecks = 12; // OPTIMIZED: Reduced from 15 to 12

        const nearbyLen = nearby.length;
        for (let j = 0; j < nearbyLen && checked < maxChecks; j++) {
            const other = nearby[j];
            if (agent === other || other.isDead || other instanceof PheromonePuff) continue;
            checked++;

            const dx = agent.x - other.x;
            const dy = agent.y - other.y;
            const distSq = dx * dx + dy * dy;
            const otherSize = other.size || 5;
            const combinedSize = agentSize + otherSize;
            const combinedSizeSq = combinedSize * combinedSize;

            // Use squared distance for comparison (faster, no sqrt needed)
            if (distSq < combinedSizeSq) {
                agent.collisions++; // Increment collision counter

                if (other.isFood) {
                    agent.energy += other.energyValue;
                    agent.foodEaten++;
                    agent.fitness += 15; // Immediate fitness reward for food
                    other.isDead = true;
                } else if (other instanceof Agent) {
                    // Simple bump physics to prevent overlap
                    const overlap = combinedSize - Math.sqrt(distSq);
                    if (overlap > 0) {
                        const dist = Math.sqrt(distSq) || 1;
                        const pushX = (dx / dist) * overlap * 0.5;
                        const pushY = (dy / dist) * overlap * 0.5;
                        agent.x += pushX;
                        agent.y += pushY;
                        other.x -= pushX;
                        other.y -= pushY;
                    }
                    // Agent collision logging disabled for performance

                    if (agent.wantsToReproduce && other.wantsToReproduce) {
                        if (agent.tryMate(other, simulation)) {
                            simulation.logger.log(`[LIFECYCLE] Agent ${agent.geneId} successfully mated with ${other.geneId}.`);
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
        }

        // Check collisions with ALL obstacles (not just quadtree results)
        // This ensures obstacles are always checked regardless of quadtree performance
        for (const obstacle of simulation.obstacles) {
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
                    const normalX = dx / dist;
                    const normalY = dy / dist;

                    // Calculate reflection vector
                    const dotProduct = agent.vx * normalX + agent.vy * normalY;
                    agent.vx = (agent.vx - 2 * dotProduct * normalX) * bounceFactor;
                    agent.vy = (agent.vy - 2 * dotProduct * normalY) * bounceFactor;

                    // Apply damage for hitting obstacle
                    const damage = 25; // Same as OBSTACLE_COLLISION_PENALTY
                    agent.energy = Math.max(0, agent.energy - damage);
                    agent.timesHitObstacle++;
                    agent.fitness -= damage; // Fitness penalty

                    // Clamp velocity to prevent extreme bouncing (use same limit as agent movement)
                    const MAX_VELOCITY = 25; // Same as agent MAX_VELOCITY
                    const currentSpeed = Math.sqrt(agent.vx * agent.vx + agent.vy * agent.vy);
                    if (currentSpeed > MAX_VELOCITY) {
                        agent.vx = (agent.vx / currentSpeed) * MAX_VELOCITY;
                        agent.vy = (agent.vy / currentSpeed) * MAX_VELOCITY;
                    }

                    // Check if agent died from collision
                    if (agent.energy <= 0) {
                        agent.isDead = true;
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

            let hitTypeArray = [0, 0, 0, 0];
            let hitTypeName = 'none';
            if (isHit) {
                simulation.rayHits++;
                if (hitType === 1) { // Wall
                    hitTypeArray = [0, 0, 0, 1]; hitTypeName = 'edge';
                } else if (hitType === 2) { // Food
                    hitTypeArray = [1, 0, 0, 0]; hitTypeName = 'food';
                } else if (hitType === 3) { // Agent - differentiate by size
                    const agentSize = agent.size;
                    if (entitySize > agentSize * 1.1) {
                        // Larger agent (threat/predator)
                        hitTypeArray = [0, 1, 0, 0]; hitTypeName = 'larger';
                    } else if (entitySize < agentSize * 0.9) {
                        // Smaller agent (prey)
                        hitTypeArray = [0, 0, 1, 0]; hitTypeName = 'smaller';
                    } else {
                        // Same size agent
                        hitTypeArray = [0, 1, 1, 0]; hitTypeName = 'same';
                    }
                } else if (hitType === 4) { // Obstacle
                    hitTypeArray = [0, 0, 0, 1]; hitTypeName = 'obstacle';
                }
            }
            inputs.push(...hitTypeArray);

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
        const smellRadius = new Rectangle(
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

        // Obstacle shadow detection
        for (const obs of simulation.obstacles) {
            const dist = distance(agent.x, agent.y, obs.x, obs.y);
            if (dist < obs.radius + OBSTACLE_HIDING_RADIUS) {
                inShadow = true;
                break;
            }
        }

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
