// --- AGENT TRAIL SYSTEM ---
// Creates and updates visual trails for agents

import * as THREE from 'three';
import { acquireColor, releaseColor } from './three-object-pool.js';
import { hslToRgb } from './utils.js';

/**
 * Update agent trail visualization
 * @param {Map} agentTrails - Map of agent id to trail data
 * @param {Object} agent - Agent to update trail for
 * @param {number} speedRatio - Speed ratio (0-1) for trail length
 * @param {THREE.Group} trailGroup - Three.js group for trails
 * @param {Object} logger - Logger instance
 */
export function updateAgentTrail(agentTrails, agent, speedRatio, trailGroup, logger) {
    if (!agent.id) return;

    const trailLength = Math.floor(speedRatio * 8); // 0-8 trail points based on speed
    if (trailLength < 2) return;

    let trail = agentTrails.get(agent.id);
    if (!trail) {
        // Create new trail
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(trailLength * 3);
        const colors = new Float32Array(trailLength * 3);
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        const material = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
            linewidth: 2
        });
        
        trail = new THREE.Line(geometry, material);
        trail.frustumCulled = false;
        trailGroup.add(trail);
        agentTrails.set(agent.id, trail);
        trail.userData.positions = positions;
        trail.userData.colors = colors;
        trail.userData.history = [];
    }

    // Add current position to history
    trail.userData.history.push({ x: agent.x, y: agent.y, time: Date.now() });
    
    // Keep only recent positions
    const maxAge = 200; // 200ms
    const now = Date.now();
    trail.userData.history = trail.userData.history.filter(p => now - p.time < maxAge);
    
    // Update geometry with trail positions
    const history = trail.userData.history;
    const positions = trail.userData.positions;
    const colors = trail.userData.colors;
    const rgb = hslToRgb(agent.geneColor.h, agent.geneColor.s, agent.geneColor.l, new Map(), 1000);
    const agentColor = acquireColor();
    agentColor.set(rgb.r, rgb.g, rgb.b);
    
    const count = Math.min(history.length, trailLength);
    for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const point = history[history.length - count + i];
        positions[i3] = point.x;
        positions[i3 + 1] = -point.y;
        positions[i3 + 2] = 0.05;
        
        // Fade trail from front to back
        const alpha = i / count;
        colors[i3] = agentColor.r * alpha;
        colors[i3 + 1] = agentColor.g * alpha;
        colors[i3 + 2] = agentColor.b * alpha;
    }
    
    releaseColor(agentColor);
    
    // Create proper array copies for Three.js
    const positionsCopy = new Float32Array(positions.subarray(0, count * 3));
    const colorsCopy = new Float32Array(colors.subarray(0, count * 3));
    
    trail.geometry.setAttribute('position', new THREE.BufferAttribute(positionsCopy, 3));
    trail.geometry.setAttribute('color', new THREE.BufferAttribute(colorsCopy, 3));
    trail.geometry.setDrawRange(0, count);
    trail.geometry.attributes.position.needsUpdate = true;
    trail.geometry.attributes.color.needsUpdate = true;
}

