# JavaScript Modules Documentation

This directory contains all the JavaScript modules for the Blob Evolution simulation.

## Module Overview

### Core Simulation

#### `constants.js`
**Purpose**: Centralized storage of all simulation constants and configuration values.

**Exports**:
- Energy constants: `MAX_ENERGY`, `MIN_ENERGY_TO_REPRODUCE`, `PASSIVE_LOSS`, etc.
- Movement constants: `MAX_THRUST`, `MAX_VELOCITY`, `DAMPENING_FACTOR`, etc.
- Reproduction constants: `REPRODUCE_COST_BASE`, `PREGNANCY_DURATION_FRAMES`, etc.
- World constants: `WORLD_WIDTH`, `WORLD_HEIGHT`
- Visual constants: `LOW_ENERGY_THRESHOLD` (for red border)

**Key Features**:
- All values preserved exactly from original simulation
- Single source of truth for balancing parameters
- Easy to adjust for experimentation

---

#### `utils.js`
**Purpose**: Mathematical utilities and helper functions.

**Exports**:
- `matrixMultiply(a, b)` - Matrix multiplication with NaN/Infinity safety
- `sigmoid(x)` - Sigmoid activation function
- `applySigmoid(matrix)` - Apply sigmoid to matrix with safety checks
- `isUnsafe(n)` - Check for NaN or Infinity
- `lerp(a, b, t)` - Linear interpolation
- `distance(x1, y1, x2, y2)` - Euclidean distance
- `randomGaussian(mean, stdDev)` - Box-Muller transform for Gaussian random
- `generateGeneId()` - Generate unique gene ID string
- `geneIdToColor(geneId)` - Hash gene ID to HSL color

**Key Features**:
- All functions preserved from original
- Added gene ID utilities for new features
- Numerical stability checks prevent crashes

---

#### `neural-network.js`
**Purpose**: Recurrent Neural Network implementation.

**Class**: `NeuralNetwork`

**Constructor**: `new NeuralNetwork(inputSize, hiddenSize, outputSize, weights)`

**Methods**:
- `forward(inputs, hiddenState)` - Forward pass through network
  - Returns: `{ output: [5 values], hiddenState: [40 values] }`
- `getWeights()` - Get current weight matrices
- `mutate(mutationRate)` - Apply Gaussian mutation to weights
  - Micro-mutation: `stdDev = mutationRate * 0.3`
  - Macro-mutation: `stdDev = mutationRate * 3.0` (2% chance)

**Architecture**:
- Input layer: 169 neurons (sensor rays + alignment rays + states + hidden state)
- Hidden layer: 40 neurons (RNN state)
- Output layer: 5 neurons (thrust, rotation, sprint, mate-search, attack)
- Activation: Sigmoid on all layers

**Key Features**:
- Preserves exact architecture from original
- RNN maintains hidden state across frames for memory
- Mutation preserves micro/macro mutation strategy

---

#### `quadtree.js`
**Purpose**: Spatial indexing for efficient collision detection and queries.

**Classes**:
- `Point(x, y, data)` - Point with associated data
- `Rectangle(x, y, w, h)` - Axis-aligned bounding box
- `Quadtree(boundary, capacity)` - Quadtree spatial index

**Methods**:
- `Quadtree.insert(point)` - Insert point into quadtree
- `Quadtree.query(range, found)` - Query all points in range

**Key Features**:
- O(log n) query time instead of O(n)
- Essential for performance with hundreds of agents
- Preserved exactly from original

---

#### `camera.js`
**Purpose**: Camera/viewport management for following agents.

**Class**: `Camera`

**Methods**:
- `follow(entity)` - Set target to follow entity
- `update()` - Smoothly interpolate to target position
- `getPosition()` - Get current position and zoom

**Key Features**:
- Smooth camera movement using lerp
- Supports zoom and pan
- Used by WebGL renderer for viewport

---

### Entity Classes

#### `food.js`
**Purpose**: Food entity that agents consume for energy.

**Class**: `Food`

**Properties**:
- `x, y` - Position
- `isHighValue` - Boolean for high-value food (yellow)
- `energyValue` - Energy gained when consumed (~45 or ~110)
- `size` - Visual size (3 or 5)
- `isFood` - Marker for collision detection
- `isDead` - Removal flag

**Key Features**:
- Two types: standard (green) and high-value (yellow)
- Energy values preserved from original

---

#### `pheromone.js`
**Purpose**: Pheromone puffs for agent communication.

**Class**: `PheromonePuff`

**Properties**:
- `x, y` - Position
- `type` - 'danger', 'attack', or 'reproduction'
- `life` - Life value (1.0 to 0.0)
- `size` - Visual size (grows over time)
- `color` - HSL color based on type

**Methods**:
- `update()` - Decrease life, increase size
- `getColor()` - Get HSL color object

**Color Mapping**:
- **Danger** (flight): `h: 200, s: 80, l: 50` (blue/cyan)
- **Attack** (fight): `h: 0, s: 100, l: 50` (red/orange)
- **Reproduction**: `h: 120, s: 80, l: 60` (green)

**Key Features**:
- Action-based coloring (NEW)
- Fades over time
- Used for social behavior

