// --- RAY VISUALIZATION SYSTEM ---
// Visualizes agent perception rays

import * as THREE from 'three';
import { COLORS } from './constants.js';
import {
    acquireFrustum, releaseFrustum,
    acquireMatrix4, releaseMatrix4,
    acquireVector3, releaseVector3,
    acquireSphere, releaseSphere,
    acquireBufferGeometry, releaseBufferGeometry,
    acquireLineBasicMaterial, releaseLineBasicMaterial
} from './three-object-pool.js';

/**
 * Update ray visualization
 * @param {THREE.Group} rayGroup - Three.js group for rays
 * @param {Array} agents - Array of agents
 * @param {number} frameCount - Current frame count
 * @param {boolean} showRays - Whether to show rays
 * @param {number} worldWidth - World width
 * @param {number} worldHeight - World height
 * @param {THREE.Camera} camera - Three.js camera
 * @param {THREE.Frustum} frustum - Three.js frustum for culling
 * @param {THREE.Vector3} tempVec - Temporary vector for calculations
 * @param {THREE.Sphere} testSphere - Temporary sphere for culling
 * @param {Array} tempActiveAgents - Temporary array for active agents
 * @param {Object} rayState - Ray state: { rayLineSegments, rayPositionsBuffer, rayColorsBuffer, rayColors }
 * @param {Object} logger - Logger instance
 */
