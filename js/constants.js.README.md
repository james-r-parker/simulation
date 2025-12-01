# constants.js Documentation

## Purpose

Centralized storage of all simulation constants and configuration values. This ensures consistency across the codebase and makes balancing adjustments easy. All constants are organized into logical groups with comprehensive JSDoc-style documentation.

## Organization

Constants are organized into the following major sections:

1. **Simulation Configuration** - World dimensions, FPS, game speed, memory thresholds
2. **Agent Physical Properties** - Size, appearance, energy system
3. **Agent Movement Physics** - Thrust, rotation, velocity, momentum, sprint mechanics
4. **Agent Energy Management** - Passive loss, movement costs, temperature system
5. **Agent Reproduction** - Timing, costs, cooldowns, maturation
6. **Agent Neural Network & Evolution** - Memory, goals, mutation, evolution parameters
7. **Agent Fitness & Behavior** - Fitness thresholds, movement rewards, navigation tracking
8. **Agent Specialization** - Types, configurations, visual appearance
9. **Food System** - Spawning, energy values, decay, visual properties
10. **Obstacle System** - Generation, placement, interaction
11. **Pheromone System** - Chemical trail system for communication
12. **Physics & Collision** - Dampening, separation, combat mechanics
13. **Neural Network Evolution** - Initialization, mutation strategies, crossover
14. **Gene Pool Management** - Qualification thresholds, storage limits, validation
15. **Seasonal Environmental Cycle** - Temperature modifiers, reproduction bonuses, food scarcity
16. **Nutrient Cycling & Decomposition** - Fertile zones from dead agents
17. **Kin Recognition & Social Behavior** - Relatedness calculations, social interactions
18. **Rendering & Visual** - Colors, materials, post-processing, camera settings
19. **UI & Performance** - Toast durations, timeouts, performance limits
20. **Math & Utilities** - Pre-calculated values, exploration grid

## Complete Constant List

### Simulation Configuration

- `WORLD_WIDTH = 14400` - Total width of the simulation world in pixels
- `WORLD_HEIGHT = 8100` - Total height of the simulation world in pixels
- `FPS_TARGET = 60` - Target frames per second for smooth animation and physics updates
- `AUTO_ADJUST_COOLDOWN = 15000` - Minimum frames between automatic performance adjustments (15 seconds at 60 FPS)
- `MIN_AGENTS = 5` - Minimum number of agents that must exist at any time
- `MAX_AGENTS_LIMIT = 100` - Hard upper limit on total agent population
- `MIN_GAME_SPEED = 0.5` - Minimum allowed game speed multiplier (slowest playback)
- `MAX_GAME_SPEED = 10` - Maximum allowed game speed multiplier (fastest playback)
- `MEMORY_PRESSURE_THRESHOLD = 150 * 1024 * 1024` - Memory usage threshold that triggers cleanup (150MB)
- `SEASON_LENGTH = 3600` - Number of frames per season phase (60 seconds at 60 FPS)

### Agent Physical Properties

- `BASE_SIZE = 25` - Default visual radius of agents in pixels
- `MIN_AGENT_SIZE = 20` - Minimum visual size agents can shrink to, regardless of energy level
- `ENERGY_TO_SIZE_RATIO = 250` - How much energy affects agent size (higher energy = larger size)
- `INITIAL_AGENT_ENERGY = 2500` - Starting energy for newly spawned agents
- `MAX_ENERGY = 25000` - Maximum energy an agent can accumulate
- `MIN_ENERGY_TO_REPRODUCE = 250` - Minimum energy required to attempt reproduction
- `REPRODUCE_COST_BASE = 15` - Base energy cost for reproduction attempts
- `CHILD_STARTING_ENERGY = 1750` - Energy given to newborn agents
- `OBESITY_THRESHOLD_ENERGY = 15000` - Energy level above which agents suffer obesity penalties
- `OBESITY_ENERGY_TAX_DIVISOR = 2000` - Divisor for calculating obesity energy tax
- `LOW_ENERGY_THRESHOLD = 100` - Energy level that triggers low-energy visual warnings

### Agent Movement Physics

