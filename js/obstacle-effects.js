// --- OBSTACLE PARTICLE EFFECTS ---
// Creates particle systems for obstacles

import * as THREE from 'three';
import { EMISSIVE_COLORS } from './constants.js';

/**
 * Create particle system for obstacle energy/sparks
 * @param {Object} obstacle - Obstacle object
 * @param {Map} particleSystems - Map of obstacle id to particle system
 * @param {THREE.Group} obstacleGroup - Three.js group for obstacles
 * @param {Object} logger - Logger instance
 */
export function createObstacleParticles(obstacle, particleSystems, obstacleGroup, logger) {
    if (!obstacle.id) return;
    
    const particleCount = 20;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    
    const obstacleColor = new THREE.Color(EMISSIVE_COLORS.OBSTACLE);
    
    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        const angle = (i / particleCount) * Math.PI * 2;
        const radius = obstacle.radius * (0.8 + Math.random() * 0.4);
        positions[i3] = Math.cos(angle) * radius;
        positions[i3 + 1] = Math.sin(angle) * radius;
        positions[i3 + 2] = 0.1;
        
        obstacleColor.toArray(colors, i3);
        sizes[i] = 2 + Math.random() * 3;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    
    const material = new THREE.ShaderMaterial({
        vertexShader: `
            attribute float size;
            varying vec3 vColor;
            varying float vOpacity;
            void main() {
                // Three.js automatically provides 'color' attribute when vertexColors: true
                vColor = color;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = size * (300.0 / -mvPosition.z);
                vOpacity = 0.6;
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            varying float vOpacity;
            void main() {
                vec2 coord = gl_PointCoord - vec2(0.5);
                float dist = length(coord);
                float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
                alpha *= vOpacity;
                gl_FragColor = vec4(vColor, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true
    });
    
    const particles = new THREE.Points(geometry, material);
    particles.position.set(obstacle.x, -obstacle.y, 0.1);
    obstacleGroup.add(particles);
    particleSystems.set(obstacle.id, particles);
}














