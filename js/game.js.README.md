# game.js Documentation

## Purpose

Main simulation class that coordinates all systems and runs the game loop. This is the central orchestrator of the entire simulation.

## Class: Simulation

### Overview

The Simulation class:
- Manages all entities (agents, food, pheromones)
- Coordinates systems (rendering, database, camera)
- Runs the main game loop
- Handles UI interactions
- Manages evolution (selection, crossover, mutation)

## Constructor

```javascript
new Simulation(container)
```

**Parameters**:
- `container`: DOM element for WebGL renderer

**Initialization**:
- Creates WebGL renderer
- Initializes IndexedDB database
- Sets up world (3200×2400)
- Creates obstacles
- Sets up camera
- Initializes gene pools

## Key Properties

### Entities
- `agents[]`: Array of Agent instances
- `food[]`: Array of Food instances
- `pheromones[]`: Array of PheromonePuff instances

### World
- `worldWidth`: 14400
- `worldHeight`: 8100
- `obstacles[]`: Array of obstacle objects `{x, y, radius}`

### Systems
- `quadtree`: Quadtree for spatial indexing
- `camera`: Camera instance for viewport
- `renderer`: WebGLRenderer instance
- `db`: GenePoolDatabase instance

### State
- `generation`: Current generation number
- `bestAgent`: Agent with highest fitness
- `frameCount`: Total frames elapsed
- `respawnTimer`: Timer for respawning agents

### Settings
- `gameSpeed`: Simulation speed multiplier (1-10)
- `maxAgents`: Maximum population (10-100)
- `foodSpawnRate`: Food spawn multiplier (0.1-2.0)
- `mutationRate`: Mutation rate (0.01-0.5)
- `showRays`: Toggle ray visualization
- `followBest`: Toggle camera following best agent

### Gene Pools
- `genePools{}`: Object mapping geneId → array of top 3 agents
- Organized by specialization type for efficient selection

### Environment
- `seasonTimer`: Timer for seasonality
- `foodScarcityFactor`: Current scarcity (0.5-1.0)
- `finalFoodSpawnMultiplier`: Calculated spawn multiplier

## Methods

### `init()`

Async initialization method.

**Process**:
1. Initialize IndexedDB database
2. Migrate from localStorage (if needed)
3. Load gene pools from database
4. Initialize population
5. Setup UI listeners
6. Update food scaling factor

**Returns**: Promise

**Usage**: Called once at startup

---

### `setupUIListeners()`

Wires up all UI controls to simulation settings.

**Controls**:
- Game speed slider
- Max agents slider
- Show rays checkbox
- Follow best checkbox
- Food rate slider
- Mutation rate slider
- Clear storage button
- Window resize handler
- Before unload handler (saves gene pools)

---

### `initPopulation()`

Creates initial agents and food.

**Process**:
1. Spawn 3 agents at center (guaranteed visible)
2. Spawn remaining agents (try to use gene pools)
3. Spawn 100 food items near center
4. Spawn 150 food items scattered

**Gene Pool Usage**: If gene pools exist, uses random weights from them

---

### `spawnAgent(weights, x, y, energy, fatherWeights)`

Creates a new agent.

**Parameters**:
- `weights`: Neural network weights (optional)
- `x, y`: Position (optional, random if not provided)
- `energy`: Starting energy (optional, default: 300)
- `fatherWeights`: Father's weights (optional)

**Process**:
1. Determine spawn position (provided or random)
2. Create new Agent instance
3. Add to agents array

---

### `spawnFood()`

Creates a new food item.

**Process**:
1. Check food cap (600 max)
2. Calculate spawn chance based on:
   - Final food spawn multiplier
   - Food scarcity factor
   - Current population
3. Randomly determine if high-value
4. Spawn at random safe location

**Spawn Formula**:
```
chance = 0.1 * finalFoodSpawnMultiplier * foodScarcityFactor * (1 - agents/maxAgents*1.5)
```

---

### `spawnPheromone(x, y, type)`

Creates a pheromone puff.

**Parameters**:
- `x, y`: Position
- `type`: 'danger', 'attack', or 'reproduction'

---

### `crossover(weightsA, weightsB)`

Performs one-point crossover on weight matrices.

**Parameters**:
- `weightsA`: First parent's weights
- `weightsB`: Second parent's weights

**Process**:
1. Randomly select split point for each matrix
2. Combine weights before split from A, after from B

**Returns**: New weight object `{ weights1, weights2 }`

---

### `selection(geneId)`

Selects two parents from gene pool for crossover.

