// --- THREE.JS OBJECT POOL FOR PERFORMANCE ---
// Reusable pool system for THREE.js objects to eliminate allocations in hot paths
// Similar to ArrayPool but designed for THREE.js objects with proper reset methods

// Memory leak detection: Track acquired objects in development mode
const POOL_LEAK_DETECTION = typeof __PRODUCTION__ === 'undefined' || !__PRODUCTION__;
const activeObjects = new WeakMap(); // Track active objects to detect leaks

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
        this.poolName = 'UnknownPool'; // Set by subclasses for better error messages

        // Pre-populate pool
        for (let i = 0; i < initialCapacity; i++) {
            this.pool.push(this.createFn());
        }
    }

    acquire() {
        this.stats.acquired++;

        let obj;
        if (this.pool.length > 0) {
            this.stats.reused++;
            obj = this.pool.pop();
            if (this.resetFn) {
                this.resetFn(obj);
            }
        } else {
            // Pool exhausted, create new object
            this.stats.created++;
            obj = this.createFn();
        }

        // Track object for leak detection in development
        if (POOL_LEAK_DETECTION) {
            activeObjects.set(obj, {
                pool: this.poolName,
                acquiredAt: Date.now(),
                stack: new Error().stack
            });
        }

        return obj;
    }

    release(obj) {
        if (!obj) return;

        this.stats.released++;

        // Remove from leak tracking
        if (POOL_LEAK_DETECTION) {
            activeObjects.delete(obj);
        }

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
    constructor(createFn, resetFn, initialCapacity = 50, poolName = 'SimpleObjectPool') {
        super(createFn, resetFn, initialCapacity);
        this.poolName = poolName;
    }
}

