// --- AGENT CLASS (RNN and Thrust/Rotation Implemented) ---
// Preserved exactly from original with gene ID added (metadata only)

import { NeuralNetwork } from './neural-network.js';
import {
    BASE_SIZE, ENERGY_TO_SIZE_RATIO, MAX_ENERGY, MIN_ENERGY_TO_REPRODUCE,
    REPRODUCE_COST_BASE, CHILD_STARTING_ENERGY,
    REPRODUCTION_COOLDOWN_FRAMES, PREGNANCY_DURATION_FRAMES,
    OBESITY_THRESHOLD_ENERGY, OBESITY_ENERGY_TAX_DIVISOR,
    MAX_THRUST, MAX_ROTATION, MAX_VELOCITY, SPRINT_BONUS_THRUST,
    SPRINT_COST_PER_FRAME, SPRINT_THRESHOLD, FEAR_SPRINT_BONUS,
    OBSTACLE_COLLISION_PENALTY, OBSTACLE_HIDING_RADIUS,
    PHEROMONE_RADIUS, PHEROMONE_DIAMETER, DAMPENING_FACTOR, ROTATION_COST_MULTIPLIER,
    PASSIVE_LOSS, MOVEMENT_COST_MULTIPLIER, LOW_ENERGY_THRESHOLD,
    SPECIALIZATION_TYPES, INITIAL_AGENT_ENERGY, AGENT_CONFIGS, TWO_PI,
    DIRECTION_CHANGE_FITNESS_FACTOR, MIN_FRAMES_ALIVE_TO_SAVE_GENE_POOL,
    MIN_FITNESS_TO_SAVE_GENE_POOL, MIN_FOOD_EATEN_TO_SAVE_GENE_POOL,
    EXPLORATION_CELL_WIDTH, EXPLORATION_CELL_HEIGHT, EXPLORATION_GRID_WIDTH, EXPLORATION_GRID_HEIGHT
} from './constants.js';
import { distance, randomGaussian, generateGeneId, geneIdToColor, generateId } from './utils.js';
import { Rectangle } from './quadtree.js';
import { spawnPheromone } from './spawn.js';
import { crossover } from './gene.js';
import { PheromonePuff } from './pheromone.js';

