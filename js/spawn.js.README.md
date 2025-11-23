# Spawning Documentation (`spawn.js`)

## Overview
The `spawn.js` module handles the creation and placement of all entities in the world: agents, food, obstacles, and pheromones.

## Why It Exists
- **Environment Generation**: Procedurally generates obstacles to create a varied and challenging map.
- **Population Control**: Manages repopulation to keep the agent count at the target level.
- **Diversity**: Implements different spawning strategies (random, elitism, crossover) to maintain genetic diversity.

## Key Functions

### `generateObstacles(simulation)`
Procedurally generates obstacles.
- **Grid System**: Uses a grid to ensure even distribution while adding randomness within cells.
- **Variety**: Generates obstacles of different sizes.
- **Safety**: Ensures obstacles don't overlap too much and aren't placed too close to each other.

### `spawnAgent(simulation, options)`
Creates a new agent.
- **Placement**: Uses `randomSpawnAvoidCluster` to find a safe spot away from obstacles and other agents.
- **Genetics**: Can spawn a fresh random agent, a clone of an existing one, or a crossover child.

### `repopulate(simulation)`
Called every frame to check if new agents are needed.
- **Strategies**:
    - **Elitism (25%)**: Clones a top performer from the gene pool.
    - **Crossover (25%)**: Mates two top performers.
    - **Random (25%)**: Fresh random genetics (introduces new traits).
    - **Novelty (25%)**: Forces a new specialization type to ensure role diversity.
- **Validation**: Prioritizes spawning "validation candidates" (agents waiting to prove their fitness) if the queue is not empty.

### `spawnFood(simulation)`
Spawns food particles.
- **Scaling**: Adjusts spawn rate based on population size and food scarcity settings.
- **High Value**: Occasionally spawns "super food" with more energy.