---

#### `agent.js`
**Purpose**: Main agent class with RNN brain and gene ID system.

**Class**: `Agent`

**Constructor**: `new Agent(x, y, energy, weights, fatherWeights, geneId)`

**Key Properties**:
- **Position & Movement**: `x, y, vx, vy, angle, size`
- **Neural Network**: `nn` (NeuralNetwork instance), `hiddenState` (40 values)
- **Gene System**: `geneId`, `geneColor` (HSL)
- **Energy**: `energy`, `energySpent`
- **Stats**: `offspring`, `kills`, `foodEaten`, `fitness`, `age`
- **State**: `isDead`, `isPregnant`, `wantsToReproduce`, `wantsToAttack`, `isSprinting`

**Methods**:
- `think(inputs)` - Process perception through RNN, update movement
- `update(worldWidth, worldHeight, obstacles, quadtree, simulation, newChildren)` - Main update loop
- `perceiveWorld(quadtree, obstacles)` - Gather sensor data (169 inputs)
- `emitPheromones(simulation)` - Emit pheromones based on state
- `tryMate(mate, simulation)` - Attempt reproduction
- `birthChild(simulation)` - Create child with inherited gene ID
- `isLowEnergy()` - Check if energy < threshold (for red border)

**Gene ID System**:
- Generated on creation if not provided
- Inherited from mother during reproduction
- Used for consistent color coding
- Enables tracking genetic lineages