export class Agent {
    constructor(gene, x, y, energy, logger, parent = null, simulation = null) {
        this.logger = logger;
        this.simulation = simulation;

        this.gene = gene || {};

        // Position and physics
        this.x = x;
        this.y = y;
        this.entityType = 1.0; // 1 for agent, 2 for food

        // Validate and set energy
        if (typeof energy !== 'number' || !isFinite(energy) || energy <= 0) {
            this.logger.error('Agent created with invalid energy, defaulting.', { providedEnergy: energy });
            this.energy = INITIAL_AGENT_ENERGY;
        } else {
            this.energy = energy;
        }

        this.size = BASE_SIZE + (this.energy / ENERGY_TO_SIZE_RATIO);
        this.diameter = this.size * 2;
        this.targetSize = this.size;
        this.maxEnergy = MAX_ENERGY;
        this.energyEfficiency = 1.0;
        this.age = 0;
        this.framesAlive = 0;

        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.angle = Math.random() * TWO_PI;

        // --- VITAL ---
        // These properties MUST be set before the neural network is initialized.

        // Specialization system
        const allTypes = Object.values(SPECIALIZATION_TYPES);
        if (this.gene.specializationType && allTypes.includes(this.gene.specializationType)) {
            this.specializationType = this.gene.specializationType;
        } else {
            this.specializationType = allTypes[Math.floor(Math.random() * allTypes.length)];
        }

        if (!this.specializationType || !AGENT_CONFIGS[this.specializationType]) {
            this.logger.error('CRITICAL: invalid specializationType after initialization! Falling back to FORAGER.', {
                gene: this.gene,
                type: this.specializationType
            });
            this.specializationType = SPECIALIZATION_TYPES.FORAGER; // Safe fallback
        }

        // Create a numeric ID for the specialization type for GPU processing
        const typeKeys = Object.values(SPECIALIZATION_TYPES);
        this.specializationTypeId = typeKeys.indexOf(this.specializationType);
        if (this.specializationTypeId === -1) {
            this.logger.error('Could not determine specializationTypeId', { type: this.specializationType });
            this.specializationTypeId = 0; // Fallback to 0 (FORAGER)
        }

        // Get agent configuration from the central AGENT_CONFIGS object
        const config = AGENT_CONFIGS[this.specializationType];

        // Specialized sensor configurations from config
        this.numSensorRays = this.gene.numSensorRays || config.numSensorRays || 30;
        this.maxRayDist = this.gene.maxRayDist || config.maxRayDist || 150;
        // Alignment rays are being phased out in favor of simpler GPU logic, but we keep a value for now.
        this.numAlignmentRays = this.gene.numAlignmentRays || 6;

        // Specialized hidden layer sizes from config
        this.hiddenSize = this.gene.hiddenSize || config.hiddenSize || 20;

        // --- RNN State ---
        // CRITICAL: Initialize hiddenState here, as its length is needed for inputSize
        this.hiddenState = new Array(this.hiddenSize).fill(0);

        // Input size: (rays * 5) + (alignment rays * 1) + 8 state inputs + 8 memory inputs + hidden state
        this.inputSize = (this.numSensorRays * 5) + (this.numAlignmentRays * 1) + 16 + this.hiddenState.length;
        this.outputSize = 5;

        // Now that sizes are defined, initialize the neural network
        if (!this.gene.weights) {
            this.nn = new NeuralNetwork(this.inputSize, this.hiddenSize, this.outputSize);
            this.gene.weights = this.nn.getWeights(); // Store the new random weights
        } else {
            this.nn = new NeuralNetwork(this.inputSize, this.hiddenSize, this.outputSize, this.gene.weights);
        }

        this.birthTime = Date.now();
        this.offspring = 0;
        this.childrenFromSplit = 0;
        this.childrenFromMate = 0;
        this.kills = 0;
        this.foodEaten = 0;
        this.collisions = 0; // Total number of collisions detected
        this.timesHitObstacle = 0; // Number of obstacle collisions (not wall hits)
        this.rayHits = 0; // Total number of ray hits detected
        this.fitness = 0;
        this.fit = false;
        this.isDead = false;
        this.wantsToReproduce = false;
        this.wantsToAttack = false;
        this.isSprinting = false;
        this.lastRayData = [];
        this.lastInputs = null;
        this.lastOutput = null;
        this.newHiddenState = null;
        this.reproductionCooldown = REPRODUCTION_COOLDOWN_FRAMES;
        this.distanceTravelled = 0;
        this.directionChanged = 0;
        this.speedChanged = 0; // Track speed variation to reward dynamic movement
        this.consecutiveTurns = 0; // Track consecutive turns in same direction (penalize circles)
        this.lastTurnDirection = 0; // Track direction of last significant turn
        this.exploredCells = new Set(); // Track unique grid cells visited for exploration percentage
        this.cleverTurns = 0; // Direction changes in response to threats/opportunities
        this.energySpent = 0;
        this.successfulEscapes = 0;
        this.lastX = x;
        this.lastY = y;
        this.currentRotation = 0;

        // --- Recent Memory (last 3 frames for temporal awareness) ---
        this.memoryFrames = 3;
        this.previousVelocities = Array(this.memoryFrames).fill(null).map(() => ({ vx: 0, vy: 0 }));
        this.previousEnergies = Array(this.memoryFrames).fill(this.energy);
        this.previousDanger = Array(this.memoryFrames).fill(0);
        this.previousAggression = Array(this.memoryFrames).fill(0);
        this.previousRayHits = Array(this.memoryFrames).fill(0);

        // --- Pre-allocated Memory for Performance ---
        this.inputs = []; // Pre-allocate inputs array
        this.rayData = []; // Pre-allocate rayData array
        this.queryRange = new Rectangle(0, 0, 0, 0); // Pre-allocate query range
        this.smellRadius = new Rectangle(0, 0, 0, 0); // Pre-allocate smell radius

        // Pre-allocate rayData objects to avoid garbage generation
        const maxTotalRays = this.numSensorRays + this.numAlignmentRays;
        for (let i = 0; i < maxTotalRays; i++) {
            this.rayData.push({
                angle: 0,
                dist: 0,
                hit: false,
                type: '',
                hitType: '',
                hitTypeValue: 0
            });
        }

        // --- RNN State ---
        //this.hiddenState = new Array(this.hiddenSize).fill(0);

        // --- BEHAVIORAL STATES ---
        this.isPregnant = false;
        this.pregnancyTimer = 0;
        this.fatherWeights = this.gene.fatherWeights;
        this.dangerSmell = 0;
        this.attackSmell = 0;
        this.hunger = 1;
        this.fear = 0;
        this.aggression = 0;
        this.avgGroupSize = 1;

        this.mutationRate = 0.1;
        this.speedFactor = 2 + Math.random() * 3;

        // --- GENE ID SYSTEM (NEW) ---
        this.id = generateId(this.birthTime)
        this.geneId = this.gene.geneId || generateGeneId(this.id);
        this.geneColor = geneIdToColor(this.geneId);
    }

    getWeights() {
        return this.nn.getWeights();
    }

    think(inputs) {
        // CPU path - compute neural network forward pass

        // Validate inputs
        if (!Array.isArray(inputs) || inputs.length === 0) {
            console.error(`[ERROR] Invalid neural network inputs for agent ${this.geneId}:`, inputs);
            inputs = new Array(16).fill(0.5); // Fallback inputs
        }

        // Validate hidden state
        if (!Array.isArray(this.hiddenState) || this.hiddenState.length === 0) {
            console.error(`[ERROR] Invalid hidden state for agent ${this.geneId}:`, this.hiddenState);
            this.hiddenState = new Array(this.hiddenSize).fill(0); // Reset hidden state
        }


        const result = this.nn.forward(inputs, this.hiddenState);
        this.hiddenState = result.hiddenState;


        this.thinkFromOutput(result.output);
    }