- `MAX_THRUST = 0.5` - Maximum acceleration force agents can apply per frame
- `MAX_ROTATION = 0.1` - Maximum turning speed in radians per frame
- `MAX_VELOCITY = 8` - Maximum speed an agent can reach in pixels per frame
- `SPRINT_BONUS_THRUST = 0.5` - Additional thrust when sprinting
- `SPRINT_COST_PER_FRAME = 0.05` - Energy cost per frame when sprinting
- `SPRINT_THRESHOLD = 0.9` - Neural network output threshold to trigger sprinting (legacy)
- `FEAR_SPRINT_BONUS = 0.5` - Extra thrust bonus when fleeing from threats
- `THRUST_DEADZONE = 0.05` - Reduced deadzone for finer speed control
- `ACCELERATION_SMOOTHING = 0.35` - How quickly thrust ramps up towards target (0-1, higher = faster)
- `DECELERATION_RATE_NORMAL = 0.12` - Normal deceleration rate when reducing thrust
- `DECELERATION_RATE_BRAKING = 0.25` - Active braking deceleration rate
- `DECELERATION_RATE_EMERGENCY = 0.4` - Emergency stop deceleration rate
- `ROTATION_MOMENTUM = 0.75` - Rotation carryover factor (how much rotation persists)
- `ROTATION_EFFICIENCY_AT_MAX_SPEED = 0.7` - Rotation efficiency at max speed (30% reduction)
- `SPRINT_BONUS_MULTIPLIER = 0.5` - Sprint intensity multiplier (1.0 to 1.5x max thrust)
- `SPRINT_COST_INTENSITY_THRESHOLD = 0.3` - Minimum sprint intensity to cost energy
- `VELOCITY_MOMENTUM = 0.85` - Velocity carryover factor
- `DAMPENING_FACTOR = 0.95` - Velocity reduction factor applied each frame (friction)
- `BRAKING_FRICTION = 0.90` - Stronger friction applied when agent is not thrusting

### Agent Energy Management

- `PASSIVE_LOSS = 0.01` - Energy lost per frame just by existing (metabolic cost)
- `MOVEMENT_COST_MULTIPLIER = 0.02` - Energy cost multiplier for movement (velocity * this)
- `ROTATION_COST_MULTIPLIER = 0.1` - Energy cost multiplier for rotation (rotation speed * this)
- `AGENT_SIZE_ENERGY_LOSS_MULTIPLIER = 0.00025` - Energy loss per frame based on agent size
- `TEMPERATURE_MAX = 100` - Maximum temperature value
- `TEMPERATURE_MIN = 0` - Minimum temperature value
- `TEMPERATURE_START = 50` - Starting temperature (closer to optimal range center)
- `TEMPERATURE_GAIN_MOVE = 0.025` - Temperature gain per frame at max speed
- `TEMPERATURE_GAIN_EAT = 2` - Temperature gain when eating
- `TEMPERATURE_LOSS_PASSIVE = 0.015` - Temperature loss per frame
- `TEMPERATURE_PASSIVE_LOSS_FACTOR = 7.0` - Max multiplier for passive energy loss at 0 temperature
- `TEMPERATURE_OPTIMAL_MIN = 40` - Minimum temperature for optimal performance
- `TEMPERATURE_OPTIMAL_MAX = 65` - Maximum temperature for optimal performance
- `TEMPERATURE_COLD_STRESS_THRESHOLD = 30` - Temperature below which severe cold stress occurs
- `TEMPERATURE_HEAT_STRESS_THRESHOLD = 85` - Temperature above which severe heat stress occurs
- `TEMPERATURE_COLD_MODERATE_THRESHOLD = 40` - Temperature below which moderate cold effects occur
- `TEMPERATURE_HEAT_MODERATE_THRESHOLD = 70` - Temperature above which moderate heat effects occur
- `TEMPERATURE_EFFICIENCY_OPTIMAL = 1.0` - Movement efficiency at optimal temperatures
- `TEMPERATURE_EFFICIENCY_COLD_MODERATE = 0.7` - Movement efficiency in moderate cold
- `TEMPERATURE_EFFICIENCY_HEAT_MODERATE = 0.8` - Movement efficiency in moderate heat
- `TEMPERATURE_EFFICIENCY_COLD_SEVERE = 0.3` - Movement efficiency in severe cold
- `TEMPERATURE_EFFICIENCY_HEAT_SEVERE = 0.4` - Movement efficiency in severe heat
- `TEMPERATURE_REPRODUCTION_SUPPRESSION_EXTREME = 0.3` - Chance of reproduction suppression in extreme temperatures

