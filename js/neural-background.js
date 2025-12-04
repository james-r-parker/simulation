// --- NEURAL NETWORK BACKGROUND SYSTEM ---
// Creates and manages the animated neural network background

import * as THREE from 'three';
import {
    BACKGROUND_WIDTH, BACKGROUND_HEIGHT,
    NEURAL_NODES_COUNT, NEURAL_CONNECTION_DISTANCE, MAX_CONNECTIONS_PER_NODE,
    NEURAL_PARALLAX_FACTOR, NEURAL_NODE_SIZE,
    NEURAL_PULSE_SPEED, NEURAL_ENERGY_FLOW_SPEED, NEURAL_MAX_OPACITY,
    NEURAL_SPARK_PROBABILITY, NEURAL_FIRING_SPEED, NEURAL_WAVE_COUNT,
    NEURAL_COLORS
} from './constants.js';
import { acquireVector2, releaseVector2 } from './three-object-pool.js';

/**
 * Generate random neuron positions across the background area
 * Uses Poisson disk sampling for natural distribution
 * @param {number} count - Number of nodes to generate
 * @param {number} width - Background width
 * @param {number} height - Background height
 * @returns {Array} Array of node objects
 */
export function generateNeuralNodes(count, width, height) {
    const nodes = [];
    const minDistance = NEURAL_CONNECTION_DISTANCE * 0.3; // Minimum distance between nodes
    const maxAttempts = 30;

    // Generate nodes with Poisson disk sampling for natural distribution
    for (let i = 0; i < count; i++) {
        let position = null;
        let attempts = 0;

        // Try to find a valid position not too close to existing nodes
        while (attempts < maxAttempts && !position) {
            const x = (Math.random() - 0.5) * width;
            const y = (Math.random() - 0.5) * height;

            // Check distance to all existing nodes
            let tooClose = false;
            for (const existingNode of nodes) {
                const dx = x - existingNode.x;
                const dy = y - existingNode.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < minDistance) {
                    tooClose = true;
                    break;
                }
            }

            if (!tooClose) {
                position = { x, y };
            }
            attempts++;
        }

        // If we couldn't find a good position, just place it randomly
        if (!position) {
            position = {
                x: (Math.random() - 0.5) * width,
                y: (Math.random() - 0.5) * height
            };
        }

        // Add some variation properties for animation
        nodes.push({
            x: position.x,
            y: position.y,
            phase: Math.random() * Math.PI * 2, // Random animation phase
            type: Math.floor(Math.random() * 3), // 0=primary, 1=secondary, 2=accent
            size: NEURAL_NODE_SIZE * (0.8 + Math.random() * 0.4), // Slight size variation
            connections: []
        });
    }

    return nodes;
}

/**
 * Generate connections between nearby neurons
 * Creates a network of synapses with distance-based connectivity
 * @param {Array} nodes - Array of neural nodes
 * @param {number} maxDistance - Maximum connection distance
 * @param {number} maxConnections - Maximum connections per node
 * @returns {Array} Array of connection objects
 */
export function generateNeuralConnections(nodes, maxDistance, maxConnections) {
    const connections = [];

    // For each node, find nearby nodes to connect to
    for (let i = 0; i < nodes.length; i++) {
        const nodeA = nodes[i];
        const nearbyNodes = [];

        // Find all nodes within connection distance
        for (let j = 0; j < nodes.length; j++) {
            if (i === j) continue; // Don't connect to self

            const nodeB = nodes[j];
            const dx = nodeB.x - nodeA.x;
            const dy = nodeB.y - nodeA.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= maxDistance) {
                nearbyNodes.push({ index: j, distance, node: nodeB });
            }
        }

        // Sort by distance and connect to closest nodes (up to MAX_CONNECTIONS_PER_NODE)
        nearbyNodes.sort((a, b) => a.distance - b.distance);

        for (let k = 0; k < Math.min(maxConnections, nearbyNodes.length); k++) {
            const target = nearbyNodes[k];
            const connectionIndex = connections.length;

            // Create bidirectional connection
            connections.push({
                from: i,
                to: target.index,
                distance: target.distance,
                energyFlow: Math.random() * Math.PI * 2, // Random flow phase
                active: Math.random() > 0.3 // 70% of connections are active
            });

            // Track connection in both nodes
            nodeA.connections.push(connectionIndex);
            target.node.connections.push(connectionIndex);
        }
    }

    return connections;
}

/**
 * Get color for neural node based on type
 * @param {number} type - Node type (0=primary, 1=secondary, 2=accent)
 * @returns {number} Color as hex number
 */