    thinkFromOutput(output) {
        // Shared logic for processing neural network outputs (used by both CPU and GPU paths)
        // Validate output array
        if (!Array.isArray(output) || output.length < 5) {
            console.error('Invalid output from neural network:', output);
            output = [0.5, 0.5, 0, 0, 0]; // Default safe values
        }

        // Outputs: (Thrust, Rotation, Sprint, Mate-Search, Attack)
        // Outputs: (Thrust, Rotation, Sprint, Mate-Search, Attack)
        const thrustOutput = output[0];
        const rotationOutput = (output[1] * 2 - 1);
        const sprintOutput = output[2];
        this.wantsToReproduce = output[3] > 0.8;
        this.wantsToAttack = output[4] > 0.8;


        // --- MOVEMENT CALCULATIONS ---
        const geneticMaxThrust = MAX_THRUST * this.speedFactor;
        let desiredThrust = thrustOutput * geneticMaxThrust;

        // CRITICAL FIX: Minimum movement guarantee to prevent agents from starving due to zero thrust
        if (desiredThrust < 0.01) {
            desiredThrust = 0.01; // Minimum thrust to ensure some movement
        }

        let sprintThreshold = SPRINT_THRESHOLD;

        // --- FIGHT/FLIGHT MODIFIERS ---
        if (this.fear > this.aggression * 0.5) {
            sprintThreshold = 0.5;
            desiredThrust += FEAR_SPRINT_BONUS * MAX_THRUST;
            if (this.dangerSmell > 0.5) this.successfulEscapes++;
        }

        if ((this.isSprinting = (sprintOutput > sprintThreshold))) {
            desiredThrust += SPRINT_BONUS_THRUST;
        }

        // Apply rotation
        const rotationChange = rotationOutput * MAX_ROTATION;
        this.angle += rotationChange;
        this.currentRotation = Math.abs(rotationChange); // Store for cost calculation

        // Apply thrust in the direction of the angle
        let finalThrustX = Math.cos(this.angle) * desiredThrust;
        let finalThrustY = Math.sin(this.angle) * desiredThrust;

        // TEMP: Add minimum random movement to ensure agents explore
        if (Math.abs(finalThrustX) < 0.01 && Math.abs(finalThrustY) < 0.01) {
            // Add small random thrust if neural network produces no movement
            finalThrustX = (Math.random() - 0.5) * 0.1;
            finalThrustY = (Math.random() - 0.5) * 0.1;
        }


        this.vx += finalThrustX;
        this.vy += finalThrustY;
    }

