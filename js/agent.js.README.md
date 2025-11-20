# agent.js Documentation

## Purpose

Main agent class representing autonomous entities in the simulation. Each agent has a neural network brain, gene ID, and complex behavior system.

## Class: Agent

### Overview

Agents are the core entities that evolve through neuroevolution. They:
- Perceive the world through sensor rays
- Make decisions using a recurrent neural network
- Move, eat, reproduce, and fight
- Pass their genes to offspring

## Constructor

```javascript
new Agent(gene, x, y, energy, logger, parent = null, simulation = null)
```

**Parameters**:
- `gene`: Gene object containing:
  - `weights`: Neural network weights (optional)
  - `fatherWeights`: Father's weights for reproduction (optional)
  - `geneId`: Gene ID string (optional, generated if not provided)
  - `specializationType`: Specialization type (optional, random if not provided)
  - `numSensorRays`: Number of sensor rays (optional, uses config default)
  - `maxRayDist`: Maximum ray distance (optional, uses config default)
  - `hiddenSize`: Hidden layer size (optional, uses config default)
- `x, y`: Starting position
- `energy`: Starting energy
- `logger`: Logger instance
- `parent`: Parent agent (optional)
- `simulation`: Simulation instance (optional)

**Initialization**:
- Determines specialization type from gene or random
- Loads configuration from `AGENT_CONFIGS[specializationType]`
- Creates neural network with dynamic architecture
- Generates gene ID if not provided
- Calculates gene color from gene ID
- Initializes all state variables

## Key Properties

### Position & Movement
- `x, y`: Current position
- `vx, vy`: Velocity components
- `angle`: Facing direction (radians)
- `size`: Current size (based on energy)

### Specialization System
- `specializationType`: String ('forager', 'predator', 'reproducer', 'scout', 'defender')
- `specializationTypeId`: Numeric ID for GPU processing (0-4)
- `numSensorRays`: Variable (30-60 based on specialization)
- `hiddenSize`: Variable (15-25 based on specialization)
- `maxRayDist`: Variable (150-400 based on specialization)

### Neural Network
- `nn`: NeuralNetwork instance
- `hiddenState`: Array of hiddenSize values (RNN memory)
- `inputSize`: Dynamic (calculated per specialization)
- `outputSize`: 5 (fixed)

### Gene System
- `geneId`: Unique identifier string
- `geneColor`: HSL color object `{ h, s, l }`

### Energy
- `energy`: Current energy
- `energySpent`: Total energy spent (for efficiency calculation)

### Statistics
- `offspring`: Number of children produced
- `kills`: Number of agents consumed
- `foodEaten`: Number of food items consumed
- `fitness`: Calculated fitness score
- `age`: Age in seconds
- `distanceTravelled`: Total distance moved

### State Flags
- `isDead`: Whether agent is dead
- `isPregnant`: Whether agent is pregnant
- `wantsToReproduce`: Neural network wants to reproduce
- `wantsToAttack`: Neural network wants to attack
- `isSprinting`: Currently sprinting

### Perception
- `numSensorRays`: Variable per specialization (30-60)
- `numAlignmentRays`: Variable per specialization (typically 6)
- `maxRayDist`: Variable per specialization (150-400)
- `lastRayData`: Last frame's ray data (for visualization)

## Methods

### `think(inputs)`

Processes perception through neural network and updates movement.

**Parameters**:
- `inputs`: Array of 129 perception values

**Process**:
1. Forward pass through neural network
2. Update hidden state
3. Extract outputs (thrust, rotation, sprint, mate, attack)
4. Calculate movement based on outputs
5. Apply fight/flight modifiers
6. Update velocity

**Outputs**:
- `thrustOutput`: [0, 1] → scaled by `MAX_THRUST * speedFactor`
- `rotationOutput`: [0, 1] → remapped to [-1, 1] → scaled by `MAX_ROTATION`
- `sprintOutput`: [0, 1] → activates if > threshold
- `wantsToReproduce`: true if output[3] > 0.8
- `wantsToAttack`: true if output[4] > 0.8

**Fight/Flight Modifiers**:
- If fear > aggression: Lower sprint threshold, add fear sprint bonus
- If sprinting: Add sprint bonus thrust

---

### `update(worldWidth, worldHeight, obstacles, quadtree, simulation, newChildren)`

Main update loop called every frame.

**Process**:
1. Perceive world (gather sensor data)
2. Think (process through neural network)
3. Update age and timers
4. Apply movement (dampening, velocity cap)
5. Calculate energy costs
6. Check collisions (edges, obstacles)
7. Emit pheromones
8. Handle reproduction (pregnancy timer)

**Energy Costs**:
- Passive loss (metabolism)
- Size maintenance
- Movement (speed²)
- Sprinting (if active)
- Rotation
- Obesity tax (if energy > 350)

