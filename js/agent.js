import { NeuralNetwork } from './neural-network.js';
import {
    BASE_SIZE, ENERGY_TO_SIZE_RATIO, MAX_ENERGY, MIN_ENERGY_TO_REPRODUCE, MIN_AGENT_SIZE,
    REPRODUCE_COST_BASE, CHILD_STARTING_ENERGY,
    REPRODUCTION_COOLDOWN_FRAMES, PREGNANCY_DURATION_FRAMES,
    OBESITY_THRESHOLD_ENERGY, OBESITY_ENERGY_TAX_DIVISOR,
    MAX_THRUST, MAX_ROTATION, MAX_VELOCITY, SPRINT_BONUS_THRUST,
    SPRINT_COST_PER_FRAME, SPRINT_THRESHOLD, FEAR_SPRINT_BONUS,
    THRUST_DEADZONE, ACCELERATION_SMOOTHING, DECELERATION_RATE_NORMAL, DECELERATION_RATE_BRAKING, DECELERATION_RATE_EMERGENCY,
    ROTATION_SMOOTHING, ROTATION_MOMENTUM, ROTATION_EFFICIENCY_AT_MAX_SPEED,
    SPRINT_BONUS_MULTIPLIER, SPRINT_COST_INTENSITY_THRESHOLD,
    VELOCITY_MOMENTUM,
    OBSTACLE_COLLISION_PENALTY, OBSTACLE_HIDING_RADIUS, OBSTACLE_MAX_SPEED,
    PHEROMONE_RADIUS, PHEROMONE_DIAMETER, DAMPENING_FACTOR, BRAKING_FRICTION, ROTATION_COST_MULTIPLIER,
    PASSIVE_LOSS, MOVEMENT_COST_MULTIPLIER, LOW_ENERGY_THRESHOLD, AGENT_SIZE_ENERGY_LOSS_MULTIPLIER,
    TEMPERATURE_MAX, TEMPERATURE_MIN, TEMPERATURE_START, TEMPERATURE_GAIN_MOVE, TEMPERATURE_LOSS_PASSIVE, TEMPERATURE_PASSIVE_LOSS_FACTOR,
    TEMPERATURE_OPTIMAL_MIN, TEMPERATURE_OPTIMAL_MAX, TEMPERATURE_COLD_STRESS_THRESHOLD, TEMPERATURE_HEAT_STRESS_THRESHOLD,
    TEMPERATURE_COLD_MODERATE_THRESHOLD, TEMPERATURE_HEAT_MODERATE_THRESHOLD, TEMPERATURE_EFFICIENCY_OPTIMAL,
    TEMPERATURE_EFFICIENCY_COLD_MODERATE, TEMPERATURE_EFFICIENCY_HEAT_MODERATE, TEMPERATURE_EFFICIENCY_COLD_SEVERE,
    TEMPERATURE_EFFICIENCY_HEAT_SEVERE, TEMPERATURE_REPRODUCTION_SUPPRESSION_EXTREME,
    SEASON_LENGTH,
    SPECIALIZATION_TYPES, INITIAL_AGENT_ENERGY, AGENT_CONFIGS, TWO_PI,
    DIRECTION_CHANGE_FITNESS_FACTOR,
    MIN_FITNESS_TO_SAVE_GENE_POOL, MIN_FOOD_EATEN_TO_SAVE_GENE_POOL, FPS_TARGET,
    MIN_EXPLORATION_PERCENTAGE_TO_SAVE_GENE_POOL, MIN_TURNS_TOWARDS_FOOD_TO_SAVE_GENE_POOL,
    MIN_SECONDS_ALIVE_TO_SAVE_GENE_POOL, EXCEPTIONAL_FITNESS_THRESHOLD, INACTIVE_TEMPERATURE_PENALTY,
    MIN_DISTANCE_FOR_MOVEMENT_REWARDS, MIN_ANGLE_CHANGE_FOR_FITNESS, MIN_SPEED_CHANGE_FOR_FITNESS,
    MIN_NAVIGATION_TURN_FOR_FITNESS, MIN_FOOD_APPROACH_DISTANCE,
    SPAWN_GROWTH_DURATION_FRAMES, SPAWN_GROWTH_MIN_SCALE, SPAWN_GROWTH_MAX_SCALE, SPAWN_SIZE_INTERPOLATION_SPEED,
    EXPLORATION_CELL_WIDTH, EXPLORATION_CELL_HEIGHT, EXPLORATION_GRID_WIDTH, EXPLORATION_GRID_HEIGHT,
    WORLD_WIDTH, WORLD_HEIGHT,
    AGENT_MEMORY_FRAMES, BASE_MUTATION_RATE, AGENT_SPEED_FACTOR_BASE, AGENT_SPEED_FACTOR_VARIANCE,
    WALL_COLLISION_DAMAGE, EDGE_BOUNCE_DAMPING,
    BOUNCE_ENERGY_LOSS, COLLISION_SEPARATION_STRENGTH, COLLISION_NUDGE_STRENGTH,
    KIN_RELATEDNESS_SELF, KIN_RELATEDNESS_PARENT_CHILD, KIN_RELATEDNESS_SIBLINGS, KIN_RELATEDNESS_GRANDPARENT,
    KIN_RELATEDNESS_DISTANT, KIN_RELATEDNESS_MAX_GENERATION_DIFF,
    TERRITORY_RADIUS, RAY_DISTANCE_THRESHOLD, DIVISION_BY_ZERO_THRESHOLD
} from './constants.js';
import { distance, randomGaussian, generateGeneId, geneIdToColor, generateId } from './utils.js';
import { Rectangle } from './quadtree.js';
import { spawnPheromone } from './spawn.js';
import { crossover } from './gene.js';
import { PheromonePuff } from './pheromone.js';
import { queryArrayPool, hitTypeArrayPool } from './array-pool.js';
import { rectanglePool } from './rectangle-pool.js';

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

        this.size = Math.max(MIN_AGENT_SIZE, BASE_SIZE + (this.energy / ENERGY_TO_SIZE_RATIO));
        this.diameter = this.size * 2;
        this.targetSize = this.size;
        this.maxEnergy = MAX_ENERGY;
        this.energyEfficiency = 1.0;
        this.birthTime = Date.now(); // Real-time birth timestamp for accurate age/fitness calculation
        this.age = 0;
        this.framesAlive = 0;
        this.temperature = TEMPERATURE_START;

        // Temperature tracking for fitness calculation
        this.temperatureSum = 0;
        this.temperatureSamples = 0;

        // Genealogy tracking for kin recognition
        this.genealogy = {
            id: this.gene.id || generateId(),
            parent1Id: parent ? parent.genealogy?.id : null,
            parent2Id: null, // Set during mating
            generation: parent ? (parent.genealogy?.generation || 0) + 1 : 0,
            offspring: []
        };

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

        // --- NEURAL NETWORK INPUT STRUCTURE (RNN Architecture) ---
        // NOTE: This is a Recurrent Neural Network (RNN), so the hidden state from the previous
        // timestep is fed back as input along with the current perception data.
        //
        // Input size calculation: perception inputs + hidden state feedback
        // - Perception inputs: (sensor rays * 5) + (alignment rays * 1) + 33 state/memory inputs
        // - Hidden state: hiddenSize (RNN feedback from previous timestep)
        //
        // Perception input breakdown (33 total):
        //   - 8 base state: hunger, fear, aggression, energy, age, speed, angle diff, shadow
        //   - 4 temperature: current temp, distance from optimal, cold stress, heat stress
        //   - 1 season phase
        //   - 8 memory: previous velocities (4), energy deltas (2), previous danger/aggression (2)
        //   - 3 lifetime metrics: food eaten, obstacles hit, offspring (all normalized to [0,1])
        //   - 5 event flags: just ate, hit obstacle, reproduced, attacked, low energy (binary)
        //   - 4 movement state: current thrust, current rotation, thrust change, rotation change (NEW)
        //
        // All inputs are normalized to [0,1] or [-1,1] ranges for consistent neural network training.
        // The first layer processes (perception + hiddenState) together, which is why hiddenState
        // is included in inputSize. This is the standard RNN architecture pattern.
        this.inputSize = (this.numSensorRays * 5) + (this.numAlignmentRays * 1) + 33 + this.hiddenState.length;
        this.outputSize = 5;

        // Now that sizes are defined, initialize the neural network
        if (!this.gene.weights) {
            // No weights in gene - create new random weights
            this.nn = new NeuralNetwork(this.inputSize, this.hiddenSize, this.outputSize, null, this.logger);
            this.gene.weights = this.nn.getWeights(); // Store the new random weights
        } else {
            // Weights exist in gene - try to use them
            this.nn = new NeuralNetwork(this.inputSize, this.hiddenSize, this.outputSize, this.gene.weights, this.logger);
            // CRITICAL: If NN constructor detected incompatible dimensions and reinitialized,
            // update the gene with the new weights so it doesn't keep trying to use bad weights
            this.gene.weights = this.nn.getWeights();
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
        this.isResting = false;
        this.lastRayData = [];

        // Territorial behavior for defenders
        this.territoryCenterX = this.x;
        this.territoryCenterY = this.y;
        this.territoryRadius = TERRITORY_RADIUS; // Territory size
        this.isInTerritory = true;
        this.lastInputs = null;
        // PERFORMANCE: Arrays will be allocated by GPU unpacking when results are ready
        // Keep as null initially so truthiness check works correctly
        this.lastOutput = null; // Will be allocated by GPU unpacking
        this.newHiddenState = null; // Will be allocated by GPU unpacking
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
        this.turnsTowardsFood = 0; // Track turning towards food
        this.turnsAwayFromObstacles = 0; // Track turning away from obstacles
        this.foodApproaches = 0; // Track successful approaches to food
        this.lastFoodDistance = null; // Track distance to nearest food (null = no recent food detected)
        this.lastObstacleDistance = null; // Track distance to nearest obstacle (null = no recent obstacle detected)

        // --- Recent Memory (last 3 frames for temporal awareness) ---
        this.memoryFrames = AGENT_MEMORY_FRAMES;
        this.previousVelocities = Array(this.memoryFrames).fill(null).map(() => ({ vx: 0, vy: 0 }));
        this.previousEnergies = Array(this.memoryFrames).fill(this.energy);
        this.previousDanger = Array(this.memoryFrames).fill(0);
        this.previousAggression = Array(this.memoryFrames).fill(0);
        this.previousRayHits = Array(this.memoryFrames).fill(0);

        // --- Event Memory Flags (countdown frames since events) ---
        this.eventFlags = {
            justAteFood: 0,      // Frames since eating food
            justHitObstacle: 0,  // Frames since obstacle collision
            justReproduced: 0,   // Frames since reproduction
            justAttacked: 0,     // Frames since being attacked
            lowEnergyWarning: 0  // Frames in low energy state
        };

        // --- Pre-allocated Memory for Performance ---
        this.inputs = []; // Pre-allocate inputs array
        this.rayData = []; // Pre-allocate rayData array
        this.queryRange = new Rectangle(0, 0, 0, 0); // Pre-allocate query range
        this.smellRadius = new Rectangle(0, 0, 0, 0); // Pre-allocate smell radius

        // Pre-allocate rayData objects to avoid garbage generation
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

        this.mutationRate = BASE_MUTATION_RATE;
        this.speedFactor = AGENT_SPEED_FACTOR_BASE + Math.random() * AGENT_SPEED_FACTOR_VARIANCE;

        // --- MOVEMENT STATE TRACKING (for acceleration/deceleration smoothing) ---
        this.currentThrust = 0; // Current thrust level (smoothed)
        this.targetThrust = 0; // Target thrust from neural network
        this.currentRotation = 0; // Current rotation rate (smoothed, preserves sign for momentum)
        this.targetRotation = 0; // Target rotation from neural network
        this.previousThrust = 0; // Previous frame thrust (for change detection)
        this.previousRotation = 0; // Previous frame rotation (for change detection, preserves sign)
        this.rotationMagnitudeForCost = 0; // Rotation magnitude for cost calculation (separate from currentRotation)

        // --- GENE ID SYSTEM (NEW) ---
        this.id = generateId(this.birthTime)
        this.geneId = this.gene.geneId || generateGeneId(this.id);
        this.geneColor = geneIdToColor(this.geneId);

        // Performance: One-time GPU fallback warning flag
        this.gpuFallbackWarned = false;
        this._cleanedUp = false; // Flag to prevent double cleanup

        // Log agent birth
        this.logger.debug(`[LIFECYCLE] 🎉 Agent ${this.id} (${this.geneId}) born - Specialization: ${this.specializationType}, Energy: ${this.energy.toFixed(1)}, Parent: ${parent ? parent.id + ' (' + parent.geneId + ')' : 'none'}`);
    }

    getWeights() {
        // If neural network is cleaned up but we have extracted weights, use those
        if (!this.nn && this._extractedWeights) {
            return this._extractedWeights;
        }
        // Otherwise, try to get from neural network
        if (!this.nn) {
            throw new Error('Neural network is null and no extracted weights available');
        }
        return this.nn.getWeights();
    }

    think(inputs) {
        // CPU path - compute neural network forward pass

        // Safety check: if NN was cleaned up, mark agent as dead and return
        if (!this.nn) {
            this.isDead = true;
            // If we have extracted weights, preserve them for potential validation
            // (weights extraction should have happened before cleanup, but just in case)
            return;
        }

        // Validate inputs
        if (!Array.isArray(inputs) || inputs.length === 0) {
            this.logger.error(`[ERROR] Invalid neural network inputs for agent ${this.geneId}:`, inputs);
            inputs = new Array(16).fill(0.5); // Fallback inputs
        }

        // Validate hidden state
        if (!Array.isArray(this.hiddenState) || this.hiddenState.length === 0) {
            this.logger.error(`[ERROR] Invalid hidden state for agent ${this.geneId}:`, this.hiddenState);
            this.hiddenState = new Array(this.hiddenSize).fill(0); // Reset hidden state
        }


        const result = this.nn.forward(inputs, this.hiddenState);
        this.hiddenState = result.hiddenState;

        // Store output for UI visualization (CPU path)
        this.lastOutput = result.output;

        this.thinkFromOutput(result.output);

        // Release pooled arrays back to pool
        result.release();
    }

    thinkFromOutput(output) {
        // Shared logic for processing neural network outputs (used by both CPU and GPU paths)
        // Validate output array
        if (!Array.isArray(output) || output.length < 5) {
            this.logger.error(`[ERROR] Invalid output from neural network for agent ${this.id} (${this.geneId}):`, output);
            output = [0.5, 0.5, 0, 0, 0]; // Default safe values
        }

        // Outputs: (Thrust, Rotation, Sprint, Mate-Search, Attack)
        // Map thrust to [-1, 1] for reverse capability
        let rawThrust = (output[0] * 2 - 1);
        const rotationOutput = (output[1] * 2 - 1);
        const sprintIntensity = output[2]; // [0, 1] - continuous intensity, not binary
        this.wantsToReproduce = output[3] > 0.8;
        this.wantsToAttack = output[4] > 0.8;

        // Kin recognition: Reduce attack willingness toward close relatives
        // This will be checked during collision resolution

        // --- MOVEMENT CALCULATIONS ---
        // 1. Apply deadzone to thrust (reduced for finer control)
        if (Math.abs(rawThrust) < THRUST_DEADZONE) {
            rawThrust = 0;
        }

        // 2. Calculate target thrust
        const geneticMaxThrust = MAX_THRUST * this.speedFactor;
        this.targetThrust = rawThrust * geneticMaxThrust;

        // 3. Calculate current speed for context-aware deceleration
        const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);

        // 4. Smooth acceleration/deceleration with context-aware rates
        let decelRate = DECELERATION_RATE_NORMAL;

        // Choose deceleration rate based on context
        if (Math.abs(this.targetThrust) < THRUST_DEADZONE * geneticMaxThrust) {
            this.isBraking = true;
            decelRate = DECELERATION_RATE_BRAKING;
        } else {
            this.isBraking = false;
        }

        // Emergency deceleration when danger detected
        // OPTIMIZED: Cache previousRayHits check to avoid repeated array access
        if (this.dangerSmell > 0.7) {
            decelRate = DECELERATION_RATE_EMERGENCY;
        } else if (this.previousRayHits && this.previousRayHits.length > 0 && this.previousRayHits[0] > 5) {
            decelRate = DECELERATION_RATE_EMERGENCY;
        }

        // Interpolate towards target thrust
        // OPTIMIZED: Use squared comparison to avoid Math.abs calls
        const targetThrustSq = this.targetThrust * this.targetThrust;
        const currentThrustSq = this.currentThrust * this.currentThrust;
        
        if (targetThrustSq > currentThrustSq) {
            // Accelerating - use acceleration smoothing
            this.currentThrust += (this.targetThrust - this.currentThrust) * ACCELERATION_SMOOTHING;
        } else {
            // Decelerating - use context-aware deceleration rate
            this.currentThrust += (this.targetThrust - this.currentThrust) * decelRate;
        }

        // Clamp to max thrust (optimized: single Math.max call)
        if (this.currentThrust > geneticMaxThrust) {
            this.currentThrust = geneticMaxThrust;
        } else if (this.currentThrust < -geneticMaxThrust) {
            this.currentThrust = -geneticMaxThrust;
        }

        // 5. Apply temperature and energy modifiers
        const tempEfficiency = this.getTemperatureEfficiency();
        let desiredThrust = this.currentThrust * tempEfficiency;

        // Energy conservation (resting)
        if (this.energy < LOW_ENERGY_THRESHOLD * 0.5) { // Below 50 energy
            desiredThrust *= 0.3; // Reduce movement to 30% when exhausted
            this.isResting = true;
        } else {
            this.isResting = false;
        }

        // Temperature affects reproduction willingness
        if (this.temperature < TEMPERATURE_COLD_STRESS_THRESHOLD || this.temperature > TEMPERATURE_HEAT_STRESS_THRESHOLD) {
            // Extreme temperatures reduce mating drive
            this.wantsToReproduce = this.wantsToReproduce && (Math.random() < TEMPERATURE_REPRODUCTION_SUPPRESSION_EXTREME);
        }

        // 6. Apply directional sprint (continuous intensity, works in any direction)
        if (sprintIntensity > SPRINT_COST_INTENSITY_THRESHOLD) {
            this.isSprinting = true;
            const sprintMultiplier = 1.0 + (sprintIntensity * SPRINT_BONUS_MULTIPLIER);
            desiredThrust *= sprintMultiplier;

            // Sprint energy cost scales with intensity
            const sprintCost = SPRINT_COST_PER_FRAME * sprintIntensity;
            this.energy -= sprintCost;
            this.energySpent += sprintCost;
        } else {
            this.isSprinting = false;
        }

        // 7. Fear sprint bonus (only if moving, works in any direction)
        if (this.fear > this.aggression * 0.5 && desiredThrust !== 0) {
            desiredThrust += FEAR_SPRINT_BONUS * MAX_THRUST * Math.sign(desiredThrust);
            if (this.dangerSmell > 0.5) this.successfulEscapes++;
        }

        // 8. Smooth rotation with momentum
        this.targetRotation = rotationOutput * MAX_ROTATION;

        // Apply rotation momentum (carryover from previous frame)
        // Use previousRotation which stores the rotation rate from last frame
        this.currentRotation = this.previousRotation * ROTATION_MOMENTUM;
        this.currentRotation += this.targetRotation * (1 - ROTATION_MOMENTUM);

        // Rotation efficiency at high speeds (harder to turn at max speed)
        const speedRatio = currentSpeed / MAX_VELOCITY;
        const rotationEfficiency = 1.0 - (speedRatio * (1 - ROTATION_EFFICIENCY_AT_MAX_SPEED));
        this.currentRotation *= rotationEfficiency;

        // Apply rotation to angle
        this.angle += this.currentRotation;

        // Normalize angle to [0, TWO_PI) to prevent precision issues
        this.angle = this.angle % TWO_PI;
        if (this.angle < 0) this.angle += TWO_PI;

        // Store rotation magnitude for cost calculation (use absolute value of smoothed rotation)
        // OPTIMIZED: Calculate magnitude once and reuse
        const rotationMagnitude = this.currentRotation < 0 ? -this.currentRotation : this.currentRotation;

        // 9. Apply thrust in the direction of the angle
        // Note: Velocity momentum removed - update() already applies DAMPENING_FACTOR for physics friction
        // The acceleration/deceleration smoothing above provides the movement smoothness
        const finalThrustX = Math.cos(this.angle) * desiredThrust;
        const finalThrustY = Math.sin(this.angle) * desiredThrust;

        this.vx += finalThrustX;
        this.vy += finalThrustY;

        // Store for next frame
        this.previousThrust = this.currentThrust;
        // CRITICAL: Store the actual rotation rate (with sign) for momentum calculation
        // Don't store magnitude here - we need the direction for proper momentum
        this.previousRotation = this.currentRotation;
        
        // Store rotation magnitude separately for cost calculation (used in update() method)
        // We'll use a separate variable to avoid breaking momentum
        this.rotationMagnitudeForCost = rotationMagnitude;
    }

    update(worldWidth, worldHeight, obstacles, quadtree, simulation) {
        if (this.isDead) return;

        // Safety check: if neural network was cleaned up, mark as dead and return
        if (!this.nn) {
            this.isDead = true;
            // If we have extracted weights, preserve them for potential validation
            // (weights extraction should have happened before cleanup, but just in case)
            return;
        }

        // Constants for spawn growth effect
        const spawnProgress = Math.min(1.0, this.framesAlive / SPAWN_GROWTH_DURATION_FRAMES);

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
                if (this.framesAlive !== 0 && !this.gpuFallbackWarned) {
                    this.logger.warn(`[FALLBACK] Agent ${this.geneId} running CPU perception fallback.`, { frame: this.simulation.frameCount });
                    this.gpuFallbackWarned = true;
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

        // Calculate age using real time instead of frame count for consistency when focus is lost
        this.age = (Date.now() - this.birthTime) / 1000; // Age in seconds
        this.framesAlive++; // Keep framesAlive for backward compatibility

        // Validation agents die naturally from energy depletion just like regular agents
        // No forced timeout needed - they will run their course and provide accurate fitness data

        // Smooth size growth effect for newly spawned agents (grow from 30% to 100% size over SIZE_GROWTH_FRAMES)

        // Calculate base size from energy (used for both spawn effect and normal sizing)
        const energyBasedSize = Math.max(MIN_AGENT_SIZE, BASE_SIZE + (this.energy / ENERGY_TO_SIZE_RATIO));

        // During spawn growth, scale from min to max of energy-based size
        if (spawnProgress < 1.0) {
            const scaleRange = SPAWN_GROWTH_MAX_SCALE - SPAWN_GROWTH_MIN_SCALE;
            this.targetSize = energyBasedSize * (SPAWN_GROWTH_MIN_SCALE + scaleRange * spawnProgress);
        } else {
            // After growth complete, use normal energy-based sizing
            this.targetSize = energyBasedSize;
        }

        // Interpolate actual size towards target size for smooth visual effect
        this.size += (this.targetSize - this.size) * SPAWN_SIZE_INTERPOLATION_SPEED;
        this.diameter = this.size * 2;
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
            // Mutate existing object instead of creating new one
            this.previousVelocities[i].vx = this.previousVelocities[i - 1].vx;
            this.previousVelocities[i].vy = this.previousVelocities[i - 1].vy;
            this.previousEnergies[i] = this.previousEnergies[i - 1];
            this.previousDanger[i] = this.previousDanger[i - 1];
            this.previousAggression[i] = this.previousAggression[i - 1];
            this.previousRayHits[i] = this.previousRayHits[i - 1];
        }
        // Store current frame as most recent memory
        this.previousVelocities[0].vx = this.vx;
        this.previousVelocities[0].vy = this.vy;
        this.previousEnergies[0] = this.energy;
        this.previousDanger[0] = this.dangerSmell;
        this.previousAggression[0] = this.attackSmell;
        this.previousRayHits[0] = this.rayHits;

        // Update event flags (decrement counters each frame)
        if (this.eventFlags.justAteFood > 0) this.eventFlags.justAteFood--;
        if (this.eventFlags.justHitObstacle > 0) this.eventFlags.justHitObstacle--;
        if (this.eventFlags.justReproduced > 0) this.eventFlags.justReproduced--;
        if (this.eventFlags.justAttacked > 0) this.eventFlags.justAttacked--;

        // Set low energy warning if energy drops below threshold
        if (this.energy < LOW_ENERGY_THRESHOLD) {
            this.eventFlags.lowEnergyWarning = 30; // Set flag for 30 frames
        } else if (this.eventFlags.lowEnergyWarning > 0) {
            this.eventFlags.lowEnergyWarning--; // Decrement if not in low energy
        }

        // Apply drag/dampening
        // Use stronger braking friction if agent is not applying thrust
        const friction = this.isBraking ? BRAKING_FRICTION : DAMPENING_FACTOR;
        this.vx *= friction;
        this.vy *= friction;

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

        // Boundary collision detection with visual effects
        let hitBoundary = false;
        if (this.x - this.size <= 0) {
            this.x = this.size;
            this.vx = Math.abs(this.vx); // Bounce right
            hitBoundary = true;
        } else if (this.x + this.size >= WORLD_WIDTH) {
            this.x = WORLD_WIDTH - this.size;
            this.vx = -Math.abs(this.vx); // Bounce left
            hitBoundary = true;
        }

        if (this.y - this.size <= 0) {
            this.y = this.size;
            this.vy = Math.abs(this.vy); // Bounce down
            hitBoundary = true;
        } else if (this.y + this.size >= WORLD_HEIGHT) {
            this.y = WORLD_HEIGHT - this.size;
            this.vy = -Math.abs(this.vy); // Bounce up
            hitBoundary = true;
        }

        // Apply damage and trigger visual effect for boundary collisions
        if (hitBoundary) {
            const damage = WALL_COLLISION_DAMAGE; // Less damage than obstacle collisions
            this.energy = Math.max(0, this.energy - damage);
            this.fitness -= damage;

            // Trigger collision visual effect (red glow)
            if (simulation && simulation.renderer) {
                simulation.renderer.addVisualEffect(this, 'collision');
            }
        }

        this.distanceTravelled += distance(this.lastX, this.lastY, this.x, this.y);

        // Track exploration - mark current grid cell as visited
        const gridX = Math.max(0, Math.min(EXPLORATION_GRID_WIDTH - 1, Math.floor(this.x / EXPLORATION_CELL_WIDTH)));
        const gridY = Math.max(0, Math.min(EXPLORATION_GRID_HEIGHT - 1, Math.floor(this.y / EXPLORATION_CELL_HEIGHT)));
        const cellKey = `${gridX},${gridY}`;
        this.exploredCells.add(cellKey);

        // --- ENERGY COSTS ---
        // 1. Passive metabolic cost (existence)
        let passiveLoss = PASSIVE_LOSS + (this.size * AGENT_SIZE_ENERGY_LOSS_MULTIPLIER);
        const sizeLoss = (this.size * AGENT_SIZE_ENERGY_LOSS_MULTIPLIER);

        // 2. Temperature Logic
        // Increase temp based on movement (FPS-normalized)
        const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        const speedRatio = Math.min(currentSpeed / MAX_VELOCITY, 1.0);
        const fpsNormalization = this.simulation && this.simulation.currentFps ?
            FPS_TARGET / Math.max(this.simulation.currentFps, 1) : 1.0;
        this.temperature += speedRatio * TEMPERATURE_GAIN_MOVE * fpsNormalization;

        // Passive temp loss (affected by season)
        let passiveLossRate = TEMPERATURE_LOSS_PASSIVE;

        // Environmental temperature effects on passive loss
        // Higher ambient temperature = harder to cool down (slower cooling)
        // Lower ambient temperature = easier to cool down (faster cooling)
        if (this.simulation && this.simulation.globalTemperatureModifier !== undefined) {
            // Environmental temperature affects cooling rate
            // Positive modifier (hotter environment) = slower cooling (retain heat)
            // Negative modifier (colder environment) = faster cooling (lose heat)
            const envTempEffect = 1.0 + (this.simulation.globalTemperatureModifier * 0.07); // ±7% per degree modifier (increased from 2% for more noticeable seasonal effects)
            passiveLossRate *= envTempEffect;
        }

        this.temperature -= passiveLossRate * fpsNormalization;

        // Clamp temperature
        this.temperature = Math.max(TEMPERATURE_MIN, Math.min(TEMPERATURE_MAX, this.temperature));

        // Track temperature for fitness calculation
        this.temperatureSum += this.temperature;
        this.temperatureSamples++;

        // Calculate passive loss multiplier based on temperature
        // 0 temp = max penalty, 100 temp = no penalty (1x)
        const tempFactor = 1.0 - (this.temperature / TEMPERATURE_MAX); // 1.0 at 0 temp, 0.0 at 100 temp
        let passiveMultiplier = 1.0 + (tempFactor * (TEMPERATURE_PASSIVE_LOSS_FACTOR - 1.0));

        // Resting agents conserve energy better (lower metabolic rate)
        if (this.isResting) {
            passiveMultiplier *= 0.5; // 50% less passive loss when resting
        }

        passiveLoss *= passiveMultiplier;

        // Calculate movement efficiency based on temperature
        let movementEfficiency = TEMPERATURE_EFFICIENCY_OPTIMAL;
        if (this.temperature < TEMPERATURE_COLD_STRESS_THRESHOLD) {
            // Severe cold stress
            movementEfficiency = TEMPERATURE_EFFICIENCY_COLD_SEVERE;
        } else if (this.temperature < TEMPERATURE_COLD_MODERATE_THRESHOLD) {
            // Moderate cold stress
            movementEfficiency = TEMPERATURE_EFFICIENCY_COLD_MODERATE;
        } else if (this.temperature > TEMPERATURE_HEAT_STRESS_THRESHOLD) {
            // Severe heat stress
            movementEfficiency = TEMPERATURE_EFFICIENCY_HEAT_SEVERE;
        } else if (this.temperature > TEMPERATURE_HEAT_MODERATE_THRESHOLD) {
            // Moderate heat stress
            movementEfficiency = TEMPERATURE_EFFICIENCY_HEAT_MODERATE;
        } else if (this.temperature >= TEMPERATURE_OPTIMAL_MIN && this.temperature <= TEMPERATURE_OPTIMAL_MAX) {
            // Optimal temperature range
            movementEfficiency = TEMPERATURE_EFFICIENCY_OPTIMAL;
        }

        const movementCostMultiplier = MOVEMENT_COST_MULTIPLIER;
        // Apply temperature efficiency to movement cost (lower efficiency = higher cost per unit of movement)
        const movementLoss = Math.min(currentSpeed * currentSpeed * movementCostMultiplier / movementEfficiency, 5);

        let energyLoss = sizeLoss + movementLoss;

        if (this.framesAlive > 1) {
            energyLoss += passiveLoss;
        }

        this.energy -= energyLoss;
        // Only count active energy expenditures (movement, sprinting) in energySpent
        // Exclude passive losses including temperature debuffs
        this.energySpent += movementLoss;

        // Sprint cost is now handled in thinkFromOutput() with intensity scaling
        // Removed duplicate sprint cost calculation here

        // Explicit cost for high rotation to break spinning optimum
        // Use rotationMagnitudeForCost which was stored in thinkFromOutput()
        const rotationCost = (this.rotationMagnitudeForCost || Math.abs(this.currentRotation || 0)) * ROTATION_COST_MULTIPLIER;
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

        // Variables for navigation tracking
        let prevAngle = 0;
        let currAngle = 0;
        let angleDiff = 0;
        let turnDirection = 0;

        // Only calculate if moving to avoid noise
        // OPTIMIZED: Use squared comparison to avoid Math.abs
        const prevSpeedSq = prevVx * prevVx + prevVy * prevVy;
        const currSpeedSq = currVx * currVx + currVy * currVy;
        const MIN_MOVEMENT_THRESHOLD_SQ = 0.0001; // 0.01^2 to avoid sqrt
        
        if (prevSpeedSq > MIN_MOVEMENT_THRESHOLD_SQ || currSpeedSq > MIN_MOVEMENT_THRESHOLD_SQ) {
            prevAngle = Math.atan2(prevVy, prevVx);
            currAngle = Math.atan2(currVy, currVx);
            angleDiff = Math.abs(currAngle - prevAngle);
            if (angleDiff > Math.PI) angleDiff = TWO_PI - angleDiff;

            // Only count significant direction changes (minimum threshold to prevent tiny movements)
            // This prevents tiny jittery movements from accumulating massive fitness
            if (angleDiff > MIN_ANGLE_CHANGE_FOR_FITNESS) {
                this.directionChanged += angleDiff * DIRECTION_CHANGE_FITNESS_FACTOR;
            }

            // Track speed changes to reward dynamic movement (not constant speed circles)
            const prevSpeed = Math.sqrt(prevSpeedSq);
            const currSpeed = Math.sqrt(currSpeedSq);
            const speedDiff = Math.abs(currSpeed - prevSpeed);
            // Increased threshold and reduced multiplier to prevent tiny speed changes from accumulating
            if (speedDiff > MIN_SPEED_CHANGE_FOR_FITNESS) {
                this.speedChanged += speedDiff * 1.0; // Reduced from 2.0 to 1.0
            }

            // Detect circular movement patterns (consecutive turns in same direction)
            turnDirection = Math.sign(angleDiff > 0.1 ? currAngle - prevAngle : 0);
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
            if (angleDiff > 0.2) { // Only count meaningful turns (about 11 degrees, reduced from 0.3)
                // Clever turn if responding to danger, opportunity, or visual information
                const hasRecentRayHits = this.previousRayHits.some(hits => hits > 0);
                const isStrategicTurn = this.dangerSmell > 0.5 || this.attackSmell > 0.5 || hasRecentRayHits;
                
                if (isStrategicTurn) {
                    // Double reward for strategic turns (turning towards food, away from obstacles, or evading danger)
                    this.cleverTurns += angleDiff * 2.0;
                } else {
                    // Regular reward for any significant turn
                    this.cleverTurns += angleDiff;
                }
            }
        }

        // === NAVIGATION BEHAVIOR TRACKING (NEW) ===
        // Track turning towards food and away from obstacles
        // OPTIMIZED: Require more significant turns to prevent tiny movements from accumulating
        if (this.lastRayData && this.lastRayData.length > 0 && Math.abs(angleDiff) > MIN_NAVIGATION_TURN_FOR_FITNESS) {
            // Find closest food and obstacle in ray data
            let closestFoodDist = Infinity;
            let closestFoodAngle = null;
            let closestObstacleDist = Infinity;
            let closestObstacleAngle = null;

            for (const ray of this.lastRayData) {
                if (ray.hit && ray.hitType === 'food' && ray.dist < closestFoodDist) {
                    closestFoodDist = ray.dist;
                    closestFoodAngle = ray.angle;
                }
                if (ray.hit && (ray.hitType === 'obstacle_or_edge' || ray.hitType === 'obstacle') && ray.dist < closestObstacleDist) {
                    closestObstacleDist = ray.dist;
                    closestObstacleAngle = ray.angle;
                }
            }

            // Track food approaches (getting closer to food)
            if (closestFoodDist < Infinity) {
                // Track improvement only if we have previous data
                // OPTIMIZED: Require minimum approach distance to prevent tiny movements from accumulating
                if (this.lastFoodDistance !== null && this.lastFoodDistance !== undefined && closestFoodDist < this.lastFoodDistance) {
                    const approachDistance = this.lastFoodDistance - closestFoodDist;
                    if (approachDistance > MIN_FOOD_APPROACH_DISTANCE) { // Only count significant approaches
                        this.foodApproaches += approachDistance * 0.1; // Reward proportional to approach speed
                    }
                }
                this.lastFoodDistance = closestFoodDist;

                // Check if agent is turning towards food
                if (closestFoodAngle !== null) {
                    // Calculate angle to food relative to agent's current facing angle
                    let angleToFood = closestFoodAngle - this.angle;
                    // Normalize angle difference
                    while (angleToFood > Math.PI) angleToFood -= TWO_PI;
                    while (angleToFood < -Math.PI) angleToFood += TWO_PI;

                    // Check if turn direction aligns with food direction
                    const foodDirection = Math.sign(angleToFood);

                    if (Math.abs(turnDirection - foodDirection) < 0.7 || (Math.abs(angleToFood) < 0.2)) {
                        // Agent is turning towards food or already facing it
                        // Increased tolerance (0.5->0.7) and reduced minimum angle (0.3->0.2) for more accurate tracking
                        this.turnsTowardsFood += Math.min(Math.abs(angleDiff), 0.5); // Cap reward per turn
                    }
                }
            } else {
                this.lastFoodDistance = null; // No food detected
            }

            // Track obstacle avoidance (turning away from obstacles)
            if (closestObstacleDist < Infinity) {
                if (closestObstacleDist < this.lastObstacleDistance) {
                    // Getting closer to obstacle - check if turning away
                    if (closestObstacleAngle !== null) {
                        // Calculate angle to obstacle relative to agent's current facing angle
                        let angleToObstacle = closestObstacleAngle - this.angle;
                        // Normalize angle difference
                        while (angleToObstacle > Math.PI) angleToObstacle -= TWO_PI;
                        while (angleToObstacle < -Math.PI) angleToObstacle += TWO_PI;

                        // Check if turn direction is away from obstacle
                        const obstacleDirection = Math.sign(angleToObstacle);

                        if (Math.abs(turnDirection + obstacleDirection) < 0.5 || (turnDirection === 0 && Math.abs(angleToObstacle) > 2.5)) {
                            // Agent is turning away from obstacle (opposite direction) or avoiding it
                            this.turnsAwayFromObstacles += Math.min(Math.abs(angleDiff), 0.5); // Cap reward per turn
                        }
                    }
                }
                this.lastObstacleDistance = closestObstacleDist;
            } else {
                this.lastObstacleDistance = null; // No obstacle detected
            }
        }

        // Update target size based on current energy (for normal size changes)
        // Only update if spawn growth is complete (to avoid conflicts)

        if (spawnProgress >= 1.0) {
            const energyBasedSize = Math.max(MIN_AGENT_SIZE, BASE_SIZE + (this.energy / ENERGY_TO_SIZE_RATIO));
            this.targetSize = energyBasedSize;

            // Interpolate actual size towards target size for smooth visual effect
            this.size += (this.targetSize - this.size) * SPAWN_SIZE_INTERPOLATION_SPEED;
            this.diameter = this.size * 2;
        }

        // --- ASEXUAL REPRODUCTION (SPLITTING) ---
        if (this.energy > this.maxEnergy * 0.8 && this.reproductionCooldown <= 0) {
            this.split();
        }

        if (this.energy <= 0) {
            this.isDead = true;
            // CRITICAL: Extract weights BEFORE cleanup so they're available for validation
            if (this.nn && !this._extractedWeights) {
                try {
                    this._extractedWeights = this.nn.getWeights();
                } catch (error) {
                    // If extraction fails, log but continue with cleanup
                    if (this.logger) {
                        this.logger.debug(`[AGENT] Could not extract weights before cleanup for agent ${this.id} (${this.geneId}): ${error.message}`);
                    }
                }
            }
            this.cleanup();
        }

        // --- EDGE BOUNCE WITH PHYSICS - ENHANCED PUSH AWAY ---
        let hitWall = false;
        const restitution = Math.min(BOUNCE_ENERGY_LOSS * 3, 0.99); // Triple the bounce (much more bouncy)
        const separationStrength = COLLISION_SEPARATION_STRENGTH * 2.0; // Stronger push away
        const minBounceSpeed = 0.5; // Minimum speed to ensure agents get pushed away

        if (this.x < 0) {
            // Left edge collision - normal points right (1, 0)
            const overlap = this.size - this.x; // How much we're overlapping the edge
            if (overlap > 0) {
                // Stronger position correction to push agent away
                this.x += overlap * separationStrength;

                // Always apply bounce for consistent push away behavior
                this.vx = Math.abs(this.vx) * restitution + minBounceSpeed; // Always push right
                if (this.vx < minBounceSpeed) this.vx = minBounceSpeed; // Ensure minimum push

                hitWall = true;
            }
        } else if (this.x > worldWidth) {
            // Right edge collision - normal points left (-1, 0)
            const overlap = this.x - (worldWidth - this.size);
            if (overlap > 0) {
                // Stronger position correction to push agent away
                this.x -= overlap * separationStrength;

                // Always apply bounce for consistent push away behavior
                this.vx = -Math.abs(this.vx) * restitution - minBounceSpeed; // Always push left
                if (this.vx > -minBounceSpeed) this.vx = -minBounceSpeed; // Ensure minimum push

                hitWall = true;
            }
        }

        if (this.y < 0) {
            // Top edge collision - normal points down (0, 1)
            const overlap = this.size - this.y;
            if (overlap > 0) {
                // Stronger position correction to push agent away
                this.y += overlap * separationStrength;

                // Always apply bounce for consistent push away behavior
                this.vy = Math.abs(this.vy) * restitution + minBounceSpeed; // Always push down
                if (this.vy < minBounceSpeed) this.vy = minBounceSpeed; // Ensure minimum push

                hitWall = true;
            }
        } else if (this.y > worldHeight) {
            // Bottom edge collision - normal points up (0, -1)
            const overlap = this.y - (worldHeight - this.size);
            if (overlap > 0) {
                // Stronger position correction to push agent away
                this.y -= overlap * separationStrength;

                // Always apply bounce for consistent push away behavior
                this.vy = -Math.abs(this.vy) * restitution - minBounceSpeed; // Always push up
                if (this.vy > -minBounceSpeed) this.vy = -minBounceSpeed; // Ensure minimum push

                hitWall = true;
            }
        }

        if (hitWall) {
            const energyLost = OBSTACLE_COLLISION_PENALTY / 4;  // Reduced from /2 to /4 for more forgiving wall hits
            this.energy -= energyLost;
            this.collisions++;

            // Add visual effect for wall collisions
            if (simulation.renderer) {
                simulation.renderer.addVisualEffect(this, 'collision', simulation.gameSpeed);
            }

            // Wall collision logging disabled for performance
        }

        // Obstacle Collision with bounce physics (fallback to agent-level collision)
        const agentSize = this.size;
        for (let i = 0; i < obstacles.length; i++) {
            const obs = obstacles[i];
            const dx = this.x - obs.x;
            const dy = this.y - obs.y;
            const distSq = dx * dx + dy * dy;
            const combinedRadius = agentSize + obs.radius;
            const combinedRadiusSq = combinedRadius * combinedRadius;

            if (distSq < combinedRadiusSq) {
                const dist = Math.sqrt(distSq) || 1;
                const overlap = combinedRadius - dist;

                // Enhanced position correction for stronger push away
                const separationStrength = COLLISION_SEPARATION_STRENGTH * 1.5; // Stronger push for obstacles
                const pushX = (dx / dist) * overlap * separationStrength;
                const pushY = (dy / dist) * overlap * separationStrength;
                this.x += pushX;
                this.y += pushY;

                // Enhanced velocity bounce with minimum push away speed
                const nx = dx / dist;
                const ny = dy / dist;
                const dot = this.vx * nx + this.vy * ny;
                const bounceFactor = Math.min(BOUNCE_ENERGY_LOSS * 3, 0.99); // Triple the bounce for obstacles too
                const minBounceSpeed = 0.3; // Minimum speed to ensure push away

                // Always apply bounce for consistent push away behavior, but scale by approach direction
                const bounceScale = dot < 0 ? 1.0 : 0.5; // Full bounce if moving towards, half if moving away
                this.vx = (this.vx - 2 * dot * nx) * bounceFactor * bounceScale;
                this.vy = (this.vy - 2 * dot * ny) * bounceFactor * bounceScale;

                // Ensure minimum push away speed in the correct direction
                const pushSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                if (pushSpeed < minBounceSpeed) {
                    this.vx += nx * minBounceSpeed * 0.5; // Add minimum push in normal direction
                    this.vy += ny * minBounceSpeed * 0.5;
                }

                // Nudge obstacle slightly (same as physics.js)
                const nudgeStrength = COLLISION_NUDGE_STRENGTH;
                obs.vx -= nx * nudgeStrength;
                obs.vy -= ny * nudgeStrength;

                // Cap obstacle speed
                const obstacleSpeed = Math.sqrt(obs.vx * obs.vx + obs.vy * obs.vy);
                const maxObstacleSpeed = OBSTACLE_MAX_SPEED;
                if (obstacleSpeed > maxObstacleSpeed) {
                    obs.vx = (obs.vx / obstacleSpeed) * maxObstacleSpeed;
                    obs.vy = (obs.vy / obstacleSpeed) * maxObstacleSpeed;
                }

                this.energy -= OBSTACLE_COLLISION_PENALTY;
                this.collisions++;
                this.timesHitObstacle++;
                this.eventFlags.justHitObstacle = 30; // Set flag for 30 frames (~0.5 seconds)

                // Add visual effect
                if (simulation.renderer) {
                    simulation.renderer.addVisualEffect(this, 'collision', simulation.gameSpeed);
                }

                // Obstacle collision logging disabled for performance
                break; // Only handle first collision
            }
        }

        this.emitPheromones();
        // PERFORMANCE: Calculate fitness every 10 frames instead of every frame
        // Fitness is still calculated on death (see cleanup method) and periodically for UI
        if (this.framesAlive % 10 === 0) {
            this.calculateFitness();
        }
    }

    perceiveWorld(quadtree, obstacles, worldWidth, worldHeight) {
        // Reset ray hits counter at start of each frame
        this.rayHits = 0;

        // Reuse pre-allocated arrays
        this.inputs.length = 0;
        this.rayData.length = 0; // Clear rayData to prevent accumulation
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

            if (t1 > RAY_DISTANCE_THRESHOLD) return t1; // First intersection point in front of ray origin
            if (t2 > RAY_DISTANCE_THRESHOLD) return t2; // Second intersection point in front of ray origin (if t1 was behind)
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

            // OPTIMIZED: Query quadtree for nearby obstacles instead of checking all 500
            // Calculate ray bounding box for spatial query
            const rayEndX = this.x + rayDirX * maxRayDist;
            const rayEndY = this.y + rayDirY * maxRayDist;
            const rayBoundsMinX = Math.min(this.x, rayEndX);
            const rayBoundsMaxX = Math.max(this.x, rayEndX);
            const rayBoundsMinY = Math.min(this.y, rayEndY);
            const rayBoundsMaxY = Math.max(this.y, rayEndY);
            const rayBoundsCenterX = (rayBoundsMinX + rayBoundsMaxX) / 2;
            const rayBoundsCenterY = (rayBoundsMinY + rayBoundsMaxY) / 2;
            const rayBoundsHalfWidth = (rayBoundsMaxX - rayBoundsMinX) / 2 + 50; // +50 for safety margin
            const rayBoundsHalfHeight = (rayBoundsMaxY - rayBoundsMinY) / 2 + 50;

            // Reuse pre-allocated Rectangle for ray bounds query
            const rayBounds = rectanglePool.acquire(rayBoundsCenterX, rayBoundsCenterY, rayBoundsHalfWidth, rayBoundsHalfHeight);
            const nearbyPoints = quadtree.query(rayBounds);

            // Check only nearby obstacles
            for (const point of nearbyPoints) {
                const entity = point.data;
                // Check if this is an obstacle (obstacles don't have isFood or Agent properties)
                if (entity && !entity.isFood && !(entity instanceof Agent) && entity.radius !== undefined) {
                    const obs = entity;
                    const dist = rayCircleIntersect(this.x, this.y, rayDirX, rayDirY, obs.x, obs.y, obs.radius);
                    if (dist !== null && dist > 0 && dist < closestDist) {
                        closestDist = dist;
                        hitType = 4; // Obstacle
                        hitEntity = obs;
                    }
                }
            }

            // PERFORMANCE: Release rectangle and array back to pools
            rectanglePool.release(rayBounds);
            queryArrayPool.release(nearbyPoints);

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

            // PERFORMANCE: Use pooled array instead of allocating new one
            const hitTypeArray = hitTypeArrayPool.acquire();
            let hitTypeName = 'none';
            const isHit = closestDist < maxRayDist;

            if (isHit) {
                this.rayHits++;
                if (hitType === 1) {
                    hitTypeArray[0] = 1; hitTypeArray[1] = 0; hitTypeArray[2] = 0; hitTypeArray[3] = 0; hitTypeName = 'food';
                } else if (hitType === 2) {
                    hitTypeArray[0] = 0; hitTypeArray[1] = 1; hitTypeArray[2] = 0; hitTypeArray[3] = 0; hitTypeName = 'smaller';
                } else if (hitType === 3) {
                    hitTypeArray[0] = 0; hitTypeArray[1] = 0; hitTypeArray[2] = 1; hitTypeArray[3] = 0; hitTypeName = 'larger';
                } else if (hitType === 6) {
                    hitTypeArray[0] = 0; hitTypeArray[1] = 1; hitTypeArray[2] = 1; hitTypeArray[3] = 0; hitTypeName = 'same_size_agent';
                } else if (hitType === 4 || hitType === 5) {
                    hitTypeArray[0] = 0; hitTypeArray[1] = 0; hitTypeArray[2] = 0; hitTypeArray[3] = 1; hitTypeName = 'obstacle_or_edge';
                }
            }
            inputs.push(...hitTypeArray);

            // PERFORMANCE: Return array to pool
            hitTypeArrayPool.release(hitTypeArray);

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

            // PERFORMANCE: Release entity query array back to pool
            queryArrayPool.release(nearbyEntities);
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

            // OPTIMIZED: Query quadtree for nearby obstacles instead of checking all 500
            const rayEndX = this.x + rayDirX * maxRayDist;
            const rayEndY = this.y + rayDirY * maxRayDist;
            const rayBoundsMinX = Math.min(this.x, rayEndX);
            const rayBoundsMaxX = Math.max(this.x, rayEndX);
            const rayBoundsMinY = Math.min(this.y, rayEndY);
            const rayBoundsMaxY = Math.max(this.y, rayEndY);
            const rayBoundsCenterX = (rayBoundsMinX + rayBoundsMaxX) / 2;
            const rayBoundsCenterY = (rayBoundsMinY + rayBoundsMaxY) / 2;
            const rayBoundsHalfWidth = (rayBoundsMaxX - rayBoundsMinX) / 2 + 50;
            const rayBoundsHalfHeight = (rayBoundsMaxY - rayBoundsMinY) / 2 + 50;

            const rayBounds = rectanglePool.acquire(rayBoundsCenterX, rayBoundsCenterY, rayBoundsHalfWidth, rayBoundsHalfHeight);
            const nearbyPoints = quadtree.query(rayBounds);

            // Check only nearby obstacles
            for (const point of nearbyPoints) {
                const entity = point.data;
                if (entity && !entity.isFood && !(entity instanceof Agent) && entity.radius !== undefined) {
                    const obs = entity;
                    const dist = rayCircleIntersect(this.x, this.y, rayDirX, rayDirY, obs.x, obs.y, obs.radius);
                    if (dist !== null && dist > 0 && dist < closestDist) {
                        closestDist = dist;
                    }
                }
            }

            // PERFORMANCE: Release rectangle and array back to pools
            rectanglePool.release(rayBounds);
            queryArrayPool.release(nearbyPoints);

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

            // PERFORMANCE: Release entity query array back to pool
            queryArrayPool.release(nearbyEntities);
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

        // PERFORMANCE: Release pheromone query array back to pool
        queryArrayPool.release(nearbyPuffs);

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
        // Enhanced temperature inputs (4 inputs instead of 1)
        inputs.push(this.temperature / TEMPERATURE_MAX); // Current temperature (0-1)
        // Distance from optimal range (0-1, where 0 = optimal, 1 = max distance)
        const optimalCenter = (TEMPERATURE_OPTIMAL_MIN + TEMPERATURE_OPTIMAL_MAX) / 2;
        const distanceFromOptimal = Math.abs(this.temperature - optimalCenter);
        inputs.push(Math.min(distanceFromOptimal / (TEMPERATURE_MAX / 2), 1.0)); // Distance from optimal (0-1)
        // Cold stress indicator (0-1, where 1 = severe cold stress)
        const coldStress = this.temperature < TEMPERATURE_COLD_STRESS_THRESHOLD ? 
            1.0 : 
            (this.temperature < TEMPERATURE_COLD_MODERATE_THRESHOLD ? 
                (TEMPERATURE_COLD_MODERATE_THRESHOLD - this.temperature) / (TEMPERATURE_COLD_MODERATE_THRESHOLD - TEMPERATURE_COLD_STRESS_THRESHOLD) : 
                0.0);
        inputs.push(Math.min(coldStress, 1.0)); // Cold stress (0-1)
        // Heat stress indicator (0-1, where 1 = severe heat stress)
        const heatStress = this.temperature > TEMPERATURE_HEAT_STRESS_THRESHOLD ? 
            1.0 : 
            (this.temperature > TEMPERATURE_HEAT_MODERATE_THRESHOLD ? 
                (this.temperature - TEMPERATURE_HEAT_MODERATE_THRESHOLD) / (TEMPERATURE_HEAT_STRESS_THRESHOLD - TEMPERATURE_HEAT_MODERATE_THRESHOLD) : 
                0.0);
        inputs.push(Math.min(heatStress, 1.0)); // Heat stress (0-1)
        
        inputs.push(this.simulation && this.simulation.seasonPhase !== undefined ? this.simulation.seasonPhase : 0.0); // Season phase (0-1)

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

        // Lifetime experience metrics (career achievements accessible to NN)
        inputs.push(Math.min(this.foodEaten / 10, 1)); // Career nutrition score (0-1 scale)
        inputs.push(Math.min(this.timesHitObstacle / 5, 1)); // Safety record (0-1 scale)
        inputs.push(Math.min(this.offspring / 3, 1)); // Reproductive success (0-1 scale)

        // Recent event flags (binary indicators for recent experiences)
        inputs.push(this.eventFlags.justAteFood > 0 ? 1 : 0); // Recently ate food
        inputs.push(this.eventFlags.justHitObstacle > 0 ? 1 : 0); // Recently hit obstacle
        inputs.push(this.eventFlags.justReproduced > 0 ? 1 : 0); // Recently reproduced
        inputs.push(this.eventFlags.justAttacked > 0 ? 1 : 0); // Recently attacked
        inputs.push(this.eventFlags.lowEnergyWarning > 0 ? 1 : 0); // Currently in low energy

        // Optional: Movement state inputs (enhances learning of movement control)
        // OPTIMIZED: Cache geneticMaxThrust calculation and use cached inverse
        const geneticMaxThrust = MAX_THRUST * this.speedFactor;
        const invGeneticMaxThrust = 1 / Math.max(geneticMaxThrust, 0.001);
        const invMaxRotation = 1 / MAX_ROTATION;
        
        // Current thrust level (0-1, normalized by max thrust)
        inputs.push(Math.abs(this.currentThrust) * invGeneticMaxThrust);
        
        // Current rotation rate (-1 to 1, normalized by max rotation)
        inputs.push((this.previousRotation || 0) * invMaxRotation);
        
        // Thrust change (delta from previous frame)
        const thrustChange = this.currentThrust - (this.previousThrust || 0);
        inputs.push(thrustChange * invGeneticMaxThrust);
        
        // Rotation change (delta from previous frame)
        // Approximation: use current rotation rate as indicator of change
        const rotationChange = this.previousRotation || 0;
        inputs.push(rotationChange * invMaxRotation);

        this.lastRayData = rayData;

        // DEBUG: Minimal ray tracing confirmation (only when rays are actually hitting things)
        if (this.simulation.agents && this.simulation.agents[0] === this && this.rayHits > 0 && this.framesAlive % 1200 === 0) {
            this.logger.debug(`[DEBUG] Agent ${this.id} (${this.geneId}) - Ray tracing active: ${this.rayHits}/${this.numSensorRays + this.numAlignmentRays} rays hitting objects`);
        }

        return { inputs, rayData, nearbyAgents: null }; // nearbyAgents not fully populated here, but that's ok for now.
    }

    emitPheromones() {
        // Analyze visual inputs for threats (predators) and targets (prey)
        let predatorProximity = 0;
        let preyProximity = 0;
        let offspringProximity = 0;
        let packProximity = 0; // For cooperative hunting

        if (this.lastRayData) {
            for (const ray of this.lastRayData) {
                if (ray.hit) {
                    const intensity = 1.0 - (ray.dist / this.maxRayDist);
                    // 'larger' hit type means "I am smaller", so the other agent is a PREDATOR
                    if (ray.hitTypeName === 'larger') {
                        predatorProximity = Math.max(predatorProximity, intensity);
                    }
                    // 'smaller' hit type means "I am larger", so the other agent is PREY
                    else if (ray.hitTypeName === 'smaller') {
                        preyProximity = Math.max(preyProximity, intensity);
                    }
                    // COOPERATIVE HUNTING: Detect other predators for pack behavior
                    else if (ray.hitTypeName === 'larger' || ray.hitTypeName === 'same') {
                        // Check if it's another predator (rough approximation - same size often means same type)
                        if (ray.hitTypeName === 'same') {
                            packProximity = Math.max(packProximity, intensity * 0.5); // Weaker pack signal for same size
                        }
                    }
                }
            }
        }

        // Update fear and aggression based on pheromone smells, internal state, AND visual threats
        // Fear increases if: smelling danger, low energy, OR seeing a predator
        this.fear = Math.min(this.dangerSmell + (this.isLowEnergy() ? 0.6 : 0) + predatorProximity, 1);

        // Aggression increases if: smelling attack, wanting to attack, low energy (hunger), OR seeing prey
        let baseAggression = this.attackSmell + (this.wantsToAttack ? 0.6 : 0) + (this.energy < LOW_ENERGY_THRESHOLD ? 0.4 : 0) + preyProximity;

        // DEFENDER TERRITORIAL BONUS: Increased aggression when intruders detected in territory
        if (this.specializationType === 'defender') {
            const distFromTerritory = Math.sqrt((this.x - this.territoryCenterX) ** 2 + (this.y - this.territoryCenterY) ** 2);
            this.isInTerritory = distFromTerritory < this.territoryRadius;

            // Extra aggression when in territory and seeing prey (intruders)
            if (this.isInTerritory && preyProximity > 0) {
                baseAggression += 0.3; // +30% aggression for territorial defense
            }

            // Reduced fear when defending territory (brave defenders)
            this.fear *= 0.7; // 30% less fear for defenders in their territory
        }

        // SCOUT MIGRATION BEHAVIOR: Increased exploration drive during seasonal changes
        if (this.specializationType === 'scout' && this.simulation && this.simulation.seasonTimer !== undefined) {
            const phase = (this.simulation.seasonTimer % SEASON_LENGTH) / SEASON_LENGTH;
            // Scouts are more exploratory during seasonal transitions (spring and fall)
            if ((phase >= 0.2 && phase <= 0.3) || (phase >= 0.7 && phase <= 0.8)) {
                baseAggression += 0.2; // More aggressive exploration during migration seasons
            }
        }

        // PREDATOR COOPERATIVE HUNTING: Increased aggression when pack members nearby
        if (this.specializationType === 'predator' && packProximity > 0) {
            baseAggression += packProximity * 0.3; // Up to +30% aggression when hunting in packs
            this.fear *= 0.9; // 10% less fear when hunting with pack (safety in numbers)
        }

        // PARENTING BEHAVIOR: Reduced aggression and increased protectiveness around offspring
        if (offspringProximity > 0) {
            baseAggression *= 0.7; // 30% less aggression around offspring (protective, not hunting)
            this.fear *= 0.8; // 20% less fear when offspring nearby (braver to protect young)
        }

        this.aggression = Math.min(baseAggression, 1);


        // Reduced spawn rates to prevent pheromone accumulation
        if (this.fear > 0.5 && Math.random() < 0.1) { // Reduced from 0.3 to 0.1
            spawnPheromone(this.simulation, this.x, this.y, 'danger');
        }
        if (this.aggression > 0.5 && Math.random() < 0.1) { // Reduced from 0.3 to 0.1
            spawnPheromone(this.simulation, this.x, this.y, 'attack');
        }
        // NEW: Add reproduction pheromone when wantsToReproduce
        if (this.wantsToReproduce && Math.random() < 0.05) { // Reduced from 0.2 to 0.05
            spawnPheromone(this.simulation, this.x, this.y, 'reproduction');
        }
    }

    tryMate(mate) {
        // FRAME-BASED maturation check (independent of game speed)
        const MATURATION_AGE_FRAMES = 600; // REDUCED to 10 seconds at 60 FPS (was 15s/900 frames)
        if (this.framesAlive < MATURATION_AGE_FRAMES || mate.framesAlive < MATURATION_AGE_FRAMES) return false;
        if (this.specializationType !== mate.specializationType) return false;

        if (this.isPregnant || this.reproductionCooldown > 0 || this.energy < MIN_ENERGY_TO_REPRODUCE ||
            mate.isPregnant || mate.reproductionCooldown > 0 || mate.energy < MIN_ENERGY_TO_REPRODUCE) {
            return false;
        }

        // CRITICAL: Only mate with same specialization type
        // Different specializations have different neural network dimensions
        if (this.specializationType !== mate.specializationType) {
            return false;
        }

        const mateScore = mate.speedFactor * (mate.energy / MAX_ENERGY);
        const selfScore = this.speedFactor * (this.energy / MAX_ENERGY);

        if (mateScore < selfScore * 0.5) return false;

        this.isPregnant = true;
        this.pregnancyTimer = 0;
        this.reproductionCooldown = REPRODUCTION_COOLDOWN_FRAMES;
        this.energy -= REPRODUCE_COST_BASE;
        this.energySpent += REPRODUCE_COST_BASE;
        this.fatherWeights = mate.getWeights();

        // Update genealogy: track parent-child relationships for kin recognition
        this.genealogy.parent2Id = mate.genealogy.id;

        // CRITICAL: Cap offspring tracking to prevent unbounded growth
        // This prevents memory leaks from genealogy arrays growing indefinitely
        if (mate.genealogy.offspring.length >= 100) {
            mate.genealogy.offspring.shift(); // Remove oldest offspring
        }
        mate.genealogy.offspring.push(this.genealogy.id);

        mate.reproductionCooldown = REPRODUCTION_COOLDOWN_FRAMES;
        mate.energy -= REPRODUCE_COST_BASE * 0.5;
        mate.energySpent += REPRODUCE_COST_BASE * 0.5;

        this.offspring++;
        this.childrenFromMate++;

        // Log successful mating
        this.logger.info(`[LIFECYCLE] 💕 Agent ${this.id} (${this.geneId}) mated with Agent ${mate.id} (${mate.geneId}) - Specialization: ${this.specializationType}, Energy spent: ${REPRODUCE_COST_BASE.toFixed(1)}`);

        return true;
    }

    split() {
        this.logger.info(`[LIFECYCLE] ✂️ Agent ${this.id} (${this.geneId}) is splitting due to high energy (${this.energy.toFixed(1)}).`);


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
        this.eventFlags.justReproduced = 60; // Set flag for 60 frames (~1 second) - longer for reproduction
        this.childrenFromSplit++;
        this.reproductionCooldown = REPRODUCTION_COOLDOWN_FRAMES * 1.5; // Longer cooldown after splitting

        return child;
    }

    birthChild() {
        const parentWeights = this.getWeights();
        const childWeights = crossover(parentWeights, this.fatherWeights, this.logger);

        // Log birth of child
        this.logger.info(`[LIFECYCLE] 👶 Agent ${this.id} (${this.geneId}) giving birth to child - Specialization: ${this.specializationType}, Energy spent: ${REPRODUCE_COST_BASE.toFixed(1)}`);


        // Specialization inheritance with mutation chance (5% chance to change)
        let childSpecialization = this.specializationType;
        if (Math.random() < 0.05) {
            const allTypes = Object.values(SPECIALIZATION_TYPES);
            childSpecialization = allTypes[Math.floor(Math.random() * allTypes.length)];
        }

        // CRITICAL: Only pass weights if child has same specialization as parent
        // Different specializations have different hiddenSize, so weights are incompatible
        const useParentWeights = childSpecialization === this.specializationType;

        const childGene = {
            weights: useParentWeights ? childWeights : null, // null = new random weights
            fatherWeights: null, // Father weights are used for creation, not inherited
            geneId: useParentWeights ? this.geneId : generateGeneId(Date.now()), // New gene ID for new specialization
            specializationType: childSpecialization,
            // CRITICAL: Don't inherit neural network structure if specialization changed
            // Each specialization has its own numSensorRays, hiddenSize, etc.
            numSensorRays: useParentWeights ? this.numSensorRays : undefined,
            numAlignmentRays: useParentWeights ? this.numAlignmentRays : undefined,
            hiddenSize: useParentWeights ? this.hiddenSize : undefined,
            maxRayDist: useParentWeights ? this.maxRayDist : undefined
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

        // Mutate neural network (only if using parent weights)
        if (useParentWeights) {
            child.nn.mutate(this.simulation.mutationRate);
        }

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
        // Safety: Ensure all tracking variables are numbers to prevent Infinity/NaN
        const safeNumber = (val, defaultVal = 0) => {
            if (typeof val !== 'number' || !isFinite(val)) return defaultVal;
            return val;
        };

        // Calculate exploration percentage
        const totalCells = EXPLORATION_GRID_WIDTH * EXPLORATION_GRID_HEIGHT;
        const exploredCellsSize = safeNumber(this.exploredCells?.size || 0, 0);
        const explorationPercentage = (exploredCellsSize / totalCells) * 100;

        let baseScore = 0;

        // Temperature-based fitness (symmetric bonus/penalty system)
        const avgTemperature = this.temperatureSamples > 0 ? this.temperatureSum / this.temperatureSamples : 0;
        let temperatureBonus = 0;
        let temperaturePenalty = 0;
        if (avgTemperature < 1) {
            // Penalty for inactive agents (symmetric to bonus)
            temperaturePenalty = (1 - avgTemperature) * 100; // Up to 100 points penalty
        } else {
            // Bonus for active agents
            temperatureBonus = (avgTemperature / TEMPERATURE_MAX) * 100; // Up to 100 points bonus
        }
        baseScore += temperatureBonus - temperaturePenalty;

        // 1. Productive Actions (Contribute to Base Score)
        // REBALANCED: Offspring increased from 100 to 150, kills reduced from 300 to 200
        baseScore += safeNumber(this.offspring || 0, 0) * 150; // Increased from 100
        baseScore += safeNumber(this.cleverTurns || 0, 0) * 50;
        
        // Movement rewards - NORMALIZED by distance traveled to prevent tiny movements from inflating fitness
        const distanceTravelled = safeNumber(this.distanceTravelled || 0, 0);
        const ageInSeconds = safeNumber(this.age || 0, 0);
        
        if (distanceTravelled > MIN_DISTANCE_FOR_MOVEMENT_REWARDS) {
            // Normalize movement metrics by distance traveled (per 100 units of distance)
            const distanceNormalizer = distanceTravelled / 100;
            
            // Direction changes: cap and normalize
            const directionChangedNormalized = Math.min(safeNumber(this.directionChanged || 0, 0), 500) / Math.max(distanceNormalizer, 1);
            baseScore += directionChangedNormalized * 1.0; // Reduced from 2.0 and normalized
            
            // Speed changes: cap and normalize
            const speedChangedNormalized = Math.min(safeNumber(this.speedChanged || 0, 0), 200) / Math.max(distanceNormalizer, 1);
            baseScore += speedChangedNormalized * 0.5; // Reduced from 1.0 and normalized
        } else {
            // Penalty for minimal movement (agents that barely move)
            const movementPenalty = (MIN_DISTANCE_FOR_MOVEMENT_REWARDS - distanceTravelled) / 10;
            baseScore -= Math.min(movementPenalty, 50); // Max 50 point penalty for minimal movement
        }
        
        baseScore += safeNumber(explorationPercentage, 0) * 100;
        baseScore += safeNumber(this.foodEaten || 0, 0) * 500;
        baseScore += safeNumber(this.kills || 0, 0) * 200; // Reduced from 300

        // Navigation behavior rewards - NORMALIZED by distance to prevent accumulation from tiny movements
        if (distanceTravelled > MIN_DISTANCE_FOR_MOVEMENT_REWARDS) {
            const distanceNormalizer = distanceTravelled / 100;
            
            // Normalize navigation rewards by distance
            const turnsTowardsFoodNormalized = safeNumber(this.turnsTowardsFood || 0, 0) / Math.max(distanceNormalizer, 1);
            baseScore += turnsTowardsFoodNormalized * 5; // Reduced from 10 and normalized
            
            const turnsAwayFromObstaclesNormalized = safeNumber(this.turnsAwayFromObstacles || 0, 0) / Math.max(distanceNormalizer, 1);
            baseScore += turnsAwayFromObstaclesNormalized * 5; // Reduced from 10 and normalized
            
            const foodApproachesNormalized = safeNumber(this.foodApproaches || 0, 0) / Math.max(distanceNormalizer, 1);
            baseScore += foodApproachesNormalized * 10; // Reduced from 25 and normalized
        }

        const offspring = safeNumber(this.offspring || 0, 0);
        const foodEaten = safeNumber(this.foodEaten || 0, 0);
        // Enhanced synergy bonus: reward agents that both reproduce and eat
        if (offspring > 0 && foodEaten > 0) {
            baseScore += (offspring * 2 + foodEaten) * 10; // Enhanced from (offspring * foodEaten) * 5
        }

        // 2. Efficiency and Exploration
        // REMOVED THRESHOLD: Always calculate efficiency, even for early deaths
        let efficiency = 0;
        const energySpent = safeNumber(this.energySpent || 0, 0);
        // Reuse distanceTravelled declared above
        if (energySpent > 0) {
            efficiency = Math.min(distanceTravelled / Math.max(energySpent, 1), 10.0);
        }
        baseScore += efficiency * 15;

        // 3. Penalize repetitive circular movement (lucky food finding)
        const consecutiveTurns = safeNumber(this.consecutiveTurns || 0, 0);
        // Cap consecutive turns to prevent extreme penalties (max 50 turns = 1000 penalty)
        const cappedTurns = Math.min(consecutiveTurns, 50);
        const circlePenalty = Math.min(cappedTurns * 20, 2000);
        baseScore -= circlePenalty;
        baseScore += safeNumber(this.successfulEscapes || 0, 0) * 75;

        // 3. Penalties (Applied to Base Score)
        const timesHitObstacle = safeNumber(this.timesHitObstacle || 0, 0);
        const collisions = safeNumber(this.collisions || 0, 0);
        baseScore -= timesHitObstacle * 30;
        baseScore -= (collisions - timesHitObstacle) * 10;

        // 4. Collision Avoidance Reward (NEW)
        // Use real-time age in seconds for fitness calculation (not affected by focus loss)
        // Reuse ageInSeconds declared above
        const ageInFrames = ageInSeconds * FPS_TARGET; // Convert to equivalent frames for compatibility

        // Reward agents that survive without hitting obstacles
        const obstacleFreeFrames = Math.max(0, ageInFrames - (timesHitObstacle * 30));
        if (obstacleFreeFrames > 200) {
            baseScore += (obstacleFreeFrames / 200) * 25;
        }

        // 6. Activity Requirement Penalty
        // Penalize agents that survive for extended periods with minimal activity
        let inactivityPenalty = 0;
        if (ageInSeconds > 20 && baseScore < 50) {
            // Agents surviving >20s with baseScore <50 get increasingly penalized
            const inactivityDuration = Math.max(0, ageInSeconds - 20);
            inactivityPenalty = inactivityDuration * 2; // 2 points per second of inactivity beyond 20s
        }

        // Apply inactivity penalty to base score
        let adjustedBaseScore = Math.max(0, baseScore - inactivityPenalty);

        // 7. REBALANCED SURVIVAL: Use separate bonus instead of multiplier to reduce dominance
        // Separate survival bonus (max 500 points) instead of 3x multiplier
        // This prevents passive survivalists from achieving high fitness
        const survivalBonus = Math.min(ageInSeconds * 10, 500); // 10 points per second, capped at 500
        // Add a small bonus for just surviving, rewarding wall-avoiders even if they don't eat.
        // Only applies after surviving longer than 30 seconds to avoid rewarding short-lived agents
        const rawSurvivalBonus = ageInSeconds > 30 ? (ageInSeconds - 30) / 10 : 0;

        // Final fitness = adjusted base score + survival bonuses (not multiplied)
        const finalFitnessValue = safeNumber(adjustedBaseScore + survivalBonus + rawSurvivalBonus, 0);
        this.fitness = Math.max(0, finalFitnessValue);

        // Agent qualification criteria for gene pool entry
        // Partial credit system: Allow 4/5 criteria if fitness is exceptional
        const turnsTowardsFood = safeNumber(this.turnsTowardsFood || 0, 0);
        const criteria = [
            this.fitness >= MIN_FITNESS_TO_SAVE_GENE_POOL,
            foodEaten >= MIN_FOOD_EATEN_TO_SAVE_GENE_POOL,
            ageInSeconds >= MIN_SECONDS_ALIVE_TO_SAVE_GENE_POOL,
            explorationPercentage >= MIN_EXPLORATION_PERCENTAGE_TO_SAVE_GENE_POOL,
            turnsTowardsFood >= MIN_TURNS_TOWARDS_FOOD_TO_SAVE_GENE_POOL
        ];
        const criteriaMet = criteria.filter(Boolean).length;
        
        // All 5 criteria must pass, OR 4/5 criteria with exceptional fitness (from constants)
        this.fit = criteriaMet >= 5 || (criteriaMet >= 4 && this.fitness > EXCEPTIONAL_FITNESS_THRESHOLD);
    }

    getTemperatureEfficiency() {
        // Temperature affects movement efficiency and behavior
        // Optimal temperature range: TEMPERATURE_OPTIMAL_MIN-TEMPERATURE_OPTIMAL_MAX degrees
        // Below TEMPERATURE_COLD_STRESS_THRESHOLD or above TEMPERATURE_HEAT_STRESS_THRESHOLD: severe penalties
        // TEMPERATURE_COLD_MODERATE_THRESHOLD-TEMPERATURE_HEAT_MODERATE_THRESHOLD: moderate penalties

        if (this.temperature < TEMPERATURE_COLD_STRESS_THRESHOLD) {
            // Extreme cold: hibernation-like state, very low activity
            return TEMPERATURE_EFFICIENCY_COLD_SEVERE;
        } else if (this.temperature < TEMPERATURE_COLD_MODERATE_THRESHOLD) {
            // Cold: reduced efficiency
            return TEMPERATURE_EFFICIENCY_COLD_MODERATE;
        } else if (this.temperature <= TEMPERATURE_OPTIMAL_MAX) {
            // Optimal range: full efficiency
            return TEMPERATURE_EFFICIENCY_OPTIMAL;
        } else if (this.temperature < TEMPERATURE_HEAT_STRESS_THRESHOLD) {
            // Moderate heat: slight reduction due to heat stress
            return TEMPERATURE_EFFICIENCY_HEAT_MODERATE;
        } else {
            // Extreme heat: severe reduction, seek cooling
            return TEMPERATURE_EFFICIENCY_HEAT_SEVERE;
        }
    }

    getRelatedness(otherAgent) {
        // Calculate genetic relatedness using genealogy
        // This is a simplified model - in reality this would be more complex
        if (!otherAgent || !otherAgent.genealogy || !this.genealogy) {
            return 0;
        }

        // Same agent
        if (this.genealogy.id === otherAgent.genealogy.id) {
            return KIN_RELATEDNESS_SELF;
        }

        // Direct parent-child relationship
        if (this.genealogy.parent1Id === otherAgent.genealogy.id ||
            this.genealogy.parent2Id === otherAgent.genealogy.id ||
            otherAgent.genealogy.parent1Id === this.genealogy.id ||
            otherAgent.genealogy.parent2Id === this.genealogy.id) {
            return KIN_RELATEDNESS_PARENT_CHILD;
        }

        // Sibling relationship (same parents)
        if ((this.genealogy.parent1Id === otherAgent.genealogy.parent1Id ||
            this.genealogy.parent1Id === otherAgent.genealogy.parent2Id) &&
            (this.genealogy.parent2Id === otherAgent.genealogy.parent1Id ||
                this.genealogy.parent2Id === otherAgent.genealogy.parent2Id)) {
            return KIN_RELATEDNESS_SIBLINGS;
        }

        // Grandparent/grandchild or aunt/uncle
        if (this.genealogy.parent1Id && otherAgent.genealogy.offspring.includes(this.genealogy.parent1Id) ||
            this.genealogy.parent2Id && otherAgent.genealogy.offspring.includes(this.genealogy.parent2Id) ||
            otherAgent.genealogy.parent1Id && this.genealogy.offspring.includes(otherAgent.genealogy.parent1Id) ||
            otherAgent.genealogy.parent2Id && this.genealogy.offspring.includes(otherAgent.genealogy.parent2Id)) {
            return KIN_RELATEDNESS_GRANDPARENT;
        }

        // Distant relatives or same generation (simplified)
        if (Math.abs(this.genealogy.generation - otherAgent.genealogy.generation) <= KIN_RELATEDNESS_MAX_GENERATION_DIFF) {
            return KIN_RELATEDNESS_DISTANT;
        }

        return 0; // Unrelated
    }

    cleanup() {
        // Prevent double cleanup
        if (this._cleanedUp) {
            return;
        }
        this._cleanedUp = true;
        
        // Clear GPU validation flag
        this._gpuWeightsValidated = false;

        // Log cleanup for debugging validation issues
        this.logger.debug(`[AGENT-CLEANUP] 🧹 Cleaning up agent ${this.id} (${this.geneId}) - Age: ${this.age.toFixed(1)}s, Fitness: ${this.fitness.toFixed(1)}, Fit: ${this.fit}, Energy: ${this.energy.toFixed(1)}, NN: ${this.nn ? 'present' : 'null'}`);

        // CRITICAL: Extract weights BEFORE cleanup for ALL agents (not just fit ones)
        // This ensures weights are available for validation even after cleanup
        // Validation may need to test non-fit agents, so we extract weights for all
        if (this.nn && !this._extractedWeights) {
            try {
                this._extractedWeights = this.nn.getWeights();
                this.logger.debug(`[AGENT-CLEANUP] Extracted weights for agent ${this.id} (${this.geneId}) before cleanup (fit: ${this.fit})`);
            } catch (error) {
                this.logger.debug(`[AGENT-CLEANUP] Could not extract weights for agent ${this.id} (${this.geneId}): ${error.message}`);
            }
        }

        // Reinitialize memory arrays to prevent undefined access errors
        // Don't just clear them - reinitialize with proper structure
        this.previousVelocities = Array(this.memoryFrames).fill(null).map(() => ({ vx: 0, vy: 0 }));
        this.previousEnergies = Array(this.memoryFrames).fill(this.energy);
        this.previousDanger = Array(this.memoryFrames).fill(0);
        this.previousAggression = Array(this.memoryFrames).fill(0);
        this.previousRayHits = Array(this.memoryFrames).fill(0);

        // Calculate final fitness before clearing exploration data
        this.calculateFitness();

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
            // Clear any other gene references that might hold memory
            this.gene.weights = null; // Weights are stored elsewhere if needed
        }
        this.fatherWeights = null;

        // CRITICAL: Clear genealogy references to break circular dependencies
        // Genealogy.offspring arrays hold references to child agents, creating circular refs
        if (this.genealogy) {
            this.genealogy.offspring = []; // Clear offspring array to break circular refs
            this.genealogy.parent1Id = null; // Clear parent references
            this.genealogy.parent2Id = null;
        }

        // DO NOT clear _extractedWeights - validation needs them after cleanup
        // The weights are a deep copy, so keeping them doesn't create memory leaks
        // They will be garbage collected when the agent is fully removed

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

        // CRITICAL: Break circular references to allow garbage collection
        // This is essential for preventing memory leaks during long runs
        this.simulation = null;
        this.logger = null;
        this.nn = null; // Neural network holds weight matrices in memory
    }
}