    update(worldWidth, worldHeight, obstacles, quadtree) {
        if (this.isDead) return;

        // Check if GPU has already processed this agent's neural network
        if (this.lastOutput && this.newHiddenState) {
            // GPU processed - use results and update hidden state
            this.hiddenState = this.newHiddenState;
            this.thinkFromOutput(this.lastOutput);
            // Clear GPU results so we don't reuse them
            this.lastOutput = null;
            this.newHiddenState = null;
        } else {
            // If lastInputs is not populated, it means the GPU perception step failed or was skipped.
            // In that case, we must run perception on the CPU.
            if (!this.lastInputs) {
                if (this.framesAlive !== 0) {
                    this.logger.warn(`[FALLBACK] Agent ${this.geneId} running unexpected CPU perception fallback.`, { frame: this.simulation.frameCount });
                }
                const perception = this.perceiveWorld(quadtree, obstacles, worldWidth, worldHeight);
                this.lastRayData = perception.rayData;
                this.think(perception.inputs);
            } else {
                // Otherwise, perception data is fresh, just run the brain.
                this.think(this.lastInputs);
                // Note: With GPU running per iteration (Solution 4), we don't clear lastInputs
                // because GPU will overwrite it on the next iteration anyway
            }
        }

        this.age = this.framesAlive / 60; // Frame-based age (independent of game speed)
        this.framesAlive++;
        if (this.reproductionCooldown > 0) this.reproductionCooldown--;
        if (this.isPregnant) {
            this.pregnancyTimer++;
            if (this.pregnancyTimer >= PREGNANCY_DURATION_FRAMES) {
                this.isPregnant = false;
                this.pregnancyTimer = 0;
                this.birthChild();
            }
        }

        // --- Movement Application ---
        this.lastX = this.x;
        this.lastY = this.y;

        // Update recent memory (shift older frames back)
        for (let i = this.memoryFrames - 1; i > 0; i--) {
            this.previousVelocities[i] = { ...this.previousVelocities[i - 1] };
            this.previousEnergies[i] = this.previousEnergies[i - 1];
            this.previousDanger[i] = this.previousDanger[i - 1];
            this.previousAggression[i] = this.previousAggression[i - 1];
            this.previousRayHits[i] = this.previousRayHits[i - 1];
        }
        // Store current frame as most recent memory
        this.previousVelocities[0] = { vx: this.vx, vy: this.vy };
        this.previousEnergies[0] = this.energy;
        this.previousDanger[0] = this.dangerSmell;
        this.previousAggression[0] = this.attackSmell;
        this.previousRayHits[0] = this.rayHits;

        // Apply drag/dampening
        this.vx *= DAMPENING_FACTOR;
        this.vy *= DAMPENING_FACTOR;

        // Cap velocity - OPTIMIZED: Cache MAX_VELOCITY_SQ
        const MAX_VELOCITY_SQ = MAX_VELOCITY * MAX_VELOCITY;
        const currentSpeedSq = this.vx * this.vx + this.vy * this.vy;
        if (currentSpeedSq > MAX_VELOCITY_SQ) {
            const ratio = MAX_VELOCITY / Math.sqrt(currentSpeedSq);
            this.vx *= ratio;
            this.vy *= ratio;
        }

        this.x += this.vx;
        this.y += this.vy;

        this.distanceTravelled += distance(this.lastX, this.lastY, this.x, this.y);

        // Track exploration - mark current grid cell as visited
        const gridX = Math.floor(this.x / EXPLORATION_CELL_WIDTH);
        const gridY = Math.floor(this.y / EXPLORATION_CELL_HEIGHT);
        const cellKey = `${gridX},${gridY}`;
        this.exploredCells.add(cellKey);

        // --- ENERGY COSTS ---
        const passiveLoss = PASSIVE_LOSS;
        const sizeLoss = (this.size * 0.00025);

        const movementCostMultiplier = MOVEMENT_COST_MULTIPLIER;
        const movementLoss = Math.min(currentSpeedSq * movementCostMultiplier, 5);

        let energyLoss = sizeLoss + movementLoss;

        if (this.framesAlive > 1) {
            energyLoss += passiveLoss;
        }

        this.energy -= energyLoss;
        this.energySpent += energyLoss;

        if (this.isSprinting) {
            this.energy -= SPRINT_COST_PER_FRAME;
            this.energySpent += SPRINT_COST_PER_FRAME;
        }

        // Explicit cost for high rotation to break spinning optimum
        const rotationCost = this.currentRotation * ROTATION_COST_MULTIPLIER;
        this.energy -= rotationCost;
        this.energySpent += rotationCost;

        if (this.energy > OBESITY_THRESHOLD_ENERGY) {
            this.energy -= this.energy / OBESITY_ENERGY_TAX_DIVISOR;
        }
        // --- END ENERGY COSTS ---

        // Reward for changing direction (dodging/weaving)
        const prevVel = this.previousVelocities[1] || { vx: 0, vy: 0 };
        const prevVx = prevVel.vx;
        const prevVy = prevVel.vy;
        const currVx = this.vx;
        const currVy = this.vy;

        // Only calculate if moving to avoid noise
        if (Math.abs(prevVx) > 0.01 || Math.abs(prevVy) > 0.01) {
            const prevAngle = Math.atan2(prevVy, prevVx);
            const currAngle = Math.atan2(currVy, currVx);
            let angleDiff = Math.abs(currAngle - prevAngle);
            if (angleDiff > Math.PI) angleDiff = TWO_PI - angleDiff;

            this.directionChanged += angleDiff * DIRECTION_CHANGE_FITNESS_FACTOR;

            // Track speed changes to reward dynamic movement (not constant speed circles)
            const prevSpeed = Math.sqrt(prevVx * prevVx + prevVy * prevVy);
            const currSpeed = Math.sqrt(currVx * currVx + currVy * currVy);
            const speedDiff = Math.abs(currSpeed - prevSpeed);
            if (speedDiff > 0.05) { // Lower threshold for speed changes
                this.speedChanged += speedDiff * 2.0; // Increased reward for speed variation
            }

            // Detect circular movement patterns (consecutive turns in same direction)
            const turnDirection = Math.sign(angleDiff > 0.1 ? currAngle - prevAngle : 0);
            if (Math.abs(angleDiff) > 0.2) { // Significant turn
                if (turnDirection === Math.sign(this.lastTurnDirection || 0)) {
                    this.consecutiveTurns++;
                } else {
                    this.consecutiveTurns = 1; // Reset on direction change
                }
                this.lastTurnDirection = turnDirection;
            } else {
                this.consecutiveTurns = Math.max(0, this.consecutiveTurns - 0.1); // Decay over time
            }

            // Track "clever turns" - significant direction changes in response to environment
            if (angleDiff > 0.3) { // Only count meaningful turns (about 17 degrees)
                // Clever turn if responding to danger, opportunity, or visual information
                const hasRecentRayHits = this.previousRayHits.some(hits => hits > 0);
                if (this.dangerSmell > 0.5 || this.attackSmell > 0.5 || hasRecentRayHits) {
                    this.cleverTurns += angleDiff;
                }
            }
        }

        this.size = BASE_SIZE + (this.energy / ENERGY_TO_SIZE_RATIO);
        this.diameter = this.size * 2;

        // --- ASEXUAL REPRODUCTION (SPLITTING) ---
        if (this.energy > this.maxEnergy * 0.95 && this.reproductionCooldown <= 0) {
            this.split();
        }

        if (this.energy <= 0) {
            this.isDead = true;
            this.cleanup();
        }

        // --- EDGE BOUNCE ---
        const dampen = 0.5;
        let hitWall = false;
        if (this.x < 0) {
            this.x = 0;
            this.vx *= -dampen;
            hitWall = true;
        }
        if (this.x > worldWidth) {
            this.x = worldWidth;
            this.vx *= -dampen;
            hitWall = true;
        }
        if (this.y < 0) {
            this.y = 0;
            this.vy *= -dampen;
            hitWall = true;
        }
        if (this.y > worldHeight) {
            this.y = worldHeight;
            this.vy *= -dampen;
            hitWall = true;
        }
        if (hitWall) {
            const energyLost = OBSTACLE_COLLISION_PENALTY / 4;  // Reduced from /2 to /4 for more forgiving wall hits
            this.energy -= energyLost;
            this.collisions++;
            // Wall collision logging disabled for performance
        }

        // Obstacle Collision - OPTIMIZED: Use squared distance to avoid sqrt
        const agentSize = this.size;
        for (let i = 0; i < obstacles.length; i++) {
            const obs = obstacles[i];
            const dx = this.x - obs.x;
            const dy = this.y - obs.y;
            const distSq = dx * dx + dy * dy;
            const combinedRadius = agentSize + obs.radius;
            const combinedRadiusSq = combinedRadius * combinedRadius;

            if (distSq < combinedRadiusSq) {
                const dist = Math.sqrt(distSq);
                const overlap = combinedRadius - dist;
                if (dist > 0.0001) { // Avoid division by zero
                    this.x += (dx / dist) * overlap;
                    this.y += (dy / dist) * overlap;
                }
                this.vx *= -dampen;
                this.vy *= -dampen;

                this.energy -= OBSTACLE_COLLISION_PENALTY;
                this.collisions++;
                this.timesHitObstacle++;
                // Obstacle collision logging disabled for performance
                break; // Only handle first collision
            }
        }

        this.emitPheromones();
        this.calculateFitness();
    }