**Key Features**:
- All simulation logic preserved exactly
- Gene ID added as metadata (doesn't affect behavior)
- RNN provides memory across frames
- Complex perception system (30 sensor rays + 8 alignment rays + 8 states)

---

### Storage

#### `database.js`
**Purpose**: IndexedDB wrapper for persistent gene pool storage using Web Worker.

**Class**: `GenePoolDatabase`

**Database Schema**:
- **Store**: `genePools`
- **Key**: `geneId` (string)
- **Value**: `{ geneId, agents: [{ weights, fitness, geneId, specializationType }] }`
- **Limit**: Top 3 agents per gene ID

**Methods**:
- `init()` - Initialize database and worker (async)
- `saveGenePool(geneId, agents)` - Save top 3 agents for gene ID (async)
- `loadGenePool(geneId)` - Load agents for specific gene ID (async)
- `loadAllGenePools()` - Load all gene pools (async)
- `clearAll()` - Clear all stored data (async)
- `queueSaveGenePool(geneId, agents)` - Non-blocking queue-based save
- `flush()` - Ensure all queued saves complete

**Key Features**:
- Uses Web Worker (`database-worker.js`) for non-blocking operations
- Stores top 3 per gene ID (not just top 10 overall)
- Async operations prevent UI blocking
- Queue-based saving for performance

---

#### `database-worker.js`
**Purpose**: Web Worker for IndexedDB operations.

**Functions**:
- `initDB()` - Initialize IndexedDB connection
- `saveGenePool(geneId, agents)` - Save gene pool data
- `loadGenePool(geneId)` - Load specific gene pool
- `loadAllGenePools()` - Load all gene pools
- `clearAll()` - Clear all data

**Message Protocol**:
- Receives messages from main thread with `{id, action, payload}`
- Returns results with `{id, success, result/error}`

**Key Features**:
- Runs in background thread
- Non-blocking database operations
- Error handling and reporting

---

#### `logger.js`
**Purpose**: Logging utility with configurable log levels.

**Class**: `Logger`

**Log Levels** (exported as `LOG_LEVELS`):
- `NONE` (0) - No logging
- `ERROR` (1) - Errors only
- `WARN` (2) - Warnings and errors
- `INFO` (3) - Info, warnings, and errors
- `DEBUG` (4) - All logs including debug

**Methods**:
- `log(message, data)` - Info level log
- `info(message, data)` - Info level log
- `warn(message, data)` - Warning log
- `error(message, data)` - Error log
- `debug(message, data)` - Debug log

**Usage**: Set level in constructor, e.g., `new Logger(LOG_LEVELS.DEBUG)`

---

#### `gpu-compute.js`
**Purpose**: WebGPU-accelerated neural network forward passes.

**Class**: `GPUCompute`

**Key Features**:
- Batches neural network computations for all agents
- Separate pipelines per specialization type
- Weight caching to avoid redundant uploads
- Double-buffering for efficiency
- Vectorized WGSL shaders

**Methods**:
- `init()` - Initialize WebGPU device and adapters
- `createPipelineForSpecialization(inputSize, hiddenSize, outputSize)` - Create compute pipeline
- `batchNeuralNetworkForward(agents)` - Process all agents' brains on GPU
- `isAvailable()` - Check WebGPU availability

**Performance**:
- Massive speedup for large agent populations
- Parallel processing of hundreds of agents
- Optimized memory transfers

---

#### `gpu-physics.js`
**Purpose**: WebGPU-accelerated ray tracing for agent vision.

**Class**: `GPUPhysics`

**Key Features**:
- GPU-accelerated ray-entity intersection tests
- Batched ray tracing for all agents
- Pheromone detection on GPU
- Optimized entity packing

**Methods**:
- `init(config)` - Initialize WebGPU for physics
- `createRayTracingPipeline()` - Create ray tracing shader pipeline
- `batchRayTracing(agents, entities, obstacles, numRaysPerAgent, worldWidth, worldHeight)` - Trace rays on GPU
- `isAvailable()` - Check WebGPU availability

**Performance**:
- O(1) complexity per agent (GPU parallelization)
- Handles thousands of rays efficiently
- Real-time performance with 100+ agents

---

### Rendering

#### `renderer.js`
**Purpose**: WebGL rendering using Three.js.

**Class**: `WebGLRenderer`

**Constructor**: `new WebGLRenderer(container, worldWidth, worldHeight)`

**Three.js Setup**:
- Scene with black background
- Orthographic camera for 2D view
- WebGL renderer with antialiasing

**Rendering Groups**:
- `agentGroup` - Instanced meshes for agents (grouped by gene ID)
- `foodGroup` - Individual meshes for food
- `pheromoneGroup` - Individual meshes for pheromones
- `obstacleGroup` - Static meshes for obstacles
- `rayGroup` - Lines for ray visualization

**Methods**:
- `resize(width, height)` - Handle window resize
- `updateCamera(cameraPos)` - Update camera position/zoom
- `updateAgents(agents)` - Update agent meshes (instanced by gene ID)
- `updateFood(foodArray)` - Update food meshes
- `updatePheromones(pheromones)` - Update pheromone meshes
- `updateObstacles(obstacles)` - Update obstacle meshes
- `updateRays(agents)` - Update ray visualization
- `render()` - Render frame
- `setShowRays(show)` - Toggle ray visualization

**Agent Rendering**:
- Instanced meshes grouped by gene ID
- Each gene ID gets its own color
- Red border ring appears when `agent.isLowEnergy()`
- Efficient batching for performance

**Key Features**:
- GPU-accelerated rendering
- Instanced rendering for agents (hundreds of agents efficiently)
- Color mapping from gene ID
- Visual indicators (red border for low energy)

---

### Main Game Loop

#### `game.js`
**Purpose**: Main simulation class coordinating all systems.

**Class**: `Simulation`

**Constructor**: `new Simulation(container)`

**Properties**:
- **Entities**: `agents[]`, `food[]`, `pheromones[]`
- **World**: `worldWidth`, `worldHeight`, `obstacles[]`
- **Systems**: `quadtree`, `camera`, `renderer`, `db`
- **State**: `generation`, `bestAgent`, `frameCount`
- **Settings**: `gameSpeed`, `maxAgents`, `mutationRate`, etc.
- **Gene Pools**: `genePools{}` (geneId -> top 3 agents)

**Methods**:
- `init()` - Initialize database and load gene pools (async)
- `setupUIListeners()` - Wire up UI controls
- `initPopulation()` - Spawn initial agents and food
- `spawnAgent(weights, x, y, energy, fatherWeights)` - Create new agent
- `spawnFood()` - Create new food (scaled by population)
- `spawnPheromone(x, y, type)` - Create pheromone puff
- `crossover(weightsA, weightsB)` - One-point crossover
- `selection(geneId)` - Select parents from gene pool
- `repopulate()` - Spawn new agents to maintain population
- `calculateFitness(agent)` - Calculate fitness score
- `updateGenePools()` - Update and save gene pools (async)
- `checkCollisions()` - Handle agent-food, agent-agent collisions
- `applyEnvironmentEvents()` - Seasonality and environmental effects
- `updateInfo()` - Update UI information display
- `gameLoop()` - Main game loop (called via requestAnimationFrame)

**Game Loop Flow**:
1. Rebuild quadtree with all entities
2. Update pheromones
3. Apply environment events (seasonality)
4. Update all agents (perception, thinking, movement, energy)
5. Check collisions (food consumption, mating, combat)
6. Remove dead entities
7. Add new children
8. Repopulate if needed
9. Update camera
10. Render frame
11. Repeat

**Key Features**:
- Coordinates all systems
- Preserves exact simulation logic
- Integrates WebGL rendering
- Manages gene pool persistence
- Handles UI interactions

---

## Module Dependencies

```
game.js
├── constants.js
├── agent.js
│   ├── constants.js
│   ├── utils.js
│   ├── neural-network.js
│   ├── quadtree.js
│   └── pheromone.js
├── food.js
├── pheromone.js
├── quadtree.js
├── camera.js
├── renderer.js
│   └── (Three.js from CDN)
└── database.js
```

## Key Design Decisions

1. **Modular Architecture**: Each file has a single responsibility
2. **Preserved Logic**: All simulation logic kept identical to original
3. **Gene ID System**: Added as metadata, doesn't affect behavior
4. **IndexedDB**: Better than localStorage for structured data
5. **WebGL Rendering**: GPU acceleration for better performance
6. **Instanced Rendering**: Efficient rendering of many agents

## Performance Considerations

- Quadtree reduces collision checks from O(n²) to O(n log n)
- Instanced rendering batches agents by gene ID
- Three.js handles GPU optimization automatically
- IndexedDB operations are async to avoid blocking



