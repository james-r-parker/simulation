# renderer.js Documentation

## Purpose

WebGL renderer using Three.js for GPU-accelerated rendering of all simulation entities.

## Class: WebGLRenderer

### Overview

Handles all visual rendering:
- Agents (instanced meshes grouped by gene ID)
- Food (individual meshes)
- Pheromones (individual meshes with transparency)
- Obstacles (static meshes with shadows)
- Rays (line visualization)

## Constructor

```javascript
new WebGLRenderer(container, worldWidth, worldHeight)
```

**Parameters**:
- `container`: DOM element to attach canvas
- `worldWidth`: World width in pixels
- `worldHeight`: World height in pixels

**Initialization**:
- Creates Three.js scene, camera, renderer
- Sets up rendering groups
- Creates reusable geometries
- Configures WebGL settings

## Three.js Setup

### Scene
- Black background (`#000`)
- Contains all entity groups

### Camera
- Orthographic camera (2D view)
- View size: `max(worldWidth, worldHeight) * 0.6`
- Position: `z = 1000`
- Updates based on simulation camera

### Renderer
- WebGL renderer with antialiasing
- Matches container size
- Uses device pixel ratio

## Rendering Groups

### `agentGroup`
- Instanced meshes for agents
- Grouped by gene ID for efficient rendering
- Each gene ID has body + border meshes

### `foodGroup`
- Individual meshes for food items
- Recreated each frame (food changes frequently)

### `pheromoneGroup`
- Individual meshes for pheromones
- Transparent materials
- Size and opacity based on life

### `obstacleGroup`
- Static meshes for obstacles
- Includes shadow rings (hiding zones)

### `rayGroup`
- Line geometries for ray visualization
- Recreated each frame when enabled

## Methods

### `resize(width, height)`

Handles window resize.

**Process**:
1. Calculate new aspect ratio
2. Update camera bounds
3. Update renderer size

---

### `updateCamera(cameraPos)`

Updates camera position and zoom.

**Parameters**:
- `cameraPos`: `{ x, y, zoom }` from simulation camera

**Note**: Y-axis flipped for Three.js coordinate system

---

### `updateAgents(agents)`

Updates agent meshes using instanced rendering.

**Process**:
1. Group agents by gene ID
2. For each gene ID:
   - Create instanced mesh if needed
   - Update all instance matrices
   - Show/hide border based on energy
3. Update instance counts

**Instancing**:
- Allocates up to 100 instances per gene ID
- Uses `InstancedMesh` for efficient rendering
- Updates only changed instances

**Border Rendering**:
- Red ring appears when `agent.isLowEnergy()`
- Uses `RingGeometry` for border effect
- Visibility toggled per instance

**Color Mapping**:
- Each gene ID gets consistent color
- Color calculated from gene ID hash
- HSL converted to RGB for Three.js

---

### `updateFood(foodArray)`

Updates food meshes.

**Process**:
1. Remove all old food meshes
2. Create new mesh for each food item
3. Set color (green or yellow for high-value)
4. Set position and size

**Note**: Recreated each frame (food changes frequently)

---

### `updatePheromones(pheromones)`

Updates pheromone meshes.

**Process**:
1. Remove all old pheromone meshes
2. Create new mesh for each pheromone
3. Set color based on type (danger/attack/reproduction)
4. Set opacity based on life
5. Set size (grows over time)

**Colors**:
- Danger: Blue/cyan (h: 200)
- Attack: Red/orange (h: 0)
- Reproduction: Green (h: 120)

---

### `updateObstacles(obstacles)`

Updates obstacle meshes.

**Process**:
1. Remove all old obstacle meshes
2. For each obstacle:
   - Create circle mesh (obstacle)
   - Create ring mesh (shadow/hiding zone)
3. Set positions and sizes

**Shadow Effect**:
- Semi-transparent ring around obstacle
- Represents hiding zone
- Reduces fear pheromone response

---

### `updateRays(agents)`

Updates ray visualization.

**Process**:
1. Clear all old rays
2. For each agent (if showRays enabled):
   - Create line for each ray
   - Color based on type:
     - Sensor rays: Cyan
     - Alignment rays: Yellow
     - Hit rays: Red
3. Set opacity based on ray type

**Note**: Only rendered when `showRays` is true

---

### `render()`

Renders the current frame.

**Process**:
1. Call `renderer.render(scene, camera)`

**Called**: Every frame via requestAnimationFrame

---

### `setShowRays(show)`

Toggles ray visualization.

**Parameters**:
- `show`: Boolean

---

### `hslToRgb(h, s, l)`

Converts HSL to RGB color.

**Parameters**:
- `h`: Hue (0-360)
- `s`: Saturation (0-100)
- `l`: Lightness (0-100)

**Returns**: THREE.Color object

**Algorithm**: Standard HSL to RGB conversion

## Key Features

### Instanced Rendering
- Agents rendered as instanced meshes
- Groups by gene ID for batching
- Efficient for hundreds of agents
- Only updates changed instances

### Gene ID Coloring
- Consistent colors per gene ID
- Visual identification of lineages
- Hash-based color generation

### Low Energy Indicator
- Red border ring when energy < 100
- Per-instance visibility control
- Clear visual feedback

### Action-Based Pheromones
- Color-coded by type
- Transparent rendering
- Size and opacity fade over time

### Performance Optimizations
- Instanced rendering for agents
- Reusable geometries
- Efficient material management
- GPU-accelerated rendering

## Usage Example

```javascript
import { WebGLRenderer } from './renderer.js';

const container = document.getElementById('canvas-container');
const renderer = new WebGLRenderer(container, 3200, 2400);

// Update entities
renderer.updateAgents(agents);
renderer.updateFood(food);
renderer.updatePheromones(pheromones);
renderer.updateObstacles(obstacles);
renderer.updateRays(agents);

// Update camera
renderer.updateCamera({ x: 1600, y: 1200, zoom: 0.3 });

// Render
renderer.render();
```

## Performance

- GPU-accelerated rendering
- Instanced meshes for efficient batching
- Minimal CPU overhead
- Handles hundreds of agents smoothly

## Dependencies

- **Three.js**: Loaded from CDN
  - `THREE.Scene`
  - `THREE.OrthographicCamera`
  - `THREE.WebGLRenderer`
  - `THREE.InstancedMesh`
  - `THREE.Mesh`
  - `THREE.Line`
  - `THREE.CircleGeometry`
  - `THREE.RingGeometry`
  - `THREE.MeshBasicMaterial`
  - `THREE.LineBasicMaterial`
  - `THREE.Color`
  - `THREE.Matrix4`
  - `THREE.Vector3`
  - `THREE.BufferGeometry`