    perceiveWorld(quadtree, obstacles, worldWidth, worldHeight) {
        // Reset ray hits counter at start of each frame
        this.rayHits = 0;

        // Reuse pre-allocated arrays
        this.inputs.length = 0;
        // rayData is pre-allocated, so we don't clear it, we just overwrite
        const inputs = this.inputs;
        const rayData = this.rayData;
        let rayDataIndex = 0;

        const maxRayDist = this.maxRayDist;
        const numSensorRays = this.numSensorRays;
        const numAlignmentRays = this.numAlignmentRays;

        // Calculate ray angles
        const startAngle = this.angle - Math.PI;
        const sensorAngleStep = TWO_PI / numSensorRays;
        const alignAngleStep = TWO_PI / numAlignmentRays;

        // Helper for ray-circle intersection
        const rayCircleIntersect = (rayX, rayY, rayDirX, rayDirY, circleX, circleY, circleRadius) => {
            const ocX = circleX - rayX;
            const ocY = circleY - rayY;
            const b = (ocX * rayDirX + ocY * rayDirY);
            const c = (ocX * ocX + ocY * ocY) - circleRadius * circleRadius;
            const discriminant = b * b - c;

            if (discriminant < 0) return null; // No intersection

            const t1 = b - Math.sqrt(discriminant);
            const t2 = b + Math.sqrt(discriminant);

            if (t1 > 0.001) return t1; // First intersection point in front of ray origin
            if (t2 > 0.001) return t2; // Second intersection point in front of ray origin (if t1 was behind)
            return null; // Both intersection points are behind ray origin
        };

        // Process sensor rays
        for (let rayIdx = 0; rayIdx < numSensorRays; rayIdx++) {
            const angle = startAngle + rayIdx * sensorAngleStep;
            const rayDirX = Math.cos(angle);
            const rayDirY = Math.sin(angle);

            let closestDist = maxRayDist;
            let hitType = 0; // 0: none, 1: food, 2: smaller agent, 3: larger agent, 4: obstacle, 5: edge
            let hitEntity = null;

            // Check for world edge collisions
            let distToEdge = Infinity;
            if (rayDirX < 0) distToEdge = Math.min(distToEdge, -this.x / rayDirX);
            if (rayDirX > 0) distToEdge = Math.min(distToEdge, (worldWidth - this.x) / rayDirX);
            if (rayDirY < 0) distToEdge = Math.min(distToEdge, -this.y / rayDirY);
            if (rayDirY > 0) distToEdge = Math.min(distToEdge, (worldHeight - this.y) / rayDirY);

            if (distToEdge > 0 && distToEdge < closestDist) {
                closestDist = distToEdge;
                hitType = 5; // Edge
            }

            // Check for obstacle collisions
            for (const obs of obstacles) {
                const dist = rayCircleIntersect(this.x, this.y, rayDirX, rayDirY, obs.x, obs.y, obs.radius);
                if (dist !== null && dist > 0 && dist < closestDist) {
                    closestDist = dist;
                    hitType = 4; // Obstacle
                    hitEntity = obs;
                }
            }

            // Query quadtree for nearby entities (agents and food)
            // Reuse pre-allocated Rectangle
            this.queryRange.x = this.x - maxRayDist;
            this.queryRange.y = this.y - maxRayDist;
            this.queryRange.w = maxRayDist * 2;
            this.queryRange.h = maxRayDist * 2;

            const nearbyEntities = quadtree.query(this.queryRange);

            for (const entity of nearbyEntities) {
                if (!entity) continue; // Safety check for bad data in quadtree
                if (entity === this || entity.isDead) continue;

                if (entity.isFood) {
                    const food = entity;
                    const dist = rayCircleIntersect(this.x, this.y, rayDirX, rayDirY, food.x, food.y, food.size);
                    if (dist !== null && dist > 0 && dist < closestDist) {
                        closestDist = dist;
                        hitType = 1; // Food
                        hitEntity = food;
                    }
                } else if (entity instanceof Agent) {
                    const otherAgent = entity;
                    const dist = rayCircleIntersect(this.x, this.y, rayDirX, rayDirY, otherAgent.x, otherAgent.y, otherAgent.size);
                    if (dist !== null && dist > 0 && dist < closestDist) {
                        closestDist = dist;
                        if (this.size > otherAgent.size * 1.1) {
                            hitType = 3; // Larger agent (prey)
                        } else if (this.size < otherAgent.size * 0.9) {
                            hitType = 2; // Smaller agent (predator)
                        } else {
                            hitType = 6; // Same size agent
                        }
                        hitEntity = otherAgent;
                    }
                }
            }

            const normalizedDist = 1.0 - (Math.min(closestDist, maxRayDist) / maxRayDist);
            inputs.push(normalizedDist);

            let hitTypeArray = [0, 0, 0, 0];
            let hitTypeName = 'none';
            const isHit = closestDist < maxRayDist;

            if (isHit) {
                this.rayHits++;
                if (hitType === 1) {
                    hitTypeArray = [1, 0, 0, 0]; hitTypeName = 'food';
                } else if (hitType === 2) {
                    hitTypeArray = [0, 1, 0, 0]; hitTypeName = 'smaller';
                } else if (hitType === 3) {
                    hitTypeArray = [0, 0, 1, 0]; hitTypeName = 'larger';
                } else if (hitType === 6) {
                    hitTypeArray = [0, 1, 1, 0]; hitTypeName = 'same_size_agent';
                } else if (hitType === 4 || hitType === 5) {
                    hitTypeArray = [0, 0, 0, 1]; hitTypeName = 'obstacle_or_edge';
                }
            }
            inputs.push(...hitTypeArray);

            // OPTIMIZED: Reuse rayData object
            if (rayDataIndex < rayData.length) {
                const ray = rayData[rayDataIndex++];
                ray.angle = angle;
                ray.dist = closestDist;
                ray.hit = isHit;
                ray.type = 'sensor';
                ray.hitType = hitTypeName;
                ray.hitTypeValue = hitType;
            } else {
                // Fallback if needed
                rayData.push({
                    angle, dist: closestDist, hit: isHit, type: 'sensor',
                    hitType: hitTypeName, hitTypeValue: hitType
                });
                rayDataIndex++;
            }
        }

        // Process alignment rays (no hitType, just distance)
        for (let rayIdx = 0; rayIdx < numAlignmentRays; rayIdx++) {
            const angle = startAngle + rayIdx * alignAngleStep;
            const rayDirX = Math.cos(angle);
            const rayDirY = Math.sin(angle);

            let closestDist = maxRayDist;

            let distToEdge = Infinity;
            if (rayDirX < 0) distToEdge = Math.min(distToEdge, -this.x / rayDirX);
            if (rayDirX > 0) distToEdge = Math.min(distToEdge, (worldWidth - this.x) / rayDirX);
            if (rayDirY < 0) distToEdge = Math.min(distToEdge, -this.y / rayDirY);
            if (rayDirY > 0) distToEdge = Math.min(distToEdge, (worldHeight - this.y) / rayDirY);
            if (distToEdge > 0 && distToEdge < closestDist) {
                closestDist = distToEdge;
            }

            for (const obs of obstacles) {
                const dist = rayCircleIntersect(this.x, this.y, rayDirX, rayDirY, obs.x, obs.y, obs.radius);
                if (dist !== null && dist > 0 && dist < closestDist) {
                    closestDist = dist;
                }
            }

            // Reuse pre-allocated Rectangle
            this.queryRange.x = this.x - maxRayDist;
            this.queryRange.y = this.y - maxRayDist;
            this.queryRange.w = maxRayDist * 2;
            this.queryRange.h = maxRayDist * 2;

            const nearbyEntities = quadtree.query(this.queryRange);

            for (const entity of nearbyEntities) {
                if (!entity) continue; // Safety check
                if (entity === this || entity.isDead) continue;

                const r = entity.isFood ? entity.size : (entity.size || 0);
                if (r > 0) {
                    const dist = rayCircleIntersect(this.x, this.y, rayDirX, rayDirY, entity.x, entity.y, r);
                    if (dist !== null && dist > 0 && dist < closestDist) {
                        closestDist = dist;
                    }
                }
            }

            const isHit = closestDist < maxRayDist;
            if (isHit) {
                this.rayHits++;
            }

            const normalizedDist = 1.0 - (Math.min(closestDist, maxRayDist) / maxRayDist);
            inputs.push(normalizedDist);

            // OPTIMIZED: Reuse rayData object
            if (rayDataIndex < rayData.length) {
                const ray = rayData[rayDataIndex++];
                ray.angle = angle;
                ray.dist = closestDist;
                ray.hit = isHit;
                ray.type = 'alignment';
                ray.hitType = isHit ? 'alignment' : 'none';
                // hitTypeValue not needed for alignment
            } else {
                rayData.push({
                    angle, dist: closestDist, hit: isHit, type: 'alignment',
                    hitType: isHit ? 'alignment' : 'none'
                });
                rayDataIndex++;
            }
        }

        let dangerSmell = 0;
        let attackSmell = 0;
        let inShadow = false;

        // Reuse pre-allocated Rectangle
        this.smellRadius.x = this.x - PHEROMONE_RADIUS;
        this.smellRadius.y = this.y - PHEROMONE_RADIUS;
        this.smellRadius.w = PHEROMONE_DIAMETER;
        this.smellRadius.h = PHEROMONE_DIAMETER;

        const nearbyPuffs = quadtree.query(this.smellRadius);
        for (const entity of nearbyPuffs) {
            if (entity.data instanceof PheromonePuff) {
                const pheromone = entity.data;
                const dist = distance(this.x, this.y, pheromone.x, pheromone.y);
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

        for (const obs of obstacles) {
            const dist = distance(this.x, this.y, obs.x, obs.y);
            if (dist < obs.radius + OBSTACLE_HIDING_RADIUS) {
                inShadow = true;
                break;
            }
        }

        this.dangerSmell = dangerSmell;
        this.attackSmell = attackSmell;

        const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        const velocityAngle = Math.atan2(this.vy, this.vx);
        const angleDifference = (velocityAngle - this.angle + Math.PI * 3) % TWO_PI - Math.PI;

        inputs.push((MAX_ENERGY - this.energy) / MAX_ENERGY); // Hunger
        inputs.push(Math.min(this.dangerSmell, 1)); // Fear
        inputs.push(Math.min(this.attackSmell + (this.energy / OBESITY_THRESHOLD_ENERGY), 1)); // Aggression
        inputs.push(this.energy / MAX_ENERGY); // Energy ratio

        inputs.push(Math.min(this.age / 60, 1)); // Age ratio
        inputs.push(currentSpeed / MAX_VELOCITY); // Speed ratio
        inputs.push(angleDifference / Math.PI); // Velocity-angle difference
        inputs.push(inShadow ? 1 : 0); // In obstacle shadow

        // Recent memory (temporal awareness) - adds 8 inputs
        // Safety checks to prevent undefined access errors
        const vel1 = this.previousVelocities[1] || { vx: 0, vy: 0 };
        const vel2 = this.previousVelocities[2] || { vx: 0, vy: 0 };
        const energy0 = this.previousEnergies[0] || this.energy;
        const energy1 = this.previousEnergies[1] || this.energy;
        const energy2 = this.previousEnergies[2] || this.energy;
        const danger1 = this.previousDanger[1] || 0;
        const aggression1 = this.previousAggression[1] || 0;

        inputs.push(vel1.vx / MAX_VELOCITY); // Previous velocity X (1 frame ago)
        inputs.push(vel1.vy / MAX_VELOCITY); // Previous velocity Y (1 frame ago)
        inputs.push(vel2.vx / MAX_VELOCITY); // Previous velocity X (2 frames ago)
        inputs.push(vel2.vy / MAX_VELOCITY); // Previous velocity Y (2 frames ago)
        inputs.push((energy0 - this.energy) / MAX_ENERGY); // Energy delta (last frame)
        inputs.push(Math.min(danger1, 1)); // Previous danger (1 frame ago)
        inputs.push(Math.min(aggression1, 1)); // Previous aggression (1 frame ago)
        inputs.push((energy1 - energy2) / MAX_ENERGY); // Energy delta (2 frames ago)

        this.lastRayData = rayData;

        // DEBUG: Minimal ray tracing confirmation (only when rays are actually hitting things)
        if (this.simulation.agents && this.simulation.agents[0] === this && this.rayHits > 0 && this.framesAlive % 1200 === 0) {
            console.log(`[DEBUG] Ray tracing active: ${this.rayHits}/${this.numSensorRays + this.numAlignmentRays} rays hitting objects`);
        }

        return { inputs, rayData, nearbyAgents: [] }; // nearbyAgents not fully populated here, but that's ok for now.
    }

    emitPheromones() {
        // Update fear and aggression based on pheromone smells and state
        this.fear = Math.min(this.dangerSmell + (this.isLowEnergy() ? 0.6 : 0), 1);
        this.aggression = Math.min(this.attackSmell + (this.wantsToAttack ? 0.6 : 0) + (this.energy > OBESITY_THRESHOLD_ENERGY ? 0.4 : 0), 1);


        // Lower thresholds and higher spawn rates for more visible pheromones
        if (this.fear > 0.5 && Math.random() < 0.3) {
            spawnPheromone(this.simulation, this.x, this.y, 'danger');
        }
        if (this.aggression > 0.5 && Math.random() < 0.3) {
            spawnPheromone(this.simulation, this.x, this.y, 'attack');
        }
        // NEW: Add reproduction pheromone when wantsToReproduce
        if (this.wantsToReproduce && Math.random() < 0.2) {
            spawnPheromone(this.simulation, this.x, this.y, 'reproduction');
        }
    }

    tryMate(mate) {
        // FRAME-BASED maturation check (independent of game speed)
        const MATURATION_AGE_FRAMES = 900; // 15 seconds at 60 FPS
        if (this.framesAlive < MATURATION_AGE_FRAMES || mate.framesAlive < MATURATION_AGE_FRAMES) return false;
        if (this.specializationType !== mate.specializationType) return false;

        if (this.isPregnant || this.reproductionCooldown > 0 || this.energy < MIN_ENERGY_TO_REPRODUCE ||
            mate.isPregnant || mate.reproductionCooldown > 0 || mate.energy < MIN_ENERGY_TO_REPRODUCE) {
            return false;
        }

        const mateScore = mate.speedFactor * (mate.energy / MAX_ENERGY);
        const selfScore = this.speedFactor * (this.energy / MAX_ENERGY);

        if (mateScore < selfScore * 0.5) return false;

        this.isPregnant = true;
        this.pregnancyTimer = 0;
        this.reproductionCooldown = REPRODUCTION_COOLDOWN_FRAMES;
        this.energy -= REPRODUCE_COST_BASE;
        this.fatherWeights = mate.getWeights();

        mate.reproductionCooldown = REPRODUCTION_COOLDOWN_FRAMES;
        mate.energy -= REPRODUCE_COST_BASE * 0.5;

        this.offspring++;
        this.childrenFromMate++;
        return true;
    }

    split() {
        this.logger.log(`[LIFECYCLE] Agent ${this.geneId} is splitting due to high energy.`);


        // Halve energy for parent and child
        const childEnergy = this.energy / 2;
        this.energy /= 2;

        // Create a direct clone of the gene, including specialization
        const childGene = {
            weights: this.getWeights(), // Get a copy of the current weights
            fatherWeights: null,
            geneId: this.geneId, // Inherit gene ID
            specializationType: this.specializationType // Direct inheritance
        };

        const child = new Agent(
            childGene,
            this.x + randomGaussian(0, this.diameter),
            this.y + randomGaussian(0, this.diameter),
            childEnergy,
            this.logger,
            null,
            this.simulation
        );

        // Mutate the clone slightly
        child.nn.mutate(this.simulation.mutationRate * 0.5); // Lower mutation rate for clones

        this.offspring++;
        this.childrenFromSplit++;
        this.reproductionCooldown = REPRODUCTION_COOLDOWN_FRAMES * 1.5; // Longer cooldown after splitting

        return child;
    }

    birthChild() {
        const parentWeights = this.getWeights();
        const childWeights = crossover(parentWeights, this.fatherWeights);


        // Specialization inheritance with mutation chance (5% chance to change)
        let childSpecialization = this.specializationType;
        if (Math.random() < 0.05) {
            const allTypes = Object.values(SPECIALIZATION_TYPES);
            childSpecialization = allTypes[Math.floor(Math.random() * allTypes.length)];
        }

        const childGene = {
            weights: childWeights,
            fatherWeights: null, // Father weights are used for creation, not inherited
            geneId: this.geneId, // Inherit gene ID from mother
            specializationType: childSpecialization
        };

        const child = new Agent(
            childGene,
            this.x + randomGaussian(0, 5),
            this.y + randomGaussian(0, 5),
            CHILD_STARTING_ENERGY,
            this.logger,
            null,
            this.simulation
        );

        // Mutate neural network
        child.nn.mutate(this.simulation.mutationRate);

        // Mutate inherited traits (preserved from original)
        child.speedFactor = Math.max(1, child.speedFactor + randomGaussian(0, 0.05));
        child.maxRayDist = Math.max(50, child.maxRayDist + randomGaussian(0, 5));

        this.fatherWeights = null;
        return child;
    }

    isLowEnergy() {
        return this.energy < LOW_ENERGY_THRESHOLD;
    }

    mutate() {
        this.nn.mutate(this.simulation.mutationRate);
        this.weights = this.getWeights();
    }

    calculateFitness() {
        // Calculate exploration percentage
        const totalCells = EXPLORATION_GRID_WIDTH * EXPLORATION_GRID_HEIGHT;
        const explorationPercentage = (this.exploredCells.size / totalCells) * 100;

        let baseScore = 0;


        // 1. Productive Actions (Contribute to Base Score)
        baseScore += this.offspring * 50; // Heavily reduced to prevent inflation
        baseScore += this.cleverTurns * 30; // Reduced to prevent inflation
        baseScore += Math.min(this.directionChanged, 500) * 2; // Further reduced and capped lower
        baseScore += Math.min(this.speedChanged, 200) * 1; // Further reduced and capped lower
        baseScore += explorationPercentage * 10; // Reduced from 50 to prevent inflation
        baseScore += this.foodEaten * 20; // Heavily reduced from 100
        baseScore += this.kills * 100; // Reduced from 500

        if (this.offspring > 0 && this.foodEaten > 0) {
            baseScore += (this.offspring * this.foodEaten) * 5;
        }

        // 2. Efficiency and Exploration
        // Only reward efficiency for agents that have actually moved and spent energy
        let efficiency = 0;
        if (this.energySpent > 50) { // Minimum energy threshold to avoid division issues
            efficiency = Math.min(this.distanceTravelled / this.energySpent, 10.0); // Cap at 10x efficiency
        }
        baseScore += efficiency * 15;

        // 3. Penalize repetitive circular movement (lucky food finding)
        const circlePenalty = Math.min(this.consecutiveTurns * 20, 2000); // Increased penalty for circular movement
        baseScore -= circlePenalty;
        baseScore += this.successfulEscapes * 75;

        // 3. Penalties (Applied to Base Score)
        baseScore -= circlePenalty; // Apply circular movement penalty
        baseScore -= this.timesHitObstacle * 30; // Reduced penalty for obstacle collisions
        baseScore -= (this.collisions - this.timesHitObstacle) * 10; // Reduced penalty for wall hits

        // 4. Collision Avoidance Reward (NEW)
        // Reward agents that survive without hitting obstacles
        const obstacleFreeFrames = Math.max(0, this.framesAlive - (this.timesHitObstacle * 30));
        if (obstacleFreeFrames > 200) {
            baseScore += (obstacleFreeFrames / 200) * 25; // +25 per 200 frames without obstacle hits
        }

        // 5. Survival Multiplier (The most important factor)
        // This creates a positive feedback loop. A high base score is good,
        // but a high base score sustained over a long life is exponentially better.
        // The multiplier starts at 1x and increases with age, but is capped to prevent runaway fitness.
        // An agent living for 60 seconds (3600 frames) gets a 2x multiplier on its entire life's achievements.
        const survivalMultiplier = Math.min(1 + (this.framesAlive / 3600), 4.0); // Cap at 4x maximum

        // Final fitness is the base score amplified by how long the agent survived.
        const finalFitness = baseScore * survivalMultiplier;

        // Add a small bonus for just surviving, rewarding wall-avoiders even if they don't eat.
        // Equivalent to age * 2 (where age is in seconds) -> (frames / 60) * 2 = frames / 30
        const rawSurvivalBonus = this.framesAlive / 30;

        this.fitness = Math.max(0, finalFitness + rawSurvivalBonus);
        this.fit = this.fitness >= MIN_FITNESS_TO_SAVE_GENE_POOL && this.foodEaten >= MIN_FOOD_EATEN_TO_SAVE_GENE_POOL && this.framesAlive >= MIN_FRAMES_ALIVE_TO_SAVE_GENE_POOL;
    }

    cleanup() {
        // Reinitialize memory arrays to prevent undefined access errors
        // Don't just clear them - reinitialize with proper structure
        this.previousVelocities = Array(this.memoryFrames).fill(null).map(() => ({ vx: 0, vy: 0 }));
        this.previousEnergies = Array(this.memoryFrames).fill(this.energy);
        this.previousDanger = Array(this.memoryFrames).fill(0);
        this.previousAggression = Array(this.memoryFrames).fill(0);
        this.previousRayHits = Array(this.memoryFrames).fill(0);

        // Clear working arrays
        this.inputs.length = 0;
        this.rayData.length = 0;
        this.exploredCells.clear(); // Reset exploration tracking

        // Clear neural network results
        this.lastInputs = null;
        this.lastRayData = [];
        this.lastOutput = null;
        this.newHiddenState = null;

        // Clear gene references to help GC
        if (this.gene) {
            this.gene.fatherWeights = null;
        }
        this.fatherWeights = null;

        // Reset behavioral states
        this.dangerSmell = 0;
        this.attackSmell = 0;
        this.hunger = 0;
        this.fear = 0;
        this.aggression = 0;
        this.avgGroupSize = 0;

        // Clear renderer references if they exist
        if (this.rendererMesh) {
            this.rendererMesh = null;
        }
    }
}

