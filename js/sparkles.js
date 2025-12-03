// --- SPARKLE PARTICLE SYSTEM ---
// Handles sparkle particle effects for visual feedback

import * as THREE from 'three';
import { EMISSIVE_COLORS } from './constants.js';
import {
    acquireColor, releaseColor,
    acquireBufferGeometry
} from './three-object-pool.js';

/**
 * Add sparkles for a visual effect
 * @param {Array} sparkles - Array of sparkle objects
 * @param {Object} agent - Agent that triggered the effect
 * @param {string} effectType - Type of effect ('collision' or 'eating')
 * @param {number} maxSparkles - Maximum number of sparkles allowed
 */
export function addSparkles(sparkles, agent, effectType, maxSparkles) {
    if (!agent || agent.isDead) return;
    if (sparkles.length >= maxSparkles) return; // Limit for performance

    // Spawn 3-5 sparkles per effect
    const sparkleCount = 3 + Math.floor(Math.random() * 3);
    const color = effectType === 'collision' ? EMISSIVE_COLORS.EFFECTS.COLLISION : EMISSIVE_COLORS.EFFECTS.EATING;

    for (let i = 0; i < sparkleCount; i++) {
        if (sparkles.length >= maxSparkles) break;

        const angle = Math.random() * Math.PI * 2;
        const distance = agent.size * (0.5 + Math.random() * 0.5);
        const speed = 0.5 + Math.random() * 1.0;
        const life = 20 + Math.floor(Math.random() * 20); // 20-40 frames

        sparkles.push({
            x: agent.x + Math.cos(angle) * distance,
            y: agent.y + Math.sin(angle) * distance,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            color: color,
            life: life,
            maxLife: life,
            size: 4 + Math.random() * 6 // Larger sparkles: 4-10 instead of 2-4
        });
    }
}

/**
 * Update sparkle positions and rendering
 * @param {Array} sparkles - Array of sparkle objects
 * @param {THREE.Group} sparkleGroup - Three.js group for sparkles
 * @param {THREE.Scene} scene - Three.js scene
 * @param {Object} sparkleState - State object: { sparklePoints, sparklePositionsBuffer, sparkleColorsBuffer, sparkleSizesBuffer }
 * @param {boolean} sparklesEnabled - Whether sparkles are enabled
 * @returns {Object} Updated sparkle state
 */
