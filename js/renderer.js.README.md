# renderer.js Documentation

## Purpose

WebGL renderer using Three.js for GPU-accelerated rendering of all simulation entities. Features cyberpunk aesthetics with post-processing effects, instanced rendering for performance, and comprehensive visual feedback systems.

## Class: WebGLRenderer

### Overview

Handles all visual rendering with advanced features:
- **Instanced Rendering**: Agents, food, and pheromones use instanced meshes for optimal performance
- **Post-Processing Pipeline**: Bloom, vignette, and chromatic aberration effects
- **Visual Effects System**: Particle sparkles, collision/eating effects, and state indicators
- **Frustum Culling**: Only renders visible entities for better performance
- **Object Pooling**: Reuses Three.js objects to minimize garbage collection
- **Specialization-Based Coloring**: Agents colored by their specialization type

## Constructor

```javascript
new WebGLRenderer(container, worldWidth, worldHeight, logger)
```

**Parameters**:
- `container`: DOM element to attach canvas
- `worldWidth`: World width in pixels (14400)
- `worldHeight`: World height in pixels (8100)
- `logger`: Logger instance for debugging

**Initialization**:
- Creates Three.js scene with cyberpunk background color
- Sets up orthographic camera (2D view)
- Configures WebGL renderer with antialiasing
- Initializes post-processing pipeline
- Creates rendering groups for all entity types
- Sets up lighting (ambient + directional for cyberpunk aesthetic)
- Pre-allocates reusable objects and arrays

## Three.js Setup

### Scene
- Deep space background color (`COLORS.BACKGROUND: 0x050510`)
- Ambient light (deep blue/cyan, intensity 0.5)
- Directional light (white, intensity 0.3) for MeshStandardMaterial visibility

### Camera
- Orthographic camera (2D view)
- View size: `max(worldWidth, worldHeight) * VIEW_SIZE_RATIO` (0.4 = 40% of world)
- Position: `z = CAMERA_Z_POSITION` (1000)
- Far plane: `CAMERA_FAR_PLANE` (10000)
- Updates based on simulation camera position

### Renderer
- WebGL renderer with antialiasing enabled
- Matches container size
- Uses device pixel ratio for crisp rendering
- Power preference set to "high-performance"

### Post-Processing Pipeline
- **Bloom Pass**: UnrealBloomPass with configurable strength (0.25), radius (1), and threshold (0.75)
- **Vignette Pass**: Custom shader for edge darkening (offset: 5, darkness: 0.1)
- **Chromatic Aberration**: Custom shader for color separation effect (offset: 0.001)
- All effects can be toggled via `setPostProcessingEnabled()`

## Rendering Groups

### `agentGroup`
- Instanced meshes for agents grouped by gene ID
- Each gene ID has separate body and border meshes
- Uses `InstancedMesh` for efficient rendering
- Maximum 200 instances per batch (`MAX_INSTANCES_PER_BATCH`)

### `foodGroup`
- Instanced mesh for all food items
- Single instanced mesh with per-instance attributes
- Color varies by food type (normal vs high-value)

### `pheromoneGroup`
- Instanced mesh for all pheromones
- Transparent materials with fade effects
- Size and opacity based on life remaining

### `obstacleGroup`
- Static meshes for obstacles
- Includes shadow rings (hiding zones) using `OBSTACLE_HIDING_RADIUS`

### `rayGroup`
- Line segments for ray visualization
- Recreated each frame when enabled
- Color-coded by ray type (food, obstacle, agent, edge, etc.)

### `agentStateGroup`
- Visual indicators for agent states
- Currently used for state visualization

### `agentEffectsGroup`
- Visual effects (collision rings, eating effects)
- Pooled mesh system for performance
- Fade out over time

### `sparkleGroup`
- Particle sparkle system for visual feedback
- Maximum 200 sparkles for performance
- Can be toggled via `setSparklesEnabled()`

## Key Methods

### `dispose()`
Comprehensive cleanup method to dispose of all WebGL resources and prevent memory leaks. Called when destroying the renderer.

