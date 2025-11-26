// --- WebGL RENDERER USING THREE.JS ---
// Handles all rendering, simulation logic preserved

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { Agent } from './agent.js';
import { Food } from './food.js';
import { PheromonePuff } from './pheromone.js';
import {
    LOW_ENERGY_THRESHOLD, OBSTACLE_HIDING_RADIUS, SPECIALIZATION_TYPES, MAX_ENERGY,
    COLORS, VIEW_SIZE_RATIO, EFFECT_DURATION_BASE, MAX_INSTANCES_PER_BATCH, EFFECT_FADE_DURATION
} from './constants.js';
import { queryArrayPool } from './array-pool.js';

export class WebGLRenderer {
    constructor(container, worldWidth, worldHeight, logger) {
        this.logger = logger;
        this.logger.log('Renderer constructor started.');

        this.container = container;
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;

        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(COLORS.BACKGROUND); // Deep dark blue/black

        // Camera setup (orthographic for 2D)
        const aspect = container.clientWidth / container.clientHeight;
        // Smaller viewSize = see less world = things appear larger (was 0.6, now 0.4)
        const viewSize = Math.max(worldWidth, worldHeight) * VIEW_SIZE_RATIO;
        this.camera = new THREE.OrthographicCamera(
            -viewSize * aspect, viewSize * aspect,
            viewSize, -viewSize,
            0.1, 10000
        );
        this.camera.position.z = 1000;

        // Cached frustum for performance (reused across all culling operations)
        this.frustum = new THREE.Frustum();
        this.frustumMatrix = new THREE.Matrix4();

        // Reusable objects for frustum culling to avoid allocations
        this.tempVec = new THREE.Vector3();
        this.testSphere = new THREE.Sphere(this.tempVec, 0);

        // PERFORMANCE: Pre-allocated temp arrays to reuse instead of allocating per frame
        this.tempValidAgents = [];
        this.tempVisibleFood = [];
        this.tempVisiblePheromones = [];
        this.tempActiveAgents = [];
        this.tempActiveEffects = [];

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        // Use window size initially, will be resized properly after DOM is ready
        const initialWidth = container.clientWidth || window.innerWidth;
        const initialHeight = container.clientHeight || window.innerHeight;
        this.renderer.setSize(initialWidth, initialHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(this.renderer.domElement);

        // Groups for organization
        this.agentGroup = new THREE.Group();
        this.foodGroup = new THREE.Group();
        this.pheromoneGroup = new THREE.Group();
        this.obstacleGroup = new THREE.Group();
        this.rayGroup = new THREE.Group(); // Ray visualization
        this.scene.add(this.agentGroup);
        this.scene.add(this.foodGroup);
        this.scene.add(this.pheromoneGroup);
        this.scene.add(this.obstacleGroup);
        this.scene.add(this.rayGroup);

        // Agent meshes (instanced for performance)
        this.agentMeshes = new Map(); // geneId -> mesh
        this.agentGeometry = new THREE.CircleGeometry(1, 16);
        this.agentBorderGeometry = new THREE.RingGeometry(0.95, 1.0, 16);

        // Food geometry - using InstancedMesh
        this.foodGeometry = new THREE.CircleGeometry(1, 8);
        this.foodInstancedMesh = null; // Will be created in updateFood

        // Pheromone geometry
        this.pheromoneGeometry = new THREE.CircleGeometry(1, 8);
        this.pheromoneInstancedMesh = null; // Will be created in updatePheromones

        // Ray visualization
        this.showRays = false;
        this.rayLineSegments = null;
        this.rayColors = {
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

        // Agent state visualization
        this.agentStateGroup = new THREE.Group();
        this.scene.add(this.agentStateGroup);
        this.agentStateMeshes = new Map();

        // Visual effects
        this.agentEffects = new Map();
        this.agentEffectsGroup = new THREE.Group();
        this.scene.add(this.agentEffectsGroup);
        this.currentFrame = 0;
    }

    updateFrustum() {
        // Update cached frustum for current camera position
        this.frustumMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
        this.frustum.setFromProjectionMatrix(this.frustumMatrix);
    }

    resize(width, height) {
        if (width <= 0 || height <= 0) return; // Skip invalid sizes

        const aspect = width / height;
        // Smaller viewSize = see less world = things appear larger (0.4 = zoomed in)
        const viewSize = Math.max(this.worldWidth, this.worldHeight) * VIEW_SIZE_RATIO;
        this.camera.left = -viewSize * aspect;
        this.camera.right = viewSize * aspect;
        this.camera.top = viewSize;
        this.camera.bottom = -viewSize;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    // Visual effects system
    addVisualEffect(agent, effectType, gameSpeed = 1) {
        // NEVER add effects to dead agents
        if (!agent || agent.isDead) {
            return;
        }

        if (!this.agentEffects.has(agent)) {
            this.agentEffects.set(agent, []);
        }
        const effects = this.agentEffects.get(agent);

        // FIXED: Multiply by game speed so effects scale correctly
        // Slower games (0.5x) should have shorter durations (7.5 frames)
        // Faster games (3x) should have longer durations (45 frames)
        const adjustedDuration = EFFECT_DURATION_BASE;

        effects.push({
            type: effectType,
            startFrame: this.currentFrame || 0,
            duration: adjustedDuration
        });
    }

    updateVisualEffects(currentFrame) {
        // Initialize agentEffects if not already done (safety check)
        if (!this.agentEffects) {
            this.agentEffects = new Map();
        }

        this.currentFrame = currentFrame;

        // Clean up expired effects and dead agents
        for (const [agent, effects] of this.agentEffects.entries()) {
            // Remove effects for dead agents immediately
            if (!agent || agent.isDead) {
                this.agentEffects.delete(agent);
                continue;
            }

            // PERFORMANCE: Reuse temp array instead of filter, then copy
            const activeEffects = this.tempActiveEffects;
            activeEffects.length = 0;
            for (const effect of effects) {
                if (currentFrame - effect.startFrame < effect.duration) {
                    activeEffects.push(effect);
                }
            }
            if (activeEffects.length === 0) {
                this.agentEffects.delete(agent);
            } else {
                // Create a new array copy to store (can't store reference to reusable array)
                this.agentEffects.set(agent, [...activeEffects]);
            }
        }
    }

    updateCamera(cameraPos) {
        this.camera.position.x = cameraPos.x;
        this.camera.position.y = -cameraPos.y; // Flip Y for Three.js

        // Update camera zoom and projection
        const aspect = this.container.clientWidth / this.container.clientHeight;
        const baseViewSize = Math.max(this.worldWidth, this.worldHeight) * VIEW_SIZE_RATIO;
        const viewSize = baseViewSize * cameraPos.zoom;

        this.camera.left = -viewSize * aspect;
        this.camera.right = viewSize * aspect;
        this.camera.top = viewSize;
        this.camera.bottom = -viewSize;
        this.camera.updateProjectionMatrix();

        // CRITICAL: Update frustum immediately after camera changes
        // This ensures frustum culling uses the latest camera view
        this.camera.updateMatrixWorld();
        this.updateFrustum();
    }

    // HSL to RGB helper
    hslToRgb(h, s, l) {
        h /= 360;
        s /= 100;
        l /= 100;
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs((h * 6) % 2 - 1));
        const m = l - c / 2;
        let r, g, b;
        if (h < 1 / 6) { r = c; g = x; b = 0; }
        else if (h < 2 / 6) { r = x; g = c; b = 0; }
        else if (h < 3 / 6) { r = 0; g = c; b = x; }
        else if (h < 4 / 6) { r = 0; g = x; b = c; }
        else if (h < 5 / 6) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }
        return new THREE.Color(r + m, g + m, b + m);
    }

    updateAgents(agents, frameCount) {
        // OPTIMIZED: Frustum culling - only render agents visible in camera
        this.updateFrustum();

        // Group ALL living agents by gene ID first (to prevent disposal of off-screen agents)
        const agentsByGene = new Map();
        const numAgents = agents.length;
        for (let i = 0; i < numAgents; i++) {
            const agent = agents[i];
            if (!agent || agent.isDead) continue;

            if (!agent.geneId) continue;

            if (!agentsByGene.has(agent.geneId)) {
                agentsByGene.set(agent.geneId, []);
            }
            agentsByGene.get(agent.geneId).push(agent);
        }

        // Remove old meshes for gene IDs that no longer exist (truly extinct)
        for (const [geneId, mesh] of this.agentMeshes.entries()) {
            if (!agentsByGene.has(geneId)) {
                this.agentGroup.remove(mesh.body);
                this.agentGroup.remove(mesh.border);
                mesh.body.geometry.dispose();
                mesh.body.material.dispose();
                mesh.border.geometry.dispose();
                mesh.border.material.dispose();
                this.agentMeshes.delete(geneId);
            }
        }

        // Use reusable Vector3/Sphere for culling to reduce garbage

        // Update/create meshes for each gene ID
        for (const [geneId, geneAgents] of agentsByGene.entries()) {

            if (!this.agentMeshes.has(geneId)) {
                // Create new mesh for this gene ID (allocate for max possible)
                if (!geneAgents[0].geneColor) {
                    continue;
                }
                let baseColor = this.hslToRgb(geneAgents[0].geneColor.h, geneAgents[0].geneColor.s, geneAgents[0].geneColor.l);

                // Apply specialization tint
                const specialization = geneAgents[0].specializationType;
                if (specialization === SPECIALIZATION_TYPES.FORAGER) {
                    baseColor = new THREE.Color(baseColor.r * 0.7 + 0.3, baseColor.g * 0.7 + 0.3, baseColor.b * 0.7);
                } else if (specialization === SPECIALIZATION_TYPES.PREDATOR) {
                    baseColor = new THREE.Color(baseColor.r * 0.7 + 0.3, baseColor.g * 0.7, baseColor.b * 0.7);
                } else if (specialization === SPECIALIZATION_TYPES.REPRODUCER) {
                    baseColor = new THREE.Color(baseColor.r * 0.7 + 0.3, baseColor.g * 0.7 + 0.2, baseColor.b * 0.7 + 0.2);
                } else if (specialization === SPECIALIZATION_TYPES.SCOUT) {
                    baseColor = new THREE.Color(baseColor.r * 0.7, baseColor.g * 0.7 + 0.2, baseColor.b * 0.7 + 0.3);
                } else if (specialization === SPECIALIZATION_TYPES.DEFENDER) {
                    baseColor = new THREE.Color(baseColor.r * 0.7 + 0.3, baseColor.g * 0.7 + 0.3, baseColor.b * 0.7);
                }

                const bodyMaterial = new THREE.MeshBasicMaterial({ color: baseColor });
                const borderMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });

                // Increased from 100 to 200 to handle larger populations per gene
                const maxInstances = MAX_INSTANCES_PER_BATCH;
                const bodyMesh = new THREE.InstancedMesh(this.agentGeometry, bodyMaterial, maxInstances);
                const borderMesh = new THREE.InstancedMesh(this.agentBorderGeometry, borderMaterial, maxInstances);

                bodyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                borderMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

                // CRITICAL: Disable Three.js built-in frustum culling
                // Three.js has its own frustum culling that can interfere with rendering
                bodyMesh.frustumCulled = false;
                borderMesh.frustumCulled = false;

                this.agentMeshes.set(geneId, { body: bodyMesh, border: borderMesh, maxCapacity: maxInstances });
                this.agentGroup.add(bodyMesh);
                this.agentGroup.add(borderMesh);
            }

            const mesh = this.agentMeshes.get(geneId);
            const matrix = new THREE.Matrix4();

            // OPTIMIZED: Include only visible agents (frustum culling for performance)
            // PERFORMANCE: Reuse temp array instead of allocating
            const validAgents = this.tempValidAgents;
            validAgents.length = 0;
            for (let j = 0; j < geneAgents.length; j++) {
                const agent = geneAgents[j];
                if (typeof agent.x === 'number' && typeof agent.y === 'number' &&
                    isFinite(agent.x) && isFinite(agent.y) &&
                    typeof agent.size === 'number' && isFinite(agent.size) && agent.size > 0 &&
                    !agent.isDead) {

                    // Frustum culling - only include agents visible on screen
                    this.tempVec.set(agent.x, -agent.y, 0);
                    this.testSphere.center = this.tempVec;
                    // Use larger safety margin to prevent premature culling at edges
                    this.testSphere.radius = Math.max(agent.size, 12) * 3 + 50;

                    if (this.frustum.intersectsSphere(this.testSphere)) {
                        validAgents.push(agent);
                    }
                }
            }

            const validCount = validAgents.length;

            if (validCount === 0) {
                // No visible agents for this gene ID, hide the mesh but DO NOT DISPOSE
                mesh.body.count = 0;
                mesh.border.count = 0;
                mesh.body.instanceMatrix.needsUpdate = true;
                mesh.border.instanceMatrix.needsUpdate = true;
                continue;
            }

            // CRITICAL: Check if we need to resize the instanced mesh
            if (validCount > mesh.maxCapacity) {
                // We have more visible agents than the mesh can handle - need to resize
                const newCapacity = Math.max(validCount * 1.5, mesh.maxCapacity * 2); // Grow by 50% or double
                console.warn(`[RENDERER] Gene ${geneId} exceeded capacity (${validCount} > ${mesh.maxCapacity}). Resizing to ${newCapacity}`);

                // Remove old meshes
                this.agentGroup.remove(mesh.body);
                this.agentGroup.remove(mesh.border);
                mesh.body.geometry.dispose();
                mesh.body.material.dispose();
                mesh.border.geometry.dispose();
                mesh.border.material.dispose();

                // Create new larger meshes
                const bodyMaterial = mesh.body.material.clone();
                const borderMaterial = mesh.border.material.clone();
                const newBodyMesh = new THREE.InstancedMesh(this.agentGeometry, bodyMaterial, newCapacity);
                const newBorderMesh = new THREE.InstancedMesh(this.agentBorderGeometry, borderMaterial, newCapacity);

                newBodyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                newBorderMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

                // CRITICAL: Disable Three.js built-in frustum culling on new meshes too
                newBodyMesh.frustumCulled = false;
                newBorderMesh.frustumCulled = false;

                // Update mesh reference
                mesh.body = newBodyMesh;
                mesh.border = newBorderMesh;
                mesh.maxCapacity = newCapacity;

                this.agentGroup.add(newBodyMesh);
                this.agentGroup.add(newBorderMesh);
            }

            // Update all instances (limited to mesh capacity for safety)
            const renderCount = Math.min(validCount, mesh.maxCapacity);
            if (renderCount < validCount) {
                console.warn(`[RENDERER] Gene ${geneId}: Can only render ${renderCount} of ${validCount} visible agents (capacity limit)`);
            }

            for (let i = 0; i < renderCount; i++) {
                const agent = validAgents[i];

                // Update body - ensure minimum visible size
                const renderSize = Math.max(agent.size, 12); // Never smaller than 12 pixels
                matrix.makeScale(renderSize, renderSize, 1);
                matrix.setPosition(agent.x, -agent.y, 0.1); // Flip Y, slightly in front
                mesh.body.setMatrixAt(i, matrix);

                // Update border (scale to 0 if not low energy to hide it)
                if (agent.isLowEnergy()) {
                    const borderSize = Math.max(agent.size, 12) * 1.1;
                    matrix.makeScale(borderSize, borderSize, 1);
                    matrix.setPosition(agent.x, -agent.y, 0.1);
                } else {
                    // Set scale to 0 to hide the border
                    matrix.makeScale(0, 0, 1);
                    matrix.setPosition(agent.x, -agent.y, 0.1);
                }
                mesh.border.setMatrixAt(i, matrix);
            }

            // Update instance count
            mesh.body.count = renderCount;
            mesh.border.count = renderCount;

            mesh.body.instanceMatrix.needsUpdate = true;
            mesh.border.instanceMatrix.needsUpdate = true;
        }

