// --- WebGL RENDERER USING THREE.JS ---
// Handles all rendering, simulation logic preserved

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { Agent } from './agent.js';
import { Food } from './food.js';
import { PheromonePuff } from './pheromone.js';
import { LOW_ENERGY_THRESHOLD, OBSTACLE_HIDING_RADIUS, SPECIALIZATION_TYPES, MAX_ENERGY, COLORS } from './constants.js';

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
        const viewSize = Math.max(worldWidth, worldHeight) * 0.4;
        this.camera = new THREE.OrthographicCamera(
            -viewSize * aspect, viewSize * aspect,
            viewSize, -viewSize,
            0.1, 10000
        );
        this.camera.position.z = 1000;

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
        this.scene.add(this.agentGroup);
        this.scene.add(this.foodGroup);
        this.scene.add(this.pheromoneGroup);
        this.scene.add(this.obstacleGroup);

        // Agent meshes (instanced for performance)
        this.agentMeshes = new Map(); // geneId -> mesh
        this.agentGeometry = new THREE.CircleGeometry(1, 16);
        this.agentBorderGeometry = new THREE.RingGeometry(0.95, 1.0, 16);

        // Food geometry - using InstancedMesh
        this.foodGeometry = new THREE.CircleGeometry(1, 8);
        this.foodInstancedMesh = null; // Will be created in updateFood

        // Pheromone system - using InstancedMesh
        this.pheromoneInstancedMesh = null; // Will be created in updatePheromones
        this.pheromoneGeometry = new THREE.CircleGeometry(1, 16);

        // Obstacle meshes
        this.obstacleMeshes = [];

        // Ray visualization - using single LineSegments for performance
        this.rayGroup = new THREE.Group();
        this.scene.add(this.rayGroup);
        this.rayLineSegments = null; // Single LineSegments geometry for all rays
        this.showRays = true;

        // Agent state visualization (energy bars, status icons)
        this.agentStateGroup = new THREE.Group();
        this.scene.add(this.agentStateGroup);
        this.agentStateMeshes = new Map(); // agent -> { energyBar, statusIcon }

        // Pre-calculate ray colors to avoid object creation in loop
        this.rayColors = {
            default: new THREE.Color(COLORS.RAYS.DEFAULT),
            alignment: new THREE.Color(COLORS.RAYS.ALIGNMENT),
            food: new THREE.Color(COLORS.RAYS.FOOD),
            smaller: new THREE.Color(COLORS.RAYS.SMALLER),
            larger: new THREE.Color(COLORS.RAYS.LARGER),
            obstacle: new THREE.Color(COLORS.RAYS.OBSTACLE),
            edge: new THREE.Color(COLORS.RAYS.EDGE),
            same: new THREE.Color(COLORS.RAYS.SAME)
        };
    }

    resize(width, height) {
        if (width <= 0 || height <= 0) return; // Skip invalid sizes

        const aspect = width / height;
        // Smaller viewSize = see less world = things appear larger (0.4 = zoomed in)
        const viewSize = Math.max(this.worldWidth, this.worldHeight) * 0.4;
        this.camera.left = -viewSize * aspect;
        this.camera.right = viewSize * aspect;
        this.camera.top = viewSize;
        this.camera.bottom = -viewSize;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    updateCamera(cameraPos) {
        this.camera.position.x = cameraPos.x;
        this.camera.position.y = -cameraPos.y; // Flip Y for Three.js

        // Update camera zoom and projection
        const aspect = this.container.clientWidth / this.container.clientHeight;
        const baseViewSize = Math.max(this.worldWidth, this.worldHeight) * 0.4;
        const viewSize = baseViewSize * cameraPos.zoom;

        this.camera.left = -viewSize * aspect;
        this.camera.right = viewSize * aspect;
        this.camera.top = viewSize;
        this.camera.bottom = -viewSize;
        this.camera.updateProjectionMatrix();
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

    updateAgents(agents) {
        // OPTIMIZED: Frustum culling - only render agents visible in camera
        const frustum = new THREE.Frustum();
        const matrix = new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(matrix);

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

        // Reuse Vector3/Sphere for culling to reduce garbage
        const tempVec = new THREE.Vector3();
        const testSphere = new THREE.Sphere(tempVec, 0);

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

                // Allocate for up to 100 agents per gene ID (can be increased if needed)
                const maxInstances = 100;
                const bodyMesh = new THREE.InstancedMesh(this.agentGeometry, bodyMaterial, maxInstances);
                const borderMesh = new THREE.InstancedMesh(this.agentBorderGeometry, borderMaterial, maxInstances);

                bodyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                borderMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

                this.agentMeshes.set(geneId, { body: bodyMesh, border: borderMesh });
                this.agentGroup.add(bodyMesh);
                this.agentGroup.add(borderMesh);
            }

            const mesh = this.agentMeshes.get(geneId);
            const matrix = new THREE.Matrix4();

            // Filter for VISIBLE agents only
            const validAgents = [];
            for (let j = 0; j < geneAgents.length; j++) {
                const agent = geneAgents[j];
                if (typeof agent.x === 'number' && typeof agent.y === 'number' &&
                    isFinite(agent.x) && isFinite(agent.y) &&
                    typeof agent.size === 'number' && isFinite(agent.size) && agent.size > 0) {

                    // Frustum culling
                    tempVec.set(agent.x, -agent.y, 0);
                    testSphere.center = tempVec;
                    testSphere.radius = agent.size;

                    if (frustum.intersectsSphere(testSphere)) {
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

            // Update all instances
            for (let i = 0; i < validCount; i++) {
                const agent = validAgents[i];

                // Update body
                matrix.makeScale(agent.size, agent.size, 1);
                matrix.setPosition(agent.x, -agent.y, 0); // Flip Y
                mesh.body.setMatrixAt(i, matrix);

                // Update border (scale to 0 if not low energy to hide it)
                if (agent.isLowEnergy()) {
                    matrix.makeScale(agent.size * 1.1, agent.size * 1.1, 1);
                    matrix.setPosition(agent.x, -agent.y, 0);
                } else {
                    // Set scale to 0 to hide the border
                    matrix.makeScale(0, 0, 1);
                    matrix.setPosition(agent.x, -agent.y, 0);
                }
                mesh.border.setMatrixAt(i, matrix);
            }

            // Update instance count
            mesh.body.count = validCount;
            mesh.border.count = validCount;

            mesh.body.instanceMatrix.needsUpdate = true;
            mesh.border.instanceMatrix.needsUpdate = true;
        }

        // Update agent state visualization (energy bars, status icons)
        this.updateAgentStates(agents);
    }

    updateAgentStates(agents) {
        // Performance optimization: Disable agent state visualization for better FPS
        // This is very expensive - creating/destroying meshes every frame
        // For now, disable it entirely for performance
        return;

        // Clear all old state meshes
        while (this.agentStateGroup.children.length > 0) {
            const child = this.agentStateGroup.children[0];
            this.agentStateGroup.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        }
        this.agentStateMeshes.clear();

        // Limit to showing state for max 20 agents (reduced for performance)
        const maxStateAgents = 20;
        const agentsToShow = agents.filter(a => !a.isDead)
            .sort((a, b) => b.fitness - a.fitness) // Show state for top agents
            .slice(0, maxStateAgents);

        // Create state visualization for limited agents
        agentsToShow.forEach(agent => {
            const meshes = {};

            // Energy bar (above agent) - simplified, only fill, no background
            const energyRatio = agent.energy / MAX_ENERGY;
            const barWidth = agent.size * 1.5;
            const barHeight = 2;
            const barY = agent.y - agent.size - 8;

            // Energy fill only (skip background for performance)
            const fillWidth = barWidth * energyRatio;
            if (fillWidth > 0) {
                const fillGeometry = new THREE.PlaneGeometry(fillWidth, barHeight * 0.8);
                let fillColor = 0x00ff00; // Green
                if (energyRatio < 0.3) fillColor = 0xff0000; // Red
                else if (energyRatio < 0.6) fillColor = 0xffff00; // Yellow
                const fillMaterial = new THREE.MeshBasicMaterial({ color: fillColor });
                const fillMesh = new THREE.Mesh(fillGeometry, fillMaterial);
                fillMesh.position.set(agent.x - (barWidth - fillWidth) / 2, -barY, 0.1);
                this.agentStateGroup.add(fillMesh);
                meshes.energyBar = fillMesh;
            }

            // Status icon - only show most important states
            if (agent.isPregnant) {
                const iconSize = agent.size * 0.3;
                const pulse = 1 + Math.sin(Date.now() / 200) * 0.2;
                const iconGeometry = new THREE.CircleGeometry(iconSize * pulse, 6); // Reduced segments
                const iconMaterial = new THREE.MeshBasicMaterial({
                    color: 0xff00ff,
                    transparent: true,
                    opacity: 0.7
                });
                const iconMesh = new THREE.Mesh(iconGeometry, iconMaterial);
                iconMesh.position.set(agent.x, -(agent.y + agent.size + 5), 0);
                this.agentStateGroup.add(iconMesh);
                meshes.statusIcon = iconMesh;
            } else if (agent.wantsToAttack) {
                // Red aura - simplified
                const auraGeometry = new THREE.RingGeometry(agent.size * 1.1, agent.size * 1.2, 8); // Reduced segments
                const auraMaterial = new THREE.MeshBasicMaterial({
                    color: 0xff0000,
                    transparent: true,
                    opacity: 0.4
                });
                const auraMesh = new THREE.Mesh(auraGeometry, auraMaterial);
                auraMesh.position.set(agent.x, -agent.y, 0);
                this.agentStateGroup.add(auraMesh);
                meshes.statusIcon = auraMesh;
            }

            if (meshes.energyBar || meshes.statusIcon) {
                this.agentStateMeshes.set(agent, meshes);
            }
        });
    }

    updateFood(foodArray) {
        // OPTIMIZED: Frustum culling + InstancedMesh for food
        const frustum = new THREE.Frustum();
        const matrix = new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(matrix);

        // OPTIMIZED: Count visible food with for loop
        const visibleFood = [];
        const numFood = foodArray.length;
        for (let i = 0; i < numFood; i++) {
            const food = foodArray[i];
            if (!food || food.isDead) continue;

            // Frustum culling
            const foodSize = food.size || 5;
            const testSphere = new THREE.Sphere(new THREE.Vector3(food.x, -food.y, 0), foodSize);
            if (!frustum.intersectsSphere(testSphere)) continue;

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

            // Set instance color
            const foodColor = food.isHighValue ? COLORS.FOOD.HIGH_VALUE : COLORS.FOOD.NORMAL;
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
        const frustum = new THREE.Frustum();
        const matrix = new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(matrix);

        // OPTIMIZED: Count visible pheromones with for loop
        const visiblePheromones = [];
        const numPheromones = pheromones.length;
        for (let i = 0; i < numPheromones; i++) {
            const puff = pheromones[i];
            if (!puff || puff.isDead) continue;

            // Frustum culling
            const puffSize = puff.size || 5;
            const testSphere = new THREE.Sphere(new THREE.Vector3(puff.x, -puff.y, 0), puffSize);
            if (!frustum.intersectsSphere(testSphere)) continue;

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
        // Only update if obstacles changed (they're static, so only create once)
        if (this.obstacleMeshes.length > 0 && obstacles.length === this.obstacleMeshes.length / 2) {
            return; // Already created
        }

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
        const activeAgents = [];
        const numAgents = agents.length;
        for (let i = 0; i < numAgents; i++) {
            const agent = agents[i];
            if (agent && !agent.isDead && agent.lastRayData) {
                // Frustum check
                const agentSize = agent.size || 5;
                tempVec.set(agent.x, -agent.y, 0);
                testSphere.center = tempVec;
                testSphere.radius = agentSize + agent.maxRayDist; // Check if rays could be in view

                if (frustum.intersectsSphere(testSphere)) {
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
                    renderCounts.none++;
                }

                const r = color.r;
                const g = color.g;
                const b = color.b;
                // If not hit, keep default cyan

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
        this.renderer.render(this.scene, this.camera);
    }

    setShowRays(show) {
        this.showRays = show;
    }
}

