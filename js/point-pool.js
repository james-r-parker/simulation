// Object pool for Point objects to reduce GC pressure
// Reuses Point objects instead of allocating new ones every quadtree rebuild

import { Point } from './quadtree.js';
import { POINT_POOL_SIZE } from './constants.js';

export class PointPool {
    constructor(initialSize = POINT_POOL_SIZE) {
        this.pool = [];
        this.activePoints = new Set();

        // Pre-allocate pool
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(new Point(0, 0, null, 0));
        }
    }

    acquire(x, y, data, radius) {
        let point;

        if (this.pool.length > 0) {
            // Reuse from pool
            point = this.pool.pop();
            point.x = x;
            point.y = y;
            point.data = data;
            point.radius = radius;
        } else {
            // Pool exhausted, create new (will be added to pool on release)
            point = new Point(x, y, data, radius);
        }

        this.activePoints.add(point);
        return point;
    }

    release(point) {
        if (this.activePoints.has(point)) {
            this.activePoints.delete(point);
            // Clear references to avoid memory leaks
            point.data = null;
            this.pool.push(point);
        }
    }

    releaseAll() {
        // Return all active points to pool
        for (const point of this.activePoints) {
            point.data = null;
            this.pool.push(point);
        }
        this.activePoints.clear();
    }

    getStats() {
        return {
            poolSize: this.pool.length,
            activeCount: this.activePoints.size,
            totalCapacity: this.pool.length + this.activePoints.size
        };
    }
}