**Process**:
1. Dispose agent meshes and materials
2. Dispose food and pheromone instanced meshes
3. Dispose ray visualization
4. Dispose agent state meshes
5. Dispose visual effects
6. Dispose sparkle system
7. Clear all groups from scene
8. Dispose post-processing composer
9. Dispose Three.js renderer
10. Clear all references

### `resize(width, height)`
Handles window resize events.

**Process**:
1. Calculate new aspect ratio
2. Update camera bounds based on `VIEW_SIZE_RATIO`
3. Update renderer size
4. Resize post-processing render targets

### `updateFrustum()`
Updates cached frustum for current camera position. Used for frustum culling optimization.

### `setupPostProcessing()`
Initializes the post-processing pipeline with bloom, vignette, and chromatic aberration effects. Can be disabled for performance.

### `updateCamera(cameraPos)`
Updates camera position and zoom.

**Parameters**:
- `cameraPos`: `{ x, y, zoom }` from simulation camera

**Process**:
1. Update camera position (Y-axis flipped for Three.js)
2. Update frustum for culling
3. Update camera projection matrix

### `updateAgents(agents, frameCount)`
Updates agent meshes using instanced rendering with frustum culling.

**Process**:
1. Group agents by gene ID
2. For each gene ID:
   - Create instanced mesh if needed (up to 200 instances)
   - Update instance matrices for visible agents only (frustum culling)
   - Update colors based on specialization type
   - Show/hide border based on energy level
3. Update instance counts
4. Use object pooling for matrices and vectors

**Instancing**:
- Allocates up to `MAX_INSTANCES_PER_BATCH` (200) instances per gene ID
- Uses `InstancedMesh` for efficient GPU rendering
- Only updates changed instances

**Border Rendering**:
- Red ring appears when `agent.energy < LOW_ENERGY_THRESHOLD` (100)
- Uses `RingGeometry` with `AGENT_BORDER_SIZE_MULTIPLIER` (1.15)
- Minimum border size: `AGENT_MINIMUM_BORDER_SIZE` (12)
- Visibility toggled per instance

**Color System**:
- Agents colored by specialization type from `AGENT_CONFIGS`
- Colors from `COLORS.AGENTS` (Forager: lime, Predator: red, etc.)
- Emissive colors from `EMISSIVE_COLORS.AGENTS` for glow effect

**Material Properties**:
- Uses `MeshStandardMaterial` with emissive properties
- Material properties from `MATERIAL_PROPERTIES.AGENT`
- Emissive intensity: 1.8, Metalness: 0.4, Roughness: 0.2, Opacity: 0.9

### `updateFood(foodArray)`
Updates food meshes using instanced rendering.

**Process**:
1. Cull food outside frustum
2. Create or update instanced mesh
3. Set per-instance attributes:
   - Position (x, y)
   - Size (based on food size and decay)
   - Color (normal: green, high-value: magenta)
4. Update instance count

**Colors**:
- Normal food: `COLORS.FOOD.NORMAL` (0x39FF14 - neon green)
- High-value food: `COLORS.FOOD.HIGH_VALUE` (0xFF00FF - neon magenta)

### `updatePheromones(pheromones)`
Updates pheromone meshes using instanced rendering.

**Process**:
1. Cull pheromones outside frustum
2. Create or update instanced mesh
3. Set per-instance attributes:
   - Position (x, y)
   - Size (based on radius and life)
   - Opacity (fades over time)
   - Color (based on type)
4. Update instance count

**Fade System**:
- Opacity decreases based on `PHEROMONE_FADE_RATE` (0.005 per frame)
- Size may vary based on life remaining

### `updateObstacles(obstacles)`
Updates obstacle meshes.

**Process**:
1. Remove all old obstacle meshes
2. For each obstacle:
   - Create circle mesh (obstacle body)
   - Create ring mesh (shadow/hiding zone)
3. Set positions, sizes, and colors
4. Use `COLORS.OBSTACLE` (0x9D00FF - neon purple)

**Shadow Effect**:
- Semi-transparent ring around obstacle
- Represents hiding zone (`OBSTACLE_HIDING_RADIUS`: 75)
- Reduces fear pheromone response when agents are inside