**Parameters**:
- `geneId`: Gene ID to select from

**Process**:
1. Get gene pool for gene ID
2. Sort by fitness
3. Select first parent from top 3
4. Select second parent from entire pool

**Returns**: Crossover result or null

---

### `repopulate()`

Maintains population by spawning new agents.

**Process**:
1. Check if population below max
2. Increment respawn timer
3. When timer reaches threshold:
   - Try to spawn from gene pools
   - Otherwise spawn random agent
4. Spawn food

---

### `calculateFitness(agent)`

Calculates fitness score for agent.

**Formula**:
```
fitness = (offspring × 500)
        + (foodEaten × 150)
        + (efficiency × 10)
        + (successfulEscapes × 50)
        + (age^1.3) [if productive]
        - (age × 0.5) [if unproductive]
        - (collisions × 10)
        + (kills × 10)
```

**Returns**: Fitness score (>= 0)

---

### `updateGenePools()`

Updates and saves gene pools.

**Process**:
1. Calculate fitness for all agents
2. Sort agents by fitness
3. Group agents by gene ID
4. Keep top 3 per gene ID
5. Save to IndexedDB

**Called**: Every 500 frames

---

### `checkCollisions()`

Handles all collision detection.

**Collision Types**:
1. **Agent-Food**: Agent consumes food, gains energy
2. **Agent-Agent (Mating)**: If both want to reproduce, attempt mating
3. **Agent-Agent (Combat)**: If attacker wants to attack and is larger, consume victim

**Process**:
1. For each agent, query nearby entities using quadtree
2. Check distance for collisions
3. Handle appropriate collision type

---

### `applyEnvironmentEvents()`

Applies environmental effects (seasonality).

**Process**:
1. Update season timer
2. Calculate scarcity factor (sine wave)
3. Apply energy drain during harsh season
4. Spawn danger pheromones periodically

**Season Length**: 1800 frames

**Scarcity**: Varies from 0.5 to 1.0

---

### `updateInfo()`

Updates UI information display.

**Updates**:
- Population count
- Best agent stats
- Generation number
- Average energy and scarcity

**Called**: Every 100 frames

---

### `gameLoop()`

Main game loop (called via requestAnimationFrame).

**Process**:
1. Rebuild quadtree with all entities
2. Run simulation steps (based on gameSpeed):
   - Update pheromones
   - Apply environment events
   - Update all agents
   - Check collisions
   - Remove dead entities
   - Add new children
   - Repopulate
3. Update camera
4. Update renderer (agents, food, pheromones, obstacles, rays)
5. Render frame
6. Schedule next frame

**Key Features**:
- Runs multiple simulation steps per frame (gameSpeed)
- Updates UI periodically
- Updates gene pools periodically
- Smooth rendering at 60 FPS

## Game Loop Flow

```
┌─────────────────┐
│  Rebuild Tree   │
└────────┬────────┘
         │
┌────────▼────────┐
│  Update Pheromones │
└────────┬────────┘
         │
┌────────▼────────┐
│ Environment Events│
└────────┬────────┘
         │
┌────────▼────────┐
│  Update Agents   │
└────────┬────────┘
         │
┌────────▼────────┐
│ Check Collisions│
└────────┬────────┘
         │
┌────────▼────────┐
│ Remove Dead     │
└────────┬────────┘
         │
┌────────▼────────┐
│  Add Children   │
└────────┬────────┘
         │
┌────────▼────────┐
│   Repopulate    │
└────────┬────────┘
         │
┌────────▼────────┐
│ Update Camera   │
└────────┬────────┘
         │
┌────────▼────────┐
│ Update Renderer │
└────────┬────────┘
         │
┌────────▼────────┐
│     Render      │
└─────────────────┘
```

## Key Features

### Multi-Step Simulation
- Runs `gameSpeed` simulation steps per frame
- Allows faster simulation without frame rate issues

### Efficient Collision Detection
- Uses quadtree for O(log n) queries
- Only checks nearby entities

### Gene Pool Management
- Stores top 3 per gene ID (not just top 10 overall)
- Enables tracking of multiple genetic lineages
- Persistent across sessions

### Dynamic Food Spawning
- Scales with population size
- Adjusts for scarcity
- Maintains challenge level

## Usage Example

```javascript
import { Simulation } from './game.js';

const container = document.getElementById('canvas-container');
const sim = new Simulation(container);

sim.init().then(() => {
    sim.gameLoop();
});
```

## Performance

- Efficient quadtree queries
- Batched rendering updates
- Async database operations
- Optimized for hundreds of agents



