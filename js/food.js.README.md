# food.js Documentation

## Purpose

Food entity class representing consumable resources for agents.

## Class: Food

### Overview

Food items that agents consume for energy:
- Two types: standard (green) and high-value (yellow)
- Different energy values
- Visual size differences

## Constructor

```javascript
new Food(x, y, isHighValue)
```

**Parameters**:
- `x, y`: Position
- `isHighValue`: Boolean (default: false)

**Initialization**:
- Sets position
- Determines type
- Calculates energy value
- Sets visual size

## Properties

- `x, y`: Position coordinates
- `isHighValue`: Boolean for high-value food
- `energyValue`: Energy gained when consumed
  - Standard: 40-50
  - High-value: 100-120
- `size`: Visual size
  - Standard: 3
  - High-value: 5
- `isFood`: Marker for collision detection (always true)
- `isDead`: Removal flag (set to true when consumed)

## Food Types

### Standard Food (Green)
- **Color**: Green (`hsl(120, 70%, 50%)`)
- **Size**: 3
- **Energy**: 40-50 (random)
- **Spawn Chance**: 95% of food spawns

### High-Value Food (Yellow)
- **Color**: Yellow (`hsl(60, 100%, 50%)`)
- **Size**: 5
- **Energy**: 100-120 (random)
- **Spawn Chance**: 5% of food spawns

## Key Features

### Simple Entity
- Minimal properties
- No update logic (static until consumed)
- Efficient storage

### Energy Values
- Preserved from original simulation
- Standard: ~45 energy
- High-value: ~110 energy

### Visual Distinction
- Color and size differences
- Easy to identify in simulation
- Rendered by WebGL renderer

## Usage Example

```javascript
import { Food } from './food.js';

// Create standard food
const food = new Food(100, 200, false);

// Create high-value food
const highValue = new Food(300, 400, true);

// Check if consumed
if (food.isDead) {
    // Remove from array
}
```

## Consumption

Food is consumed when:
1. Agent collides with food
2. Agent gains `food.energyValue` energy
3. Agent's `foodEaten` counter increments
4. Food's `isDead` flag set to true
5. Food removed from array in next frame

## Performance

- Minimal memory footprint
- No per-frame updates
- Efficient collision detection

## Preserved Implementation

- Exact energy values from original
- Same spawn probabilities
- Same visual properties