### Agent Reproduction

- `REPRODUCTION_COOLDOWN_FRAMES = 300` - Frames an agent must wait between reproduction attempts (5 seconds)
- `PREGNANCY_DURATION_FRAMES = 480` - Frames required for pregnancy to complete (8 seconds)
- `MATURATION_AGE_FRAMES = 600` - Minimum age in frames before agents can reproduce (10 seconds)
- `RESPAWN_DELAY_FRAMES = 0` - Frames to wait before respawning dead agents

### Agent Neural Network & Evolution

- `AGENT_MEMORY_FRAMES = 60` - Number of previous frames stored for temporal decision making (~1 second at 60fps)
- `TARGET_ATTENTION_SPAN_FRAMES = 180` - Frames to remember target after losing sight (~3 seconds at 60fps)
- `GOALS` - Goal tracking constants (numeric for performance): FIND_FOOD (0), FIND_MATE (1), AVOID_DANGER (2), REST (3)
- `BASE_MUTATION_RATE = 0.1` - Base probability of gene mutations during reproduction
- `AGENT_SPEED_FACTOR_BASE = 2` - Base multiplier for agent movement speed calculations
- `AGENT_SPEED_FACTOR_VARIANCE = 3` - Random variance range for speed factor inheritance

### Agent Fitness & Behavior

- `DIRECTION_CHANGE_FITNESS_FACTOR = 2.0` - Multiplier for fitness scoring based on directional changes
- `MIN_DISTANCE_FOR_MOVEMENT_REWARDS = 100` - Minimum distance traveled to get movement rewards
- `MIN_ANGLE_CHANGE_FOR_FITNESS = 0.1` - Minimum angle change in radians to count for directionChanged (~5.7 degrees)
- `MIN_SPEED_CHANGE_FOR_FITNESS = 0.15` - Minimum speed change to count for speedChanged
- `MIN_NAVIGATION_TURN_FOR_FITNESS = 0.15` - Minimum turn angle for navigation rewards (~8.6 degrees)
- `MIN_FOOD_APPROACH_DISTANCE = 5` - Minimum distance improvement to count as food approach

### Agent Specialization

- `SPECIALIZATION_TYPES` - Object defining 5 specialization types:
  - `FORAGER = 'forager'` - Food-finding specialists
  - `PREDATOR = 'predator'` - Hunting specialists
  - `REPRODUCER = 'reproducer'` - Breeding specialists
  - `SCOUT = 'scout'` - Exploration specialists
  - `DEFENDER = 'defender'` - Territory defense specialists

- `AGENT_CONFIGS` - Configuration object mapping specialization types to:
  - `color` - Hex color code for the specialization
  - `numSensorRays` - Number of sensor rays (16-24)
  - `maxRayDist` - Maximum ray distance (250-400)
  - `hiddenSize` - Hidden layer size (25-38)
  - `description` - Human-readable description

### Food System

- `FOOD_SPAWN_CAP = 300` - Maximum number of food items that can exist simultaneously
- `FOOD_SPAWN_RATE = 0.12` - Probability per frame of attempting to spawn new food
- `HIGH_VALUE_FOOD_CHANCE = 0.1` - Probability that spawned food will be high-value type
- `FOOD_SPAWN_NEAR_AGENTS_CHANCE = 0.3` - Probability that food spawns near living agents
- `FOOD_SPAWN_NEAR_AGENT_DISTANCE_MIN = 200` - Minimum distance from agent to spawn food
- `FOOD_SPAWN_NEAR_AGENT_DISTANCE_MAX = 400` - Maximum distance from agent to spawn food
- `FOOD_ENERGY_NORMAL_BASE = 500` - Base energy value of normal food
- `FOOD_ENERGY_NORMAL_VARIANCE = 20` - Random variance in normal food energy (± this amount)
- `FOOD_ENERGY_HIGH_BASE = 1000` - Base energy value of high-value food
- `FOOD_ENERGY_HIGH_VARIANCE = 50` - Random variance in high-value food energy (± this amount)
- `FOOD_SIZE_NORMAL = 20` - Visual radius of normal food in pixels
- `FOOD_SIZE_HIGH = 30` - Visual radius of high-value food in pixels
- `FOOD_SIZE_MIN_NORMAL = 8` - Minimum size normal food can shrink to during decay
- `FOOD_SIZE_MIN_HIGH = 12` - Minimum size high-value food can shrink to during decay
- `FOOD_ROT_RATE_BASE = 0.002` - Base rate at which food loses energy per frame
- `FOOD_ROT_RATE_VARIANCE = 0.003` - Random variance in food rot rate
- `FOOD_MAX_AGE_BASE = 10000` - Base maximum age of food before it disappears (in frames)
- `FOOD_MAX_AGE_VARIANCE = 1000` - Random variance in food maximum age (± this amount)