**Death Conditions**:
- Energy <= 0
- Unstable frames > 60

---

### `perceiveWorld(quadtree, obstacles)`

Gathers sensor data from the environment.

**Returns**:
```javascript
{
    inputs: [129 values],    // Neural network inputs
    rayData: [...],          // Ray visualization data
    nearbyAgents: [...]      // Nearby agents
}
```

**Inputs Generated**:
1. **numSensorRays Sensor Rays** (numSensorRays × 5 inputs):
   - Normalized distance
   - Hit food (binary)
   - Hit smaller agent (binary)
   - Hit larger agent (binary)
   - Hit obstacle (binary)

2. **numAlignmentRays Alignment Rays** (numAlignmentRays × 1 inputs):
   - Normalized distance to nearest peer

3. **8 Explicit States** (8 inputs):
   - Hunger: (MAX_ENERGY - energy) / MAX_ENERGY
   - Fear: min(dangerSmell, 1)
   - Aggression: min(attackSmell + energy/OBESITY_THRESHOLD, 1)
   - Energy ratio: energy / MAX_ENERGY
   - Age ratio: min(age / 60, 1)
   - Speed ratio: speed / MAX_VELOCITY
   - Velocity-angle difference: turning difficulty
   - In obstacle shadow: binary

4. **8 Memory Inputs** (8 inputs):
   - Previous velocities (2 frames)
   - Energy deltas
   - Previous danger/aggression

**Total**: (numSensorRays × 5) + (numAlignmentRays × 1) + 16 (varies by specialization)

---

### `emitPheromones(simulation)`

Emits pheromone puffs based on agent state.

**Conditions**:
- Fear > 0.5: 20% chance to emit 'danger' pheromone
- Aggression > 0.5: 20% chance to emit 'attack' pheromone
- wantsToReproduce: 10% chance to emit 'reproduction' pheromone (NEW)

**Usage**: Social communication between agents

---

### `tryMate(mate, simulation)`

Attempts to mate with another agent.

**Requirements**:
- Both agents mature (age >= 15 seconds)
- Neither pregnant
- No reproduction cooldown
- Both have enough energy (>= 250)
- Mate score >= 50% of self score

**Process**:
1. Check all requirements
2. Set this agent as pregnant
3. Store father's weights
4. Apply reproduction costs
5. Increment offspring counter

**Returns**: Boolean (success/failure)

---

### `birthChild(simulation)`

Creates a child agent after pregnancy duration.

**Process**:
1. Get parent weights
2. Crossover with father's weights
3. Create child with inherited gene ID
4. Mutate child's neural network
5. Mutate inherited traits (speedFactor, maxRayDist)

**Gene ID Inheritance**: Child gets gene ID from mother (this agent)

**Returns**: New Agent instance

---

### `isLowEnergy()`

Checks if agent energy is below threshold.

**Returns**: Boolean (energy < LOW_ENERGY_THRESHOLD)

**Usage**: Visual indicator (red border in renderer)

---

### `getWeights()`

Returns neural network weights.

**Returns**: `{ weights1, weights2 }`

**Usage**: For gene pool storage, crossover

---

### `getRayIntersection(other, dx, dy, radius)`

Calculates ray intersection with entity.

**Parameters**:
- `other`: Entity to check
- `dx, dy`: Ray direction
- `radius`: Optional radius override

**Returns**: Distance to intersection, or -1 if no intersection

**Algorithm**: Quadratic formula for circle-line intersection

## Gene ID System

### Generation
- Created on agent birth if not provided
- Format: `"gene_" + timestamp + "_" + random string`

### Inheritance
- Children inherit gene ID from mother
- Enables tracking genetic lineages
- Used for consistent color coding

### Color Mapping
- Gene ID hashed to HSL color
- Same gene ID = same color
- Visual identification of related agents

## Key Features

### RNN Memory
- Hidden state maintained across frames
- Enables complex behaviors requiring memory
- Agents can learn sequences

### Complex Perception
- 30 sensor rays in 360° circle
- 8 alignment rays for flocking
- 8 explicit state inputs
- Pheromone detection

### Energy Management
- Multiple energy costs
- Energy gains from food/combat
- Death when energy depleted

### Reproduction
- Sexual reproduction with two parents
- Crossover of neural network weights
- Mutation of weights and traits
- Gene ID inheritance

## Usage Example

```javascript
import { Agent } from './agent.js';

// Create new agent
const agent = new Agent(100, 100, 300);

// Update every frame
agent.update(worldWidth, worldHeight, obstacles, quadtree, simulation, newChildren);

// Check state
if (agent.isLowEnergy()) {
    // Show red border
}

// Get weights for gene pool
const weights = agent.getWeights();
```

## Performance

- Efficient perception using quadtree
- Minimal allocations per frame
- Reusable across hundreds of agents



