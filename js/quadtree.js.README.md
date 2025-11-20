# quadtree.js Documentation

## Purpose

Spatial indexing data structure for efficient collision detection and spatial queries. Reduces collision checks from O(n²) to O(n log n).

## Classes

### Point

Represents a point in 2D space with associated data.

**Constructor**: `new Point(x, y, data)`

**Properties**:
- `x, y`: Coordinates
- `data`: Associated entity (agent, food, etc.)

---

### Rectangle

Axis-aligned bounding box.

**Constructor**: `new Rectangle(x, y, w, h)`

**Properties**:
- `x, y`: Center coordinates
- `w, h`: Half-width and half-height

**Methods**:
- `contains(point)`: Check if point is inside rectangle
- `intersects(range)`: Check if rectangle intersects another

---

### Quadtree

Spatial index that subdivides space into quadrants.

**Constructor**: `new Quadtree(boundary, capacity)`

**Parameters**:
- `boundary`: Rectangle defining tree bounds
- `capacity`: Max points per node before subdividing

**Properties**:
- `boundary`: Bounding rectangle
- `capacity`: Max points per node
- `points[]`: Array of points in this node
- `divided`: Whether node has been subdivided
- `northeast, northwest, southeast, southwest`: Child nodes

## Methods

### `insert(point)`

Inserts a point into the quadtree.

**Parameters**:
- `point`: Point instance to insert

**Process**:
1. Check if point is in boundary
2. If node not at capacity, add point
3. Otherwise, subdivide and insert into child

**Returns**: Boolean (success/failure)

**Time Complexity**: O(log n) average

---

### `query(range, found)`

Queries all points within a range.

**Parameters**:
- `range`: Rectangle to query
- `found`: Array to accumulate results (optional)

**Process**:
1. Check if range intersects boundary
2. Add points in this node that are in range
3. Recursively query children if subdivided

**Returns**: Array of point data

**Time Complexity**: O(log n) average

**Usage**:
```javascript
const queryRange = new Rectangle(agent.x, agent.y, radius, radius);
const nearby = quadtree.query(queryRange);
```

## Key Features

### Spatial Partitioning
- Divides space into quadrants
- Only checks relevant regions
- Efficient for sparse distributions

### Dynamic Subdivision
- Subdivides when node reaches capacity
- Creates 4 child nodes (NE, NW, SE, SW)
- Handles any distribution

### Efficient Queries
- O(log n) query time
- Only checks relevant nodes
- Essential for performance

## Usage Example

```javascript
import { Quadtree, Rectangle, Point } from './quadtree.js';

// Create quadtree
const boundary = new Rectangle(1600, 1200, 1600, 1200);
const quadtree = new Quadtree(boundary, 4);

// Insert entities
entities.forEach(entity => {
    quadtree.insert(new Point(entity.x, entity.y, entity));
});

// Query nearby entities
const queryRange = new Rectangle(agent.x, agent.y, 150, 150);
const nearby = quadtree.query(queryRange);
```

## Performance

- O(log n) insertion and query
- Much faster than O(n) brute force
- Essential for hundreds of agents
- Rebuilt each frame (entities move)

## Algorithm

```
Insert:
1. If point not in boundary → return false
2. If node has space → add point
3. If node full → subdivide, insert into child

Query:
1. If range doesn't intersect boundary → return
2. Check points in this node
3. If subdivided → query all children
```

## Preserved Implementation

- Exact implementation from original
- No changes to algorithm
- Proven performance characteristics