export function updateSparkles(sparkles, sparkleGroup, scene, sparkleState, sparklesEnabled) {
    if (!sparklesEnabled) {
        // Hide sparkles if disabled
        if (sparkleState.sparklePoints) {
            const geometry = sparkleState.sparklePoints.geometry;
            if (geometry.attributes.position) {
                geometry.attributes.position.count = 0;
                geometry.attributes.position.needsUpdate = true;
            }
            if (geometry.attributes.color) {
                geometry.attributes.color.count = 0;
                geometry.attributes.color.needsUpdate = true;
            }
            if (geometry.attributes.size) {
                geometry.attributes.size.count = 0;
                geometry.attributes.size.needsUpdate = true;
            }
            sparkleState.sparklePoints.visible = false;
        }
        return sparkleState;
    }
    
    // Update and remove expired sparkles
    for (let i = sparkles.length - 1; i >= 0; i--) {
        const sparkle = sparkles[i];
        sparkle.x += sparkle.vx;
        sparkle.y += sparkle.vy;
        sparkle.vx *= 0.95; // Friction
        sparkle.vy *= 0.95;
        sparkle.life--;

        if (sparkle.life <= 0) {
            sparkles.splice(i, 1);
        }
    }

    // Update sparkle meshes - reuse when possible
    if (sparkles.length > 0) {
        // Reuse or create buffers with growth strategy (1.5x growth factor)
        const neededSize = sparkles.length * 3;
        if (!sparkleState.sparklePositionsBuffer || sparkleState.sparklePositionsBuffer.length < neededSize) {
            const growSize = Math.ceil(neededSize * 1.5); // Allocate 1.5x to reduce reallocations
            sparkleState.sparklePositionsBuffer = new Float32Array(growSize);
            sparkleState.sparkleColorsBuffer = new Float32Array(growSize);
            sparkleState.sparkleSizesBuffer = new Float32Array(Math.ceil(sparkles.length * 1.5));
        }
        const positions = sparkleState.sparklePositionsBuffer.subarray(0, neededSize);
        const colors = sparkleState.sparkleColorsBuffer.subarray(0, neededSize);
        const sizes = sparkleState.sparkleSizesBuffer.subarray(0, sparkles.length);

        for (let i = 0; i < sparkles.length; i++) {
            const sparkle = sparkles[i];
            const i3 = i * 3;
            positions[i3] = sparkle.x;
            positions[i3 + 1] = -sparkle.y; // Flip Y for Three.js
            positions[i3 + 2] = 0.2; // Slightly above other objects

            const color = acquireColor();
            color.setHex(sparkle.color);
            // Brighten sparkle colors significantly
            color.multiplyScalar(1.8);
            const opacity = sparkle.life / sparkle.maxLife;
            colors[i3] = Math.min(color.r, 1.0); // Clamp to valid range
            colors[i3 + 1] = Math.min(color.g, 1.0);
            colors[i3 + 2] = Math.min(color.b, 1.0);
            releaseColor(color); // Release after use

            sizes[i] = sparkle.size * opacity;
        }

        // Reuse existing geometry and Points object if available
        if (!sparkleState.sparklePoints) {
            // CRITICAL: Create proper array copies instead of subarray views
            // Three.js BufferAttribute needs to own the array data
            const positionsCopy = new Float32Array(positions);
            const colorsCopy = new Float32Array(colors);
            const sizesCopy = new Float32Array(sizes);
            
            const geometry = acquireBufferGeometry();
            const positionAttr = new THREE.BufferAttribute(positionsCopy, 3);
            positionAttr.count = sparkles.length;
            geometry.setAttribute('position', positionAttr);
            
            const colorAttr = new THREE.BufferAttribute(colorsCopy, 3);
            colorAttr.count = sparkles.length;
            geometry.setAttribute('color', colorAttr);
            
            const sizeAttr = new THREE.BufferAttribute(sizesCopy, 1);
            sizeAttr.count = sparkles.length;
            geometry.setAttribute('size', sizeAttr);

            // Create custom shader material for soft circular sparkles
            const sparkleShaderMaterial = new THREE.ShaderMaterial({
                vertexShader: `
                    attribute float size;
                    varying vec3 vColor;
                    varying float vOpacity;
                    void main() {
                        // Three.js automatically provides 'color' attribute when vertexColors: true
                        vColor = color;
                        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                        gl_PointSize = size * (300.0 / -mvPosition.z);
                        vOpacity = min(size / 3.0, 1.0); // Higher base opacity, clamp to 1.0
                        gl_Position = projectionMatrix * mvPosition;
                    }
                `,
                fragmentShader: `
                    varying vec3 vColor;
                    varying float vOpacity;
                    void main() {
                        vec2 coord = gl_PointCoord - vec2(0.5);
                        float dist = length(coord);
                        // Soft circular falloff with smooth edges - brighter and more visible
                        float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
                        alpha *= vOpacity * 1.5; // Increase opacity by 50%
                        // Brighten the color for more visibility
                        vec3 brightColor = vColor * 1.5;
                        gl_FragColor = vec4(brightColor, alpha);
                    }
                `,
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                vertexColors: true
            });

            sparkleState.sparklePoints = new THREE.Points(geometry, sparkleShaderMaterial);
            sparkleState.sparklePoints.visible = true;
            
            // CRITICAL: Ensure sparkleGroup is in scene before adding sparklePoints
            if (sparkleGroup.parent !== scene) {
                scene.add(sparkleGroup);
            }
            
            // Only add if not already in the group (safety check)
            if (!sparkleGroup.children.includes(sparkleState.sparklePoints)) {
                sparkleGroup.add(sparkleState.sparklePoints);
            }
            
            // CRITICAL: Compute bounding sphere for proper rendering
            geometry.computeBoundingSphere();
        } else {
            // Update existing attributes instead of creating new ones
            const geometry = sparkleState.sparklePoints.geometry;
            const posAttr = geometry.attributes.position;
            const colorAttr = geometry.attributes.color;
            const sizeAttr = geometry.attributes.size;

            // Update existing attributes if buffer size matches, otherwise recreate
            if (posAttr && posAttr.array.length >= neededSize) {
                posAttr.array.set(positions);
                posAttr.needsUpdate = true;
                posAttr.count = sparkles.length;
            } else {
                // CRITICAL: Create proper array copy instead of subarray view
                const positionsCopy = new Float32Array(positions);
                const newAttr = new THREE.BufferAttribute(positionsCopy, 3);
                newAttr.count = sparkles.length;
                newAttr.needsUpdate = true;
                geometry.setAttribute('position', newAttr);
            }

            if (colorAttr && colorAttr.array.length >= neededSize) {
                colorAttr.array.set(colors);
                colorAttr.needsUpdate = true;
                colorAttr.count = sparkles.length;
            } else {
                // CRITICAL: Create proper array copy instead of subarray view
                const colorsCopy = new Float32Array(colors);
                const newAttr = new THREE.BufferAttribute(colorsCopy, 3);
                newAttr.count = sparkles.length;
                newAttr.needsUpdate = true;
                geometry.setAttribute('color', newAttr);
            }

            if (sizeAttr && sizeAttr.array.length >= sparkles.length) {
                sizeAttr.array.set(sizes);
                sizeAttr.needsUpdate = true;
                sizeAttr.count = sparkles.length;
            } else {
                // CRITICAL: Create proper array copy instead of subarray view
                const sizesCopy = new Float32Array(sizes);
                const newAttr = new THREE.BufferAttribute(sizesCopy, 1);
                newAttr.count = sparkles.length;
                newAttr.needsUpdate = true;
                geometry.setAttribute('size', newAttr);
            }
            
            // CRITICAL: Ensure sparklePoints is still in the scene hierarchy and visible
            if (sparkleGroup.parent !== scene) {
                scene.add(sparkleGroup);
            }
            if (!sparkleGroup.children.includes(sparkleState.sparklePoints)) {
                sparkleGroup.add(sparkleState.sparklePoints);
            }
            
            // CRITICAL: Always ensure visible and valid when we have sparkles
            sparkleState.sparklePoints.visible = true;
            
            // CRITICAL: Recompute bounding sphere when attributes change
            geometry.computeBoundingSphere();
            
            // CRITICAL: Force geometry update to ensure rendering
            geometry.attributes.position.needsUpdate = true;
            geometry.attributes.color.needsUpdate = true;
            geometry.attributes.size.needsUpdate = true;
        }
    } else {
        // No sparkles - hide Points object but keep it for reuse
        if (sparkleState.sparklePoints) {
            const geometry = sparkleState.sparklePoints.geometry;
            if (geometry.attributes.position) {
                geometry.attributes.position.count = 0;
                geometry.attributes.position.needsUpdate = true;
            }
            if (geometry.attributes.color) {
                geometry.attributes.color.count = 0;
                geometry.attributes.color.needsUpdate = true;
            }
            if (geometry.attributes.size) {
                geometry.attributes.size.count = 0;
                geometry.attributes.size.needsUpdate = true;
            }
            sparkleState.sparklePoints.visible = false;
        }
    }

    return sparkleState;
}




