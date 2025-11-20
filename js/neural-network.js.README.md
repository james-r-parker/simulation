# neural-network.js Documentation

## Purpose

Recurrent Neural Network (RNN) implementation for agent decision-making. This is the "brain" of each agent.

## Class: NeuralNetwork

### Architecture

```
Input Layer (variable) → Hidden Layer (variable) → Output Layer (5)
                          ↑                          ↓
                          └──── (RNN State) ──────────┘
```

**Input Size**: Variable per specialization
- (numSensorRays × 5) + (numAlignmentRays × 1) + 16 state inputs + hiddenSize
- Example FORAGER: (40 × 5) + (6 × 1) + 16 + 20 = 242
- Example SCOUT: (60 × 5) + (6 × 1) + 16 + 15 = 337

**Hidden Size**: Variable (15-25 neurons per specialization)
- SCOUT: 15 neurons (fast, long-range)
- REPRODUCER: 18 neurons
- FORAGER: 20 neurons
- DEFENDER: 22 neurons  
- PREDATOR: 25 neurons (complex, short-range)

**Output Size**: 5 neurons
1. Thrust (0-1)
2. Rotation (0-1, remapped to -1 to 1)
3. Sprint (0-1)
4. Mate-Search (0-1)
5. Attack (0-1)

**Activation**: Sigmoid on all layers

## Constructor

```javascript
new NeuralNetwork(inputSize, hiddenSize, outputSize, weights)
```

**Parameters**:
- `inputSize`: Number of input neurons (variable per specialization)
- `hiddenSize`: Number of hidden neurons (15-25 per specialization)
- `outputSize`: Number of output neurons (5)
- `weights`: Optional weight matrices `{ weights1, weights2 }`

**Initialization**:
- If weights provided, uses them
- Otherwise, initializes random weights using Gaussian distribution (mean=0, stdDev=0.1)
- Validates weight dimensions match architecture

## Methods

### `forward(inputs, hiddenState)`

Performs forward pass through the network.

**Parameters**:
- `inputs`: Array of (numSensorRays × 5 + numAlignmentRays + 16) values (perception data)
- `hiddenState`: Array of hiddenSize values (previous RNN state)

**Returns**:
```javascript
{
    output: [5 values],           // Network outputs  
    hiddenState: [hiddenSize values] // New RNN state
}
```

**Process**:
1. Concatenate inputs with hidden state (variable total)
2. Multiply by weights1 → hidden layer
3. Apply sigmoid activation
4. Multiply by weights2 → output layer
5. Apply sigmoid activation
6. Return output and new hidden state

**Key Feature**: Architecture adapts to agent specialization

---

### `getWeights()`

Returns current weight matrices.

**Returns**:
```javascript
{
    weights1: [[...], ...], // Input → Hidden weights
    weights2: [[...], ...]  // Hidden → Output weights
}
```

**Usage**: For saving to gene pool, crossover, mutation

---

### `mutate(mutationRate)`

Applies Gaussian mutation to weights.

**Parameters**:
- `mutationRate`: Base mutation rate (typically 0.1)

**Mutation Strategy**:
- **Micro-mutation**: `stdDev = mutationRate * 0.3` (applied to all weights)
- **Macro-mutation**: `stdDev = mutationRate * 3.0` (2% chance per weight)

**Weight Clamping**: Weights clamped to [-3, 3] range

**Process**:
1. Apply micro-mutation to all weights
2. With 2% probability, apply additional macro-mutation
3. Clamp weights to valid range

**Rationale**:
- Micro-mutation: Refines successful behaviors
- Macro-mutation: Prevents local optima, introduces large changes

---

### `initRandomWeights(rows, cols)`

Initializes random weight matrix.

**Parameters**:
- `rows`: Number of rows
- `cols`: Number of columns

**Returns**: 2D array with Gaussian random values (mean=0, stdDev=0.1)

**Usage**: Called during initialization if no weights provided

---

### `copyMatrix(matrix)`

Creates deep copy of matrix.

**Parameters**:
- `matrix`: 2D array

**Returns**: New matrix (not reference)

**Usage**: Prevents accidental weight sharing between agents

---

### `randomGaussian(mean, stdDev)`

Box-Muller transform for Gaussian random numbers.

**Parameters**:
- `mean`: Mean value (default: 0)
- `stdDev`: Standard deviation (default: 1)

**Returns**: Random number from normal distribution

## Key Features

### RNN Memory
- Hidden state maintained across frames
- Enables complex behaviors requiring memory
- Agents can learn sequences (e.g., "turn → detect danger → turn back → sprint")

### Numerical Stability
- Uses `applySigmoid` with safety checks
- Prevents NaN/Infinity propagation
- Critical for long-running simulations

### Dynamic Architecture
- Adapts to agent specialization
- Variable input and hidden layer sizes
- Optimized for different sensing/processing needs

## Usage Example

```javascript
import { NeuralNetwork } from './neural-network.js';

// Create network for FORAGER (specialized config)
const nn = new NeuralNetwork(242, 20, 5);

// Forward pass
const perception = agent.perceiveWorld(...);
const result = nn.forward(perception.inputs, agent.hiddenState);
agent.hiddenState = result.hiddenState;

// Use outputs
const thrust = result.output[0];
const rotation = result.output[1] * 2 - 1;
const sprint = result.output[2] > 0.9;
const wantsToReproduce = result.output[3] > 0.8;
const wantsToAttack = result.output[4] > 0.8;

// Mutation
nn.mutate(0.1);
```

## Performance

- Efficient matrix operations
- Minimal memory allocations
- Reusable across all agents
- Architecture size optimized per specialization

## Evolution

Networks evolve through:
1. **Selection**: Top performers enter gene pool
2. **Crossover**: Combine weights from two parents
3. **Mutation**: Random changes to weights
4. **Inheritance**: Children get mutated parent weights

This creates a population that improves over generations!


