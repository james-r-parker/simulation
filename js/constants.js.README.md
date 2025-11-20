# constants.js Documentation

## Purpose

Centralized storage of all simulation constants and configuration values. This ensures consistency across the codebase and makes balancing adjustments easy.

## Exports

### Energy Constants
- `BASE_SIZE = 5` - Base agent size
- `ENERGY_TO_SIZE_RATIO = 100` - Energy to size conversion ratio
- `MAX_ENERGY = 2500` - Maximum energy an agent can have
- `MIN_ENERGY_TO_REPRODUCE = 250` - Minimum energy required for reproduction
- `INITIAL_AGENT_ENERGY = 2000` - Starting energy for new agents
- `CHILD_STARTING_ENERGY = 150` - Starting energy for newborn agents
- `OBESITY_THRESHOLD_ENERGY = 350` - Energy level where obesity tax applies
- `OBESITY_ENERGY_TAX_DIVISOR = 500` - Divisor for obesity tax calculation
- `PASSIVE_LOSS = 0.000002` - Constant passive energy drain (metabolism)
- `MOVEMENT_COST_MULTIPLIER = 0.004` - Multiplier for movement energy cost
- `LOW_ENERGY_THRESHOLD = 100` - Energy threshold for red border visualization

### Reproduction Constants
- `REPRODUCE_COST_BASE = 15` - Base energy cost for reproduction
- `MATURATION_AGE_SECONDS = 15` - Age required before reproduction
- `REPRODUCTION_COOLDOWN_FRAMES = 300` - Frames before can reproduce again (60 * 5)
- `PREGNANCY_DURATION_FRAMES = 480` - Frames until child is born (60 * 8)

### Movement Constants
- `MAX_THRUST = 0.5` - Maximum forward acceleration
- `MAX_ROTATION = 0.1` - Maximum rotation per frame
- `MAX_VELOCITY = 10` - Maximum speed cap
- `SPRINT_BONUS_THRUST = 0.5` - Additional thrust when sprinting
- `SPRINT_COST_PER_FRAME = 0.8` - Energy cost per frame when sprinting
- `SPRINT_THRESHOLD = 0.9` - Neural network output threshold for sprinting
- `FEAR_SPRINT_BONUS = 0.5` - Additional thrust when fearful
- `DAMPENING_FACTOR = 0.95` - Velocity dampening per frame (prevents instability)
- `ROTATION_COST_MULTIPLIER = 0.5` - Energy cost multiplier for rotation

### Collision Constants
- `OBSTACLE_COLLISION_PENALTY = 100` - Energy lost on obstacle collision
- `OBSTACLE_HIDING_RADIUS = 75` - Radius of obstacle shadow (hiding zone)

### Pheromone Constants
- `DANGER_PHEROMONE_THRESHOLD = 30` - Threshold for danger pheromone (unused in current code)
- `PHEROMONE_FADE_RATE = 0.005` - Life decrease per frame
- `PHEROMONE_RADIUS = 60` - Detection radius for pheromones

### Food Constants
- `FOOD_SPAWN_CAP = 600` - Maximum food entities
- `HIGH_VALUE_FOOD_CHANCE = 0.05` - Probability of high-value food spawn

### World Constants
- `WORLD_WIDTH = 14400` - World width in pixels (16:9 aspect ratio for 1440p monitors)
- `WORLD_HEIGHT = 8100` - World height in pixels

### Specialization System
- `SPECIALIZATION_TYPES` - Object defining 5 specialization types:
  - `FORAGER` - Specialized in finding and consuming food
  - `PREDATOR` - Specialized in hunting other agents
  - `REPRODUCER` - Specialized in mating and creating offspring
  - `SCOUT` - Specialized in long-range sensing and exploration
  - `DEFENDER` - Specialized in defending territory and allies

- `AGENT_CONFIGS` - Configuration object mapping specialization types to:
  - `color` - Hex color code for the specialization
  - `numSensorRays` - Number of sensor rays (30-60)
  - `maxRayDist` - Maximum ray distance (150-400)
  - `hiddenSize` - Hidden layer size (15-25)
  - `description` - Human-readable description

### Gene Pool Constants
- `MIN_FITNESS_TO_SAVE_GENE_POOL = 200` - Minimum fitness required to save agent to gene pool

### Spawn Constants
- `RESPAWN_DELAY_FRAMES = 0` - Frames to wait before respawning agents

## Usage

Import specific constants as needed:

```javascript
import { MAX_ENERGY, MAX_VELOCITY, DAMPENING_FACTOR } from './constants.js';
```

## Key Design Decisions

1. **Single Source of Truth**: All constants in one file prevents inconsistencies
2. **Preserved Values**: All values match original simulation exactly
3. **Clear Naming**: Constants use UPPER_SNAKE_CASE for clarity
4. **Grouped by Category**: Constants organized by purpose

## Balancing Notes

These constants control the simulation balance:
- Energy costs determine agent survival time
- Movement constants affect agent speed and efficiency
- Reproduction constants control population growth
- Food constants affect resource availability

Adjust carefully to maintain simulation balance!



