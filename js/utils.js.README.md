# utils.js Documentation

## Purpose

Mathematical utilities and helper functions used throughout the simulation. Includes both original functions and new gene ID utilities.

## Exports

### Matrix Operations

#### `matrixMultiply(a, b)`
Performs matrix multiplication with numerical safety checks.

**Parameters**:
- `a`: First matrix (2D array)
- `b`: Second matrix (2D array)

**Returns**: Result matrix

**Safety**: Replaces NaN/Infinity with 0 to prevent crashes

**Usage**:
```javascript
const result = matrixMultiply(inputMatrix, weights);
```

---

#### `sigmoid(x)`
Sigmoid activation function: `1 / (1 + e^(-x))`

**Parameters**:
- `x`: Input value

**Returns**: Value in range [0, 1]

**Usage**: Used in neural network activation

---

#### `applySigmoid(matrix)`
Applies sigmoid function to all values in a matrix.

**Parameters**:
- `matrix`: 2D array

**Returns**: Matrix with sigmoid applied

**Safety**: Replaces unsafe values with 0.5

---

#### `isUnsafe(n)`
Checks if a number is NaN or Infinity.

**Parameters**:
- `n`: Number to check

**Returns**: Boolean

**Usage**: Prevents numerical instability crashes

---

### Math Utilities

#### `lerp(a, b, t)`
Linear interpolation between two values.

**Parameters**:
- `a`: Start value
- `b`: End value
- `t`: Interpolation factor [0, 1]

**Returns**: Interpolated value

**Usage**: Smooth camera movement, animations

---

#### `distance(x1, y1, x2, y2)`
Euclidean distance between two points.

**Parameters**:
- `x1, y1`: First point
- `x2, y2`: Second point

**Returns**: Distance value

**Usage**: Collision detection, spatial queries

---

#### `randomGaussian(mean, stdDev)`
Generates Gaussian (normal) random numbers using Box-Muller transform.

**Parameters**:
- `mean`: Mean value (default: 0)
- `stdDev`: Standard deviation (default: 1)

**Returns**: Random number from normal distribution

**Usage**: 
- Neural network weight initialization
- Mutation operations
- Random spawn positions

**Algorithm**: Box-Muller transform for accurate normal distribution

---

### Gene ID Utilities (NEW)

#### `generateGeneId()`
Generates a unique gene ID string.

**Returns**: String like `"gene_1234567890_abc123"`

**Format**: `"gene_" + timestamp + "_" + random string`

**Usage**: Create unique identifier for new agents

---

#### `geneIdToColor(geneId)`
Hashes a gene ID to a consistent HSL color.

**Parameters**:
- `geneId`: Gene ID string

**Returns**: `{ h: hue, s: saturation, l: lightness }`

**Algorithm**:
1. Hash gene ID string to integer
2. Use modulo 360 for hue (full color spectrum)
3. Fixed saturation (70) and lightness (50)

**Usage**: Color agents consistently by gene ID

**Example**:
```javascript
const color = geneIdToColor(agent.geneId);
// Returns: { h: 245, s: 70, l: 50 }
```

## Key Features

### Numerical Stability
- All matrix operations include safety checks
- Prevents NaN/Infinity propagation
- Critical for long-running simulations

### Preserved Functions
- All original utility functions maintained
- Exact implementations from original code
- No changes to mathematical operations

### New Gene ID Functions
- Simple hash-based color generation
- Consistent coloring across generations
- Lightweight implementation

## Usage Examples

```javascript
import { 
    matrixMultiply, 
    sigmoid, 
    distance, 
    randomGaussian,
    generateGeneId,
    geneIdToColor 
} from './utils.js';

// Matrix operations
const output = matrixMultiply(input, weights);

// Distance calculation
const dist = distance(agent1.x, agent1.y, agent2.x, agent2.y);

// Random spawn
const x = centerX + randomGaussian(0, 100);

// Gene ID
const geneId = generateGeneId();
const color = geneIdToColor(geneId);
```

## Performance

- Efficient implementations
- No unnecessary allocations
- Reusable across modules



