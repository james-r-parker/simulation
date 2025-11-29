// --- THREE.JS OBJECT POOL FOR PERFORMANCE ---
// Reusable pool system for THREE.js objects to eliminate allocations in hot paths
// Similar to ArrayPool but designed for THREE.js objects with proper reset methods

class ObjectPool {
    constructor(createFn, resetFn, initialCapacity = 50) {
        this.pool = [];
        this.createFn = createFn;
        this.resetFn = resetFn;
        this.stats = {
            acquired: 0,
            released: 0,
            created: 0,
            reused: 0
        };

        // Pre-populate pool
        for (let i = 0; i < initialCapacity; i++) {
            this.pool.push(this.createFn());
        }
    }

    acquire() {
        this.stats.acquired++;

        if (this.pool.length > 0) {
            this.stats.reused++;
            const obj = this.pool.pop();
            if (this.resetFn) {
                this.resetFn(obj);
            }
            return obj;
        }

        // Pool exhausted, create new object
        this.stats.created++;
        return this.createFn();
    }

    release(obj) {
        if (!obj) return;

        this.stats.released++;

        // Reset object state before returning to pool
        if (this.resetFn) {
            this.resetFn(obj);
        }
        this.pool.push(obj);
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

// Pool for simple THREE.js value objects that are safe to reuse indefinitely
class SimpleObjectPool extends ObjectPool {
    constructor(createFn, resetFn, initialCapacity = 50) {
        super(createFn, resetFn, initialCapacity);
    }
}

// Pool for THREE.js objects with GPU resources that need periodic clearing
class GPUResourcePool extends ObjectPool {
    constructor(createFn, resetFn, disposeFn, initialCapacity = 20) {
        super(createFn, resetFn, initialCapacity);
        this.disposeFn = disposeFn;
        this.lastClearTime = Date.now();
        this.clearInterval = 60 * 1000; // Clear every 1 minute (more aggressive)
    }

    release(obj) {
        // Check if we should clear the pool periodically
        const now = Date.now();
        if (now - this.lastClearTime > this.clearInterval) {
            this.clearGPUResources();
            this.lastClearTime = now;
        }

        super.release(obj);
    }

    clearGPUResources() {
        // Dispose of all objects in pool to free GPU resources
        for (const obj of this.pool) {
            if (this.disposeFn) {
                this.disposeFn(obj);
            }
        }
        this.pool.length = 0;
        this.stats.created = 0; // Reset creation count as we're clearing
    }
}

// Import THREE here to avoid circular dependencies
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// Matrix4 pool - safe to reuse indefinitely
export const matrix4Pool = new SimpleObjectPool(
    () => new THREE.Matrix4(),
    (matrix) => {
        // Reset matrix to identity
        matrix.identity();
    },
    100 // Higher capacity since these are used frequently
);

// Vector3 pool - safe to reuse indefinitely
export const vector3Pool = new SimpleObjectPool(
    () => new THREE.Vector3(),
    (vec) => {
        // Reset vector to zero
        vec.set(0, 0, 0);
    },
    50
);

// Color pool - safe to reuse indefinitely
export const colorPool = new SimpleObjectPool(
    () => new THREE.Color(),
    (color) => {
        // Reset color to black
        color.set(0, 0, 0);
    },
    50
);

// Frustum pool - safe to reuse indefinitely
export const frustumPool = new SimpleObjectPool(
    () => new THREE.Frustum(),
    (frustum) => {
        // Frustum doesn't have a simple reset method, but it's safe to reuse
        // The setFromProjectionMatrix method will overwrite its state
    },
    10
);

// Sphere pool - safe to reuse indefinitely
export const spherePool = new SimpleObjectPool(
    () => new THREE.Sphere(),
    (sphere) => {
        // Reset sphere center and radius
        sphere.center.set(0, 0, 0);
        sphere.radius = 0;
    },
    20
);

// RingGeometry pool - has GPU resources, needs periodic clearing
export const ringGeometryPool = new GPUResourcePool(
    () => new THREE.RingGeometry(1, 2, 32), // Default parameters
    (geometry) => {
        // RingGeometry doesn't have state to reset, parameters are set when created
    },
    (geometry) => {
        geometry.dispose();
    },
    20
);

// MeshBasicMaterial pool - has GPU resources, needs periodic clearing
export const meshBasicMaterialPool = new GPUResourcePool(
    () => new THREE.MeshBasicMaterial(),
    (material) => {
        // Reset material to default state
        material.color.set(0xffffff);
        material.transparent = false;
        material.opacity = 1;
        material.side = THREE.FrontSide;
        material.depthWrite = true;
    },
    (material) => {
        material.dispose();
    },
    20
);

// Utility functions for easy pool usage
export function acquireMatrix4() { return matrix4Pool.acquire(); }
export function releaseMatrix4(matrix) { matrix4Pool.release(matrix); }

export function acquireVector3() { return vector3Pool.acquire(); }
export function releaseVector3(vec) { vector3Pool.release(vec); }

export function acquireColor() { return colorPool.acquire(); }
export function releaseColor(color) { colorPool.release(color); }

export function acquireFrustum() { return frustumPool.acquire(); }
export function releaseFrustum(frustum) { frustumPool.release(frustum); }

export function acquireSphere() { return spherePool.acquire(); }
export function releaseSphere(sphere) { spherePool.release(sphere); }

export function acquireRingGeometry(innerRadius = 1, outerRadius = 2, segments = 32) {
    const geometry = ringGeometryPool.acquire();
    // Update geometry parameters if different from default
    if (geometry.parameters.innerRadius !== innerRadius ||
        geometry.parameters.outerRadius !== outerRadius ||
        geometry.parameters.thetaSegments !== segments) {
        // Need to recreate geometry with new parameters
        ringGeometryPool.release(geometry);
        return new THREE.RingGeometry(innerRadius, outerRadius, segments);
    }
    return geometry;
}
export function releaseRingGeometry(geometry) { ringGeometryPool.release(geometry); }

export function acquireMeshBasicMaterial(options = {}) {
    const material = meshBasicMaterialPool.acquire();
    // Apply options
    if (options.color !== undefined) material.color.set(options.color);
    if (options.transparent !== undefined) material.transparent = options.transparent;
    if (options.opacity !== undefined) material.opacity = options.opacity;
    if (options.side !== undefined) material.side = options.side;
    if (options.depthWrite !== undefined) material.depthWrite = options.depthWrite;
    return material;
}
export function releaseMeshBasicMaterial(material) { meshBasicMaterialPool.release(material); }

// Debug function to get pool statistics
export function getPoolStats() {
    return {
        matrix4: matrix4Pool.getStats(),
        vector3: vector3Pool.getStats(),
        color: colorPool.getStats(),
        frustum: frustumPool.getStats(),
        sphere: spherePool.getStats(),
        ringGeometry: ringGeometryPool.getStats(),
        meshBasicMaterial: meshBasicMaterialPool.getStats()
    };
}

// Function to manually clear GPU resource pools (for memory management)
export function clearGPUResourcePools() {
    ringGeometryPool.clearGPUResources();
    meshBasicMaterialPool.clearGPUResources();
}