export function updateRays(rayGroup, agents, frameCount, showRays, worldWidth, worldHeight, camera, frustum, tempVec, testSphere, tempActiveAgents, rayState, logger) {
    if (!showRays) {
        // Hide all rays if disabled
        if (rayState.rayLineSegments) {
            rayState.rayLineSegments.visible = false;
        }
        return;
    }

    // Frustum culling for rays
    const frustumObj = acquireFrustum();
    const matrix = acquireMatrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustumObj.setFromProjectionMatrix(matrix);
    const tempVecObj = acquireVector3();
    const testSphereObj = acquireSphere();
    testSphereObj.center = tempVecObj; // Reuse the acquired vector
    testSphereObj.radius = 0;

    // OPTIMIZED: Only show rays for top 5 agents (or best agent) - use for loop
    // PERFORMANCE: Reuse temp array instead of allocating
    tempActiveAgents.length = 0;
    const numAgents = agents.length;
    for (let i = 0; i < numAgents; i++) {
        const agent = agents[i];
        if (agent && !agent.isDead && agent.lastRayData) {
            // Frustum check
            const agentSize = agent.size || 5;
            tempVecObj.set(agent.x, -agent.y, 0);
            testSphereObj.center = tempVecObj;
            testSphereObj.radius = agentSize + agent.maxRayDist; // Check if rays could be in view

            if (frustumObj.intersectsSphere(testSphereObj)) {
                tempActiveAgents.push(agent);
            }
        }
    }
    if (tempActiveAgents.length === 0) {
        if (rayState.rayLineSegments) {
            rayState.rayLineSegments.visible = false;
        }
        releaseFrustum(frustumObj);
        releaseMatrix4(matrix);
        releaseVector3(tempVecObj);
        releaseSphere(testSphereObj);
        return;
    }

    // Sort by fitness and take top 5
    const topAgents = tempActiveAgents
        .sort((a, b) => (b.fitness || 0) - (a.fitness || 0))
        .slice(0, 5);

    // OPTIMIZED: Count total rays needed with for loop
    let totalRays = 0;
    for (let i = 0; i < topAgents.length; i++) {
        const agent = topAgents[i];
        if (agent && agent.lastRayData) {
            totalRays += agent.lastRayData.length;
        }
    }

    if (totalRays === 0) {
        if (rayState.rayLineSegments) {
            rayState.rayLineSegments.visible = false;
        }
        releaseFrustum(frustumObj);
        releaseMatrix4(matrix);
        releaseVector3(tempVecObj);
        releaseSphere(testSphereObj);
        return;
    }

    // Use single LineSegments geometry for all rays (much faster)
    const neededVertexCount = totalRays * 2;
    if (!rayState.rayLineSegments || rayState.rayLineSegments.geometry.attributes.position.count < neededVertexCount) {
        // Allocate for max rays with growth strategy (1.5x growth factor)
        const maxRays = Math.max(Math.ceil(totalRays * 1.5), 500);
        const neededPosSize = maxRays * 2 * 3;
        const neededColorSize = maxRays * 2 * 3;
        
        // Reuse or create buffers with growth strategy
        if (!rayState.rayPositionsBuffer || rayState.rayPositionsBuffer.length < neededPosSize) {
            rayState.rayPositionsBuffer = new Float32Array(neededPosSize);
            rayState.rayColorsBuffer = new Float32Array(neededColorSize);
        }
        
        // Create or resize geometry
        if (rayState.rayLineSegments) {
            rayGroup.remove(rayState.rayLineSegments);
            // Release pooled resources
            releaseBufferGeometry(rayState.rayLineSegments.geometry);
            releaseLineBasicMaterial(rayState.rayLineSegments.material);
        }

        const positions = rayState.rayPositionsBuffer.subarray(0, neededPosSize);
        const colors = rayState.rayColorsBuffer.subarray(0, neededColorSize);
        const geometry = acquireBufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        // Create clean ray material without reflection effects
        const material = acquireLineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.9, // Increased opacity for better visibility
            linewidth: 2 // Thicker lines for better glow effect
        });

        rayState.rayLineSegments = new THREE.LineSegments(geometry, material);
        rayGroup.add(rayState.rayLineSegments);
    }

    // Update positions and colors directly in buffer
    const positions = rayState.rayLineSegments.geometry.attributes.position.array;
    const colors = rayState.rayLineSegments.geometry.attributes.color.array;
    let bufferIndex = 0;

    // OPTIMIZED: Use for loop instead of forEach
    for (let i = 0; i < topAgents.length; i++) {
        const agent = topAgents[i];
        if (!agent || !agent.lastRayData || agent.isDead) continue;

        // Validate agent position
        if (typeof agent.x !== 'number' || typeof agent.y !== 'number' ||
            !isFinite(agent.x) || !isFinite(agent.y)) {
            continue;
        }

        const agentX = agent.x;
        const agentY = -agent.y; // Flip Y for Three.js

        // OPTIMIZED: Use for loop instead of forEach
        const rayData = agent.lastRayData;

        for (let j = 0; j < rayData.length; j++) {
            const ray = rayData[j];
            // Validate ray data
            const angle = typeof ray.angle === 'number' && isFinite(ray.angle) ? ray.angle : 0;
            const dist = typeof ray.dist === 'number' && isFinite(ray.dist) && ray.dist >= 0 ? ray.dist : 0;

            // Start position
            positions[bufferIndex * 3] = agentX;
            positions[bufferIndex * 3 + 1] = agentY;
            positions[bufferIndex * 3 + 2] = 0;

            // End position
            const endX = agentX + Math.cos(angle) * dist;
            const endY = agentY - Math.sin(angle) * dist;
            positions[(bufferIndex + 1) * 3] = isFinite(endX) ? endX : agentX;
            positions[(bufferIndex + 1) * 3 + 1] = isFinite(endY) ? endY : agentY;
            positions[(bufferIndex + 1) * 3 + 2] = 0;

            // Color based on hit type
            let color = rayState.rayColors.default;

            if (ray.type === 'alignment') {
                color = rayState.rayColors.alignment;
            } else if (ray.hit && ray.hitType && ray.hitType !== 'none') {
                // Something was hit - color based on hit type
                if (ray.hitType === 'food') { color = rayState.rayColors.food; }
                else if (ray.hitType === 'smaller') { color = rayState.rayColors.smaller; }
                else if (ray.hitType === 'larger') { color = rayState.rayColors.larger; }
                else if (ray.hitType === 'obstacle') { color = rayState.rayColors.obstacle; }
                else if (ray.hitType === 'edge') { color = rayState.rayColors.edge; }
                else if (ray.hitType === 'same') { color = rayState.rayColors.same; }
                else { color = rayState.rayColors.larger; } // Fallback to red
            } else if (ray.hit) {
                color = rayState.rayColors.larger; // Red
            } else {
                // No hit - use dull gray color
                color = rayState.rayColors.noHit;
            }

            const r = color.r;
            const g = color.g;
            const b = color.b;

            // Apply to both start and end points
            for (let k = 0; k < 2; k++) {
                colors[bufferIndex * 3] = r;
                colors[bufferIndex * 3 + 1] = g;
                colors[bufferIndex * 3 + 2] = b;
                bufferIndex++;
            }
        }
    }

    // Update geometry
    rayState.rayLineSegments.geometry.attributes.position.needsUpdate = true;
    rayState.rayLineSegments.geometry.attributes.color.needsUpdate = true;
    rayState.rayLineSegments.geometry.setDrawRange(0, bufferIndex);
    rayState.rayLineSegments.visible = true;

    // Release pooled objects
    releaseFrustum(frustumObj);
    releaseMatrix4(matrix);
    releaseVector3(tempVecObj);
    releaseSphere(testSphereObj);
}

/**
 * Initialize ray colors
 * @returns {Object} Ray color objects
 */
export function initRayColors() {
    return {
        default: new THREE.Color(COLORS.RAYS.DEFAULT),
        noHit: new THREE.Color(COLORS.RAYS.NO_HIT),
        alignment: new THREE.Color(COLORS.RAYS.ALIGNMENT),
        food: new THREE.Color(COLORS.RAYS.FOOD),
        smaller: new THREE.Color(COLORS.RAYS.SMALLER),
        larger: new THREE.Color(COLORS.RAYS.LARGER),
        obstacle: new THREE.Color(COLORS.RAYS.OBSTACLE),
        edge: new THREE.Color(COLORS.RAYS.EDGE),
        same: new THREE.Color(COLORS.RAYS.SAME)
    };
}