// Pool for THREE.js objects with GPU resources that need periodic clearing
class GPUResourcePool extends ObjectPool {
    constructor(createFn, resetFn, disposeFn, initialCapacity = 20, poolName = 'GPUResourcePool') {
        super(createFn, resetFn, initialCapacity);
        this.poolName = poolName;
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
import * as THREE from 'three';

// Matrix4 pool - safe to reuse indefinitely
export const matrix4Pool = new SimpleObjectPool(
    () => new THREE.Matrix4(),
    (matrix) => {
        // Reset matrix to identity
        matrix.identity();
    },
    100, // Higher capacity since these are used frequently
    'Matrix4Pool'
);

// Vector3 pool - safe to reuse indefinitely
export const vector3Pool = new SimpleObjectPool(
    () => new THREE.Vector3(),
    (vec) => {
        // Reset vector to zero
        vec.set(0, 0, 0);
    },
    50,
    'Vector3Pool'
);

// Vector2 pool - safe to reuse indefinitely
export const vector2Pool = new SimpleObjectPool(
    () => new THREE.Vector2(),
    (vec) => {
        // Reset vector to zero
        vec.set(0, 0);
    },
    20,
    'Vector2Pool'
);

// Color pool - safe to reuse indefinitely
export const colorPool = new SimpleObjectPool(
    () => new THREE.Color(),
    (color) => {
        // Reset color to black
        color.set(0, 0, 0);
    },
    50,
    'ColorPool'
);

// Frustum pool - safe to reuse indefinitely
export const frustumPool = new SimpleObjectPool(
    () => new THREE.Frustum(),
    (frustum) => {
        // Frustum doesn't have a simple reset method, but it's safe to reuse
        // The setFromProjectionMatrix method will overwrite its state
    },
    10,
    'FrustumPool'
);

// Sphere pool - safe to reuse indefinitely
export const spherePool = new SimpleObjectPool(
    () => new THREE.Sphere(),
    (sphere) => {
        // Reset sphere center and radius
        sphere.center.set(0, 0, 0);
        sphere.radius = 0;
    },
    20,
    'SpherePool'
);

// CircleGeometry pool - has GPU resources, needs periodic clearing
export const circleGeometryPool = new GPUResourcePool(
    () => new THREE.CircleGeometry(1, 32), // Default radius 1, 32 segments
    (geometry) => {
        // Reset geometry parameters
        geometry.dispose();
    },
    (geometry) => {
        geometry.dispose();
    },
    10,
    'CircleGeometryPool'
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
    20,
    'RingGeometryPool'
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
    20,
    'MeshBasicMaterialPool'
);

// MeshStandardMaterial pool - has GPU resources, needs periodic clearing
export const meshStandardMaterialPool = new GPUResourcePool(
    () => new THREE.MeshStandardMaterial(),
    (material) => {
        // Reset material to default state
        material.color.set(0xffffff);
        material.emissive.set(0x000000);
        material.emissiveIntensity = 0;
        material.metalness = 0;
        material.roughness = 1;
        material.transparent = false;
        material.opacity = 1;
        material.side = THREE.FrontSide;
        material.depthWrite = true;
    },
    (material) => {
        material.dispose();
    },
    30, // Higher capacity since these are used frequently for effects
    'MeshStandardMaterialPool'
);

// Utility functions for easy pool usage
export function acquireMatrix4() { return matrix4Pool.acquire(); }
export function releaseMatrix4(matrix) { matrix4Pool.release(matrix); }

export function acquireVector3() { return vector3Pool.acquire(); }
export function releaseVector3(vec) { vector3Pool.release(vec); }

export function acquireVector2() { return vector2Pool.acquire(); }
export function releaseVector2(vec) { vector2Pool.release(vec); }

export function acquireColor() { return colorPool.acquire(); }
export function releaseColor(color) { colorPool.release(color); }

export function acquireFrustum() { return frustumPool.acquire(); }
export function releaseFrustum(frustum) { frustumPool.release(frustum); }

export function acquireSphere() { return spherePool.acquire(); }
export function releaseSphere(sphere) { spherePool.release(sphere); }

export function acquireCircleGeometry(radius, segments) {
    const geometry = circleGeometryPool.acquire();
    // Note: CircleGeometry doesn't support dynamic radius/segments easily
    // We'll create new ones if radius/segments differ, but pool standard ones
    if (radius !== 1 || segments !== 32) {
        // For non-standard sizes, create new (could extend pool later)
        circleGeometryPool.release(geometry);
        return new THREE.CircleGeometry(radius, segments);
    }
    return geometry;
}
export function releaseCircleGeometry(geometry) {
    // Only release if it's from the pool (standard size)
    if (geometry.parameters && geometry.parameters.radius === 1 && geometry.parameters.segments === 32) {
        circleGeometryPool.release(geometry);
    } else {
        geometry.dispose();
    }
}

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

export function acquireMeshStandardMaterial(options = {}) {
    const material = meshStandardMaterialPool.acquire();
    // Apply options
    if (options.color !== undefined) {
        if (options.color instanceof THREE.Color) {
            material.color.copy(options.color);
        } else {
            material.color.set(options.color);
        }
    }
    if (options.emissive !== undefined) {
        if (options.emissive instanceof THREE.Color) {
            material.emissive.copy(options.emissive);
        } else {
            material.emissive.set(options.emissive);
        }
    }
    if (options.emissiveIntensity !== undefined) material.emissiveIntensity = options.emissiveIntensity;
    if (options.metalness !== undefined) material.metalness = options.metalness;
    if (options.roughness !== undefined) material.roughness = options.roughness;
    if (options.transparent !== undefined) material.transparent = options.transparent;
    if (options.opacity !== undefined) material.opacity = options.opacity;
    if (options.side !== undefined) material.side = options.side;
    if (options.depthWrite !== undefined) material.depthWrite = options.depthWrite;
    return material;
}
export function releaseMeshStandardMaterial(material) { meshStandardMaterialPool.release(material); }

// BufferGeometry pool - has GPU resources, needs periodic clearing
export const bufferGeometryPool = new GPUResourcePool(
    () => new THREE.BufferGeometry(),
    (geometry) => {
        // Clear all attributes
        const attributeNames = Object.keys(geometry.attributes);
        for (const name of attributeNames) {
            geometry.deleteAttribute(name);
        }
        geometry.setIndex(null);
    },
    (geometry) => {
        geometry.dispose();
    },
    20,
    'BufferGeometryPool'
);

// PointsMaterial pool - has GPU resources, needs periodic clearing
export const pointsMaterialPool = new GPUResourcePool(
    () => new THREE.PointsMaterial(),
    (material) => {
        // Reset material to default state
        material.color.set(0xffffff);
        material.size = 1;
        material.vertexColors = false;
        material.transparent = false;
        material.opacity = 1;
        material.sizeAttenuation = true;
    },
    (material) => {
        material.dispose();
    },
    10,
    'PointsMaterialPool'
);

// LineBasicMaterial pool - has GPU resources, needs periodic clearing
export const lineBasicMaterialPool = new GPUResourcePool(
    () => new THREE.LineBasicMaterial(),
    (material) => {
        // Reset material to default state
        material.color.set(0xffffff);
        material.vertexColors = false;
        material.transparent = false;
        material.opacity = 1;
        material.linewidth = 1;
    },
    (material) => {
        material.dispose();
    },
    10,
    'LineBasicMaterialPool'
);

// BufferAttribute pool - has GPU resources, needs periodic clearing
// Note: BufferAttributes are usually created with specific sizes, so pooling is limited
// But we can pool the attribute objects themselves
export const bufferAttributePool = new GPUResourcePool(
    () => new THREE.BufferAttribute(new Float32Array(0), 1),
    (attribute) => {
        // BufferAttribute doesn't have a simple reset, but we can clear the array
        if (attribute.array) {
            attribute.array.fill(0);
        }
    },
    (attribute) => {
        attribute.dispose();
    },
    30
);

// Utility functions for new pools
export function acquireBufferGeometry() { return bufferGeometryPool.acquire(); }
export function releaseBufferGeometry(geometry) { 
    // Clear attributes before releasing
    const attributeNames = Object.keys(geometry.attributes);
    for (const name of attributeNames) {
        geometry.deleteAttribute(name);
    }
    geometry.setIndex(null);
    bufferGeometryPool.release(geometry); 
}

export function acquirePointsMaterial(options = {}) {
    const material = pointsMaterialPool.acquire();
    // Apply options
    if (options.size !== undefined) material.size = options.size;
    if (options.color !== undefined) material.color.set(options.color);
    if (options.vertexColors !== undefined) material.vertexColors = options.vertexColors;
    if (options.transparent !== undefined) material.transparent = options.transparent;
    if (options.opacity !== undefined) material.opacity = options.opacity;
    if (options.sizeAttenuation !== undefined) material.sizeAttenuation = options.sizeAttenuation;
    return material;
}
export function releasePointsMaterial(material) { pointsMaterialPool.release(material); }

export function acquireLineBasicMaterial(options = {}) {
    const material = lineBasicMaterialPool.acquire();
    // Apply options
    if (options.color !== undefined) material.color.set(options.color);
    if (options.vertexColors !== undefined) material.vertexColors = options.vertexColors;
    if (options.transparent !== undefined) material.transparent = options.transparent;
    if (options.opacity !== undefined) material.opacity = options.opacity;
    if (options.linewidth !== undefined) material.linewidth = options.linewidth;
    return material;
}
export function releaseLineBasicMaterial(material) { lineBasicMaterialPool.release(material); }

export function acquireBufferAttribute(array, itemSize) {
    // For BufferAttribute, we usually need specific array sizes
    // So we'll create new ones but pool the objects when possible
    // This is a simplified version - in practice, attributes are often tied to geometries
    return new THREE.BufferAttribute(array, itemSize);
}
export function releaseBufferAttribute(attribute) {
    // Note: BufferAttributes are usually disposed with geometries
    // This is mainly for standalone attributes
    if (attribute) attribute.dispose();
}

// Debug function to get pool statistics
export function getPoolStats() {
    return {
        matrix4: matrix4Pool.getStats(),
        vector3: vector3Pool.getStats(),
        vector2: vector2Pool.getStats(),
        color: colorPool.getStats(),
        frustum: frustumPool.getStats(),
        sphere: spherePool.getStats(),
        circleGeometry: circleGeometryPool.getStats(),
        ringGeometry: ringGeometryPool.getStats(),
        meshBasicMaterial: meshBasicMaterialPool.getStats(),
        meshStandardMaterial: meshStandardMaterialPool.getStats(),
        bufferGeometry: bufferGeometryPool.getStats(),
        pointsMaterial: pointsMaterialPool.getStats(),
        lineBasicMaterial: lineBasicMaterialPool.getStats()
    };
}

// Function to manually clear GPU resource pools (for memory management)
export function clearGPUResourcePools() {
    circleGeometryPool.clearGPUResources();
    ringGeometryPool.clearGPUResources();
    meshBasicMaterialPool.clearGPUResources();
    meshStandardMaterialPool.clearGPUResources();
    bufferGeometryPool.clearGPUResources();
    pointsMaterialPool.clearGPUResources();
    lineBasicMaterialPool.clearGPUResources();
}

// Memory leak detection: Check for unreleased objects (development only)
export function checkPoolLeaks() {
    if (!POOL_LEAK_DETECTION) {
        return { leaks: 0, details: [] };
    }

    // Note: WeakMap doesn't allow iteration, so we can't directly check for leaks
    // This is a limitation - we'd need a different tracking mechanism for full leak detection
    // For now, we'll check pool statistics instead
    const pools = [
        { name: 'matrix4', pool: matrix4Pool },
        { name: 'vector3', pool: vector3Pool },
        { name: 'vector2', pool: vector2Pool },
        { name: 'color', pool: colorPool },
        { name: 'frustum', pool: frustumPool },
        { name: 'sphere', pool: spherePool }
    ];

    const leaks = [];
    for (const { name, pool } of pools) {
        const stats = pool.getStats();
        const unreleased = stats.acquired - stats.released;
        if (unreleased > 10) { // Warn if more than 10 objects unreleased
            leaks.push({
                pool: name,
                unreleased,
                acquired: stats.acquired,
                released: stats.released,
                reuseRate: stats.reuseRate
            });
        }
    }

    return {
        leaks: leaks.length,
        details: leaks
    };
}