### Obstacle System

- `OBSTACLE_COUNT = 25` - Actual number of obstacles spawned in the world
- `OBSTACLE_MIN_RADIUS = 40` - Minimum radius of obstacles in pixels
- `OBSTACLE_MAX_RADIUS = 120` - Maximum radius of obstacles in pixels
- `OBSTACLE_MIN_DISTANCE = 350` - Minimum distance obstacles must maintain from each other
- `OBSTACLE_SPAWN_MARGIN = 250` - Distance from world edges where obstacles cannot spawn
- `OBSTACLE_INFLUENCE_RADIUS = 600` - Distance at which obstacles affect agent behavior
- `OBSTACLE_MAX_SPEED = 0.3` - Maximum movement speed of obstacles
- `OBSTACLE_SEGMENTS = 8` - Number of segments in obstacle path
- `GPU_MAX_OBSTACLES = 200` - Maximum obstacles GPU can handle (OBSTACLE_COUNT * OBSTACLE_SEGMENTS)
- `OBSTACLE_COLLISION_PENALTY = 50` - Energy damage taken when colliding with obstacles
- `OBSTACLE_HIDING_RADIUS = 75` - Distance within which agents can hide behind obstacles

### Pheromone System

- `MAX_PHEROMONES_TOTAL = 2000` - Total pheromone markers allowed in the world
- `MAX_PHEROMONES_PER_TYPE = 500` - Maximum markers per pheromone type (food, danger, etc.)
- `MAX_PHEROMONES_PER_AREA = 5` - Maximum markers allowed in any given area
- `PHEROMONE_RADIUS_CHECK = 50` - Search radius when checking for existing pheromones
- `PHEROMONE_RADIUS = 60` - Visual radius of pheromone markers in pixels
- `PHEROMONE_DIAMETER = 120` - Calculated diameter for convenience (PHEROMONE_RADIUS * 2)
- `PHEROMONE_FADE_RATE = 0.005` - Rate at which pheromones lose intensity per frame
- `DANGER_PHEROMONE_THRESHOLD = 30` - Intensity threshold above which pheromones signal danger

### Physics & Collision

- `COLLISION_SEPARATION_STRENGTH = 1.0` - Force applied to separate overlapping agents
- `COLLISION_NUDGE_STRENGTH = 0.05` - Small random force to prevent collision sticking
- `COLLISION_ENERGY_LOSS_CAP = 1.0` - Maximum energy considered for collision damage calculation
- `COLLISION_ENERGY_LOSS_PERCENTAGE = 0.1` - Percentage of energy lost in collisions
- `COLLISION_QUERY_BUFFER = 20` - Buffer distance added to collision queries for movement between frames
- `MAX_AGENT_SIZE_ESTIMATE = 100` - Reasonable estimate for collision queries
- `PREDATOR_SIZE_RATIO_THRESHOLD = 1.1` - Size ratio required for predator behavior (10% larger)
- `PREY_SIZE_RATIO_THRESHOLD = 0.909` - Size ratio threshold for prey vulnerability (10% smaller)
- `COLLISION_SEPARATION_MULTIPLIER = 0.5` - Multiplier for collision separation calculations
- `BITE_SIZE = 5` - Energy amount stolen when one agent bites another
- `BOUNCE_ENERGY_LOSS = 0.8` - Velocity reduction when agents bounce off each other
- `FOOD_EATEN_INCREMENT = 0.1` - Amount added to foodEaten counter when agents eat
- `WALL_COLLISION_DAMAGE = 50` - Energy damage taken when hitting world boundaries
- `EDGE_BOUNCE_DAMPING = 0.5` - Velocity reduction factor when bouncing off edges
- `TERRITORY_RADIUS = 200` - Default territory size for agents
- `RAY_DISTANCE_THRESHOLD = 0.001` - Minimum distance threshold for ray intersections
- `DIVISION_BY_ZERO_THRESHOLD = 0.0001` - Minimum value to avoid division by zero

