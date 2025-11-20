# camera.js Documentation

## Purpose

Camera/viewport management for following agents and smooth camera movement.

## Class: Camera

### Overview

Manages viewport position and zoom:
- Smoothly follows target entity
- Interpolates position for smooth movement
- Provides position/zoom for renderer

## Constructor

```javascript
new Camera(x, y, zoom)
```

**Parameters**:
- `x, y`: Initial position
- `zoom`: Initial zoom level

**Initialization**:
- Sets current and target position
- Stores zoom level

## Properties

- `x, y`: Current camera position
- `targetX, targetY`: Target position to move toward
- `zoom`: Zoom level (0.3 = zoomed out)

## Methods

### `follow(entity)`

Sets target to follow an entity.

**Parameters**:
- `entity`: Agent instance (or null to stop following)

**Process**:
- If entity provided, set target to entity position
- If null, stops following (target unchanged)

**Usage**: Follow best agent or specific agent

---

### `update()`

Smoothly interpolates toward target position.

**Process**:
- Uses lerp (linear interpolation) with factor 0.05
- Smoothly moves camera toward target
- Creates smooth following effect

**Formula**:
```
x = lerp(x, targetX, 0.05)
y = lerp(y, targetY, 0.05)
```

**Called**: Every frame

---

### `getPosition()`

Gets current camera position and zoom.

**Returns**: `{ x, y, zoom }`

**Usage**: Pass to renderer for viewport update

## Key Features

### Smooth Movement
- Linear interpolation for smooth following
- No jittery camera movement
- Comfortable viewing experience

### Flexible Following
- Can follow any entity
- Can stop following (null)
- Target can be set manually

### Simple API
- Easy to use
- Minimal overhead
- Preserved from original

## Usage Example

```javascript
import { Camera } from './camera.js';

const camera = new Camera(1600, 1200, 0.3);

// Follow agent
camera.follow(bestAgent);

// Update every frame
camera.update();

// Get position for renderer
const pos = camera.getPosition();
renderer.updateCamera(pos);
```

## Performance

- Minimal calculations per frame
- Efficient lerp operation
- No allocations

## Preserved Implementation

- Exact implementation from original
- Same interpolation factor (0.05)
- Same behavior



