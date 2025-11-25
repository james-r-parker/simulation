// --- ARRAY POOL FOR PERFORMANCE ---
// Reusable array pool to eliminate allocations in hot paths
// Usage:
//   const arr = pool.acquire();
//   // ... use array ...
//   pool.release(arr);

export class ArrayPool {
    constructor(initialCapacity = 50) {
        this.pool = [];
        this.stats = {
            acquired: 0,
            released: 0,
            created: 0,
            reused: 0
        };

        // Pre-populate pool
        for (let i = 0; i < initialCapacity; i++) {
            this.pool.push([]);
        }
    }

    acquire() {
        this.stats.acquired++;

        if (this.pool.length > 0) {
            this.stats.reused++;
            return this.pool.pop();
        }

        // Pool exhausted, create new array
        this.stats.created++;
        return [];
    }

    release(array) {
        if (!array) return;

        this.stats.released++;

        // Clear the array and return to pool
        array.length = 0;
        this.pool.push(array);
    }

    releaseAll() {
        // Convenience method - does nothing since we release individually
        // Kept for API compatibility
    }

    getStats() {
        return {
            ...this.stats,
            poolSize: this.pool.length,
            reuseRate: this.stats.acquired > 0
                ? (this.stats.reused / this.stats.acquired * 100).toFixed(1) + '%'
                : '0%'
        };
    }

    clear() {
        this.pool.length = 0;
        this.stats = {
            acquired: 0,
            released: 0,
            created: 0,
            reused: 0
        };
    }
}

// Global array pool for quadtree queries
export const queryArrayPool = new ArrayPool(100);