### Neural Network Evolution

- `NN_WEIGHT_INIT_STD_DEV = 0.1` - Standard deviation for random weight initialization
- `NN_MUTATION_STD_DEV_RATIO = 0.3` - Mutation strength as ratio of initial weight std dev
- `NN_MACRO_MUTATION_CHANCE = 0.02` - Probability of major structural mutations
- `MUTATION_STRATEGY_GAUSSIAN = 'gaussian'` - Standard Gaussian mutation (exploration)
- `MUTATION_STRATEGY_CAUCHY = 'cauchy'` - Cauchy distribution (longer tails, better for escaping local optima)
- `MUTATION_STRATEGY_POLYNOMIAL = 'polynomial'` - Polynomial mutation (self-adaptive)
- `MUTATION_STRATEGY_DEFAULT = 'gaussian'` - Default mutation strategy
- `ADAPTIVE_MUTATION_ENABLED = true` - Enable fitness-based adaptive mutation rates
- `ADAPTIVE_MUTATION_MIN_RATE = 0.04` - Minimum mutation rate (4% for high-fitness agents)
- `ADAPTIVE_MUTATION_MAX_RATE = 0.15` - Maximum mutation rate (15% for low-fitness agents)
- `ADAPTIVE_MUTATION_FITNESS_PERCENTILE_LOW = 0.25` - Below this percentile = high mutation
- `ADAPTIVE_MUTATION_FITNESS_PERCENTILE_HIGH = 0.75` - Above this percentile = low mutation
- `CAUCHY_SCALE_PARAMETER = 0.1` - Scale parameter for Cauchy distribution
- `POLYNOMIAL_DISTRIBUTION_INDEX = 20` - Distribution index for polynomial mutation (higher = more local)
- `NN_WEIGHT_CLAMP_MIN = -3` - Minimum allowed neural network weight value
- `NN_WEIGHT_CLAMP_MAX = 3` - Maximum allowed neural network weight value
- `CROSSOVER_TYPE_UNIFORM = 'uniform'` - Per-weight random selection from parents
- `CROSSOVER_TYPE_ONE_POINT = 'one_point'` - Single split point
- `CROSSOVER_TYPE_MULTI_POINT = 'multi_point'` - Multiple split points
- `CROSSOVER_TYPE_FITNESS_WEIGHTED = 'fitness_weighted'` - Blend based on parent fitness
- `CROSSOVER_TYPE_SBX = 'sbx'` - Simulated Binary Crossover (real-valued optimization)
- `CROSSOVER_TYPE_DEFAULT = 'uniform'` - Default crossover strategy
- `UNIFORM_CROSSOVER_PROBABILITY = 0.5` - Probability of selecting from parent A in uniform crossover
- `MULTI_POINT_CROSSOVER_POINTS = 3` - Number of split points for multi-point crossover
- `FITNESS_WEIGHTED_CROSSOVER_ALPHA = 0.6` - Blending factor for fitness-weighted crossover (0.6 = 60% from better parent)
- `SBX_DISTRIBUTION_INDEX = 20` - Distribution index for SBX (higher = more exploration)
- `ELITE_FITNESS_WEIGHTED_CROSSOVER_CHANCE = 0.3` - 30% chance for elite parents to use fitness-weighted crossover
- `SELECTION_TYPE_FITNESS_PROPORTIONAL = 'fitness_proportional'` - Roulette wheel selection
- `SELECTION_TYPE_TOURNAMENT = 'tournament'` - Tournament selection
- `SELECTION_TYPE_RANK_BASED = 'rank_based'` - Rank-based selection
- `SELECTION_TYPE_RANDOM = 'random'` - Random selection
- `SELECTION_TYPE_DEFAULT_PARENT1 = 'tournament'` - Default for parent 1
- `SELECTION_TYPE_DEFAULT_PARENT2 = 'fitness_proportional'` - Default for parent 2
- `TOURNAMENT_SIZE = 4` - Number of candidates in tournament selection
- `TOURNAMENT_PROBABILITY = 0.7` - Probability of selecting best in tournament (0.7 = 70% chance)
- `RANK_BASED_SELECTION_PRESSURE = 2.0` - Selection pressure for rank-based (higher = more bias toward top)
- `DIVERSITY_AWARE_SELECTION_ENABLED = true` - Enable diversity checks to avoid inbreeding
- `MIN_GENETIC_DISTANCE = 0.1` - Minimum genetic distance required between parents (0-1 scale)