        // Update agent state visualization (energy bars, status icons)
        this.updateAgentStates(agents);

        // Update visual effects system
        this.updateVisualEffects(frameCount);
    }

    updateAgentStates(agents) {
        // Performance optimization: Disable agent state visualization for better FPS
        // This is very expensive - creating/destroying meshes every frame
        // For now, disable it entirely for performance
        return;
    }

    updateVisualEffectsRendering() {
        // Initialize required properties if not already done (safety checks)
        if (!this.agentEffects) {
            this.agentEffects = new Map();
        }
        if (!this.agentEffectsGroup) {
            this.agentEffectsGroup = new THREE.Group();
            this.scene.add(this.agentEffectsGroup);
        }

        // Clear previous effect meshes
        while (this.agentEffectsGroup.children.length > 0) {
            const child = this.agentEffectsGroup.children[0];
            this.agentEffectsGroup.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        }

        // Render active effects
        for (const [agent, effects] of this.agentEffects.entries()) {
            if (!agent || agent.isDead) continue;

            // Frustum culling - skip effects for agents outside camera view
            this.tempVec.set(agent.x, -agent.y, 0);
            this.testSphere.center = this.tempVec;
            this.testSphere.radius = Math.max(agent.size, 12) * 2; // Larger radius for effects
            if (!this.frustum.intersectsSphere(this.testSphere)) continue;

            for (const effect of effects) {
                const elapsed = this.currentFrame - effect.startFrame;
                const progress = elapsed / effect.duration;
                const opacity = Math.max(1.0 - progress, 0); // Fade out over time

                // Create visible effect ring geometry - ensure it doesn't cover the agent
                const effectRadius = agent.size * (1.2 + progress * 0.5); // Start larger to avoid covering agent
                const geometry = new THREE.RingGeometry(
                    Math.max(agent.size * 1.1, effectRadius * 0.8), // Inner radius always larger than agent
                    effectRadius * 1.3,
                    32 // More segments for smoother look
                );

                // Choose color based on effect type
                const color = effect.type === 'collision' ? COLORS.EFFECTS.COLLISION : COLORS.EFFECTS.EATING;

                const material = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: opacity * 0.4, // More visible opacity
                    side: THREE.DoubleSide,
                    depthWrite: false // Don't write to depth buffer to avoid covering agents
                });

                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.set(agent.x, -agent.y, 0.05); // Slightly behind agent but in front of border
                this.agentEffectsGroup.add(mesh);
            }
        }
    }

    updateFood(foodArray) {
        // OPTIMIZED: Frustum culling + InstancedMesh for food
        this.updateFrustum();

        // OPTIMIZED: Count visible food with for loop
        // PERFORMANCE: Reuse temp array instead of allocating  
        const visibleFood = this.tempVisibleFood;
        visibleFood.length = 0;
        const numFood = foodArray.length;
        for (let i = 0; i < numFood; i++) {
            const food = foodArray[i];
            if (!food || food.isDead) continue;

            // Frustum culling
            const foodSize = food.size || 5;
            this.tempVec.set(food.x, -food.y, 0);
            this.testSphere.center = this.tempVec;
            this.testSphere.radius = foodSize;
            if (!this.frustum.intersectsSphere(this.testSphere)) continue;

            visibleFood.push(food);
        }

        const neededCount = visibleFood.length;

        // OPTIMIZED: Use InstancedMesh for food
        if (!this.foodInstancedMesh || this.foodInstancedMesh.count < neededCount) {
            // Dispose old mesh if exists
            if (this.foodInstancedMesh) {
                this.foodGroup.remove(this.foodInstancedMesh);
                this.foodInstancedMesh.geometry.dispose();
                this.foodInstancedMesh.material.dispose();
            }

            // Create InstancedMesh with capacity for more food
            const maxFood = Math.max(neededCount * 2, 1000);
            const material = new THREE.MeshBasicMaterial();
            this.foodInstancedMesh = new THREE.InstancedMesh(this.foodGeometry, material, maxFood);
            this.foodInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this.foodGroup.add(this.foodInstancedMesh);
        }

        // Update instances
        const instanceMatrix = new THREE.Matrix4();
        const color = new THREE.Color();
        for (let i = 0; i < neededCount; i++) {
            const food = visibleFood[i];

            // Set instance matrix
            instanceMatrix.makeScale(food.size, food.size, 1);
            instanceMatrix.setPosition(food.x, -food.y, 0);
            this.foodInstancedMesh.setMatrixAt(i, instanceMatrix);

            // Set instance color (consider rotting state)
            const energyRatio = food.energyValue / food.initialEnergy;
            let foodColor;

            if (food.isHighValue) {
                // High-value food: Bright green → Brown
                if (energyRatio > 0.5) {
                    foodColor = COLORS.FOOD.HIGH_VALUE; // Fresh bright green
                } else if (energyRatio > 0.2) {
                    foodColor = 0x8B4513; // Brown (rotting)
                } else {
                    foodColor = 0x654321; // Dark brown (almost rotten)
                }
            } else {
                // Normal food: Green → Brown
                if (energyRatio > 0.5) {
                    foodColor = COLORS.FOOD.NORMAL; // Fresh green
                } else if (energyRatio > 0.2) {
                    foodColor = 0x8B4513; // Brown (rotting)
                } else {
                    foodColor = 0x654321; // Dark brown (almost rotten)
                }
            }

            color.setHex(foodColor);
            this.foodInstancedMesh.setColorAt(i, color);
        }

        // Update instance count and mark for update
        this.foodInstancedMesh.count = neededCount;
        this.foodInstancedMesh.instanceMatrix.needsUpdate = true;
        if (this.foodInstancedMesh.instanceColor) {
            this.foodInstancedMesh.instanceColor.needsUpdate = true;
        }
    }

    updatePheromones(pheromones) {

        // OPTIMIZED: Frustum culling + InstancedMesh for pheromones
        this.updateFrustum();

        // OPTIMIZED: Count visible pheromones with for loop
        // PERFORMANCE: Reuse temp array instead of allocating
        const visiblePheromones = this.tempVisiblePheromones;
        visiblePheromones.length = 0;
        const numPheromones = pheromones.length;
        for (let i = 0; i < numPheromones; i++) {
            const puff = pheromones[i];
            if (!puff || puff.isDead) continue;

            // Frustum culling
            const puffSize = puff.size || 5;
            this.tempVec.set(puff.x, -puff.y, 0);
            this.testSphere.center = this.tempVec;
            this.testSphere.radius = puffSize;
            if (!this.frustum.intersectsSphere(this.testSphere)) continue;

            visiblePheromones.push(puff);
        }

        const neededCount = visiblePheromones.length;

        // OPTIMIZED: Use InstancedMesh for pheromones
        if (!this.pheromoneInstancedMesh || this.pheromoneInstancedMesh.count < neededCount) {
            // Dispose old mesh if exists
            if (this.pheromoneInstancedMesh) {
                this.pheromoneGroup.remove(this.pheromoneInstancedMesh);
                this.pheromoneInstancedMesh.geometry.dispose();
                this.pheromoneInstancedMesh.material.dispose();
            }

            // Create InstancedMesh with capacity for more pheromones
            const maxPheromones = Math.max(neededCount * 2, 2000);
            const material = new THREE.MeshBasicMaterial({
                transparent: true,
                opacity: 0.6
            });
            this.pheromoneInstancedMesh = new THREE.InstancedMesh(this.pheromoneGeometry, material, maxPheromones);
            this.pheromoneInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this.pheromoneGroup.add(this.pheromoneInstancedMesh);

            // Enable per-instance colors
            this.pheromoneInstancedMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxPheromones * 3), 3);
            this.pheromoneInstancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        }

        // Update instances
        const instanceMatrix = new THREE.Matrix4();
        const color = new THREE.Color();
        for (let i = 0; i < neededCount; i++) {
            const puff = visiblePheromones[i];

            // Set instance matrix
            instanceMatrix.makeScale(puff.size, puff.size, 1);
            instanceMatrix.setPosition(puff.x, -puff.y, 0);
            this.pheromoneInstancedMesh.setMatrixAt(i, instanceMatrix);

            // Set instance color and opacity (encode opacity in color alpha)
            const rgbColor = this.hslToRgb(puff.color.h, puff.color.s, puff.color.l);
            color.setRGB(rgbColor.r, rgbColor.g, rgbColor.b);
            // Note: Three.js InstancedMesh doesn't support per-instance opacity easily
            // We'll use a uniform opacity for all pheromones
            this.pheromoneInstancedMesh.setColorAt(i, color);
        }

        // Update instance count and mark for update
        this.pheromoneInstancedMesh.count = neededCount;
        this.pheromoneInstancedMesh.instanceMatrix.needsUpdate = true;
        if (this.pheromoneInstancedMesh.instanceColor) {
            this.pheromoneInstancedMesh.instanceColor.needsUpdate = true;
        }
    }

    updateObstacles(obstacles) {
        // Initialize obstacleMeshes if not already done
        if (!this.obstacleMeshes) {
            this.obstacleMeshes = [];
        }

        // Safety check for obstacles array
        if (!obstacles) {
            obstacles = [];
        }

        // Check if we need to recreate meshes (obstacle count changed) or update positions (obstacles moved)
        const needsRecreate = this.obstacleMeshes.length === 0 ||
            obstacles.length !== this.obstacleMeshes.length / 2;

        if (needsRecreate) {
            // Remove old obstacle meshes
            this.obstacleMeshes.forEach(mesh => {
                this.obstacleGroup.remove(mesh);
                mesh.geometry.dispose();
                mesh.material.dispose();
            });
            this.obstacleMeshes = [];

            // Create obstacle meshes
            obstacles.forEach(obs => {
                const geometry = new THREE.CircleGeometry(obs.radius, 32);
                const material = new THREE.MeshBasicMaterial({ color: COLORS.OBSTACLE });
                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.set(obs.x, -obs.y, 0);
                this.obstacleGroup.add(mesh);
                this.obstacleMeshes.push(mesh);

                // Add shadow (hiding radius)
                const shadowGeometry = new THREE.RingGeometry(obs.radius, obs.radius + OBSTACLE_HIDING_RADIUS, 32);
                const shadowMaterial = new THREE.MeshBasicMaterial({
                    color: 0x000000,
                    transparent: true,
                    opacity: 0.4
                });
                const shadowMesh = new THREE.Mesh(shadowGeometry, shadowMaterial);
                shadowMesh.position.set(obs.x, -obs.y, 0);
                this.obstacleGroup.add(shadowMesh);
                this.obstacleMeshes.push(shadowMesh);
            });
        } else {
            // Update positions of existing meshes (obstacles moved)
            for (let i = 0; i < obstacles.length; i++) {
                const obs = obstacles[i];
                const circleMesh = this.obstacleMeshes[i * 2];     // Circle mesh
                const shadowMesh = this.obstacleMeshes[i * 2 + 1]; // Shadow mesh

                if (circleMesh && shadowMesh) {
                    circleMesh.position.set(obs.x, -obs.y, 0);
                    shadowMesh.position.set(obs.x, -obs.y, 0);
                }
            }
        }

    }

    updateRays(agents, frameCount = 0) {
        if (!this.showRays) {
            // Hide all rays if disabled
            if (this.rayLineSegments) {
                this.rayLineSegments.visible = false;
            }
            return;
        }

        // Frustum culling for rays
        const frustum = new THREE.Frustum();
        const matrix = new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(matrix);
        const tempVec = new THREE.Vector3();
        const testSphere = new THREE.Sphere(tempVec, 0);

        // OPTIMIZED: Only show rays for top 5 agents (or best agent) - use for loop
        // PERFORMANCE: Reuse temp array instead of allocating
        const activeAgents = this.tempActiveAgents;
        activeAgents.length = 0;
        const numAgents = agents.length;
        for (let i = 0; i < numAgents; i++) {
            const agent = agents[i];
            if (agent && !agent.isDead && agent.lastRayData) {
                // Frustum check
                const agentSize = agent.size || 5;
                this.tempVec.set(agent.x, -agent.y, 0);
                this.testSphere.center = this.tempVec;
                this.testSphere.radius = agentSize + agent.maxRayDist; // Check if rays could be in view

                if (this.frustum.intersectsSphere(this.testSphere)) {
                    activeAgents.push(agent);
                }
            }
        }
        if (activeAgents.length === 0) {
            if (this.rayLineSegments) {
                this.rayLineSegments.visible = false;
            }
            return;
        }

        // Sort by fitness and take top 5
        const topAgents = activeAgents
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
            if (this.rayLineSegments) {
                this.rayLineSegments.visible = false;
            }
            return;
        }

        // Use single LineSegments geometry for all rays (much faster)
        if (!this.rayLineSegments || this.rayLineSegments.geometry.attributes.position.count < totalRays * 2) {
            // Create or resize geometry
            if (this.rayLineSegments) {
                this.rayGroup.remove(this.rayLineSegments);
                this.rayLineSegments.geometry.dispose();
                this.rayLineSegments.material.dispose();
            }

            // Allocate for max rays (with some headroom)
            const maxRays = Math.max(totalRays * 2, 500);
            const positions = new Float32Array(maxRays * 2 * 3); // 2 points per ray, 3 coords per point
            const colors = new Float32Array(maxRays * 2 * 3); // RGB per point
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

            const material = new THREE.LineBasicMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.6
            });

            this.rayLineSegments = new THREE.LineSegments(geometry, material);
            this.rayGroup.add(this.rayLineSegments);
        }

        // Update positions and colors directly in buffer
        const positions = this.rayLineSegments.geometry.attributes.position.array;
        const colors = this.rayLineSegments.geometry.attributes.color.array;
        let bufferIndex = 0;

        // OPTIMIZED: Use for loop instead of forEach
        let debugLoggedThisFrame = false;
        const renderCounts = { food: 0, edge: 0, obstacle: 0, smaller: 0, larger: 0, same: 0, none: 0, alignment: 0 };

        for (let i = 0; i < topAgents.length; i++) {
            const agent = topAgents[i];
            if (!agent || !agent.lastRayData || agent.isDead) continue;

            // Validate agent position
            if (typeof agent.x !== 'number' || typeof agent.y !== 'number' ||
                !isFinite(agent.x) || !isFinite(agent.y)) {
                return;
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
                let color = this.rayColors.default;

                if (ray.type === 'alignment') {
                    color = this.rayColors.alignment;
                    renderCounts.alignment++;
                } else if (ray.hit && ray.hitType && ray.hitType !== 'none') {
                    // Something was hit - color based on hit type
                    if (ray.hitType === 'food') { color = this.rayColors.food; renderCounts.food++; }
                    else if (ray.hitType === 'smaller') { color = this.rayColors.smaller; renderCounts.smaller++; }
                    else if (ray.hitType === 'larger') { color = this.rayColors.larger; renderCounts.larger++; }
                    else if (ray.hitType === 'obstacle') { color = this.rayColors.obstacle; renderCounts.obstacle++; }
                    else if (ray.hitType === 'edge') { color = this.rayColors.edge; renderCounts.edge++; }
                    else if (ray.hitType === 'same') { color = this.rayColors.same; renderCounts.same++; }
                    else { color = this.rayColors.larger; } // Fallback to red
                } else if (ray.hit) {
                    color = this.rayColors.larger; // Red
                } else {
                    // No hit - use dull gray color
                    color = this.rayColors.noHit;
                    renderCounts.none++;
                }

                const r = color.r;
                const g = color.g;
                const b = color.b;

                // Apply to both start and end points
                for (let i = 0; i < 2; i++) {
                    colors[bufferIndex * 3] = r;
                    colors[bufferIndex * 3 + 1] = g;
                    colors[bufferIndex * 3 + 2] = b;
                    bufferIndex++;
                }
            }
        }

        // Update geometry
        this.rayLineSegments.geometry.attributes.position.needsUpdate = true;
        this.rayLineSegments.geometry.attributes.color.needsUpdate = true;
        this.rayLineSegments.geometry.setDrawRange(0, bufferIndex);
        this.rayLineSegments.visible = true;
    }

    render() {
        // Render visual effects
        this.updateVisualEffectsRendering();

        this.renderer.render(this.scene, this.camera);
    }

    setShowRays(show) {
        this.showRays = show;
    }
}
