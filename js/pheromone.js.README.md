# pheromone.js Documentation

## Purpose

Pheromone puff entity for agent communication. Updated with action-based coloring.

## Class: PheromonePuff

### Overview

Pheromones enable social communication:
- Agents emit pheromones based on state
- Other agents detect and respond to pheromones
- Color-coded by action type (NEW)

## Constructor

```javascript
new PheromonePuff(x, y, type)
```

**Parameters**:
- `x, y`: Position
- `type`: 'danger', 'attack', or 'reproduction'

**Initialization**:
- Sets position and type
- Initializes life (1.0)
- Sets initial size (5)
- Calculates color based on type

## Properties

- `x, y`: Position coordinates
- `type`: 'danger', 'attack', or 'reproduction'
- `life`: Life value (1.0 to 0.0)
- `size`: Visual size (grows over time)
- `isDead`: Removal flag (true when life <= 0)
- `color`: HSL color object `{ h, s, l }`

## Pheromone Types

### Danger (Flight)
- **Type**: `'danger'`
- **Color**: Blue/cyan `{ h: 200, s: 80, l: 50 }`
- **Emitted When**: Agent fear > 0.5
- **Effect**: Increases fear input for nearby agents
- **Behavior**: Agents should flee from this

### Attack (Fight)
- **Type**: `'attack'`
- **Color**: Red/orange `{ h: 0, s: 100, l: 50 }`
- **Emitted When**: Agent aggression > 0.5
- **Effect**: Increases aggression input for nearby agents
- **Behavior**: Agents may approach to join hunt

### Reproduction (NEW)
- **Type**: `'reproduction'`
- **Color**: Green `{ h: 120, s: 80, l: 60 }`
- **Emitted When**: Agent wantsToReproduce
- **Effect**: Signals reproductive readiness
- **Behavior**: Agents may approach to mate

## Methods

### `update()`

Updates pheromone life and size.

**Process**:
1. Decrease life by `PHEROMONE_FADE_RATE` (0.005)
2. Increase size by 0.2
3. Set `isDead` if life <= 0

**Called**: Every frame

---

### `getColor()`

Gets HSL color object.

**Returns**: `{ h, s, l }`

**Usage**: Renderer converts to RGB for Three.js

## Key Features

### Action-Based Coloring (NEW)
- Color indicates pheromone type
- Visual identification of agent states
- Improved debugging and observation

### Fading Over Time
- Life decreases each frame
- Size increases (spreading effect)
- Removed when life reaches 0

### Social Communication
- Enables emergent behaviors
- Flocking, fleeing, hunting
- Reproduction coordination

## Usage Example

```javascript
import { PheromonePuff } from './pheromone.js';

// Create danger pheromone
const danger = new PheromonePuff(100, 200, 'danger');

// Update every frame
danger.update();

// Get color for rendering
const color = danger.getColor();
// Returns: { h: 200, s: 80, l: 50 }
```

## Emission Logic

Pheromones are emitted by agents in `agent.js`:

```javascript
// Danger (fear)
if (this.fear > 0.5 && Math.random() < 0.2) {
    simulation.spawnPheromone(this.x, this.y, 'danger');
}

// Attack (aggression)
if (this.aggression > 0.5 && Math.random() < 0.2) {
    simulation.spawnPheromone(this.x, this.y, 'attack');
}

// Reproduction (NEW)
if (this.wantsToReproduce && Math.random() < 0.1) {
    simulation.spawnPheromone(this.x, this.y, 'reproduction');
}
```

## Detection

Agents detect pheromones in `perceiveWorld()`:
- Query nearby pheromones using quadtree
- Calculate strength based on distance
- Add to `dangerSmell` or `attackSmell` inputs
- Used as neural network inputs

## Performance

- Minimal per-frame updates
- Efficient collision detection
- Rendered as transparent meshes

## Preserved Logic

- Fade rate preserved (0.005)
- Size growth preserved (0.2 per frame)
- Emission probabilities preserved
- NEW: Action-based coloring added