### Gene Pool Management

- `MIN_FITNESS_TO_SAVE_GENE_POOL = 9000` - Minimum fitness score required to save agent genes
- `MAX_AGENTS_TO_SAVE_PER_GENE_POOL = 10` - Maximum agents saved per gene pool generation
- `MIN_FOOD_EATEN_TO_SAVE_GENE_POOL = 5` - Minimum food items consumed to qualify
- `MIN_FRAMES_ALIVE_TO_SAVE_GENE_POOL = 2000` - Minimum lifespan in frames to qualify
- `MIN_SECONDS_ALIVE_TO_SAVE_GENE_POOL = 33.33` - Minimum lifespan in seconds (calculated from frames)
- `MIN_EXPLORATION_PERCENTAGE_TO_SAVE_GENE_POOL = 1.5` - Minimum world exploration percentage required
- `MIN_TURNS_TOWARDS_FOOD_TO_SAVE_GENE_POOL = 5` - Minimum successful food-seeking behaviors
- `MAX_GENE_POOLS = 500` - Maximum number of gene pools stored in database
- `VALIDATION_REQUIRED_RUNS = 3` - Number of test runs required for validation
- `MAX_VALIDATION_QUEUE_SIZE = 50` - Maximum agents waiting for validation
- `VALIDATION_AGENT_ENERGY = 3000` - Energy given to validation agents (boosted for fairer testing)
- `EXCEPTIONAL_FITNESS_THRESHOLD = 10000` - Fitness threshold for partial credit system (4/5 criteria with exceptional fitness)

### Seasonal Environmental Cycle

- `SEASON_SPRING_TEMP_MODIFIER = -5` - Temperature modifier during spring
- `SEASON_SUMMER_TEMP_MODIFIER = 15` - Temperature modifier during summer
- `SEASON_FALL_TEMP_MODIFIER = 5` - Temperature modifier during fall
- `SEASON_WINTER_TEMP_MODIFIER = -15` - Temperature modifier during winter
- `SEASON_SPRING_REPRODUCTION_BONUS = 1.5` - Reproduction rate multiplier in spring (breeding season)
- `SEASON_SUMMER_REPRODUCTION_BONUS = 1.2` - Reproduction rate multiplier in summer
- `SEASON_FALL_REPRODUCTION_BONUS = 0.7` - Reproduction rate multiplier in fall
- `SEASON_WINTER_REPRODUCTION_BONUS = 0.3` - Reproduction rate multiplier in winter
- `SEASON_SUMMER_ENERGY_DRAIN = 1.3` - Energy drain multiplier in summer
- `SEASON_FALL_ENERGY_DRAIN = 1.1` - Energy drain multiplier in fall
- `SEASON_WINTER_ENERGY_DRAIN = 1.8` - Energy drain multiplier in winter
- `SEASON_SPRING_MUTATION_MULTIPLIER = 1.1` - Mutation rate multiplier in spring
- `SEASON_SUMMER_MUTATION_MULTIPLIER = 1.0` - Mutation rate multiplier in summer
- `SEASON_FALL_MUTATION_MULTIPLIER = 1.0` - Mutation rate multiplier in fall
- `SEASON_WINTER_MUTATION_MULTIPLIER = 0.8` - Mutation rate multiplier in winter
- `SEASON_SPRING_FOOD_SCARCITY = 1.2` - Food abundance after winter
- `SEASON_SUMMER_FOOD_SCARCITY = 1.0` - Normal food availability in summer
- `SEASON_FALL_FOOD_SCARCITY = 0.8` - Resources becoming scarce in fall
- `SEASON_WINTER_FOOD_SCARCITY = 0.4` - Severe food scarcity in winter

### Nutrient Cycling & Decomposition