### `updateRays(agents, frameCount)`
Updates ray visualization using line segments.

**Process**:
1. Clear all old rays
2. For each agent (if `showRays` enabled):
   - Create line segments for each sensor ray
   - Color based on ray type:
     - Default: Cyan (`COLORS.RAYS.DEFAULT`)
     - No hit: Gray (`COLORS.RAYS.NO_HIT`)
     - Alignment: Yellow (`COLORS.RAYS.ALIGNMENT`)
     - Food: Green (`COLORS.RAYS.FOOD`)
     - Smaller agent: Lime (`COLORS.RAYS.SMALLER`)
     - Larger agent: Red (`COLORS.RAYS.LARGER`)
     - Obstacle: Purple (`COLORS.RAYS.OBSTACLE`)
     - Edge: Orange (`COLORS.RAYS.EDGE`)
     - Same specialization: Cyan (`COLORS.RAYS.SAME`)
3. Set opacity based on ray type
4. Only rendered when `showRays` is true

### `updateVisualEffects(currentFrame)`
Updates visual effects (collision rings, eating effects, sparkles).

**Process**:
1. Update current frame counter
2. Process agent effects:
   - Update effect meshes (fade out over time)
   - Remove expired effects
   - Pool meshes for reuse
3. Update sparkle particles:
   - Move and fade sparkles
   - Remove expired sparkles
   - Update sparkle point system

**Effect Types**:
- `collision`: Red glow when agents hit obstacles
- `eating`: Green glow when agents consume food

**Effect Duration**:
- Base duration: `EFFECT_DURATION_BASE` (7 frames)
- Fade duration: `EFFECT_FADE_DURATION` (15 frames)
- Scaled by game speed for proper timing

### `addVisualEffect(agent, effectType, gameSpeed)`
Adds a visual effect to an agent.

**Parameters**:
- `agent`: Agent instance
- `effectType`: 'collision' or 'eating'
- `gameSpeed`: Current game speed multiplier (for duration scaling)

**Process**:
1. Create effect entry with start frame and duration
2. Add sparkle particles for visual feedback
3. Duration adjusted by game speed

### `addSparkles(agent, effectType)`
Adds particle sparkles for visual effects.

**Process**:
1. Spawn 3-5 sparkles per effect
2. Set color based on effect type
3. Randomize position, velocity, and life
4. Limit to `maxSparkles` (200) for performance

### `updateSparkles()`
Updates sparkle particle positions and removes expired ones.

### `updateAgentStates(agents)`
Updates agent state visualization (currently minimal implementation).

### `updateVisualEffectsRendering()`
Renders visual effects using pooled meshes.

### `render()`
Renders the current frame.

**Process**:
1. If post-processing enabled: call `effectComposer.render()`
2. Otherwise: call `renderer.render(scene, camera)`

**Called**: Every frame via requestAnimationFrame

### `setShowRays(show)`
Toggles ray visualization.

**Parameters**:
- `show`: Boolean

### `setPostProcessingEnabled(enabled)`
Toggles post-processing effects.

**Parameters**:
- `enabled`: Boolean

**Note**: Disabling post-processing improves performance but removes visual effects.

### `setSparklesEnabled(enabled)`
Toggles sparkle particle system.

**Parameters**:
- `enabled`: Boolean

**Note**: Disabling sparkles improves performance on lower-end devices.

## Key Features

### Instanced Rendering
- Agents, food, and pheromones use `InstancedMesh` for efficient batching
- Groups agents by gene ID for optimal rendering
- Maximum 200 instances per batch
- Only updates changed instances

### Frustum Culling
- Only renders entities visible in camera frustum
- Significantly improves performance with large worlds
- Uses cached frustum for efficiency

### Object Pooling
- Reuses Three.js objects (matrices, vectors, geometries, materials)
- Minimizes garbage collection
- Uses `three-object-pool.js` for centralized pooling

### Specialization-Based Coloring
- Agents colored by specialization type from `AGENT_CONFIGS`
- Consistent colors per specialization
- Visual identification of agent types

### Low Energy Indicator
- Red border ring when energy < `LOW_ENERGY_THRESHOLD` (100)
- Per-instance visibility control
- Clear visual feedback for agent health

