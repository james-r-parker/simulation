// Rectangle object pool for reusing Rectangle instances
// Eliminates frequent Rectangle allocations in agent perception ray bounds

import { Rectangle } from './quadtree.js';

class RectanglePool {
    constructor(initialSize = 100) {
        this.pool = [];
        this.stats = {
            acquired: 0,
            released: 0,
            created: 0,
            reused: 0
        };

        // Pre-populate pool
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(new Rectangle(0, 0, 0, 0));
            this.stats.created++;
        }
    }

    acquire(x, y, w, h) {
        this.stats.acquired++;

        let rect;
        if (this.pool.length > 0) {
            rect = this.pool.pop();
            this.stats.reused++;
        } else {
            rect = new Rectangle(0, 0, 0, 0);
            this.stats.created++;
        }

        // Set values
        rect.x = x;
        rect.y = y;
        rect.w = w;
        rect.h = h;

        return rect;
    }

    release(rect) {
        if (!rect) return;
        this.stats.released++;
        this.pool.push(rect);
    }

    releaseAll() {
        // Not needed for rectangles since they're released individually
    }

    getStats() {
        const poolSize = this.pool.length;
        const reuseRate = this.stats.acquired > 0
            ? (this.stats.reused / this.stats.acquired * 100).toFixed(1)
            : 0;

        return {
            acquired: this.stats.acquired,
            released: this.stats.released,
            created: this.stats.created,
            reused: this.stats.reused,
            poolSize: poolSize,
            reuseRate: `${reuseRate}%`
        };
    }

    clear() {
        this.pool = [];
        this.stats = {
            acquired: 0,
            released: 0,
            created: 0,
            reused: 0
        };
    }
}

// Export singleton instance for global use
export const rectanglePool = new RectanglePool(100);