export function getNeuralNodeColor(type) {
    switch (type) {
        case 0: return NEURAL_COLORS.NODES.PRIMARY;   // Cyan
        case 1: return NEURAL_COLORS.NODES.SECONDARY; // Blue
        case 2: return NEURAL_COLORS.NODES.ACCENT;    // Purple
        default: return NEURAL_COLORS.NODES.PRIMARY;
    }
}

/**
 * Create the visual geometry for neurons and synapses
 * Uses Points for nodes and LineSegments for connections
 * @param {Array} nodes - Array of neural nodes
 * @param {Array} connections - Array of neural connections
 * @param {THREE.Group} neuralBackgroundGroup - Three.js group to add geometry to
 * @param {Object} logger - Logger instance
 * @returns {Object} Created Three.js objects: { nodePoints, connectionLines }
 */
export function createNeuralGeometry(nodes, connections, neuralBackgroundGroup, logger) {
    // Create neuron points geometry
    const nodePositions = new Float32Array(nodes.length * 3);
    const nodeColors = new Float32Array(nodes.length * 3);
    const nodeSizes = new Float32Array(nodes.length);

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const color = getNeuralNodeColor(node.type);

        nodePositions[i * 3] = node.x;
        nodePositions[i * 3 + 1] = node.y;
        nodePositions[i * 3 + 2] = 0;

        nodeColors[i * 3] = ((color >> 16) & 0xff) / 255;
        nodeColors[i * 3 + 1] = ((color >> 8) & 0xff) / 255;
        nodeColors[i * 3 + 2] = (color & 0xff) / 255;

        nodeSizes[i] = node.size;
    }

    // Create points geometry for neurons
    const nodeGeometry = new THREE.BufferGeometry();
    nodeGeometry.setAttribute('position', new THREE.BufferAttribute(nodePositions, 3));
    nodeGeometry.setAttribute('color', new THREE.BufferAttribute(nodeColors, 3));
    nodeGeometry.setAttribute('size', new THREE.BufferAttribute(nodeSizes, 1));

    // Create custom shader material for glowing neurons
    const nodeMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0.0 },
            maxOpacity: { value: NEURAL_MAX_OPACITY }
        },
        vertexShader: `
            attribute float size;
            attribute vec3 color;
            varying vec3 vColor;
            varying float vSize;
            uniform float time;
            uniform float maxOpacity;

            void main() {
                vColor = color;
                vSize = size;

                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = size * (300.0 / -mvPosition.z) * (0.8 + 0.4 * sin(time * 0.02 + position.x * 0.01 + position.y * 0.01));
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            varying float vSize;
            uniform float time;
            uniform float maxOpacity;

            void main() {
                float distance = length(gl_PointCoord - vec2(0.5));
                if (distance > 0.5) discard;

                float alpha = (0.5 - distance) * 2.0;
                alpha *= maxOpacity * (0.7 + 0.3 * sin(time * 0.03 + gl_FragCoord.x * 0.01 + gl_FragCoord.y * 0.01));

                gl_FragColor = vec4(vColor, alpha);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    const nodePoints = new THREE.Points(nodeGeometry, nodeMaterial);
    neuralBackgroundGroup.add(nodePoints);

    // Create connection lines geometry
    const connectionPositions = new Float32Array(connections.length * 6); // 2 points per line * 3 coords
    const connectionColors = new Float32Array(connections.length * 6); // 2 colors per line * 3 components

    for (let i = 0; i < connections.length; i++) {
        const connection = connections[i];
        const nodeA = nodes[connection.from];
        const nodeB = nodes[connection.to];
        const color = connection.active ? NEURAL_COLORS.SYNAPSES.ACTIVE : NEURAL_COLORS.SYNAPSES.INACTIVE;

        // Start point
        connectionPositions[i * 6] = nodeA.x;
        connectionPositions[i * 6 + 1] = nodeA.y;
        connectionPositions[i * 6 + 2] = 0;

        // End point
        connectionPositions[i * 6 + 3] = nodeB.x;
        connectionPositions[i * 6 + 4] = nodeB.y;
        connectionPositions[i * 6 + 5] = 0;

        // Colors (same for both endpoints)
        const r = ((color >> 16) & 0xff) / 255;
        const g = ((color >> 8) & 0xff) / 255;
        const b = (color & 0xff) / 255;

        connectionColors[i * 6] = r;
        connectionColors[i * 6 + 1] = g;
        connectionColors[i * 6 + 2] = b;
        connectionColors[i * 6 + 3] = r;
        connectionColors[i * 6 + 4] = g;
        connectionColors[i * 6 + 5] = b;
    }

    // Create lines geometry for synapses
    const connectionGeometry = new THREE.BufferGeometry();
    connectionGeometry.setAttribute('position', new THREE.BufferAttribute(connectionPositions, 3));
    connectionGeometry.setAttribute('color', new THREE.BufferAttribute(connectionColors, 3));

    // Create material for animated synapses
    const connectionMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0.0 },
            maxOpacity: { value: NEURAL_MAX_OPACITY * 0.8 },
            sparkProbability: { value: NEURAL_SPARK_PROBABILITY },
            firingSpeed: { value: NEURAL_FIRING_SPEED }
        },
        vertexShader: `
            attribute vec3 color;
            varying vec3 vColor;
            varying vec3 vPosition;
            uniform float time;

            void main() {
                vColor = color;
                vPosition = position;

                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            varying vec3 vPosition;
            uniform float time;
            uniform float maxOpacity;
            uniform float sparkProbability;
            uniform float firingSpeed;

            // Pseudo-random function
            float random(vec2 st) {
                return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
            }

            // Noise function for organic variation
            float noise(vec2 st) {
                vec2 i = floor(st);
                vec2 f = fract(st);
                float a = random(i);
                float b = random(i + vec2(1.0, 0.0));
                float c = random(i + vec2(0.0, 1.0));
                float d = random(i + vec2(1.0, 1.0));
                vec2 u = f * f * (3.0 - 2.0 * f);
                return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
            }

            void main() {
                // Create dramatic firing neuron effects
                vec2 pos = vPosition.xy;

                // Multiple traveling waves at different speeds and directions
                float wave1 = sin(pos.x * 0.005 + pos.y * 0.005 + time * firingSpeed) * 0.5 + 0.5;
                float wave2 = sin(pos.x * 0.008 - pos.y * 0.003 + time * firingSpeed * 1.5) * 0.5 + 0.5;
                float wave3 = sin(pos.x * 0.003 + pos.y * 0.007 + time * firingSpeed * 0.7) * 0.5 + 0.5;

                // Combine waves for complex firing pattern
                float combinedWave = (wave1 + wave2 + wave3) / 3.0;

                // Random spark flashes that travel along the line
                float sparkSeed = random(pos + time * 0.15);
                float spark = step(1.0 - sparkProbability, sparkSeed);

                // Traveling spark effect
                float sparkTravel = sin(pos.x * 0.02 + pos.y * 0.02 + time * 0.3) * 0.5 + 0.5;
                spark *= sparkTravel;

                // Neuron-like burst firing (sharp peaks)
                float burst = sin(time * 0.2 + pos.x * 0.01 + pos.y * 0.01) * 0.5 + 0.5;
                burst = pow(burst, 4.0); // Very sharp peaks for dramatic firing

                // Chain reaction effect - bursts trigger nearby activity
                float chainReaction = sin(time * 0.15 + length(pos) * 0.001) * 0.5 + 0.5;
                chainReaction = smoothstep(0.7, 0.9, chainReaction);

                // Combine all firing effects
                float firingIntensity = combinedWave * 0.5 + spark * 1.8 + burst * 0.9 + chainReaction * 0.6;

                // Add organic noise variation
                float organicNoise = noise(pos * 0.01 + time * 0.05) * 0.3;

                float alpha = maxOpacity * (firingIntensity + organicNoise);

                // Dynamic color based on firing state
                vec3 finalColor = vColor;

                // White hot flashes for sparks
                if (spark > 0.5) {
                    finalColor = mix(finalColor, vec3(1.0, 1.0, 1.0), 0.8);
                }
                // Bright cyan bursts for neuron firing
                else if (burst > 0.8) {
                    finalColor = mix(finalColor, vec3(0.0, 1.0, 1.0), 0.6);
                }
                // Electric blue for active connections
                else if (combinedWave > 0.7) {
                    finalColor = mix(finalColor, vec3(0.2, 0.8, 1.0), 0.4);
                }

                gl_FragColor = vec4(finalColor, alpha);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    const connectionLines = new THREE.LineSegments(connectionGeometry, connectionMaterial);
    neuralBackgroundGroup.add(connectionLines);

    return { nodePoints, connectionLines };
}

/**
 * Initialize the neural network background system
 * @param {Object} logger - Logger instance
 * @param {THREE.Group} neuralBackgroundGroup - Three.js group for neural background
 * @param {number} worldWidth - World width
 * @param {number} worldHeight - World height
 * @returns {Object} Neural system state: { nodes, connections, nodePoints, connectionLines, animationTime, parallaxOffset }
 */
export function initializeNeuralBackground(logger, neuralBackgroundGroup, worldWidth, worldHeight) {
    logger.log('[RENDER] Initializing neural network background...');

    // Generate neuron positions across the background area
    const nodes = generateNeuralNodes(NEURAL_NODES_COUNT, BACKGROUND_WIDTH, BACKGROUND_HEIGHT);

    // Create connections between nearby neurons
    const connections = generateNeuralConnections(nodes, NEURAL_CONNECTION_DISTANCE, MAX_CONNECTIONS_PER_NODE);

    // Create the visual elements (points and lines)
    const { nodePoints, connectionLines } = createNeuralGeometry(nodes, connections, neuralBackgroundGroup, logger);

    logger.log('[RENDER] Neural network background initialized with',
        nodes.length, 'nodes and', connections.length, 'connections');

    // CRITICAL: Use pooled Vector2 to prevent memory leak
    const parallaxOffset = acquireVector2();
    parallaxOffset.set(0, 0);

    return {
        nodes,
        connections,
        nodePoints,
        connectionLines,
        animationTime: 0,
        parallaxOffset
    };
}

/**
 * Update neural background animation and parallax
 * Called each frame to animate the network
 * @param {Object} neuralSystem - Neural system state from initializeNeuralBackground
 * @param {number} cameraX - Camera X position
 * @param {number} cameraY - Camera Y position
 * @param {number} cameraZoom - Camera zoom level
 * @param {THREE.Group} neuralBackgroundGroup - Three.js group for neural background
 */
export function updateNeuralBackground(neuralSystem, cameraX, cameraY, cameraZoom, neuralBackgroundGroup) {
    // Update animation time
    neuralSystem.animationTime += NEURAL_PULSE_SPEED;

    // Update parallax offset (background moves slower than camera)
    neuralSystem.parallaxOffset.x = cameraX * NEURAL_PARALLAX_FACTOR;
    neuralSystem.parallaxOffset.y = cameraY * NEURAL_PARALLAX_FACTOR;

    // Apply parallax to background group
    neuralBackgroundGroup.position.set(
        neuralSystem.parallaxOffset.x,
        neuralSystem.parallaxOffset.y,
        -1 // Behind simulation elements
    );

    // Update shader uniforms
    if (neuralSystem.nodePoints && neuralSystem.nodePoints.material) {
        neuralSystem.nodePoints.material.uniforms.time.value = neuralSystem.animationTime;
    }

    if (neuralSystem.connectionLines && neuralSystem.connectionLines.material) {
        neuralSystem.connectionLines.material.uniforms.time.value = neuralSystem.animationTime;
    }
}

/**
 * Dispose of neural background resources to prevent memory leaks
 * Call this when destroying the renderer
 * @param {Object} neuralSystem - Neural system state from initializeNeuralBackground
 * @param {THREE.Group} neuralBackgroundGroup - Three.js group for neural background
 */
export function disposeNeuralBackground(neuralSystem, neuralBackgroundGroup) {
    if (!neuralSystem) return;

    // Dispose of node points geometry and material
    if (neuralSystem.nodePoints) {
        if (neuralSystem.nodePoints.geometry) {
            // Dispose of buffer attributes
            const geometry = neuralSystem.nodePoints.geometry;
            geometry.dispose();
        }
        if (neuralSystem.nodePoints.material) {
            // ShaderMaterial is not pooled, dispose directly
            neuralSystem.nodePoints.material.dispose();
        }
        if (neuralBackgroundGroup) {
            neuralBackgroundGroup.remove(neuralSystem.nodePoints);
        }
        neuralSystem.nodePoints = null;
    }

    // Dispose of connection lines geometry and material
    if (neuralSystem.connectionLines) {
        if (neuralSystem.connectionLines.geometry) {
            // Dispose of buffer attributes
            const geometry = neuralSystem.connectionLines.geometry;
            geometry.dispose();
        }
        if (neuralSystem.connectionLines.material) {
            // ShaderMaterial is not pooled, dispose directly
            neuralSystem.connectionLines.material.dispose();
        }
        if (neuralBackgroundGroup) {
            neuralBackgroundGroup.remove(neuralSystem.connectionLines);
        }
        neuralSystem.connectionLines = null;
    }

    // CRITICAL: Release pooled Vector2 to prevent memory leak
    if (neuralSystem.parallaxOffset) {
        releaseVector2(neuralSystem.parallaxOffset);
        neuralSystem.parallaxOffset = null;
    }

    // Clear arrays
    if (neuralSystem.nodes) neuralSystem.nodes.length = 0;
    if (neuralSystem.connections) neuralSystem.connections.length = 0;
}