- `FERTILE_ZONE_MAX_COUNT = 100` - Maximum number of fertile zones allowed
- `FERTILE_ZONE_FERTILITY_FACTOR = 0.05` - Energy-to-fertility conversion factor for dead agents
- `FERTILE_ZONE_MAX_FERTILITY = 50` - Maximum fertility value for any zone
- `FERTILE_ZONE_DECAY_RATE = 0.001` - Fertility decay rate per frame
- `FERTILE_ZONE_MIN_FERTILITY = 1` - Minimum fertility to create a zone
- `FERTILE_ZONE_SIZE_FACTOR = 3` - Zone radius multiplier based on agent size
- `FERTILE_ZONE_MIN_RADIUS = 50` - Minimum zone radius
- `FERTILE_ZONE_SPAWN_CHANCE = 0.4` - Chance to spawn food in fertile zones vs random
- `FERTILE_ZONE_INFLUENCE_DISTANCE = 200` - Distance within which fertile zones affect food spawning

### Kin Recognition & Social Behavior

- `KIN_RELATEDNESS_SELF = 1.0` - Relatedness value for self
- `KIN_RELATEDNESS_PARENT_CHILD = 0.5` - Relatedness between parent and child
- `KIN_RELATEDNESS_SIBLINGS = 0.5` - Relatedness between siblings
- `KIN_RELATEDNESS_GRANDPARENT = 0.25` - Relatedness for grandparents/grandchildren/aunts/uncles
- `KIN_RELATEDNESS_DISTANT = 0.125` - Relatedness for distant relatives
- `KIN_RELATEDNESS_MAX_GENERATION_DIFF = 2` - Maximum generation difference for relatedness calculation
- `KIN_PREDATION_REDUCTION_THRESHOLD = 0.25` - Minimum relatedness to trigger predation reduction
- `KIN_ATTACK_PREVENTION_CHANCE = 0.25` - Base chance to prevent attack on siblings
- `KIN_ATTACK_PREVENTION_PARENT = 0.5` - Chance to prevent attack on parent/child

### Rendering & Visual

- `VIEW_SIZE_RATIO = 0.4` - Portion of world visible in camera (0.4 = 40% of world size)
- `EFFECT_DURATION_BASE = 7` - Base duration for visual effects in frames
- `EFFECT_FADE_DURATION = 15` - How many frames visual effects take to fade out
- `MAX_INSTANCES_PER_BATCH = 200` - Maximum objects rendered in a single GPU batch
- `CAMERA_Z_POSITION = 1000` - Default camera Z position
- `CAMERA_FAR_PLANE = 10000` - Camera far clipping plane
- `AGENT_BORDER_SIZE_MULTIPLIER = 1.15` - Border size relative to agent body
- `AGENT_MINIMUM_BORDER_SIZE = 12` - Minimum border size for visibility
- `COLORS` - Color palette for all visual elements (hex colors):
  - `BACKGROUND: 0x050510` - Deep space background color
  - `FOOD.NORMAL: 0x39FF14` - Standard food items (neon green)
  - `FOOD.HIGH_VALUE: 0xFF00FF` - Rare high-energy food items (neon magenta)
  - `OBSTACLE: 0x9D00FF` - Moving obstacles (neon purple)
  - `AGENTS.FORAGER: 0xCCFF00` - Food-specialized agents (neon lime)
  - `AGENTS.PREDATOR: 0xFF0033` - Hunting-specialized agents (neon red)
  - `AGENTS.REPRODUCER: 0x00F0FF` - Breeding-specialized agents (neon cyan)
  - `AGENTS.SCOUT: 0xFFFF00` - Exploration-specialized agents (neon yellow)
  - `AGENTS.DEFENDER: 0xFF6600` - Territory defense-specialized agents (neon orange)
  - Plus ray colors and effect colors
- `EMISSIVE_COLORS` - Emissive color palette for cyberpunk glow effects (slightly brighter/more saturated)
- `POST_PROCESSING` - Post-processing configuration:
  - `BLOOM.STRENGTH: 0.25` - Bloom intensity
  - `BLOOM.RADIUS: 1` - Bloom spread radius
  - `BLOOM.THRESHOLD: 0.75` - Brightness threshold for bloom
  - `VIGNETTE.ENABLED: true` - Vignette enabled
  - `VIGNETTE.OFFSET: 5` - Vignette offset
  - `VIGNETTE.DARKNESS: 0.1` - Vignette darkness
  - `CHROMATIC_ABERRATION.ENABLED: true` - Chromatic aberration enabled
  - `CHROMATIC_ABERRATION.OFFSET: 0.001` - Chromatic aberration offset
