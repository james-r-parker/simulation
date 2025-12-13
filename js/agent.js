import { NeuralNetwork } from './neural-network.js';
import {
    BASE_SIZE, ENERGY_TO_SIZE_RATIO, MAX_ENERGY, MIN_ENERGY_TO_REPRODUCE, MIN_AGENT_SIZE,
    REPRODUCE_COST_BASE, CHILD_STARTING_ENERGY, MIN_ENERGY_FOR_SPLITTING,
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
    GENE_POOL_MIN_FITNESS, MIN_FOOD_EATEN_TO_SAVE_GENE_POOL,
    MIN_EXPLORATION_PERCENTAGE_TO_SAVE_GENE_POOL, MIN_TURNS_TOWARDS_FOOD_TO_SAVE_GENE_POOL,
    MIN_SECONDS_ALIVE_TO_SAVE_GENE_POOL, EXCEPTIONAL_FITNESS_THRESHOLD,
    MIN_DISTANCE_FOR_MOVEMENT_REWARDS, MIN_ANGLE_CHANGE_FOR_FITNESS, MIN_SPEED_CHANGE_FOR_FITNESS,
    MIN_NAVIGATION_TURN_FOR_FITNESS, MIN_FOOD_APPROACH_DISTANCE,
    FITNESS_MULTIPLIERS, FITNESS_PENALTIES, SURVIVAL_BONUSES,
    FITNESS_CATEGORIES, SURVIVAL_SCORING, ACTION_SCORING, SPECIALIZATION_SCORING,
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
    SHOUT_FOOD_FOUND_CHANCE, SHOUT_HELP_REQUEST_CHANCE, SHOUT_ATTACK_COORDINATION_CHANCE,
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
            5 +   // Shout inputs (predator alert, food found, help request, mate call, attack coordination)
            1;    // Empirical correction for observed mismatch (191 vs 190)

        // CRITICAL: Do NOT add hiddenSize here - NeuralNetwork constructor adds it automatically
        // The RNN architecture stores weights for both perception AND recurrent hidden state in weights1
        this.inputSize = PERCEPTION_INPUTS;
        this.outputSize = 6;

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
        this.currentStrafe = 0; // Current strafe level (smoothed)
        this.targetStrafe = 0; // Target strafe from neural network
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
        this._cleanedUp = false; // Flag to prevent double cleanup

        // OPTIMIZED: Cache for cos/sin calculations
        this._lastThrustAngle = null;
        this._cachedCosAngle = 0;
        this._cachedSinAngle = 0;

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
            output = [0.5, 0.5, 0, 0, 0, 0.5]; // Default safe values
        }

        // Outputs: (Thrust, Rotation, Sprint, Mate-Search, Attack)
        // Tanh outputs are naturally [-1, 1] - no clamping needed for smoother movement control
        // Only validate for NaN/Infinity to prevent crashes
        const safeValue = (val) => (typeof val === 'number' && isFinite(val)) ? val : 0;

        let rawThrust = safeValue(output[0]);
        const rotationOutput = safeValue(output[1]);
        // Sprint intensity: tanh outputs [-1, 1], but we want [0, 1] for intensity
        // Remap from [-1, 1] to [0, 1] for smoother control
        const sprintIntensity = Math.max(0, Math.min(1, (safeValue(output[2]) + 1) / 2));
        const mateOutput = safeValue(output[3]);
        const attackOutput = safeValue(output[4]);
        const strafeOutput = safeValue(output[5]); // New Strafing Output

        this.wantsToReproduce = mateOutput > 0.8;
        this.wantsToAttack = attackOutput > 0.8;

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

        // Strafing logic (sideways movement) - reduced power (50% of main thrust)
        this.targetStrafe = strafeOutput * geneticMaxThrust * 0.5;

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
        this.currentStrafe += (this.targetStrafe - this.currentStrafe) * ACCELERATION_SMOOTHING;

        // Clamp to max thrust
        if (this.currentThrust > geneticMaxThrust) {
            this.currentThrust = geneticMaxThrust;
        } else if (this.currentThrust < -geneticMaxThrust) {
            this.currentThrust = -geneticMaxThrust;
        }

        // 5. Apply temperature and energy modifiers
        const tempEfficiency = this.getTemperatureEfficiency();
        let desiredThrust = this.currentThrust * tempEfficiency;
        let desiredStrafe = this.currentStrafe * tempEfficiency;

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
            desiredStrafe *= (1.0 + (this.adrenaline * (PREDATOR_ADRENALINE_SPEED_MULT - 1.0)));
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
        // OPTIMIZED: Cache cos/sin calculations if angle hasn't changed
        if (this._lastThrustAngle !== this.angle) {
            this._cachedCosAngle = Math.cos(this.angle);
            this._cachedSinAngle = Math.sin(this.angle);
            this._lastThrustAngle = this.angle;
        }

        // Forward/Backward thrust
        const finalThrustX = this._cachedCosAngle * desiredThrust;
        const finalThrustY = this._cachedSinAngle * desiredThrust;

        // Strafe thrust (perpendicular: -sin, cos)
        // Strafe right (positive) = -sin(angle), cos(angle)
        const finalStrafeX = -this._cachedSinAngle * desiredStrafe;
        const finalStrafeY = this._cachedCosAngle * desiredStrafe;

        this.vx += finalThrustX + finalStrafeX;
        this.vy += finalThrustY + finalStrafeY;

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
            // GPU should always provide lastInputs. If not, skip this update.
            if (!this.lastInputs) {
                // Frame should have been skipped if GPU data wasn't ready
                // This is a safety fallback - skip agent update if data is missing
                return;
            }
            // Run the brain with GPU-provided inputs
            this.think(this.lastInputs);
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
        // Temperature gain is frame-based, so it naturally scales with FPS
        // No normalization needed - if FPS drops, temperature changes slower, which is correct
        this.temperature += speedRatio * TEMPERATURE_GAIN_MOVE;

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

        this.temperature -= passiveLossRate;

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

    // perceiveWorld() method removed - GPU handles ray tracing via gpu-physics.js

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
                    // 'same_size_agent' hit type means potential mate
                    else if (ray.hitTypeName === 'same_size_agent') {
                        offspringProximity = Math.max(offspringProximity, intensity);
                    }
                }
            }
        }
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
        // Foragers emit ink deterministically when attacked or threatened by close predators
        if (this.specializationType === SPECIALIZATION_TYPES.FORAGER) {
            // Trigger 1: Just attacked (within last 5 frames)
            if (this.eventFlags.justAttacked > 0 && this.eventFlags.justAttacked <= 5) {
                spawnPheromone(this.simulation, this.x, this.y, 'ink');
            }
            // Trigger 2: High fear AND detected predator very close (< 50 pixels)
            else if (this.fear > 0.8) {
                const closePredator = this.lastRayData?.some(r =>
                    r.hit &&
                    r.hitTypeName === 'larger' &&
                    r.dist < 50
                );
                if (closePredator) {
                    spawnPheromone(this.simulation, this.x, this.y, 'ink');
                }
            }
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

        // === PREDATOR SPECIALTY: Attack Coordination ===
        // Predators coordinate attacks when pursuing prey
        if (this.specializationType === SPECIALIZATION_TYPES.PREDATOR) {
            if (this.aggression > 0.7 && this.wantsToAttack) {
                const detectingPrey = this.lastRayData?.some(r => r.hit && r.hitTypeName === 'smaller');
                if (detectingPrey && Math.random() < SHOUT_ATTACK_COORDINATION_CHANCE) {
                    this.shout(SHOUT_TYPES.ATTACK_COORDINATION, 1.5);
                    // Visual effect
                    if (this.simulation && this.simulation.renderer) {
                        this.simulation.renderer.addVisualEffect(this, 'shout', this.simulation.gameSpeed, SHOUT_TYPES.ATTACK_COORDINATION);
                    }
                }
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

    /**
     * Determine if agent should attempt asexual splitting.
     * For Reproducers: considers environment (food abundance, safety).
     * For others: only splits at very high energy (old behavior).
     * @returns {boolean} True if conditions are favorablefor splitting
     */
    shouldSplit() {
        // Base requirement: minimum energy
        if (this.energy < MIN_ENERGY_FOR_SPLITTING) {
            return false;
        }

        // Reproducer specialty: strategic splitting
        if (this.specializationType === SPECIALIZATION_TYPES.REPRODUCER) {
            // Strategy 1: Surrounded by food (3+ food items visible)
            let nearbyFoodCount = 0;
            if (this.lastRayData) {
                for (const ray of this.lastRayData) {
                    // foodType is 2.0 in ray hitting logic
                    if (ray.hit && ray.hitType === 2.0) {
                        nearbyFoodCount++;
                    }
                }
            }

            if (nearbyFoodCount >= 3) {
                return true; // Split when surrounded by resources
            }

            // Strategy 2: Safe zone (no predators nearby AND high energy)
            const predatorNearby = this.lastRayData?.some(r =>
                r.hit && r.hitTypeName === 'larger'
            );

            if (!predatorNearby && this.energy > MIN_ENERGY_FOR_SPLITTING * 1.5) {
                return true; // Split when safe and well-fed
            }

            // Fall through to default check below
        }

        // Default: only split at very high energy (old behavior for non-reproducers)
        return this.energy > MIN_ENERGY_FOR_SPLITTING * 2;
    }

    mutate() {
        this.nn.mutate(this.simulation.mutationRate);
        this.weights = this.getWeights();
    }

    /**
     * Calculate Survival Score - staying alive and healthy
     * Focus: Age, temperature efficiency, damage avoidance, energy efficiency
     * @returns {number} Survival score
     */
    calculateSurvivalScore() {
        // FIXED: Use framesAlive instead of ageInSeconds * FPS_TARGET for frame-based calculations
        // This prevents fitness inflation when FPS drops to 1 and then recovers.
        // Previously, when FPS dropped, age (real-time) continued increasing while framesAlive
        // stayed low. On recovery, ageInFrames = age * 60 would be massively inflated,
        // causing collisionFreeFrames to be huge and giving agents unfair fitness bonuses.
        const safeNumber = (val, defaultVal = 0) => {
            if (typeof val !== 'number' || !isFinite(val)) return defaultVal;
            return val;
        };

        let score = 0;
        const ageInSeconds = safeNumber(this.age || 0, 0);
        // Use actual framesAlive instead of ageInSeconds * FPS_TARGET
        const framesAlive = safeNumber(this.framesAlive || 0, 0);

        // 1. Age-based survival reward (use real-time age for consistency)
        score += ageInSeconds * SURVIVAL_SCORING.AGE_MULTIPLIER;

        // 2. Temperature efficiency bonus
        const avgTemperature = this.temperatureSamples > 0 ? this.temperatureSum / this.temperatureSamples : TEMPERATURE_START;
        if (avgTemperature >= TEMPERATURE_OPTIMAL_MIN && avgTemperature <= TEMPERATURE_OPTIMAL_MAX) {
            const optimalRange = TEMPERATURE_OPTIMAL_MAX - TEMPERATURE_OPTIMAL_MIN;
            const centerTemp = (TEMPERATURE_OPTIMAL_MAX + TEMPERATURE_OPTIMAL_MIN) / 2;
            const distanceFromCenter = Math.abs(avgTemperature - centerTemp);
            const efficiency = 1.0 - (distanceFromCenter / (optimalRange / 2));
            score += efficiency * SURVIVAL_SCORING.TEMPERATURE_EFFICIENCY_BONUS;
        }

        // 3. Damage avoidance bonus (reward collision-free time)
        // FIXED: Use actual framesAlive instead of ageInFrames derived from real-time age
        const timesHitObstacle = safeNumber(this.timesHitObstacle || 0, 0);
        const collisions = safeNumber(this.collisions || 0, 0);
        const totalCollisions = timesHitObstacle + (collisions - timesHitObstacle);
        const collisionFreeFrames = Math.max(0, framesAlive - (totalCollisions * 30));
        if (collisionFreeFrames > 200) {
            score += collisionFreeFrames * SURVIVAL_SCORING.DAMAGE_AVOIDANCE_BONUS;
        }

        // 4. Energy efficiency (distance traveled per energy spent)
        const distanceTravelled = safeNumber(this.distanceTravelled || 0, 0);
        const energySpent = safeNumber(this.energySpent || 0, 0);
        if (energySpent > 0 && distanceTravelled > 0) {
            const efficiency = Math.min(distanceTravelled / energySpent, 10.0);
            score += efficiency * SURVIVAL_SCORING.ENERGY_EFFICIENCY_MULTIPLIER;
        }

        return Math.max(0, score);
    }

    /**
     * Calculate Action Score - interacting with the world
     * Focus: Food, exploration, movement, goals
     * @returns {number} Action score
     */
    calculateActionScore() {
        const safeNumber = (val, defaultVal = 0) => {
            if (typeof val !== 'number' || !isFinite(val)) return defaultVal;
            return val;
        };

        let score = 0;

        // 1. Food consumption
        const foodEaten = safeNumber(this.foodEaten || 0, 0);
        score += foodEaten * ACTION_SCORING.FOOD_EATEN;

        // 2. Exploration
        const totalCells = EXPLORATION_GRID_WIDTH * EXPLORATION_GRID_HEIGHT;
        const exploredCellsSize = safeNumber(this.exploredCells?.size || 0, 0);
        const explorationPercentage = (exploredCellsSize / totalCells) * 100;
        score += explorationPercentage * ACTION_SCORING.EXPLORATION_PERCENT;

        // 3. Meaningful movement (distance traveled, excluding circular motion)
        const distanceTravelled = safeNumber(this.distanceTravelled || 0, 0);
        const consecutiveTurns = safeNumber(this.consecutiveTurns || 0, 0);
        if (distanceTravelled > MIN_DISTANCE_FOR_MOVEMENT_REWARDS) {
            // Penalize circular movement by reducing the movement score
            const circularPenalty = Math.min(consecutiveTurns * 10, distanceTravelled * 0.5);
            const effectiveDistance = Math.max(0, distanceTravelled - circularPenalty);
            score += effectiveDistance * ACTION_SCORING.MOVEMENT_DISTANCE;
        }

        // 4. Goal completion
        const goalsCompleted = safeNumber(this.goalMemory?.goalsCompleted || 0, 0);
        score += goalsCompleted * ACTION_SCORING.GOAL_COMPLETION;

        // 5. Navigation quality (turning towards food, away from obstacles)
        if (distanceTravelled > MIN_DISTANCE_FOR_MOVEMENT_REWARDS) {
            const turnsTowardsFood = Math.min(safeNumber(this.turnsTowardsFood || 0, 0), 100);
            const turnsAwayFromObstacles = Math.min(safeNumber(this.turnsAwayFromObstacles || 0, 0), 100);
            const foodApproaches = Math.min(safeNumber(this.foodApproaches || 0, 0), 50);

            score += (turnsTowardsFood + turnsAwayFromObstacles + foodApproaches) * ACTION_SCORING.NAVIGATION_QUALITY;
        }

        return Math.max(0, score);
    }

    /**
     * Calculate Specialization Score - job-specific performance
     * Each agent type has unique scoring criteria
     * @returns {number} Specialization score
     */
    calculateSpecializationScore() {
        const safeNumber = (val, defaultVal = 0) => {
            if (typeof val !== 'number' || !isFinite(val)) return defaultVal;
            return val;
        };

        let score = 0;
        const ageInSeconds = safeNumber(this.age || 0, 0);
        const exploredCellsSize = safeNumber(this.exploredCells?.size || 0, 0);

        switch (this.specializationType) {
            case SPECIALIZATION_TYPES.PREDATOR: {
                // Track damage dealt (estimate from kills and attacks)
                const kills = safeNumber(this.kills || 0, 0);
                const estimatedDamage = kills * 100; // Rough estimate
                score += estimatedDamage * SPECIALIZATION_SCORING.PREDATOR_DAMAGE_DEALT;
                score += kills * SPECIALIZATION_SCORING.PREDATOR_KILLS;

                // Pursuit time: frames spent with high aggression and speed
                // This is an approximation - we don't currently track exact pursuit frames
                if (this.aggression > 0.5 && this.wantsToAttack) {
                    score += SPECIALIZATION_SCORING.PREDATOR_PURSUIT_TIME;
                }
                break;
            }

            case SPECIALIZATION_TYPES.FORAGER: {
                // Food efficiency: energy gained per food eaten
                const foodEaten = safeNumber(this.foodEaten || 0, 0);
                if (foodEaten > 0) {
                    const avgEnergyPerFood = this.energy / Math.max(foodEaten, 1);
                    score += avgEnergyPerFood * SPECIALIZATION_SCORING.FORAGER_FOOD_EFFICIENCY;
                }

                // Gathering rate: food per minute
                if (ageInSeconds > 0) {
                    const foodPerMinute = (foodEaten / ageInSeconds) * 60;
                    score += foodPerMinute * SPECIALIZATION_SCORING.FORAGER_GATHERING_RATE;
                }

                // Information sharing bonus (shouts when finding food)
                // Approximation based on food eaten and shout chance
                const estimatedShouts = foodEaten * 0.1; // Rough estimate
                score += estimatedShouts * SPECIALIZATION_SCORING.FORAGER_SHARING_BONUS;
                break;
            }

            case SPECIALIZATION_TYPES.SCOUT: {
                // Unique sectors visited
                score += exploredCellsSize * SPECIALIZATION_SCORING.SCOUT_UNIQUE_SECTORS;

                // Information sharing (shouts made)
                // Scouts shout more frequently - estimate based on exploration
                const estimatedShouts = exploredCellsSize * 0.05;
                score += estimatedShouts * SPECIALIZATION_SCORING.SCOUT_INFORMATION_SHARING;

                // Vision utilization: bonus for using long-range sensors
                // Use maxRayDist as a proxy for vision usage
                if (this.maxRayDist > 300) {
                    const visionBonus = (this.maxRayDist - 300) / 10;
                    score += visionBonus * SPECIALIZATION_SCORING.SCOUT_VISION_UTILIZATION;
                }
                break;
            }

            case SPECIALIZATION_TYPES.DEFENDER: {
                // FIXED: Use actual framesAlive instead of ageInSeconds * FPS_TARGET
                // This prevents fitness inflation when FPS drops and recovers
                const framesAlive = safeNumber(this.framesAlive || 0, 0);

                // Damage mitigated: estimate from defensive positioning
                // Defenders have damage reduction - estimate mitigation from aggression time
                const estimatedMitigation = this.aggression > 0.5 ? framesAlive * 0.1 : 0;
                score += estimatedMitigation * SPECIALIZATION_SCORING.DEFENDER_DAMAGE_MITIGATED;

                // Time near allies: estimate from frames alive with aggression
                // This is simplified - actual ally proximity would need cached data
                const estimatedGuardingFrames = framesAlive * 0.3;
                score += estimatedGuardingFrames * SPECIALIZATION_SCORING.DEFENDER_TIME_NEAR_ALLIES;

                // Predator interception: estimate from confrontations
                const estimatedInterceptions = safeNumber(this.kills || 0, 0);
                score += estimatedInterceptions * SPECIALIZATION_SCORING.DEFENDER_PREDATOR_INTERCEPTION;

                // Patrol bonus: time spent moving in territory
                if (this.isInTerritory) {
                    const patrolFrames = framesAlive * 0.5;
                    score += patrolFrames * SPECIALIZATION_SCORING.DEFENDER_PATROL_BONUS;
                }
                break;
            }

            case SPECIALIZATION_TYPES.REPRODUCER: {
                // Offspring count
                const offspring = safeNumber(this.offspring || 0, 0);
                score += offspring * SPECIALIZATION_SCORING.REPRODUCER_OFFSPRING;

                // Offspring survival: simplified - assume some offspring survived
                // In reality would need to track actual offspring survival
                const estimatedSurvivors = offspring * 0.3; // 30% survival estimate
                score += estimatedSurvivors * SPECIALIZATION_SCORING.REPRODUCER_OFFSPRING_SURVIVAL;

                // Split bonus
                const childrenFromSplit = safeNumber(this.childrenFromSplit || 0, 0);
                score += childrenFromSplit * SPECIALIZATION_SCORING.REPRODUCER_SPLIT_BONUS;
                break;
            }
        }

        return Math.max(0, score);
    }

    calculateFitness() {
        // NEW: 3-Category Fitness System
        // Total Fitness = (Survival × 0.3) + (Action × 0.3) + (Specialization × 0.4)

        // Calculate the 3 component scores
        const survivalScore = this.calculateSurvivalScore();
        const actionScore = this.calculateActionScore();
        const specializationScore = this.calculateSpecializationScore();

        // Apply category weights
        const weightedSurvival = survivalScore * FITNESS_CATEGORIES.SURVIVAL_WEIGHT;
        const weightedAction = actionScore * FITNESS_CATEGORIES.ACTION_WEIGHT;
        const weightedSpecialization = specializationScore * FITNESS_CATEGORIES.SPECIALIZATION_WEIGHT;

        // Calculate total fitness
        this.fitness = weightedSurvival + weightedAction + weightedSpecialization;

        // Store breakdown for debugging/UI (will be used by getFitnessBreakdown)
        this._fitnessBreakdown = {
            survival: survivalScore,
            action: actionScore,
            specialization: specializationScore,
            weightedSurvival,
            weightedAction,
            weightedSpecialization,
            total: this.fitness
        };

        // Gene pool qualification - IMPROVED: Weighted criteria instead of all-or-nothing
        const safeNumber = (val, defaultVal = 0) => {
            if (typeof val !== 'number' || !isFinite(val)) return defaultVal;
            return val;
        };

        const totalCells = EXPLORATION_GRID_WIDTH * EXPLORATION_GRID_HEIGHT;
        const exploredCellsSize = safeNumber(this.exploredCells?.size || 0, 0);
        const explorationPercentage = (exploredCellsSize / totalCells) * 100;
        const foodEaten = safeNumber(this.foodEaten || 0, 0);
        const ageInSeconds = safeNumber(this.age || 0, 0);
        const turnsTowardsFood = safeNumber(this.turnsTowardsFood || 0, 0);

        // Weighted criteria (6 points possible, need 4 to qualify)
        const criteriaWeight = (
            (this.fitness >= GENE_POOL_MIN_FITNESS ? 2 : 0) +     // Fitness is worth 2 points
            (foodEaten >= MIN_FOOD_EATEN_TO_SAVE_GENE_POOL ? 1 : 0) +
            (ageInSeconds >= MIN_SECONDS_ALIVE_TO_SAVE_GENE_POOL ? 1 : 0) +
            (explorationPercentage >= MIN_EXPLORATION_PERCENTAGE_TO_SAVE_GENE_POOL ? 1 : 0) +
            (turnsTowardsFood >= MIN_TURNS_TOWARDS_FOOD_TO_SAVE_GENE_POOL ? 1 : 0)
        );

        // Need 4/6 points to qualify (or exceptional fitness as fallback)
        this.fit = criteriaWeight >= 4 || this.fitness > EXCEPTIONAL_FITNESS_THRESHOLD;
    }

    /**
     * Get detailed fitness breakdown for UI display
     * @returns {Object} Fitness breakdown with all categories
     */
    getFitnessBreakdown() {
        // Ensure fitness is calculated
        if (!this._fitnessBreakdown) {
            this.calculateFitness();
        }

        return {
            survival: {
                score: this._fitnessBreakdown.survival,
                weighted: this._fitnessBreakdown.weightedSurvival,
                percentage: (this._fitnessBreakdown.weightedSurvival / this.fitness * 100).toFixed(1)
            },
            action: {
                score: this._fitnessBreakdown.action,
                weighted: this._fitnessBreakdown.weightedAction,
                percentage: (this._fitnessBreakdown.weightedAction / this.fitness * 100).toFixed(1)
            },
            specialization: {
                score: this._fitnessBreakdown.specialization,
                weighted: this._fitnessBreakdown.weightedSpecialization,
                percentage: (this._fitnessBreakdown.weightedSpecialization / this.fitness * 100).toFixed(1)
            },
            total: this.fitness,
            fit: this.fit
        };
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