### Visual Effects System
- Particle sparkles for collision/eating events
- Ring effects that fade over time
- Pooled mesh system for performance
- Game speed-aware duration scaling

### Post-Processing Effects
- Bloom for bright elements (food, agents)
- Vignette for cinematic feel
- Chromatic aberration for cyberpunk aesthetic
- All effects configurable via `POST_PROCESSING` constants

### Performance Optimizations
- Instanced rendering for all entity types
- Frustum culling for off-screen entities
- Object pooling to minimize allocations
- Pre-allocated temp arrays
- HSL to RGB caching
- GPU-accelerated rendering

## Usage Example

```javascript
import { WebGLRenderer } from './renderer.js';
import { Logger, LOG_LEVELS } from './logger.js';

const container = document.getElementById('canvas-container');
const logger = new Logger(LOG_LEVELS.INFO);
const renderer = new WebGLRenderer(container, 14400, 8100, logger);

// Update entities
renderer.updateAgents(agents, frameCount);
renderer.updateFood(food);
renderer.updatePheromones(pheromones);
renderer.updateObstacles(obstacles);
renderer.updateRays(agents, frameCount);
renderer.updateVisualEffects(frameCount);

// Update camera
renderer.updateCamera({ x: 7200, y: 4050, zoom: 0.4 });

// Render
renderer.render();

// Cleanup when done
renderer.dispose();
```

## Performance

- **GPU-Accelerated**: All rendering uses WebGL/GPU
- **Instanced Meshes**: Efficient batching for hundreds of entities
- **Frustum Culling**: Only renders visible entities
- **Object Pooling**: Minimizes garbage collection
- **Optimized Materials**: Shared materials where possible
- **Post-Processing Toggle**: Can be disabled for lower-end devices
- **Sparkle Limit**: Maximum 200 sparkles for performance

## Dependencies

- **Three.js**: Core rendering library
  - `THREE.Scene`, `THREE.OrthographicCamera`, `THREE.WebGLRenderer`
  - `THREE.InstancedMesh`, `THREE.Mesh`, `THREE.Line`
  - `THREE.CircleGeometry`, `THREE.RingGeometry`
  - `THREE.MeshStandardMaterial`, `THREE.LineBasicMaterial`
  - `THREE.Color`, `THREE.Matrix4`, `THREE.Vector3`, `THREE.BufferGeometry`
  - `THREE.Points`, `THREE.PointsMaterial`
  - `THREE.Frustum`, `THREE.Sphere`
- **Three.js Post-Processing**:
  - `EffectComposer`, `RenderPass`, `UnrealBloomPass`, `ShaderPass`
- **Constants**: `constants.js` for all configuration values
- **Object Pooling**: `three-object-pool.js` for resource management
- **Array Pooling**: `array-pool.js` for temporary arrays

## Constants Used

- `COLORS`: Color palette for all visual elements
- `EMISSIVE_COLORS`: Emissive colors for glow effects
- `MATERIAL_PROPERTIES`: Material settings for cyberpunk aesthetic
- `POST_PROCESSING`: Post-processing configuration
- `VIEW_SIZE_RATIO`: Camera viewport size (0.4)
- `CAMERA_Z_POSITION`: Camera Z position (1000)
- `CAMERA_FAR_PLANE`: Camera far clipping plane (10000)
- `LOW_ENERGY_THRESHOLD`: Energy threshold for red border (100)
- `OBSTACLE_HIDING_RADIUS`: Obstacle shadow radius (75)
- `AGENT_BORDER_SIZE_MULTIPLIER`: Border size multiplier (1.15)
- `AGENT_MINIMUM_BORDER_SIZE`: Minimum border size (12)
- `MAX_INSTANCES_PER_BATCH`: Maximum instances per batch (200)
- `EFFECT_DURATION_BASE`: Base effect duration (7 frames)
- `EFFECT_FADE_DURATION`: Effect fade duration (15 frames)
- `SPECIALIZATION_TYPES`: Agent specialization types
- `AGENT_CONFIGS`: Agent configuration with colors
