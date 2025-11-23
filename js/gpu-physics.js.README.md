# GPU Physics Documentation (`gpu-physics.js`)

## Overview
The `GPUPhysics` class uses WebGPU to accelerate ray tracing for agent vision. This is the most computationally expensive part of the simulation, and moving it to the GPU allows for thousands of agents to "see" simultaneously without dropping frames.

## Why It Exists
- **Bottleneck**: In a CPU-based simulation, casting 30-60 rays for each of 1000+ agents involves millions of intersection tests per frame. This would crush a CPU.
- **Parallelism**: Ray casting is "embarrassingly parallel"—each ray is independent. GPUs are perfect for this.

## Key Features

### WebGPU Pipeline
- **Compute Shaders**: Custom WGSL shaders calculate intersections between rays and circles (entities) or line segments (obstacles).
- **Spatial Partitioning**: While the current implementation uses brute-force on the GPU (which is surprisingly fast for <10k entities), the data structure is designed to support spatial partitioning in the future.

### Data Structures
- **Agents Buffer**: Stores agent position, angle, and sensor configuration.
- **Entities Buffer**: Stores all interactive objects (other agents, food).
- **Obstacles Buffer**: Stores static obstacles. Circles are approximated as octagons (8 segments) for simpler intersection math.
- **Results Buffer**: Stores the distance, hit type (wall, food, agent, obstacle), and entity ID for every single ray.

## Key Functions

### `init(config)`
Initializes the WebGPU device and pre-allocates buffers based on the maximum expected number of agents and entities.

### `batchRayTracing(agents, entities, obstacles)`
The main entry point.
1.  **Data Packing**: Converts agent and entity objects into flat `Float32Array` buffers.
2.  **Upload**: Sends the data to the GPU.
3.  **Dispatch**: Runs the ray tracing compute shader.
4.  **Readback**: Reads the results back to the CPU.

### `convertGpuRayResultsToInputs(simulation, ...)`
Takes the raw flat array of results from the GPU and populates the `agent.inputs` array for the neural network.
- **Normalization**: Converts raw distances to normalized 0-1 values.
- **Encoding**: Converts hit types (wall, food, etc.) into one-hot encoded inputs for the brain.
- **Pheromones**: Since pheromones are not yet GPU-accelerated, this function also mixes in CPU-calculated pheromone inputs.
