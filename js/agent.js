import { NeuralNetwork } from './neural-network.js';
import {
    BASE_SIZE, ENERGY_TO_SIZE_RATIO, MAX_ENERGY, MIN_ENERGY_TO_REPRODUCE, MIN_AGENT_SIZE,
    REPRODUCE_COST_BASE, CHILD_STARTING_ENERGY,
    REPRODUCTION_COOLDOWN_FRAMES, PREGNANCY_DURATION_FRAMES,
    OBESITY_THRESHOLD_ENERGY, OBESITY_ENERGY_TAX_DIVISOR,
    MAX_THRUST, MAX_ROTATION, MAX_VELOCITY, SPRINT_BONUS_THRUST,
    SPRINT_COST_PER_FRAME, SPRINT_THRESHOLD, FEAR_SPRINT_BONUS,
    THRUST_DEADZONE, ACCELERATION_SMOOTHING, DECELERATION_RATE_NORMAL, DECELERATION_RATE_BRAKING, DECELERATION_RATE_EMERGENCY,
    ROTATION_MOMENTUM, ROTATION_EFFICIENCY_AT_MAX_SPEED,
    SPRINT_BONUS_MULTIPLIER, SPRINT_COST_INTENSITY_THRESHOLD,
    VELOCITY_MOMENTUM,
    OBSTACLE_COLLISION_PENALTY, OBSTACLE_HIDING_RADIUS, OBSTACLE_MAX_SPEED,
    PHEROMONE_RADIUS, PHEROMONE_DIAMETER, DAMPENING_FACTOR, BRAKING_FRICTION, ROTATION_COST_MULTIPLIER,
    PASSIVE_LOSS, MOVEMENT_COST_MULTIPLIER, LOW_ENERGY_THRESHOLD, DEATH_RISK_THRESHOLD, MODERATE_ENERGY_THRESHOLD, AGENT_SIZE_ENERGY_LOSS_MULTIPLIER,
    TEMPERATURE_MAX, TEMPERATURE_MIN, TEMPERATURE_START, TEMPERATURE_GAIN_MOVE, TEMPERATURE_LOSS_PASSIVE, TEMPERATURE_PASSIVE_LOSS_FACTOR,
    TEMPERATURE_OPTIMAL_MIN, TEMPERATURE_OPTIMAL_MAX, TEMPERATURE_COLD_STRESS_THRESHOLD, TEMPERATURE_HEAT_STRESS_THRESHOLD,
    TEMPERATURE_COLD_MODERATE_THRESHOLD, TEMPERATURE_HEAT_MODERATE_THRESHOLD, TEMPERATURE_EFFICIENCY_OPTIMAL,
    TEMPERATURE_EFFICIENCY_COLD_MODERATE, TEMPERATURE_EFFICIENCY_HEAT_MODERATE, TEMPERATURE_EFFICIENCY_COLD_SEVERE,
    TEMPERATURE_EFFICIENCY_HEAT_SEVERE, TEMPERATURE_REPRODUCTION_SUPPRESSION_EXTREME,
    SEASON_LENGTH,
    SPECIALIZATION_TYPES, INITIAL_AGENT_ENERGY, AGENT_CONFIGS, TWO_PI,
    DIRECTION_CHANGE_FITNESS_FACTOR,
    GENE_POOL_MIN_FITNESS, MIN_FOOD_EATEN_TO_SAVE_GENE_POOL, FPS_TARGET,
    MIN_EXPLORATION_PERCENTAGE_TO_SAVE_GENE_POOL, MIN_TURNS_TOWARDS_FOOD_TO_SAVE_GENE_POOL,
    MIN_SECONDS_ALIVE_TO_SAVE_GENE_POOL, EXCEPTIONAL_FITNESS_THRESHOLD,
    MIN_DISTANCE_FOR_MOVEMENT_REWARDS, MIN_ANGLE_CHANGE_FOR_FITNESS, MIN_SPEED_CHANGE_FOR_FITNESS,
    MIN_NAVIGATION_TURN_FOR_FITNESS, MIN_FOOD_APPROACH_DISTANCE,
    FITNESS_MULTIPLIERS, FITNESS_PENALTIES, SURVIVAL_BONUSES,
    SPAWN_GROWTH_DURATION_FRAMES, SPAWN_GROWTH_MIN_SCALE, SPAWN_GROWTH_MAX_SCALE, SPAWN_SIZE_INTERPOLATION_SPEED,
    EXPLORATION_CELL_WIDTH, EXPLORATION_CELL_HEIGHT, EXPLORATION_GRID_WIDTH, EXPLORATION_GRID_HEIGHT,
    WORLD_WIDTH, WORLD_HEIGHT,
    AGENT_MEMORY_FRAMES, BASE_MUTATION_RATE, AGENT_SPEED_FACTOR_BASE, AGENT_SPEED_FACTOR_VARIANCE,
    TARGET_ATTENTION_SPAN_FRAMES, GOALS,
    WALL_COLLISION_DAMAGE, EDGE_BOUNCE_DAMPING,
    BOUNCE_ENERGY_LOSS, COLLISION_SEPARATION_STRENGTH, COLLISION_NUDGE_STRENGTH,
    KIN_RELATEDNESS_SELF, KIN_RELATEDNESS_PARENT_CHILD, KIN_RELATEDNESS_SIBLINGS, KIN_RELATEDNESS_GRANDPARENT,
    KIN_RELATEDNESS_DISTANT, KIN_RELATEDNESS_MAX_GENERATION_DIFF,
    TERRITORY_RADIUS, RAY_DISTANCE_THRESHOLD, DIVISION_BY_ZERO_THRESHOLD,
    SHOUT_DURATION_FRAMES, SHOUT_BASE_RANGE, SHOUT_TYPES,
    SHOUT_PREDATOR_ALERT_CHANCE, SHOUT_PREDATOR_ALERT_THRESHOLD,
    SHOUT_FOOD_FOUND_CHANCE, SHOUT_HELP_REQUEST_CHANCE,
    INK_DURATION, INK_SIZE, INK_FADE_RATE, INK_BLINDNESS_THRESHOLD, INK_BLINDNESS_FACTOR,
    PREDATOR_ADRENALINE_SPEED_MULT, PREDATOR_ADRENALINE_RAY_MULT, PREDATOR_ADRENALINE_DECAY,
    SCOUT_ENERGY_COST_MULTIPLIER, SCOUT_FOOD_ALERT_CHANCE
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
        this.adrenaline = 0.0; // Predator adrenaline level (0-1)

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
        // Perception input breakdown (41 total):
        //   - 8 base state: hunger, fear, aggression, energy, age, speed, angle diff, shadow
        //   - 4 temperature: current temp, distance from optimal, cold stress, heat stress
        //   - 1 season phase
        //   - 8 memory: previous velocities (4), energy deltas (2), previous danger/aggression (2)
        //   - 3 lifetime metrics: food eaten, obstacles hit, offspring (all normalized to [0,1])
        //   - 5 event flags: just ate, hit obstacle, reproduced, attacked, low energy (binary)
        //   - 4 movement state: current thrust, current rotation, thrust change, rotation change
        //   - 5 target memory: distance, angle, time since seen, type, priority
        //   - 3 goal memory: current goal, goal priority, goal duration
        //
        // All inputs are normalized to [0,1] or [-1,1] ranges for consistent neural network training.
        // The first layer processes (perception + hiddenState) together, which is why hiddenState
        // is included in inputSize. This is the standard RNN architecture pattern.
        // Dynamic input sizing: Calculate based on actual input groups to prevent crashes from mismatches
        const PERCEPTION_INPUTS =
            (this.numSensorRays * 5) +     // Ray sensors
            (this.numAlignmentRays * 1) +  // Alignment rays
            9 +   // Base state (hunger, fear, aggression, energy, age, speed, angle sin, angle cos, in shadow)
            4 +   // Temperature
            1 +   // Season
            8 +   // Recent memory
            3 +   // Lifetime metrics
            5 +   // Event flags
            13 +  // Awareness metrics (Death risk, Food energy gain, Food urgency, Food proximity, Food availability, Collision damage, Collision risk, Predator threat, Attack damage, Vulnerability, Reproduction readiness, Reproduction benefit, Mate availability)
            4 +   // Movement state (Thrust/Rot + deltas)
            6 +   // Target memory (Dist, Sin, Cos, Time, Type, Prio)
            6 +   // Goal memory (Food, Mate, Danger, Rest, Prio, Duration)
            4;    // Shout inputs (predator alert, food found, help request, mate call)

        // CRITICAL: Do NOT add hiddenSize here - NeuralNetwork constructor adds it automatically
        // The RNN architecture stores weights for both perception AND recurrent hidden state in weights1
        this.inputSize = PERCEPTION_INPUTS;
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
        this.reproductionAttempts = 0; // Track reproduction attempts (even if unsuccessful)
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
            lowEnergyWarning: 0,  // Frames in low energy state
            lastFoodEnergyGain: 0,  // Energy gained from last food eaten (decays over time)
            lastCollisionDamage: 0,  // Energy lost from last collision (decays over time)
            lastAttackDamage: 0,     // Energy lost from last attack (decays over time)
            predatorThreat: 0,       // Current predator threat level (updated each frame)
            reproductionReadiness: 0, // Current reproduction readiness (updated each frame)
            mateAvailability: 0      // Current mate availability (updated each frame)
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

        // --- TARGET MEMORY (Performance-Optimized) ---
        // Pre-allocated to avoid GC pressure in hotpath
        this.targetMemory = {
            currentTarget: null, // {type: 'food'|'mate'|'location', x, y, id, priority}
            targetHistory: new Array(5), // Pre-allocated fixed-size array
            targetHistoryCount: 0, // Track actual count
            attentionSpan: TARGET_ATTENTION_SPAN_FRAMES, // Constant, no recalculation needed
            lastTargetSeen: 0 // Frame count, not Date.now() for performance
        };

        // --- GOAL MEMORY (Performance-Optimized) ---
        // Use numeric constants for fast comparisons
        this.goalMemory = {
            currentGoal: GOALS.FIND_FOOD, // Numeric constant, fast comparison
            goalPriority: 0.8,
            goalStartFrame: 0, // Frame count, not timestamp (will be set on first update)
            goalProgress: 0.0,
            recentGoals: [], // Pre-allocated as empty, will grow up to 20
            goalsCompleted: 0 // Track number of goals successfully completed
        };

        // Cache for expensive calculations (updated every 5 frames)
        this._cachedTargetDistance = null;
        this._cachedTargetAngle = null;
        this._lastTargetCacheUpdate = 0;

        // Cache for speed calculations (updated each frame in update())
        this._cachedSpeedSq = 0;
        this._cachedSpeed = 0;
        this._cachedInvSpeed = 0;
        this._cachedVelocityAngle = 0;
        this._lastSpeedCacheUpdate = 0;

        // --- VOICE/SHOUTING SYSTEM ---
        this.currentShout = null; // {type: string, intensity: number, frame: number}
        this.heardShouts = []; // Array of {type, distance, direction, intensity}

        // Log agent birth
        const mutationProcess = this.gene?.mutationProcess || 'unknown';
        this.logger.debug(`[LIFECYCLE] 🎉 Agent ${this.id} (${this.geneId}) born - Specialization: ${this.specializationType}, Energy: ${this.energy.toFixed(1)}, Parent: ${parent ? parent.id + ' (' + parent.geneId + ')' : 'none'}, Mutation: ${mutationProcess}`);
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

        // Apply "Leak" to memory. 
        // This mimics a biological decay of short-term memory, preventing saturation loops.
        // 0.9 means memory fades by 10% every frame if not reinforced.
        for (let i = 0; i < result.hiddenState.length; i++) {
            result.hiddenState[i] *= 0.9;
        }

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
        // Tanh outputs are already -1 to 1, so no mapping needed
        let rawThrust = output[0];
        const rotationOutput = output[1];
        const sprintIntensity = output[2]; // [0, 1] - continuous intensity, not binary
        this.wantsToReproduce = output[3] > 0.8;
        this.wantsToAttack = output[4] > 0.8;

        // Kin recognition: Reduce attack willingness toward close relatives
        // This will be checked during collision resolution

        // --- MOVEMENT CALCULATIONS ---
        // 1. Calculate target thrust (allow negative for reverse)
        // Remove the deadzone logic to allow fine motor control
        let geneticMaxThrust = MAX_THRUST * this.speedFactor;

        // 2. Allow "Turbo" control - scale the thrust cap based on sprint intensity
        // Instead of hardcoded sprint thresholds, let the output scale the thrust cap
        if (sprintIntensity > 0.5) {
            geneticMaxThrust *= (1.0 + (sprintIntensity * SPRINT_BONUS_MULTIPLIER));
            this.energy -= SPRINT_COST_PER_FRAME * sprintIntensity;
            this.energySpent += SPRINT_COST_PER_FRAME * sprintIntensity;
            this.isSprinting = true;
        } else {
            this.isSprinting = false;
        }

        this.targetThrust = rawThrust * geneticMaxThrust;

        // Re-enable braking logic: if thrust is less than 10% of max, engage brakes
        // This is required by the update method to apply BRAKING_FRICTION instead of DAMPENING_FACTOR
        this.isBraking = Math.abs(this.targetThrust) < (geneticMaxThrust * 0.1);

        // 3. Calculate current speed (needed for rotation efficiency calculation)
        // OPTIMIZED: Reuse cached speed if available, otherwise calculate
        let currentSpeed;
        if (this._lastSpeedCacheUpdate === this.framesAlive && this._cachedSpeed > 0) {
            currentSpeed = this._cachedSpeed;
        } else {
            const speedSq = this.vx * this.vx + this.vy * this.vy;
            currentSpeed = speedSq > 0 ? Math.sqrt(speedSq) : 0;
        }

        // 4. DIRECT CONTROL: Remove the automatic braking logic block
        // Instead, simply interpolate current thrust towards output
        this.currentThrust += (this.targetThrust - this.currentThrust) * ACCELERATION_SMOOTHING;

        // Clamp to max thrust
        if (this.currentThrust > geneticMaxThrust) {
            this.currentThrust = geneticMaxThrust;
        } else if (this.currentThrust < -geneticMaxThrust) {
            this.currentThrust = -geneticMaxThrust;
        }

        // 5. Apply temperature and energy modifiers
        const tempEfficiency = this.getTemperatureEfficiency();
        let desiredThrust = this.currentThrust * tempEfficiency;

        // Energy conservation (resting)
        // Allow full speed when food is nearby and energy is critical (to reach food before death)
        const hasNearbyFood = this.targetMemory && this.targetMemory.currentTarget &&
            this.targetMemory.currentTarget.type === 'food' &&
            this.targetMemory.lastTargetSeen > 0 &&
            (this.framesAlive - this.targetMemory.lastTargetSeen) < this.targetMemory.attentionSpan;

        if (this.energy < LOW_ENERGY_THRESHOLD * 0.5) { // Below 50 energy
            if (hasNearbyFood && this.energy < DEATH_RISK_THRESHOLD) {
                // Critical energy + food nearby: allow full speed to reach food
                this.isResting = false;
            } else {
                // No nearby food: conserve energy by reducing movement
                desiredThrust *= 0.3; // Reduce movement to 30% when exhausted
                this.isResting = true;
            }
        } else {
            this.isResting = false;
        }

        // Temperature affects reproduction willingness
        if (this.temperature < TEMPERATURE_COLD_STRESS_THRESHOLD || this.temperature > TEMPERATURE_HEAT_STRESS_THRESHOLD) {
            // Extreme temperatures reduce mating drive
            this.wantsToReproduce = this.wantsToReproduce && (Math.random() < TEMPERATURE_REPRODUCTION_SUPPRESSION_EXTREME);
        }

        // 5. Apply temperature and energy modifiers (sprint already applied to geneticMaxThrust above)

        // 7. Fear sprint bonus (only if moving, works in any direction)
        if (this.fear > this.aggression * 0.5 && desiredThrust !== 0) {
            desiredThrust += FEAR_SPRINT_BONUS * MAX_THRUST * Math.sign(desiredThrust);
            if (this.dangerSmell > 0.5) this.successfulEscapes++;
        }

        // PREDATOR ADRENALINE: Speed boost when hunting
        if (this.specializationType === SPECIALIZATION_TYPES.PREDATOR && this.adrenaline > 0) {
            desiredThrust *= (1.0 + (this.adrenaline * (PREDATOR_ADRENALINE_SPEED_MULT - 1.0)));
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

        // Check for threats and emit shouts if needed
        this.checkForThreatsAndShout();

        // Calculate age using real time instead of frame count for consistency when focus is lost
        this.age = (Date.now() - this.birthTime) / 1000; // Age in seconds
        this.framesAlive++; // Keep framesAlive for backward compatibility

        // Validation agents die naturally from energy depletion just like regular agents
        // No forced timeout needed - they will run their course and provide accurate fitness data

        // Smooth size growth effect for newly spawned agents (grow from 30% to 100% size over SIZE_GROWTH_FRAMES)

        // OPTIMIZED: Calculate base size from energy once and reuse throughout method
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

        // Decay food energy gain memory (similar to other event flags)
        if (this.eventFlags.lastFoodEnergyGain > 0) {
            this.eventFlags.lastFoodEnergyGain *= 0.95; // Decay by 5% per frame
            if (this.eventFlags.lastFoodEnergyGain < 0.1) {
                this.eventFlags.lastFoodEnergyGain = 0; // Clear when too small
            }
        }

        // Decay collision damage memory
        if (this.eventFlags.lastCollisionDamage > 0) {
            this.eventFlags.lastCollisionDamage *= 0.95; // Decay by 5% per frame
            if (this.eventFlags.lastCollisionDamage < 0.1) {
                this.eventFlags.lastCollisionDamage = 0; // Clear when too small
            }
        }

        // Decay attack damage memory
        if (this.eventFlags.lastAttackDamage > 0) {
            this.eventFlags.lastAttackDamage *= 0.95; // Decay by 5% per frame
            if (this.eventFlags.lastAttackDamage < 0.1) {
                this.eventFlags.lastAttackDamage = 0; // Clear when too small
            }
        }

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

        // OPTIMIZED: Calculate speed squared early for reuse in multiple places
        const MAX_VELOCITY_SQ = MAX_VELOCITY * MAX_VELOCITY;
        let currentSpeedSq = this.vx * this.vx + this.vy * this.vy;

        // Cap velocity - OPTIMIZED: Cache sqrt result and use multiplication instead of division
        let currentSpeed = 0;
        let invCurrentSpeed = 0;
        if (currentSpeedSq > MAX_VELOCITY_SQ) {
            currentSpeed = Math.sqrt(currentSpeedSq);
            invCurrentSpeed = 1 / currentSpeed;
            const ratio = MAX_VELOCITY * invCurrentSpeed;
            this.vx *= ratio;
            this.vy *= ratio;
            // Recalculate after capping
            currentSpeedSq = MAX_VELOCITY_SQ;
            currentSpeed = MAX_VELOCITY;
            invCurrentSpeed = 1 / MAX_VELOCITY;
        } else if (currentSpeedSq > 0) {
            currentSpeed = Math.sqrt(currentSpeedSq);
            invCurrentSpeed = 1 / currentSpeed;
        }

        // Cache speed calculations for reuse in other methods
        this._cachedSpeedSq = currentSpeedSq;
        this._cachedSpeed = currentSpeed;
        this._cachedInvSpeed = invCurrentSpeed;
        this._cachedVelocityAngle = Math.atan2(this.vy, this.vx);
        this._lastSpeedCacheUpdate = this.framesAlive;

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
            this.eventFlags.lastCollisionDamage = damage; // Track damage

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
        // OPTIMIZED: Reuse cached speed from velocity capping
        // currentSpeed already calculated above
        const invMaxVelocity = 1 / MAX_VELOCITY;
        const speedRatio = Math.min(currentSpeed * invMaxVelocity, 1.0);
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
        // OPTIMIZED: Cache inverse efficiency and use multiplication
        const invMovementEfficiency = 1 / movementEfficiency;
        const movementLoss = Math.min(currentSpeedSq * movementCostMultiplier * invMovementEfficiency, 5);

        let energyLoss = sizeLoss + movementLoss;

        // SCOUT EFFICIENCY: Scouts use less energy for movement
        if (this.specializationType === SPECIALIZATION_TYPES.SCOUT) {
            energyLoss *= SCOUT_ENERGY_COST_MULTIPLIER;
        }

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
        // OPTIMIZED: Reuse cached current speed squared if available
        const currSpeedSq = this._lastSpeedCacheUpdate === this.framesAlive ? this._cachedSpeedSq : (currVx * currVx + currVy * currVy);
        const MIN_MOVEMENT_THRESHOLD_SQ = 0.0001; // 0.01^2 to avoid sqrt

        if (prevSpeedSq > MIN_MOVEMENT_THRESHOLD_SQ || currSpeedSq > MIN_MOVEMENT_THRESHOLD_SQ) {
            prevAngle = Math.atan2(prevVy, prevVx);
            // OPTIMIZED: Reuse cached velocity angle if available
            currAngle = this._lastSpeedCacheUpdate === this.framesAlive ? this._cachedVelocityAngle : Math.atan2(currVy, currVx);
            angleDiff = Math.abs(currAngle - prevAngle);
            if (angleDiff > Math.PI) angleDiff = TWO_PI - angleDiff;

            // Only count significant direction changes (minimum threshold to prevent tiny movements)
            // This prevents tiny jittery movements from accumulating massive fitness
            if (angleDiff > MIN_ANGLE_CHANGE_FOR_FITNESS) {
                this.directionChanged += angleDiff * DIRECTION_CHANGE_FITNESS_FACTOR;
            }

            // Track speed changes to reward dynamic movement (not constant speed circles)
            const prevSpeed = Math.sqrt(prevSpeedSq);
            // OPTIMIZED: Reuse cached current speed if available
            const currSpeed = this._lastSpeedCacheUpdate === this.framesAlive && this._cachedSpeed > 0 ? this._cachedSpeed : Math.sqrt(currSpeedSq);
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
            // OPTIMIZED: Reuse energyBasedSize calculated earlier in update()
            this.targetSize = energyBasedSize;

            // Interpolate actual size towards target size for smooth visual effect
            this.size += (this.targetSize - this.size) * SPAWN_SIZE_INTERPOLATION_SPEED;
            this.diameter = this.size * 2;
        }

        // --- ASEXUAL REPRODUCTION (SPLITTING) ---
        if (this.energy > this.maxEnergy * 0.8 && this.reproductionCooldown <= 0) {
            this.split();
        }

        if (this.energy < 1) {
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
            this.eventFlags.lastCollisionDamage = energyLost; // Track damage

            // Add visual effect for wall collisions
            if (simulation.renderer) {
                simulation.renderer.addVisualEffect(this, 'collision', simulation.gameSpeed);
            }

            // Wall collision logging disabled for performance
        }

        // Obstacle Collision with bounce physics (fallback to agent-level collision)
        // OPTIMIZED: Cache agentSize and use early exit
        const agentSize = this.size;
        const agentSizeSq = agentSize * agentSize;
        for (let i = 0; i < obstacles.length; i++) {
            const obs = obstacles[i];
            const dx = this.x - obs.x;
            const dy = this.y - obs.y;
            const distSq = dx * dx + dy * dy;
            const obsRadius = obs.radius;
            const combinedRadius = agentSize + obsRadius;
            const combinedRadiusSq = combinedRadius * combinedRadius;

            if (distSq < combinedRadiusSq) {
                // OPTIMIZED: Cache sqrt result
                const dist = Math.sqrt(distSq) || 1;
                const invDist = 1 / dist;
                const overlap = combinedRadius - dist;

                // Enhanced position correction for stronger push away
                const separationStrength = COLLISION_SEPARATION_STRENGTH * 1.5; // Stronger push for obstacles
                // OPTIMIZED: Use cached invDist
                const pushX = dx * invDist * overlap * separationStrength;
                const pushY = dy * invDist * overlap * separationStrength;
                this.x += pushX;
                this.y += pushY;

                // Enhanced velocity bounce with minimum push away speed
                // OPTIMIZED: Use cached invDist
                const nx = dx * invDist;
                const ny = dy * invDist;
                const dot = this.vx * nx + this.vy * ny;
                const bounceFactor = Math.min(BOUNCE_ENERGY_LOSS * 3, 0.99); // Triple the bounce for obstacles too
                const minBounceSpeed = 0.3; // Minimum speed to ensure push away

                // Always apply bounce for consistent push away behavior, but scale by approach direction
                const bounceScale = dot < 0 ? 1.0 : 0.5; // Full bounce if moving towards, half if moving away
                this.vx = (this.vx - 2 * dot * nx) * bounceFactor * bounceScale;
                this.vy = (this.vy - 2 * dot * ny) * bounceFactor * bounceScale;

                // Ensure minimum push away speed in the correct direction
                // OPTIMIZED: Use squared comparison
                const pushSpeedSq = this.vx * this.vx + this.vy * this.vy;
                const minBounceSpeedSq = minBounceSpeed * minBounceSpeed;
                if (pushSpeedSq < minBounceSpeedSq) {
                    this.vx += nx * minBounceSpeed * 0.5; // Add minimum push in normal direction
                    this.vy += ny * minBounceSpeed * 0.5;
                }

                // Nudge obstacle slightly (same as physics.js)
                const nudgeStrength = COLLISION_NUDGE_STRENGTH;
                obs.vx -= nx * nudgeStrength;
                obs.vy -= ny * nudgeStrength;

                // Cap obstacle speed
                // OPTIMIZED: Use squared comparison and cache inverse
                const obstacleSpeedSq = obs.vx * obs.vx + obs.vy * obs.vy;
                const maxObstacleSpeed = OBSTACLE_MAX_SPEED;
                const maxObstacleSpeedSq = maxObstacleSpeed * maxObstacleSpeed;
                if (obstacleSpeedSq > maxObstacleSpeedSq) {
                    const obstacleSpeed = Math.sqrt(obstacleSpeedSq);
                    const invObstacleSpeed = 1 / obstacleSpeed;
                    obs.vx = obs.vx * invObstacleSpeed * maxObstacleSpeed;
                    obs.vy = obs.vy * invObstacleSpeed * maxObstacleSpeed;
                }

                this.energy -= OBSTACLE_COLLISION_PENALTY;
                this.collisions++;
                this.timesHitObstacle++;
                this.eventFlags.justHitObstacle = 30; // Set flag for 30 frames (~0.5 seconds)
                this.eventFlags.lastCollisionDamage = OBSTACLE_COLLISION_PENALTY; // Track damage

                // Add visual effect
                if (simulation.renderer) {
                    simulation.renderer.addVisualEffect(this, 'collision', simulation.gameSpeed);
                }

                // Obstacle collision logging disabled for performance
                break; // Only handle first collision
            }
        }

        this.emitPheromones();

        // =========================================================================
        // PERFORMANCE OPTIMIZATION: Cache nearby agents for fitness calculation
        // =========================================================================
        // Query quadtree ONCE per frame and cache results to avoid repeated
        // expensive queries during calculateFitness() calls (which happen during
        // mating, reproduction, and validation)
        const nearbyRange = 200; // Same range used in fitness calculation
        const queryRect = rectanglePool.acquire();
        queryRect.x = this.x - nearbyRange;
        queryRect.y = this.y - nearbyRange;
        queryRect.w = nearbyRange * 2;
        queryRect.h = nearbyRange * 2;

        this._nearbyAgentsCache = quadtree.query(queryRect);
        this._nearbyAgentsCacheFrame = this.framesAlive;

        rectanglePool.release(queryRect);

        // PERFORMANCE: Calculate fitness every 10 frames instead of every frame
        // Fitness is still calculated on death (see cleanup method) and periodically for UI
        if (this.framesAlive % 10 === 0) {
            this.calculateFitness();
        }

        // Update Adrenaline (Predators only)
        if (this.specializationType === SPECIALIZATION_TYPES.PREDATOR && this.adrenaline > 0) {
            this.adrenaline = Math.max(0, this.adrenaline - PREDATOR_ADRENALINE_DECAY);
        }
    }

    perceiveWorld(quadtree, obstacles, worldWidth, worldHeight) {
        // Reset ray hits counter at start of each frame
        this.rayHits = 0;

        // OPTIMIZED: Cache coordinates to avoid repeated property access
        const x = this.x;
        const y = this.y;
        const negX = -x;
        const negY = -y;
        const worldWidthMinusX = worldWidth - x;
        const worldHeightMinusY = worldHeight - y;

        // Reuse pre-allocated arrays
        this.inputs.length = 0;
        this.rayData.length = 0; // Clear rayData to prevent accumulation
        const inputs = this.inputs;
        const rayData = this.rayData;
        let rayDataIndex = 0;

        const maxRayDist = this.maxRayDist * (this.specializationType === SPECIALIZATION_TYPES.PREDATOR ? (1.0 + this.adrenaline * (PREDATOR_ADRENALINE_RAY_MULT - 1.0)) : 1.0);
        const numSensorRays = this.numSensorRays;
        const numAlignmentRays = this.numAlignmentRays;

        // Calculate ray angles
        const startAngle = this.angle - Math.PI;
        const sensorAngleStep = TWO_PI / numSensorRays;
        const alignAngleStep = TWO_PI / numAlignmentRays;

        // Helper for ray-circle intersection
        // OPTIMIZED: Use cached x, y coordinates
        const rayCircleIntersect = (rayDirX, rayDirY, circleX, circleY, circleRadius) => {
            const ocX = circleX - x;
            const ocY = circleY - y;
            const b = (ocX * rayDirX + ocY * rayDirY);
            const c = (ocX * ocX + ocY * ocY) - circleRadius * circleRadius;
            const discriminant = b * b - c;

            if (discriminant < 0) return null; // No intersection

            // OPTIMIZED: Cache sqrt calculation
            const sqrtDiscriminant = Math.sqrt(discriminant);
            const t1 = b - sqrtDiscriminant;
            const t2 = b + sqrtDiscriminant;

            if (t1 > RAY_DISTANCE_THRESHOLD) return t1; // First intersection point in front of ray origin
            if (t2 > RAY_DISTANCE_THRESHOLD) return t2; // Second intersection point in front of ray origin (if t1 was behind)
            return null; // Both intersection points are behind ray origin
        };

        // --- TARGET TRACKING (Performance-Optimized) ---
        // Track closest food and mate during ray casting
        let closestFoodDist = Infinity;
        let closestFoodX = null;
        let closestFoodY = null;
        let closestMateDist = Infinity;
        let closestMateX = null;
        let closestMateY = null;
        let closestObstacleDist = Infinity;
        let closestPredatorDist = Infinity;
        let closestPredatorSizeRatio = 0;
        let potentialMatesCount = 0;

        // Process sensor rays
        for (let rayIdx = 0; rayIdx < numSensorRays; rayIdx++) {
            const angle = startAngle + rayIdx * sensorAngleStep;
            const rayDirX = Math.cos(angle);
            const rayDirY = Math.sin(angle);

            let closestDist = maxRayDist;
            let hitType = 0; // 0: none, 1: food, 2: smaller agent, 3: larger agent, 4: obstacle, 5: edge
            let hitEntity = null;

            // Check for world edge collisions
            // OPTIMIZED: Use cached coordinate calculations
            let distToEdge = Infinity;
            if (rayDirX < 0) distToEdge = Math.min(distToEdge, negX / rayDirX);
            if (rayDirX > 0) distToEdge = Math.min(distToEdge, worldWidthMinusX / rayDirX);
            if (rayDirY < 0) distToEdge = Math.min(distToEdge, negY / rayDirY);
            if (rayDirY > 0) distToEdge = Math.min(distToEdge, worldHeightMinusY / rayDirY);

            if (distToEdge > 0 && distToEdge < closestDist) {
                closestDist = distToEdge;
                hitType = 5; // Edge
            }

            // OPTIMIZED: Query quadtree for nearby obstacles instead of checking all 500
            // Calculate ray bounding box for spatial query
            // OPTIMIZED: Cache ray direction * maxRayDist calculations
            const rayEndOffsetX = rayDirX * maxRayDist;
            const rayEndOffsetY = rayDirY * maxRayDist;
            const rayEndX = x + rayEndOffsetX;
            const rayEndY = y + rayEndOffsetY;
            const rayBoundsMinX = Math.min(x, rayEndX);
            const rayBoundsMaxX = Math.max(x, rayEndX);
            const rayBoundsMinY = Math.min(y, rayEndY);
            const rayBoundsMaxY = Math.max(y, rayEndY);
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
                        // Track closest obstacle for collision risk calculation
                        // OPTIMIZED: Direct comparison (dist already calculated)
                        if (dist < closestObstacleDist) {
                            closestObstacleDist = dist;
                        }
                    }
                }
            }

            // PERFORMANCE: Release rectangle and array back to pools
            rectanglePool.release(rayBounds);
            queryArrayPool.release(nearbyPoints);

            // Query quadtree for nearby entities (agents and food)
            // Reuse pre-allocated Rectangle
            // OPTIMIZED: Use cached x, y coordinates
            this.queryRange.x = x - maxRayDist;
            this.queryRange.y = y - maxRayDist;
            this.queryRange.w = maxRayDist * 2;
            this.queryRange.h = maxRayDist * 2;

            const nearbyEntities = quadtree.query(this.queryRange);

            for (const entity of nearbyEntities) {
                if (!entity) continue; // Safety check for bad data in quadtree
                if (entity === this || entity.isDead) continue;

                if (entity.isFood) {
                    const food = entity;
                    const dist = rayCircleIntersect(rayDirX, rayDirY, food.x, food.y, food.size);
                    if (dist !== null && dist > 0 && dist < closestDist) {
                        closestDist = dist;
                        hitType = 1; // Food
                        hitEntity = food;
                        // Track closest food for target memory
                        if (dist < closestFoodDist) {
                            closestFoodDist = dist;
                            closestFoodX = food.x;
                            closestFoodY = food.y;
                        }
                    }
                } else if (entity instanceof Agent) {
                    const otherAgent = entity;
                    const dist = rayCircleIntersect(rayDirX, rayDirY, otherAgent.x, otherAgent.y, otherAgent.size);
                    if (dist !== null && dist > 0 && dist < closestDist) {
                        closestDist = dist;
                        if (this.size > otherAgent.size * 1.1) {
                            hitType = 3; // Larger agent (prey)
                        } else if (this.size < otherAgent.size * 0.9) {
                            hitType = 2; // Smaller agent (predator)
                            // Track closest predator for threat calculation
                            if (dist < closestPredatorDist) {
                                closestPredatorDist = dist;
                                closestPredatorSizeRatio = otherAgent.size / this.size;
                            }
                        } else {
                            hitType = 6; // Same size agent
                        }
                        hitEntity = otherAgent;
                        // Track closest mate for target memory (when wanting to reproduce)
                        if (this.wantsToReproduce && (hitType === 6 || hitType === 3) && dist < closestMateDist) {
                            closestMateDist = dist;
                            closestMateX = otherAgent.x;
                            closestMateY = otherAgent.y;
                        }
                        // Count potential mates (similar size, mature, not pregnant, have energy)
                        if (hitType === 6 || hitType === 3) {
                            if (otherAgent.framesAlive >= 600 && !otherAgent.isPregnant &&
                                otherAgent.energy >= MIN_ENERGY_TO_REPRODUCE &&
                                otherAgent.reproductionCooldown === 0) {
                                potentialMatesCount++;
                            }
                        }
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
            // OPTIMIZED: Use cached coordinate calculations
            if (rayDirX < 0) distToEdge = Math.min(distToEdge, negX / rayDirX);
            if (rayDirX > 0) distToEdge = Math.min(distToEdge, worldWidthMinusX / rayDirX);
            if (rayDirY < 0) distToEdge = Math.min(distToEdge, negY / rayDirY);
            if (rayDirY > 0) distToEdge = Math.min(distToEdge, worldHeightMinusY / rayDirY);
            if (distToEdge > 0 && distToEdge < closestDist) {
                closestDist = distToEdge;
            }

            // OPTIMIZED: Query quadtree for nearby obstacles instead of checking all 500
            // OPTIMIZED: Cache ray direction * maxRayDist calculations
            const rayEndOffsetX = rayDirX * maxRayDist;
            const rayEndOffsetY = rayDirY * maxRayDist;
            const rayEndX = x + rayEndOffsetX;
            const rayEndY = y + rayEndOffsetY;
            const rayBoundsMinX = Math.min(x, rayEndX);
            const rayBoundsMaxX = Math.max(x, rayEndX);
            const rayBoundsMinY = Math.min(y, rayEndY);
            const rayBoundsMaxY = Math.max(y, rayEndY);
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
            // OPTIMIZED: Use cached x, y coordinates
            this.queryRange.x = x - maxRayDist;
            this.queryRange.y = y - maxRayDist;
            this.queryRange.w = maxRayDist * 2;
            this.queryRange.h = maxRayDist * 2;

            const nearbyEntities = quadtree.query(this.queryRange);

            for (const entity of nearbyEntities) {
                if (!entity) continue; // Safety check
                if (entity === this || entity.isDead) continue;

                const r = entity.isFood ? entity.size : (entity.size || 0);
                if (r > 0) {
                    const dist = rayCircleIntersect(rayDirX, rayDirY, entity.x, entity.y, r);
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
        // OPTIMIZED: Use cached x, y coordinates
        this.smellRadius.x = x - PHEROMONE_RADIUS;
        this.smellRadius.y = y - PHEROMONE_RADIUS;
        this.smellRadius.w = PHEROMONE_DIAMETER;
        this.smellRadius.h = PHEROMONE_DIAMETER;

        const nearbyPuffs = quadtree.query(this.smellRadius);
        for (const entity of nearbyPuffs) {
            if (entity.data instanceof PheromonePuff) {
                const pheromone = entity.data;
                // OPTIMIZED: Use cached x, y coordinates
                const dist = distance(x, y, pheromone.x, pheromone.y);
                if (dist < PHEROMONE_RADIUS) {
                    const intensity = 1.0 - (dist / PHEROMONE_RADIUS);
                    if (pheromone.type === 'danger') {
                        dangerSmell = Math.max(dangerSmell, intensity);
                    } else if (pheromone.type === 'attack') {
                        attackSmell = Math.max(attackSmell, intensity);
                    } else if (pheromone.type === 'ink') {
                        // INK BLINDNESS: Reduce vision range if in ink cloud
                        if (intensity > INK_BLINDNESS_THRESHOLD) {
                            // Reduce maxRayDist for this frame (affects subsequent ray casts if we were doing them dynamically,
                            // but here we just set a flag or modify the effective range for inputs)
                            // Since rays are already cast, we can't change their length retrospectively for this frame's physics,
                            // but we can affect the inputs to the neural network to simulate blindness.
                            // Better yet, we should have applied this BEFORE ray casting.
                            // However, since we are in the middle of perceiveWorld, let's apply a "blindness" factor to the inputs.
                            // Actually, let's just track it and apply it to the inputs.
                            // For simplicity in this iteration, we'll just reduce the effective maxRayDist for the NEXT frame
                            // by modifying a temporary property, or we can assume the agent is blinded and zero out some inputs.

                            // Let's go with a simpler approach: If blinded, reduce the perceived distance of things (make them seem further away or invisible)
                            // Or, we can just reduce the 'normalizedDist' in the inputs.

                            // REVISION: We can't easily re-cast rays.
                            // Let's just set a blindness flag.
                            this.isBlinded = true;
                        }
                    }
                }
            }
        }

        // Apply blindness effect to inputs if detected
        // We need to iterate over the inputs we just added and dampen them if blinded.
        // Since we pushed them to `inputs` array, we can modify them.
        // The first `numSensorRays + numAlignmentRays` inputs are distances.
        if (this.isBlinded) {
            for (let i = 0; i < numSensorRays + numAlignmentRays; i++) {
                // Reduce visibility: things appear further away (smaller input value)
                // normalizedDist = 1.0 - (dist / maxRayDist).
                // If we multiply by factor < 1, we simulate reduced range.
                inputs[i] *= (1.0 - INK_BLINDNESS_FACTOR);
            }
            this.isBlinded = false; // Reset for next frame
        }

        // PERFORMANCE: Release pheromone query array back to pool
        queryArrayPool.release(nearbyPuffs);

        // --- SHOUT DETECTION (Performance: Zero cost, piggybacks on existing agent queries) ---
        // Clear previous heard shouts
        this.heardShouts.length = 0;

        // Check if nearby agents are shouting (reuse nearbyEntities from pheromone query or query again)
        // We need to query for agents within max hearing range
        const maxHearingRange = SHOUT_BASE_RANGE * 3.0; // Max intensity is 3.0
        this.queryRange.x = x - maxHearingRange;
        this.queryRange.y = y - maxHearingRange;
        this.queryRange.w = maxHearingRange * 2;
        this.queryRange.h = maxHearingRange * 2;

        const nearbyAgents = quadtree.query(this.queryRange);
        for (const point of nearbyAgents) {
            const entity = point.data;

            if (entity instanceof Agent && entity !== this && entity.currentShout) {
                const shout = entity.currentShout;

                // Get shout duration based on shouting agent's specialization (defenders shout twice as long)
                const shoutDuration = entity.specializationType === SPECIALIZATION_TYPES.DEFENDER
                    ? SHOUT_DURATION_FRAMES * 2
                    : SHOUT_DURATION_FRAMES;

                // Check if shout is still active
                if ((entity.framesAlive - shout.frame) <= shoutDuration) {
                    const dx = entity.x - x;
                    const dy = entity.y - y;
                    const distSq = dx * dx + dy * dy;
                    const hearingRange = SHOUT_BASE_RANGE * shout.intensity;
                    const hearingRangeSq = hearingRange * hearingRange;

                    if (distSq < hearingRangeSq) {
                        const dist = Math.sqrt(distSq);
                        const strength = 1.0 - (dist / hearingRange);

                        this.heardShouts.push({
                            type: shout.type,
                            distance: dist,
                            direction: Math.atan2(dy, dx),
                            intensity: strength
                        });
                    }
                }
            }
        }

        // Release query array
        queryArrayPool.release(nearbyAgents);

        for (const obs of obstacles) {
            // OPTIMIZED: Use cached x, y coordinates
            const dist = distance(x, y, obs.x, obs.y);
            if (dist < obs.radius + OBSTACLE_HIDING_RADIUS) {
                inShadow = true;
                break;
            }
        }

        this.dangerSmell = dangerSmell;
        this.attackSmell = attackSmell;

        // OPTIMIZED: Reuse cached speed and velocity angle if available
        let currentSpeed;
        let velocityAngle;
        if (this._lastSpeedCacheUpdate === this.framesAlive) {
            currentSpeed = this._cachedSpeed;
            velocityAngle = this._cachedVelocityAngle;
        } else {
            currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            velocityAngle = Math.atan2(this.vy, this.vx);
        }
        const angleDifference = (velocityAngle - this.angle + Math.PI * 3) % TWO_PI - Math.PI;

        inputs.push((MAX_ENERGY - this.energy) / MAX_ENERGY); // Hunger
        inputs.push(Math.min(this.dangerSmell, 1)); // Fear
        inputs.push(Math.min(this.attackSmell + (this.energy / OBESITY_THRESHOLD_ENERGY), 1)); // Aggression
        inputs.push(this.energy / MAX_ENERGY); // Energy ratio

        inputs.push(Math.min(this.age / 60, 1)); // Age ratio
        inputs.push(currentSpeed / MAX_VELOCITY); // Speed ratio
        // Continuous representation of velocity relative to facing angle
        inputs.push(Math.sin(angleDifference));
        inputs.push(Math.cos(angleDifference));
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

        // Death risk: explicit awareness that low energy = death
        const deathRisk = this.energy < DEATH_RISK_THRESHOLD ? Math.max(0, (DEATH_RISK_THRESHOLD - this.energy) / DEATH_RISK_THRESHOLD) : 0;
        inputs.push(Math.min(deathRisk, 1.0)); // Death risk (0-1, where 1 = critical)

        // Food energy gain: explicit awareness that eating food gives energy
        inputs.push(Math.min(this.eventFlags.lastFoodEnergyGain / MAX_ENERGY, 1.0)); // Food energy gain (0-1, normalized)

        // Food urgency: continuous urgency based on hunger and food availability
        const hungerLevel = 1.0 - (this.energy / MAX_ENERGY); // 0 = full, 1 = starving
        const foodProximity = closestFoodDist < Infinity ?
            Math.max(0, 1.0 - (closestFoodDist / (this.maxRayDist * 2))) : 0.0;
        let foodUrgency = Math.min(hungerLevel * 0.7 + foodProximity * 0.3, 1.0);
        // Trigger urgency when hunger > 0.3 (30% energy depleted) OR food is very close
        if (hungerLevel > 0.3 || (foodProximity > 0.5 && hungerLevel > 0.1)) {
            foodUrgency = Math.max(foodUrgency, 0.5);
        }
        inputs.push(foodUrgency); // Food urgency (0-1, continuous: scales with hunger and proximity)

        // Food proximity (0-1, where 1 = food very close)
        const foodProximityInput = closestFoodDist < Infinity ?
            Math.max(0, 1.0 - (closestFoodDist / (this.maxRayDist * 2))) : 0.0;
        inputs.push(foodProximityInput);

        // Food availability score (based on how many food items detected in sensor rays)
        let foodDetectedCount = 0;
        if (rayData) {
            for (const ray of rayData) {
                if (ray.hit && ray.type === 'sensor' && ray.hitType === 'food') {
                    foodDetectedCount++;
                }
            }
        }
        const foodAvailabilityScore = Math.min(foodDetectedCount / 5, 1.0); // Normalize to 0-1
        inputs.push(foodAvailabilityScore);

        // Collision damage: explicit awareness that crashing = energy loss
        inputs.push(Math.min(this.eventFlags.lastCollisionDamage / MAX_ENERGY, 1.0)); // Collision damage (0-1, normalized)

        // Collision risk: proximity to obstacles (0-1, where 1 = very close)
        const collisionRisk = closestObstacleDist < Infinity ? (1.0 - Math.min(closestObstacleDist / maxRayDist, 1.0)) : 0.0;
        inputs.push(Math.min(collisionRisk, 1.0)); // Collision risk (0-1)

        // Predator threat: combined size difference + proximity (0-1)
        const predatorProximity = closestPredatorDist < Infinity ? (1.0 - Math.min(closestPredatorDist / maxRayDist, 1.0)) : 0.0;
        const sizeDifference = closestPredatorSizeRatio > 1.1 ? (closestPredatorSizeRatio - 1.0) / 2.0 : 0.0; // Normalize size ratio
        const predatorThreat = Math.min(predatorProximity * Math.min(sizeDifference, 1.0), 1.0);
        this.eventFlags.predatorThreat = predatorThreat; // Store for use in other systems
        inputs.push(Math.min(predatorThreat, 1.0)); // Predator threat (0-1)

        // Attack damage: energy lost from last attack (0-1, normalized)
        inputs.push(Math.min(this.eventFlags.lastAttackDamage / MAX_ENERGY, 1.0)); // Attack damage (0-1, normalized)

        // Vulnerability: how vulnerable agent is to predators (0-1)
        const vulnerability = closestPredatorSizeRatio > 1.1 ? 1.0 : (closestPredatorSizeRatio > 1.0 ? (closestPredatorSizeRatio - 1.0) * 10 : 0.0);
        inputs.push(Math.min(vulnerability, 1.0)); // Vulnerability (0-1)

        // Reproduction readiness: how ready agent is to reproduce (0-1)
        const energyReadiness = this.energy >= MIN_ENERGY_TO_REPRODUCE ? 1.0 : Math.max(0, this.energy / MIN_ENERGY_TO_REPRODUCE);
        const cooldownReadiness = this.reproductionCooldown === 0 ? 1.0 : 0.0;
        const ageReadiness = this.framesAlive >= 600 ? 1.0 : Math.max(0, this.framesAlive / 600);
        const reproductionReadiness = energyReadiness * cooldownReadiness * ageReadiness;
        this.eventFlags.reproductionReadiness = reproductionReadiness; // Store for use in other systems
        inputs.push(Math.min(reproductionReadiness, 1.0)); // Reproduction readiness (0-1)

        // Reproduction benefit: fitness benefit from reproduction (0-1)
        // Use existing offspring count normalized
        inputs.push(Math.min(this.offspring / 5, 1.0)); // Reproduction benefit (0-1, normalized)

        // Mate availability: how many potential mates are nearby (0-1)
        const mateAvailability = Math.min(potentialMatesCount / 5, 1.0);
        this.eventFlags.mateAvailability = mateAvailability; // Store for use in other systems
        inputs.push(Math.min(mateAvailability, 1.0)); // Mate availability (0-1)

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

        // --- TARGET MEMORY UPDATE (Performance-Optimized) ---
        // Update target memory if we see food or mate
        if (closestFoodDist < Infinity) {
            // Update or set food target
            if (!this.targetMemory.currentTarget || this.targetMemory.currentTarget.type !== 'food') {
                this.targetMemory.currentTarget = {
                    type: 'food',
                    x: closestFoodX,
                    y: closestFoodY,
                    priority: 1.0
                };
            } else {
                // Update existing target position
                this.targetMemory.currentTarget.x = closestFoodX;
                this.targetMemory.currentTarget.y = closestFoodY;
            }
            this.targetMemory.lastTargetSeen = this.framesAlive;
        } else if (this.wantsToReproduce && closestMateDist < Infinity) {
            // Update or set mate target
            if (!this.targetMemory.currentTarget || this.targetMemory.currentTarget.type !== 'mate') {
                this.targetMemory.currentTarget = {
                    type: 'mate',
                    x: closestMateX,
                    y: closestMateY,
                    priority: 0.8
                };
            } else {
                this.targetMemory.currentTarget.x = closestMateX;
                this.targetMemory.currentTarget.y = closestMateY;
            }
            this.targetMemory.lastTargetSeen = this.framesAlive;
        }

        // Check target expiration (only every 5 frames for performance)
        if (this.framesAlive % 5 === 0 && this.targetMemory.currentTarget && this.targetMemory.lastTargetSeen > 0) {
            const framesSinceSeen = this.framesAlive - this.targetMemory.lastTargetSeen;
            if (framesSinceSeen > this.targetMemory.attentionSpan) {
                this.targetMemory.currentTarget = null;
                this.targetMemory.lastTargetSeen = 0;
            }
        }

        // Add target memory inputs to neural network
        if (this.targetMemory.currentTarget) {
            // Calculate distance and angle to target (cached, updated every 5 frames)
            // OPTIMIZED: Use cached x, y coordinates
            if (this._lastTargetCacheUpdate !== this.framesAlive || this.framesAlive % 5 === 0) {
                const dx = this.targetMemory.currentTarget.x - x;
                const dy = this.targetMemory.currentTarget.y - y;
                // OPTIMIZED: Cache dx and dy squared for potential reuse
                const dxSq = dx * dx;
                const dySq = dy * dy;
                this._cachedTargetDistance = Math.sqrt(dxSq + dySq);
                this._cachedTargetAngle = Math.atan2(dy, dx);
                this._lastTargetCacheUpdate = this.framesAlive;
            }

            // Normalized distance to target (0-1, where 0 = very close, 1 = very far)
            const maxDist = this.maxRayDist * 2; // Use 2x ray distance as max
            inputs.push(Math.min(this._cachedTargetDistance / maxDist, 1.0));

            // Direction to target (continuous representation using sin/cos)
            let angleToTarget = this._cachedTargetAngle - this.angle;
            while (angleToTarget > Math.PI) angleToTarget -= TWO_PI;
            while (angleToTarget < -Math.PI) angleToTarget += TWO_PI;
            inputs.push(Math.sin(angleToTarget));
            inputs.push(Math.cos(angleToTarget));

            // Time since target was last seen (normalized)
            const framesSinceSeen = this.framesAlive - this.targetMemory.lastTargetSeen;
            inputs.push(Math.min(framesSinceSeen / this.targetMemory.attentionSpan, 1.0));

            // Target type (food=1, mate=0.5, location=0)
            inputs.push(this.targetMemory.currentTarget.type === 'food' ? 1.0 :
                (this.targetMemory.currentTarget.type === 'mate' ? 0.5 : 0.0));

            // Target priority
            inputs.push(this.targetMemory.currentTarget.priority || 0.5);
        } else {
            // No target - provide zero inputs
            inputs.push(0); // Distance
            inputs.push(0); // Angle sin
            inputs.push(0); // Angle cos
            inputs.push(1); // Time since seen (max = forgotten)
            inputs.push(0); // Type
            inputs.push(0); // Priority
        }

        // --- GOAL MEMORY INPUTS ---
        // Update goal based on current state
        const previousGoal = this.goalMemory.currentGoal;

        // Calculate dynamic FIND_FOOD priority based on energy level
        let findFoodPriority = 0.7; // Base priority
        if (this.energy < MODERATE_ENERGY_THRESHOLD && this.energy >= LOW_ENERGY_THRESHOLD) {
            // Moderate hunger: increase priority
            findFoodPriority = 0.85;
        } else if (this.energy < LOW_ENERGY_THRESHOLD) {
            // Low energy: REST takes priority, but FIND_FOOD should be high too
            findFoodPriority = 0.9;
        }

        // Goal selection with hunger-based prioritization
        if (this.energy < LOW_ENERGY_THRESHOLD) {
            this.goalMemory.currentGoal = GOALS.REST;
            this.goalMemory.goalPriority = 1.0;
        } else if (this.dangerSmell > 0.7 || this.fear > 0.7) {
            this.goalMemory.currentGoal = GOALS.AVOID_DANGER;
            this.goalMemory.goalPriority = 0.9;
        } else if (this.energy < MODERATE_ENERGY_THRESHOLD) {
            // Prioritize food when energy is moderate (hungry but not critical)
            this.goalMemory.currentGoal = GOALS.FIND_FOOD;
            this.goalMemory.goalPriority = 0.85;
        } else if (this.wantsToReproduce && this.energy >= MIN_ENERGY_TO_REPRODUCE) {
            // Only mate when energy is sufficient
            this.goalMemory.currentGoal = GOALS.FIND_MATE;
            this.goalMemory.goalPriority = 0.8;
        } else {
            this.goalMemory.currentGoal = GOALS.FIND_FOOD;
            this.goalMemory.goalPriority = findFoodPriority; // Use dynamic priority
        }

        // Update goal start frame if goal changed
        if (previousGoal !== this.goalMemory.currentGoal) {
            this.goalMemory.goalStartFrame = this.framesAlive;
            // Add to history (efficient index cycling)
            const historyIndex = this.goalMemory.recentGoals.length % 20;
            this.goalMemory.recentGoals[historyIndex] = {
                goal: previousGoal,
                duration: this.framesAlive - this.goalMemory.goalStartFrame,
                frame: this.framesAlive
            };
        }

        // Add goal inputs (one-hot encoded for categorical representation)
        // One-hot encode the 4 goals (Food, Mate, Flee, Rest)
        inputs.push(this.goalMemory.currentGoal === 0 ? 1 : 0); // Food
        inputs.push(this.goalMemory.currentGoal === 1 ? 1 : 0); // Mate
        inputs.push(this.goalMemory.currentGoal === 2 ? 1 : 0); // Danger
        inputs.push(this.goalMemory.currentGoal === 3 ? 1 : 0); // Rest
        inputs.push(this.goalMemory.goalPriority);
        inputs.push(Math.min((this.framesAlive - this.goalMemory.goalStartFrame) / 300, 1.0)); // Goal duration (normalized)

        // Add shout inputs to neural network (4 new inputs)
        // Aggregate shouts by type for neural network inputs
        const shoutInputs = {
            predatorAlert: 0,
            foodFound: 0,
            helpRequest: 0,
            mateCall: 0
        };
        for (const heard of this.heardShouts) {
            switch (heard.type) {
                case SHOUT_TYPES.PREDATOR_ALERT:
                    shoutInputs.predatorAlert = Math.max(shoutInputs.predatorAlert, heard.intensity);
                    break;
                case SHOUT_TYPES.FOOD_FOUND:
                    shoutInputs.foodFound = Math.max(shoutInputs.foodFound, heard.intensity);
                    break;
                case SHOUT_TYPES.HELP_REQUEST:
                    shoutInputs.helpRequest = Math.max(shoutInputs.helpRequest, heard.intensity);
                    break;
                case SHOUT_TYPES.MATE_CALL:
                    shoutInputs.mateCall = Math.max(shoutInputs.mateCall, heard.intensity);
                    break;
            }
        }
        inputs.push(shoutInputs.predatorAlert);
        inputs.push(shoutInputs.foodFound);
        inputs.push(shoutInputs.helpRequest);
        inputs.push(shoutInputs.mateCall);

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
                        // PREDATOR ADRENALINE: Boost when seeing prey
                        if (this.specializationType === SPECIALIZATION_TYPES.PREDATOR) {
                            this.adrenaline = Math.min(1.0, this.adrenaline + 0.05); // Build up adrenaline
                        }
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
            // OPTIMIZED: Use squared distance for comparison, only calculate sqrt if needed
            const dx = this.x - this.territoryCenterX;
            const dy = this.y - this.territoryCenterY;
            const distSq = dx * dx + dy * dy;
            const territoryRadiusSq = this.territoryRadius * this.territoryRadius;
            this.isInTerritory = distSq < territoryRadiusSq;

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
        // Only emit danger pheromone if there's an actual predator threat, not just from low energy
        // This prevents dying agents from emitting false danger signals
        const hasPredatorThreat = predatorProximity > 0 || this.dangerSmell > 0.3;
        if (this.fear > 0.5 && hasPredatorThreat && Math.random() < 0.1) { // Reduced from 0.3 to 0.1
            spawnPheromone(this.simulation, this.x, this.y, 'danger');
        }
        if (this.aggression > 0.5 && Math.random() < 0.1) { // Reduced from 0.3 to 0.1
            spawnPheromone(this.simulation, this.x, this.y, 'attack');
        }
        // NEW: Add reproduction pheromone when wantsToReproduce
        if (this.wantsToReproduce && Math.random() < 0.05) { // Reduced from 0.2 to 0.05
            spawnPheromone(this.simulation, this.x, this.y, 'reproduction');
        }

        // INK CLOUD EMISSION
        // Foragers emit ink when in high fear (defensive)
        if (this.specializationType === SPECIALIZATION_TYPES.FORAGER && this.fear > 0.8 && Math.random() < 0.05) {
            spawnPheromone(this.simulation, this.x, this.y, 'ink');
        }
        // Reproducers emit ink when pregnant (protective)
        if (this.specializationType === SPECIALIZATION_TYPES.REPRODUCER && this.isPregnant && Math.random() < 0.02) {
            spawnPheromone(this.simulation, this.x, this.y, 'ink');
        }
    }

    /**
     * Emit a shout that nearby agents can hear
     * @param {string} type - Shout type from SHOUT_TYPES
     * @param {number} intensity - Loudness multiplier (affects range)
     */
    shout(type, intensity = 1.0) {
        // PREDATORS NEVER SHOUT FOR DANGER - they are the danger
        if (this.specializationType === SPECIALIZATION_TYPES.PREDATOR &&
            type === SHOUT_TYPES.PREDATOR_ALERT) {
            return; // Prevent predators from ever shouting for danger
        }

        this.currentShout = {
            type: type,
            intensity: Math.max(0.1, Math.min(3.0, intensity)), // Clamp 0.1-3.0
            frame: this.framesAlive
        };
    }

    /**
     * Check for threats and emit warning shouts
     * Called each frame after perception
     * 
     * NOTE: This works alongside the existing emitPheromones() method.
     * - Shouts: Instant, far-reaching alerts (200-600px range)
     * - Pheromones: Persistent trails that linger (60px radius, fade slowly)
     */
    checkForThreatsAndShout() {
        // Get shout duration based on specialization (defenders shout twice as long)
        const shoutDuration = this.specializationType === SPECIALIZATION_TYPES.DEFENDER
            ? SHOUT_DURATION_FRAMES * 2
            : SHOUT_DURATION_FRAMES;

        // Clear previous shout if expired
        if (this.currentShout &&
            (this.framesAlive - this.currentShout.frame) > shoutDuration) {
            this.currentShout = null;
        }

        // Defender specialty: Alert nearby allies when predator spotted
        // PREDATORS NEVER SHOUT FOR DANGER - they are the danger (enforced in shout() method)
        if (this.specializationType === SPECIALIZATION_TYPES.DEFENDER) {
            let predatorThreat = 0;

            if (this.lastRayData) {
                for (const ray of this.lastRayData) {
                    if (ray.hit && ray.hitTypeName === 'larger') {
                        const intensity = 1.0 - (ray.dist / this.maxRayDist);
                        predatorThreat = Math.max(predatorThreat, intensity);
                    }
                }
            }

            // Shout warning if significant threat detected (instant, far-reaching)
            if (predatorThreat > SHOUT_PREDATOR_ALERT_THRESHOLD &&
                Math.random() < SHOUT_PREDATOR_ALERT_CHANCE) {
                this.shout(SHOUT_TYPES.PREDATOR_ALERT, predatorThreat * 2.0);
                // Add visual effect for shout with specific type
                if (this.simulation && this.simulation.renderer) {
                    this.simulation.renderer.addVisualEffect(this, 'shout', this.simulation.gameSpeed, SHOUT_TYPES.PREDATOR_ALERT);
                }
            }
        }

        // Forager specialty: Alert when finding food
        if (this.specializationType === SPECIALIZATION_TYPES.FORAGER) {
            if (this.eventFlags.justAteFood > 0 &&
                Math.random() < SHOUT_FOOD_FOUND_CHANCE) {
                this.shout(SHOUT_TYPES.FOOD_FOUND, 1.5);
                // Add visual effect for shout with specific type
                if (this.simulation && this.simulation.renderer) {
                    this.simulation.renderer.addVisualEffect(this, 'shout', this.simulation.gameSpeed, SHOUT_TYPES.FOOD_FOUND);
                }
            }
        }

        // Scout specialty: Alert when finding food (higher chance)
        if (this.specializationType === SPECIALIZATION_TYPES.SCOUT) {
            if (this.eventFlags.justAteFood > 0 &&
                Math.random() < SCOUT_FOOD_ALERT_CHANCE) {
                this.shout(SHOUT_TYPES.FOOD_FOUND, 2.0); // Louder shout
                // Add visual effect for shout with specific type
                if (this.simulation && this.simulation.renderer) {
                    this.simulation.renderer.addVisualEffect(this, 'shout', this.simulation.gameSpeed, SHOUT_TYPES.FOOD_FOUND);
                }
            }
        }

        // Any agent: Call for help when critically low on energy
        if (this.energy < DEATH_RISK_THRESHOLD &&
            Math.random() < SHOUT_HELP_REQUEST_CHANCE) {
            this.shout(SHOUT_TYPES.HELP_REQUEST, 1.0);
            // Add visual effect for shout with specific type
            if (this.simulation && this.simulation.renderer) {
                this.simulation.renderer.addVisualEffect(this, 'shout', this.simulation.gameSpeed, SHOUT_TYPES.HELP_REQUEST);
            }
        }

        // Reproducer specialty: Mate call when ready to reproduce
        if (this.specializationType === SPECIALIZATION_TYPES.REPRODUCER &&
            this.wantsToReproduce &&
            this.energy > MIN_ENERGY_TO_REPRODUCE &&
            Math.random() < 0.1) {
            this.shout(SHOUT_TYPES.MATE_CALL, 1.2);
            // Add visual effect for shout with specific type
            if (this.simulation && this.simulation.renderer) {
                this.simulation.renderer.addVisualEffect(this, 'shout', this.simulation.gameSpeed, SHOUT_TYPES.MATE_CALL);
            }
        }
    }


    tryMate(mate) {
        // Track reproduction attempt (even if it fails)
        this.reproductionAttempts++;

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

        // Enhanced mate selection with fitness consideration and kinship checks

        // 1. Kinship check: Avoid mating with close relatives (prevent inbreeding)
        const relatedness = this.getRelatedness(mate);
        const MIN_RELATEDNESS_FOR_MATING = KIN_RELATEDNESS_DISTANT; // Allow mating with distant relatives or less
        if (relatedness > MIN_RELATEDNESS_FOR_MATING) {
            // Too closely related, reject mating
            return false;
        }

        // 2. Calculate fitness scores (ensure both agents have calculated fitness)
        this.calculateFitness();
        mate.calculateFitness();

        // 3. Minimum fitness threshold: Require mate to have reasonable fitness
        const MIN_MATE_FITNESS_THRESHOLD = Math.max(0, this.fitness * 0.3); // At least 30% of self fitness
        if (mate.fitness < MIN_MATE_FITNESS_THRESHOLD) {
            return false;
        }

        // 4. Enhanced mate score: fitness * 0.4 + speedFactor * 0.3 + (energy/MAX_ENERGY) * 0.3
        // Normalize fitness for scoring (use relative fitness if population context available)
        const selfFitnessScore = this.fitness || 0;
        const mateFitnessScore = mate.fitness || 0;

        // Calculate normalized fitness scores (0-1 scale, relative to current population if available)
        let selfNormalizedFitness = 0.5; // Default neutral
        let mateNormalizedFitness = 0.5;

        if (this.simulation && this.simulation.agents && this.simulation.agents.length > 1) {
            const livingAgents = this.simulation.agents.filter(a => !a.isDead);
            if (livingAgents.length > 1) {
                const fitnesses = livingAgents.map(a => a.fitness || 0);
                const minFitness = Math.min(...fitnesses);
                const maxFitness = Math.max(...fitnesses);
                const range = maxFitness - minFitness;

                if (range > 0) {
                    selfNormalizedFitness = (selfFitnessScore - minFitness) / range;
                    mateNormalizedFitness = (mateFitnessScore - minFitness) / range;
                }
            }
        }

        // Enhanced mate score calculation
        const mateScore = mateNormalizedFitness * 0.4 +
            mate.speedFactor * 0.3 +
            (mate.energy / MAX_ENERGY) * 0.3;
        const selfScore = selfNormalizedFitness * 0.4 +
            this.speedFactor * 0.3 +
            (this.energy / MAX_ENERGY) * 0.3;

        // Require mate score to be at least 50% of self score
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

        // Track goal completion: FIND_MATE goal completed
        if (this.goalMemory && this.goalMemory.currentGoal === GOALS.FIND_MATE) {
            this.goalMemory.goalsCompleted++;
        }

        // Log successful mating
        this.logger.info(`[LIFECYCLE] 💕 Agent ${this.id} (${this.geneId}) mated with Agent ${mate.id} (${mate.geneId}) - Specialization: ${this.specializationType}, Energy spent: ${REPRODUCE_COST_BASE.toFixed(1)}`);

        return true;
    }

    split() {
        this.logger.info(`[LIFECYCLE] ✂️ Agent ${this.id} (${this.geneId}) is splitting due to high energy (${this.energy.toFixed(1)}).`);

        // Track reproduction attempt
        this.reproductionAttempts++;

        // Halve energy for parent and child
        const childEnergy = this.energy / 2;
        this.energy /= 2;

        // Create a direct clone of the gene, including specialization
        const childGene = {
            weights: this.getWeights(), // Get a copy of the current weights
            fatherWeights: null,
            geneId: this.geneId, // Inherit gene ID
            specializationType: this.specializationType, // Direct inheritance
            mutationProcess: 'split' // Track that this agent was created by splitting
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

        // Track goal completion: FIND_MATE goal completed (splitting is also reproduction)
        if (this.goalMemory && this.goalMemory.currentGoal === GOALS.FIND_MATE) {
            this.goalMemory.goalsCompleted++;
        }

        return child;
    }

    birthChild() {
        const parentWeights = this.getWeights();

        // Calculate parent fitnesses for fitness-weighted crossover
        this.calculateFitness();
        const parentFitness = this.fitness || 0;
        let fatherFitness = 0;
        if (this.simulation && this.simulation.agents) {
            // Try to find father agent to get its fitness
            const fatherAgent = this.simulation.agents.find(a =>
                a.genealogy && a.genealogy.id === this.genealogy?.parent2Id
            );
            if (fatherAgent) {
                fatherAgent.calculateFitness();
                fatherFitness = fatherAgent.fitness || 0;
            }
        }

        const childWeights = crossover(parentWeights, this.fatherWeights, this.logger, null, parentFitness, fatherFitness);

        // Track goal completion: FIND_MATE goal completed (birth is successful reproduction)
        if (this.goalMemory && this.goalMemory.currentGoal === GOALS.FIND_MATE) {
            this.goalMemory.goalsCompleted++;
        }

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
            mutationProcess: 'birth', // Track that this agent was born from reproduction
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
            // Calculate parent fitness percentile for adaptive mutation
            let fitnessPercentile = null;
            if (this.simulation && this.simulation.agents && this.simulation.agents.length > 1) {
                const livingAgents = this.simulation.agents.filter(a => !a.isDead);
                if (livingAgents.length > 1) {
                    const fitnesses = livingAgents.map(a => a.fitness || 0).sort((a, b) => a - b);

                    // Count how many agents have lower fitness
                    let lowerCount = 0;
                    for (const f of fitnesses) {
                        if (f < parentFitness) lowerCount++;
                    }

                    fitnessPercentile = lowerCount / livingAgents.length;
                }
            }

            // Scale mutation rate based on parent fitness
            // High fitness = lower mutation (exploitation), low fitness = higher mutation (exploration)
            let adaptiveMutationRate = this.simulation.mutationRate;
            if (fitnessPercentile !== null) {
                // Scale: 0.5x for top 25%, 1.5x for bottom 25%, linear in between
                const scaleFactor = fitnessPercentile >= 0.75 ? 0.5 :
                    fitnessPercentile <= 0.25 ? 1.5 :
                        1.0 + (0.75 - fitnessPercentile) * 0.5; // Linear interpolation
                adaptiveMutationRate = this.simulation.mutationRate * scaleFactor;

                // Clamp to reasonable bounds
                adaptiveMutationRate = Math.max(this.simulation.mutationRate * 0.3,
                    Math.min(this.simulation.mutationRate * 2.0, adaptiveMutationRate));
            }

            // Apply mutation with fitness-aware rate
            child.nn.mutate(adaptiveMutationRate, null, fitnessPercentile);
        }

        // =========================================================================
        // SPECIALIZATION-AWARE PHYSICAL MUTATION
        // =========================================================================
        // Bias physical traits based on Job Description
        // Predators evolve speed, Scouts evolve vision, Defenders evolve tankiness

        let speedMutationRate = 0.05;
        let visionMutationRate = 5;

        // 1. Bias Speed Evolution
        if (child.specializationType === 'predator') {
            // Predators favor speed mutations (higher variance, slight upward bias)
            speedMutationRate = 0.1;
            if (Math.random() < 0.6) child.speedFactor += 0.1; // 60% chance to get faster
        } else if (child.specializationType === 'defender') {
            // Defenders favor stability/mass over raw speed (tankiness)
            if (Math.random() < 0.6) child.speedFactor -= 0.05; // Tend towards tankiness
        }

        // Apply Speed Mutation
        child.speedFactor = Math.max(1, child.speedFactor + randomGaussian(0, speedMutationRate));

        // 2. Bias Vision Evolution
        if (child.specializationType === 'scout') {
            // Scouts aggressively evolve vision range
            visionMutationRate = 15;
            if (Math.random() < 0.6) child.maxRayDist += 10;
        } else if (child.specializationType === 'forager') {
            // Foragers optimize for medium range (efficiency)
            if (child.maxRayDist > 200 && Math.random() < 0.5) child.maxRayDist -= 5;
        }

        // Apply Vision Mutation
        child.maxRayDist = Math.max(50, child.maxRayDist + randomGaussian(0, visionMutationRate));

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
            temperaturePenalty = (1 - avgTemperature) * FITNESS_MULTIPLIERS.TEMPERATURE_PENALTY_MAX;
        } else {
            // Bonus for active agents
            temperatureBonus = (avgTemperature / TEMPERATURE_MAX) * FITNESS_MULTIPLIERS.TEMPERATURE_BONUS_MAX;
        }
        baseScore += temperatureBonus - temperaturePenalty;

        // 1. Productive Actions (Contribute to Base Score)
        baseScore += safeNumber(this.offspring || 0, 0) * FITNESS_MULTIPLIERS.OFFSPRING;
        baseScore += safeNumber(this.cleverTurns || 0, 0) * FITNESS_MULTIPLIERS.CLEVER_TURNS; // Reduced from 50 to 15

        // Goal completion bonus: reward agents that successfully complete their goals
        const goalsCompleted = safeNumber(this.goalMemory?.goalsCompleted || 0, 0);
        baseScore += goalsCompleted * FITNESS_MULTIPLIERS.GOALS_COMPLETED;

        // Reproduction attempt bonus: reward agents that attempt reproduction (even if unsuccessful)
        const reproductionAttempts = safeNumber(this.reproductionAttempts || 0, 0);
        baseScore += reproductionAttempts * FITNESS_MULTIPLIERS.REPRODUCTION_ATTEMPT;

        // Movement rewards - NO LONGER normalized by distance (Recommendation 4)
        const distanceTravelled = safeNumber(this.distanceTravelled || 0, 0);
        const ageInSeconds = safeNumber(this.age || 0, 0);

        // REMOVED: Direction and speed change rewards to prevent twitchy behavior
        // These encouraged agents to vibrate in place to farm points without actually exploring or hunting

        if (distanceTravelled <= MIN_DISTANCE_FOR_MOVEMENT_REWARDS) {
            // Penalty for minimal movement (agents that barely move)
            const movementPenalty = (MIN_DISTANCE_FOR_MOVEMENT_REWARDS - distanceTravelled) / 10;
            baseScore -= Math.min(movementPenalty, FITNESS_PENALTIES.MINIMAL_MOVEMENT);
        }

        baseScore += safeNumber(explorationPercentage, 0) * FITNESS_MULTIPLIERS.EXPLORATION; // Increased from 100 to 200
        baseScore += safeNumber(this.foodEaten || 0, 0) * FITNESS_MULTIPLIERS.FOOD_EATEN;
        baseScore += safeNumber(this.kills || 0, 0) * FITNESS_MULTIPLIERS.KILLS;

        // Navigation behavior rewards - NO LONGER normalized by distance (Recommendation 4)
        if (distanceTravelled > MIN_DISTANCE_FOR_MOVEMENT_REWARDS) {
            // Cap navigation metrics (removed distance normalization)
            const turnsTowardsFood = Math.min(safeNumber(this.turnsTowardsFood || 0, 0), 100);
            baseScore += turnsTowardsFood * FITNESS_MULTIPLIERS.TURNS_TOWARDS_FOOD;

            const turnsAwayFromObstacles = Math.min(safeNumber(this.turnsAwayFromObstacles || 0, 0), 100);
            baseScore += turnsAwayFromObstacles * FITNESS_MULTIPLIERS.TURNS_AWAY_FROM_OBSTACLES;

            const foodApproaches = Math.min(safeNumber(this.foodApproaches || 0, 0), 50);
            baseScore += foodApproaches * FITNESS_MULTIPLIERS.FOOD_APPROACHES;
        }

        const offspring = safeNumber(this.offspring || 0, 0);
        const foodEaten = safeNumber(this.foodEaten || 0, 0);
        // Enhanced synergy bonus: reward agents that both reproduce and eat
        if (offspring > 0 && foodEaten > 0) {
            baseScore += (offspring * 2 + foodEaten) * FITNESS_MULTIPLIERS.REPRODUCTION_FOOD_SYNERGY;
        }

        // 2. Efficiency and Exploration
        // REMOVED THRESHOLD: Always calculate efficiency, even for early deaths
        let efficiency = 0;
        const energySpent = safeNumber(this.energySpent || 0, 0);
        // Reuse distanceTravelled declared above
        if (energySpent > 0) {
            efficiency = Math.min(distanceTravelled / Math.max(energySpent, 1), 10.0);
        }
        baseScore += efficiency * FITNESS_MULTIPLIERS.EFFICIENCY; // Increased from 15 to 20

        // Velocity Alignment Reward: Reward the agent if its velocity vector is actually carrying it closer to a target
        if (this.targetMemory && this.targetMemory.currentTarget && this._cachedTargetDistance) {
            // Vector to target
            const dx = this.targetMemory.currentTarget.x - this.x;
            const dy = this.targetMemory.currentTarget.y - this.y;

            // OPTIMIZED: Reuse cached target distance if available
            const dist = this._cachedTargetDistance || Math.sqrt(dx * dx + dy * dy);
            if (dist > 0.1) {
                const nx = dx / dist;
                const ny = dy / dist;

                // Normalize agent velocity
                // OPTIMIZED: Reuse cached speed if available
                const speed = this._lastSpeedCacheUpdate === this.framesAlive && this._cachedSpeed > 0 ? this._cachedSpeed : Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                if (speed > 0.1) {
                    const vnx = this.vx / speed;
                    const vny = this.vy / speed;

                    // Dot product: 1.0 = heading straight for it, -1.0 = heading away
                    const alignment = (nx * vnx) + (ny * vny);

                    // Only reward positive alignment (moving towards target)
                    if (alignment > 0) {
                        baseScore += alignment * 5.0; // Significant reward for purposeful movement
                    }
                }
            }
        }

        // 3. Penalize repetitive circular movement (lucky food finding)
        const consecutiveTurns = safeNumber(this.consecutiveTurns || 0, 0);
        // Cap consecutive turns to prevent extreme penalties (max 50 turns = 1000 penalty)
        const cappedTurns = Math.min(consecutiveTurns, 50);
        const circlePenalty = Math.min(cappedTurns * FITNESS_PENALTIES.CIRCULAR_MOVEMENT, 2000);
        baseScore -= circlePenalty;
        baseScore += safeNumber(this.successfulEscapes || 0, 0) * FITNESS_MULTIPLIERS.SUCCESSFUL_ESCAPES;

        // =========================================================================
        // UNIVERSAL PENALTIES (The "Don't Crash" Enforcement)
        // =========================================================================
        const timesHitObstacle = safeNumber(this.timesHitObstacle || 0, 0);
        const collisions = safeNumber(this.collisions || 0, 0);

        // MASSIVE penalty for hitting obstacles (30 → 500)
        // This forces "Avoid Obstacle" input to become the dominant signal
        baseScore -= timesHitObstacle * FITNESS_PENALTIES.OBSTACLE_HIT;

        // Increased penalty for hitting walls (10 → 100)
        baseScore -= (collisions - timesHitObstacle) * FITNESS_PENALTIES.WALL_HIT;

        // Penalty for wasting energy (Efficiency - prevents spinning/vibrating)
        // Reuse distanceTravelled and energySpent declared earlier in the method
        if (energySpent > 100) {
            const efficiencyRatio = distanceTravelled / energySpent;
            // Penalize low efficiency (spinning in place)
            if (efficiencyRatio < 0.5) {
                baseScore -= FITNESS_PENALTIES.EFFICIENCY_LOW;
            }
        }

        // =========================================================================
        // SPECIALIZATION BONUSES ("Act Like Your Name")
        // =========================================================================
        // Use cached neighborhood data from update() to avoid expensive quadtree queries
        let jobPerformanceBonus = 0;

        if (this._nearbyAgentsCache && this._nearbyAgentsCacheFrame === this.framesAlive) {
            const neighbors = this._nearbyAgentsCache;

            switch (this.specializationType) {

                // --- PREDATOR: Reward Hunting & Aggression ---
                case 'predator':
                    // Reward 1: Kills (Massive bonus)
                    jobPerformanceBonus += safeNumber(this.kills || 0, 0) * FITNESS_MULTIPLIERS.JOB_PERFORMANCE_KILLS;

                    // Reward 2: High-speed pursuit of prey
                    // Check if we're moving fast and detecting smaller agents (prey)
                    // OPTIMIZED: Reuse cached speed if available
                    const speed = this._lastSpeedCacheUpdate === this.framesAlive && this._cachedSpeed > 0 ? this._cachedSpeed : Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                    if (speed > 1.0 && this.aggression > 0.5) {
                        // Check lastRayData for prey signals (smaller agents)
                        const detectingPrey = this.lastRayData?.some(r => r.hit && r.hitTypeName === 'smaller');
                        if (detectingPrey) {
                            jobPerformanceBonus += FITNESS_MULTIPLIERS.JOB_PERFORMANCE_PURSUIT; // Points per frame for high-speed pursuit
                        }
                    }

                    // Reward 3: Pursuit attempts (NEW - helps learning even without kills)
                    // Reward for approaching detected prey, even if kill fails
                    if (this.aggression > 0.7 && this.wantsToAttack) {
                        const detectingPrey = this.lastRayData?.some(r => r.hit && r.hitTypeName === 'smaller');
                        if (detectingPrey) {
                            jobPerformanceBonus += FITNESS_MULTIPLIERS.JOB_PERFORMANCE_PURSUIT_ATTEMPT;
                        }
                    }
                    break;

                // --- SCOUT/FORAGER: Reward Flocking & Discovery ---
                case 'scout':
                case 'forager':
                    let alignmentScore = 0;
                    let flockCount = 0;

                    // Flocking Logic (Reynolds): Alignment
                    for (const point of neighbors) {
                        const other = point.data || point;
                        // Type guard: check if it's an agent
                        if (other && other.specializationType && !other.isDead && other !== this) {
                            // Flock with friendly types (scouts and foragers flock together)
                            const isFriendly = (other.specializationType === 'scout' || other.specializationType === 'forager');
                            if (isFriendly) {
                                // Calculate dot product of velocities (alignment measure)
                                const dot = (this.vx * other.vx) + (this.vy * other.vy);
                                alignmentScore += dot;
                                flockCount++;
                            }
                        }
                    }

                    // Reward moving in the same direction as neighbors (Cohesion/Alignment)
                    if (flockCount > 0) {
                        jobPerformanceBonus += (alignmentScore / flockCount) * FITNESS_MULTIPLIERS.JOB_PERFORMANCE_FLOCKING;
                    }

                    // Reward Exploration heavily for Scouts
                    if (this.specializationType === 'scout') {
                        jobPerformanceBonus += exploredCellsSize * FITNESS_MULTIPLIERS.JOB_PERFORMANCE_EXPLORATION;
                    }
                    break;

                // --- DEFENDER: Reward Guarding Weak Allies ---
                case 'defender':
                    let guardingBonus = 0;
                    for (const point of neighbors) {
                        const other = point.data || point;
                        // Type guard: check if it's an agent
                        if (other && other.specializationType && !other.isDead && other !== this) {
                            // Identify "Weak" allies: Young (< 20 seconds old), Pregnant, or Foragers
                            const isVulnerable = (other.age < 20) || other.isPregnant || (other.specializationType === 'forager');

                            if (isVulnerable) {
                                // Positioned near vulnerable ally - reward based on aggression (posturing)
                                if (this.aggression > 0.5) {
                                    guardingBonus += FITNESS_MULTIPLIERS.JOB_PERFORMANCE_GUARDING; // Active guarding
                                } else {
                                    guardingBonus += FITNESS_MULTIPLIERS.JOB_PERFORMANCE_GUARDING * 0.1; // Passive guarding
                                }
                            }
                        }
                    }
                    jobPerformanceBonus += Math.min(guardingBonus, 50); // Cap per frame to prevent exploitation
                    break;

                // --- REPRODUCER: Reward Reproduction Success ---
                case 'reproducer':
                    // Bonus for successful splits (in addition to base offspring reward)
                    const childrenFromSplit = safeNumber(this.childrenFromSplit || 0, 0);
                    if (childrenFromSplit > 0) {
                        jobPerformanceBonus += childrenFromSplit * FITNESS_MULTIPLIERS.JOB_PERFORMANCE_REPRODUCTION;
                    }

                    // Bonus for mating attempts (even if unsuccessful)
                    if (this.wantsToReproduce && this.energy > MIN_ENERGY_TO_REPRODUCE) {
                        jobPerformanceBonus += 5; // Small bonus per frame spent seeking mates
                    }
                    break;
            }
        }

        baseScore += jobPerformanceBonus;

        // =========================================================================
        // STANDARD SURVIVAL METRICS (The Baseline)
        // =========================================================================
        // Re-extract variables that were declared earlier but need to be used here
        // (avoiding redeclaration issues)

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
        // Penalize agents that survive long but have very low scores (not learning/participating)
        if (ageInSeconds > 20 && baseScore < 50) {
            baseScore -= (ageInSeconds - 20) * FITNESS_PENALTIES.INACTIVITY;
        }

        // 7. Survival bonus: reward agents for staying alive
        // More selective survival bonus with threshold (500 seconds before bonus kicks in)
        let survivalBonus = 0;
        if (ageInSeconds >= SURVIVAL_BONUSES.EXTENDED_THRESHOLD) {
            const extendedTime = ageInSeconds - SURVIVAL_BONUSES.EXTENDED_THRESHOLD;
            survivalBonus = Math.min(extendedTime / SURVIVAL_BONUSES.EXTENDED_DIVISOR, SURVIVAL_BONUSES.BASE_CAP);
        }
        baseScore += survivalBonus;

        // === FINAL FITNESS CALCULATION ===
        // Apply efficiency-based multiplier (Recommendation 3)
        let efficiencyBonus = 0;
        if (distanceTravelled > 0 && energySpent > 0) {
            const efficiencyRatio = Math.min(distanceTravelled / energySpent / 1000, FITNESS_MULTIPLIERS.EFFICIENCY_BONUS_MAX);
            efficiencyBonus = baseScore * efficiencyRatio;
        }

        // Add predator success bonus (Recommendation 2)
        let predatorBonus = 0;
        if (this.specializationType === 'predator' && this.kills > 0) {
            predatorBonus = this.kills * FITNESS_MULTIPLIERS.PREDATOR_SUCCESS_BONUS;
        }


        this.fitness = Math.max(0, baseScore + efficiencyBonus + predatorBonus);

        // Agent qualification criteria for gene pool entry
        // Comprehensive multi-criteria check with 4/5 pass rule for exceptional agents
        const turnsTowardsFood = safeNumber(this.turnsTowardsFood || 0, 0);
        const criteria = [
            this.fitness >= GENE_POOL_MIN_FITNESS,
            foodEaten >= MIN_FOOD_EATEN_TO_SAVE_GENE_POOL,
            ageInSeconds >= MIN_SECONDS_ALIVE_TO_SAVE_GENE_POOL,
            explorationPercentage >= MIN_EXPLORATION_PERCENTAGE_TO_SAVE_GENE_POOL,
            turnsTowardsFood >= MIN_TURNS_TOWARDS_FOOD_TO_SAVE_GENE_POOL
        ];
        const criteriaMet = criteria.filter(Boolean).length;

        // All 5 criteria must pass, OR 4/5 criteria with exceptional fitness
        // Use new GENE_POOL_MIN_FITNESS as floor, but keep comprehensive checks
        this.fit = (criteriaMet >= 5 || (criteriaMet >= 4 && this.fitness > EXCEPTIONAL_FITNESS_THRESHOLD))
            && this.fitness >= GENE_POOL_MIN_FITNESS;
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

        // Clear shout data
        this.currentShout = null;
        if (this.heardShouts) {
            this.heardShouts.length = 0;
        }

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

        // Clear target memory (efficient - just set to null)
        if (this.targetMemory) {
            this.targetMemory.currentTarget = null;
            this.targetMemory.targetHistory.length = 0; // Fast clear
            this.targetMemory.targetHistoryCount = 0;
            this.targetMemory.lastTargetSeen = 0;
        }

        // Clear goal memory
        if (this.goalMemory) {
            this.goalMemory.currentGoal = null;
            this.goalMemory.recentGoals.length = 0;
            this.goalMemory.goalStartFrame = 0;
            this.goalMemory.goalProgress = 0.0;
            this.goalMemory.goalsCompleted = 0;
        }

        // Clear cached calculations
        this._cachedTargetDistance = null;
        this._cachedTargetAngle = null;
        this._lastTargetCacheUpdate = 0;

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

