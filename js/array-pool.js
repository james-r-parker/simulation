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

// Pool for hit type arrays (4-element arrays used in ray casting)
class HitTypeArrayPool {
    constructor(initialSize = 200) {
        this.pool = [];
        this.stats = {
            acquired: 0,
            released: 0,
            created: 0,
            reused: 0
        };

        // Pre-populate pool
        for (let i = 0; i < initialSize; i++) {
            this.pool.push([0, 0, 0, 0]);
        }
    }

    acquire() {
        this.stats.acquired++;

        if (this.pool.length > 0) {
            this.stats.reused++;
            const arr = this.pool.pop();
            // Reset values
            arr[0] = 0; arr[1] = 0; arr[2] = 0; arr[3] = 0;
            return arr;
        }

        // Pool exhausted, create new array
        this.stats.created++;
        return [0, 0, 0, 0];
    }

    release(array) {
        if (!array || array.length !== 4) return;

        this.stats.released++;
        this.pool.push(array);
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
}

// Global pools
export const queryArrayPool = new ArrayPool(100);
export const hitTypeArrayPool = new HitTypeArrayPool(200);