- `MATERIAL_PROPERTIES` - Material properties for cyberpunk glassy aesthetic (emissive intensity, metalness, roughness, opacity, transparent)

### UI & Performance

- `TOAST_DURATION_SUCCESS = 8000` - Validation passed toast duration (ms)
- `TOAST_DURATION_FAILURE = 6000` - Validation failed toast duration (ms)
- `TOAST_DURATION_NORMAL = 5000` - Normal toast duration (ms)
- `TOAST_DURATION_SHORT = 3000` - Short toast duration (ms)
- `TOAST_DURATION_REPRODUCTION = 4000` - Reproduction toast duration (ms)
- `VALIDATION_COOLDOWN_MS = 5000` - Cooldown between validation attempts (ms)
- `VALIDATION_CLEANUP_TIMEOUT_MS = 600000` - Remove stale entries after 10 minutes (ms)
- `MAX_VALIDATIONS_PER_PERIODIC_CHECK = 2` - Maximum agents to add to validation per periodic check
- `GPU_INIT_TIMEOUT_MS = 15000` - GPU initialization timeout (ms)
- `WORKER_REQUEST_TIMEOUT_MS = 5000` - Database worker request timeout (ms)
- `MAX_AGENTS_TO_SPAWN_PER_FRAME = 8` - Maximum agents to spawn in a single frame during repopulation
- `SPAWN_STAGGER_FRAMES = 2` - Frames to wait between individual agent spawns
- `SPAWN_GROWTH_DURATION_FRAMES = 120` - Frames for spawn growth effect (2 seconds at 60 FPS)
- `SPAWN_GROWTH_MIN_SCALE = 0.3` - Starting scale for spawn growth (30% of final size)
- `SPAWN_GROWTH_MAX_SCALE = 1.0` - Ending scale for spawn growth (100% of final size)
- `SPAWN_SIZE_INTERPOLATION_SPEED = 0.05` - Size interpolation speed (5% per frame)
- `GPU_MAX_RAYS_PER_AGENT = 50` - Maximum rays per agent across all specializations (GPU buffer size)
- `POINT_POOL_SIZE = 5000` - Initial point pool allocation size

### Math & Utilities

- `TWO_PI = 6.283185307179586` - Full circle in radians (2π)
- `EXPLORATION_GRID_WIDTH = 72` - Number of grid cells across world width
- `EXPLORATION_GRID_HEIGHT = 40` - Number of grid cells across world height
- `EXPLORATION_CELL_WIDTH = 200` - Width of each exploration cell (WORLD_WIDTH / EXPLORATION_GRID_WIDTH)
- `EXPLORATION_CELL_HEIGHT = 202.5` - Height of each exploration cell (WORLD_HEIGHT / EXPLORATION_GRID_HEIGHT)

## Usage

Import specific constants as needed:

```javascript
import { MAX_ENERGY, MAX_VELOCITY, DAMPENING_FACTOR } from './constants.js';
```

## Key Design Decisions

1. **Single Source of Truth**: All constants in one file prevents inconsistencies
2. **Comprehensive Documentation**: Every constant has JSDoc-style comments explaining purpose, units, and relationships
3. **Clear Naming**: Constants use UPPER_SNAKE_CASE for clarity
4. **Logical Grouping**: Constants organized by purpose into clear sections
5. **Type Safety**: JSDoc comments include type information for better IDE support

## Balancing Notes

These constants control the simulation balance:
- Energy costs determine agent survival time
- Movement constants affect agent speed and efficiency
- Reproduction constants control population growth
- Food constants affect resource availability
- Temperature system affects agent performance based on environmental conditions
- Seasonal cycles create dynamic environmental challenges
- Neural network evolution parameters control learning and adaptation rates

Adjust carefully to maintain simulation balance!

## Removed Constants

The following constants have been removed as they were unused:
- `ROTATION_SMOOTHING` - Was marked as not currently used (using momentum instead)
- `INACTIVE_TEMPERATURE_PENALTY` - Was deprecated, replaced by symmetric temperature bonus/penalty system
