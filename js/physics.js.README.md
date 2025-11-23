# Physics Documentation (`physics.js`)

## Overview
The `physics.js` module handles CPU-based physics interactions, primarily collision detection and resolution between agents, food, and obstacles.

## Why It Exists
- **Interaction**: Agents need to eat food, bump into each other, and bounce off obstacles. This module defines those physical rules.
- **Performance**: Uses a Quadtree (via `simulation.quadtree`) to optimize collision queries, reducing the complexity from O(N²) to O(N log N).

## Key Functions

### `checkCollisions(simulation)`
The main physics loop.
- **Quadtree Query**: Finds nearby entities for each agent.
- **Distance Check**: Uses squared distance (`distSq`) to avoid expensive square root calculations during the broad phase.
- **Resolution**:
    - **Food**: If an agent touches food, it eats it (gains energy, food dies).
    - **Agents**: If agents overlap, they push each other apart (soft body physics). Also handles mating and attacking.
    - **Obstacles**: Agents bounce off obstacles with energy loss (damage).

### `convertGpuRayResultsToInputs(...)`
*Note: This function is located here but closely related to `gpu-physics.js`.*
It processes the raw ray tracing results from the GPU and prepares them as inputs for the agent's neural network.
- **Normalization**: Converts distances to 0-1 range.
- **Encoding**: Encodes "what" was seen (wall, food, agent) into neural inputs.
- **Memory**: Adds temporal awareness by including previous velocities and energy states as inputs.
