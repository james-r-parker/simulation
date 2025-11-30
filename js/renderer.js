// --- WebGL RENDERER USING THREE.JS ---
// Handles all rendering, simulation logic preserved

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Agent } from './agent.js';
import { CAMERA_Z_POSITION, CAMERA_FAR_PLANE, AGENT_BORDER_SIZE_MULTIPLIER, AGENT_MINIMUM_BORDER_SIZE } from './constants.js';
import { Food } from './food.js';
import { PheromonePuff } from './pheromone.js';
import {
    LOW_ENERGY_THRESHOLD, OBSTACLE_HIDING_RADIUS, SPECIALIZATION_TYPES, MAX_ENERGY,
    COLORS, EMISSIVE_COLORS, MATERIAL_PROPERTIES, POST_PROCESSING,
    VIEW_SIZE_RATIO, EFFECT_DURATION_BASE, MAX_INSTANCES_PER_BATCH, EFFECT_FADE_DURATION
} from './constants.js';
import { queryArrayPool } from './array-pool.js';
import {
    acquireMatrix4, releaseMatrix4,
    acquireVector3, releaseVector3,
    acquireVector2, releaseVector2,
    acquireColor, releaseColor,
    acquireFrustum, releaseFrustum,
    acquireSphere, releaseSphere,
    acquireCircleGeometry, releaseCircleGeometry,
    acquireRingGeometry, releaseRingGeometry,
    acquireMeshBasicMaterial, releaseMeshBasicMaterial,
    acquireMeshStandardMaterial, releaseMeshStandardMaterial,
    acquireBufferGeometry, releaseBufferGeometry,
    acquirePointsMaterial, releasePointsMaterial,
    acquireLineBasicMaterial, releaseLineBasicMaterial,
    clearGPUResourcePools
} from './three-object-pool.js';
import { neuralArrayPool } from './neural-network.js';

export class WebGLRenderer {
    constructor(container, worldWidth, worldHeight, logger) {
        this.logger = logger;
        this.logger.log('[RENDER] Renderer constructor started.');

        this.container = container;
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;

        // Post-processing setup (initialize early so it's available when setupPostProcessing is called)
        this.effectComposer = null;
        this.postProcessingEnabled = true; // Can be toggled for performance

        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(COLORS.BACKGROUND); // Deep dark blue/black

        // Add lighting for cyberpunk aesthetic
        // Ambient light for base illumination
        const ambientLight = new THREE.AmbientLight(0x001122, 0.5); // Deep blue/cyan ambient light
        this.scene.add(ambientLight);
        this.ambientLight = ambientLight;

        // Add directional light to help MeshStandardMaterial be visible
        // This helps with the glassy/metallic look while emissive provides the glow
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.3);
        directionalLight.position.set(0, 0, 1000);
        this.scene.add(directionalLight);
        this.directionalLight = directionalLight;

        // Camera setup (orthographic for 2D)
        const aspect = container.clientWidth / container.clientHeight;
        // Smaller viewSize = see less world = things appear larger (was 0.6, now 0.4)
        const viewSize = Math.max(worldWidth, worldHeight) * VIEW_SIZE_RATIO;
        this.camera = new THREE.OrthographicCamera(
            -viewSize * aspect, viewSize * aspect,
            viewSize, -viewSize,
            0.1, CAMERA_FAR_PLANE
        );
        this.camera.position.z = CAMERA_Z_POSITION;

        // Cached frustum for performance (reused across all culling operations)
        this.frustum = new THREE.Frustum();
        this.frustumMatrix = new THREE.Matrix4();

        // Reusable objects for frustum culling to avoid allocations
        this.tempVec = new THREE.Vector3();
        this.testSphere = new THREE.Sphere(this.tempVec, 0);

        // Reusable buffers for sparkles and rays to avoid allocations
        this.sparklePositionsBuffer = null;
        this.sparkleColorsBuffer = null;
        this.sparkleSizesBuffer = null;
        this.rayPositionsBuffer = null;
        this.rayColorsBuffer = null;
        
        // Reusable sparkle Points object to avoid recreation
        this.sparklePoints = null;

        // PERFORMANCE: Pre-allocated temp arrays to reuse instead of allocating per frame
        this.tempValidAgents = [];
        this.tempVisibleFood = [];
        this.tempVisiblePheromones = [];
        this.tempActiveAgents = [];
        this.tempActiveEffects = [];

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false,
            powerPreference: "high-performance"
        });
        // Use window size initially, will be resized properly after DOM is ready
        const initialWidth = container.clientWidth || window.innerWidth;
        const initialHeight = container.clientHeight || window.innerHeight;
        this.renderer.setSize(initialWidth, initialHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(this.renderer.domElement);

        // Setup post-processing pipeline
        this.setupPostProcessing();

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
        this.agentBorderGeometry = new THREE.RingGeometry(0.95, 1.0, 48); // Increased from 16 to 48 segments for smoother borders

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
        // Pool of effect meshes for reuse
        this.effectMeshPool = [];
        this.activeEffectMeshes = [];

        // Particle sparkle system
        this.sparkles = [];
        this.sparkleGroup = new THREE.Group();
        this.scene.add(this.sparkleGroup);
        this.maxSparkles = 200; // Limit for performance
        this.sparklesEnabled = true; // Can be toggled for performance

        // HSL to RGB cache for performance (caches by h,s,l tuple)
        this.hslToRgbCache = new Map();
        this.hslCacheMaxSize = 1000; // Limit cache size to prevent memory growth

        // Precomputed math constants for performance
        this.MATH_CONSTANTS = {
            ONE_OVER_360: 1 / 360,
            ONE_OVER_100: 1 / 100,
            ONE_OVER_6: 1 / 6,
            TWO_OVER_6: 2 / 6,
            THREE_OVER_6: 3 / 6,
            FOUR_OVER_6: 4 / 6,
            FIVE_OVER_6: 5 / 6
        };
    }

    /**
     * Comprehensive cleanup method to dispose of all WebGL resources
     * Call this when destroying the renderer to prevent memory leaks
     */
    dispose() {
        // Guard against multiple dispose calls
        if (!this.scene) {
            this.logger.log('[RENDER] Renderer already disposed, skipping...');
            return;
        }

        this.logger.log('[RENDER] Disposing WebGL renderer and all resources...');

        // 1. Dispose of agent meshes and materials
        if (this.agentMeshes) {
            for (const [geneId, mesh] of this.agentMeshes.entries()) {
                if (mesh.body && mesh.body.geometry) {
                    mesh.body.geometry.dispose();
                }
                if (mesh.body && mesh.body.material) {
                    mesh.body.material.dispose();
                }
                if (mesh.border && mesh.border.geometry) {
                    mesh.border.geometry.dispose();
                }
                if (mesh.border && mesh.border.material) {
                    mesh.border.material.dispose();
                }
                // Remove from scene
                if (mesh.body && this.agentGroup) this.agentGroup.remove(mesh.body);
                if (mesh.border && this.agentGroup) this.agentGroup.remove(mesh.border);
            }
            this.agentMeshes.clear();
        }

        // 2. Dispose of food instanced mesh
        if (this.foodInstancedMesh) {
            if (this.foodInstancedMesh.geometry) {
                this.foodInstancedMesh.geometry.dispose();
            }
            if (this.foodInstancedMesh.material) {
                this.foodInstancedMesh.material.dispose();
            }
            if (this.foodGroup) this.foodGroup.remove(this.foodInstancedMesh);
        }

        // 3. Dispose of pheromone instanced mesh
        if (this.pheromoneInstancedMesh) {
            if (this.pheromoneInstancedMesh.geometry) {
                this.pheromoneInstancedMesh.geometry.dispose();
            }
            if (this.pheromoneInstancedMesh.material) {
                this.pheromoneInstancedMesh.material.dispose();
            }
            if (this.pheromoneGroup) this.pheromoneGroup.remove(this.pheromoneInstancedMesh);
        }

        // 4. Dispose of ray visualization
        if (this.rayLineSegments) {
            if (this.rayLineSegments.geometry) {
                releaseBufferGeometry(this.rayLineSegments.geometry);
            }
            if (this.rayLineSegments.material) {
                releaseLineBasicMaterial(this.rayLineSegments.material);
            }
            if (this.rayGroup) this.rayGroup.remove(this.rayLineSegments);
        }

        // 5. Dispose of agent state meshes
        if (this.agentStateMeshes) {
            for (const [agent, mesh] of this.agentStateMeshes.entries()) {
                if (mesh.geometry) mesh.geometry.dispose();
                if (mesh.material) mesh.material.dispose();
                if (this.agentStateGroup) this.agentStateGroup.remove(mesh);
            }
            this.agentStateMeshes.clear();
        }

        // 6. Dispose of visual effects
        if (this.agentEffectsGroup) {
            // Dispose of all children geometries and materials
            if (this.agentEffectsGroup) {
                while (this.agentEffectsGroup.children.length > 0) {
                    const child = this.agentEffectsGroup.children[0];
                    if (child.geometry) releaseRingGeometry(child.geometry);
                    if (child.material) releaseMeshStandardMaterial(child.material);
                    this.agentEffectsGroup.remove(child);
                }
            }
        }
        // Clean up effect mesh pool
        if (this.effectMeshPool) {
            for (const mesh of this.effectMeshPool) {
                if (mesh.geometry) releaseRingGeometry(mesh.geometry);
                if (mesh.material) releaseMeshStandardMaterial(mesh.material);
            }
            this.effectMeshPool = [];
        }
        if (this.activeEffectMeshes) {
            this.activeEffectMeshes = [];
        }

        // 7. Dispose of sparkle system
        if (this.sparkleGroup) {
            while (this.sparkleGroup.children.length > 0) {
                const child = this.sparkleGroup.children[0];
                if (child.geometry) releaseBufferGeometry(child.geometry);
                if (child.material) releasePointsMaterial(child.material);
                this.sparkleGroup.remove(child);
            }
            if (this.scene) this.scene.remove(this.sparkleGroup);
        }
        if (this.sparklePoints) {
            if (this.sparklePoints.geometry) releaseBufferGeometry(this.sparklePoints.geometry);
            if (this.sparklePoints.material) releasePointsMaterial(this.sparklePoints.material);
            this.sparklePoints = null;
        }
        if (this.sparkles) {
            this.sparkles.length = 0;
        }

        // 8. Clear agent effects map
        if (this.agentEffects) {
            this.agentEffects.clear();
        }

        // 9. Dispose of shared geometries (if they exist)
        if (this.agentGeometry) {
            this.agentGeometry.dispose();
        }
        if (this.agentBorderGeometry) {
            this.agentBorderGeometry.dispose();
        }
        if (this.foodGeometry) {
            this.foodGeometry.dispose();
        }
        if (this.pheromoneGeometry) {
            this.pheromoneGeometry.dispose();
        }

        // 10. Clear groups from scene
        if (this.scene) {
            if (this.agentGroup) this.scene.remove(this.agentGroup);
            if (this.foodGroup) this.scene.remove(this.foodGroup);
            if (this.pheromoneGroup) this.scene.remove(this.pheromoneGroup);
            if (this.obstacleGroup) this.scene.remove(this.obstacleGroup);
            if (this.rayGroup) this.scene.remove(this.rayGroup);
            if (this.agentStateGroup) this.scene.remove(this.agentStateGroup);
            if (this.agentEffectsGroup) this.scene.remove(this.agentEffectsGroup);
        }

        // 11. Dispose of post-processing
        if (this.effectComposer) {
            this.effectComposer.dispose();
            this.effectComposer = null;
        }

        // 12. Dispose of Three.js renderer
        if (this.renderer) {
            this.renderer.dispose();
        }

        // 13. Clear references to prevent memory leaks
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.agentMeshes = null;
        this.agentEffects = null;
        this.agentStateMeshes = null;

        // 14. Clear pre-allocated arrays
        this.tempValidAgents.length = 0;
        this.tempVisibleFood.length = 0;
        this.tempVisiblePheromones.length = 0;
        this.tempActiveAgents.length = 0;
        this.tempActiveEffects.length = 0;

        this.logger.log('[RENDER] WebGL renderer disposed successfully');
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

        // Resize post-processing render targets
        if (this.effectComposer) {
            this.effectComposer.setSize(width, height);
        }
    }

    setupPostProcessing() {
        this.logger.log('[RENDER] setupPostProcessing called');
        this.logger.log(`[RENDER] postProcessingEnabled: ${this.postProcessingEnabled}`);
        
        if (!this.postProcessingEnabled) {
            this.logger.warn('[RENDER] Post-processing disabled, skipping setup');
            return;
        }

        try {
            this.logger.log('[RENDER] Attempting to create post-processing passes...');
            // Create render pass
            const renderPass = new RenderPass(this.scene, this.camera);

            // Get renderer size
            const sizeVec = acquireVector2();
            this.renderer.getSize(sizeVec);
            const width = sizeVec.x || this.container.clientWidth || window.innerWidth;
            const height = sizeVec.y || this.container.clientHeight || window.innerHeight;
            releaseVector2(sizeVec);

            // Create bloom pass
            const bloomSizeVec = acquireVector2();
            bloomSizeVec.set(width, height);
            const bloomPass = new UnrealBloomPass(
                bloomSizeVec,
                POST_PROCESSING.BLOOM.STRENGTH,
                POST_PROCESSING.BLOOM.RADIUS,
                POST_PROCESSING.BLOOM.THRESHOLD
            );

            // Create vignette shader
            const vignetteShader = {
                uniforms: {
                    tDiffuse: { value: null },
                    offset: { value: POST_PROCESSING.VIGNETTE.OFFSET },
                    darkness: { value: POST_PROCESSING.VIGNETTE.DARKNESS }
                },
                vertexShader: `
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform sampler2D tDiffuse;
                    uniform float offset;
                    uniform float darkness;
                    varying vec2 vUv;
                    void main() {
                        vec4 texel = texture2D(tDiffuse, vUv);
                        vec2 uv = (vUv - vec2(0.5)) * vec2(offset);
                        float dist = length(uv);
                        float vignette = smoothstep(0.8, offset, dist);
                        gl_FragColor = mix(texel, vec4(0.0, 0.0, 0.0, 1.0), vignette * darkness);
                    }
                `
            };

            // Create chromatic aberration shader
            const chromaticAberrationShader = {
                uniforms: {
                    tDiffuse: { value: null },
                    offset: { value: POST_PROCESSING.CHROMATIC_ABERRATION.OFFSET }
                },
                vertexShader: `
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform sampler2D tDiffuse;
                    uniform float offset;
                    varying vec2 vUv;
                    void main() {
                        vec2 uv = vUv;
                        vec2 offsetVec = (uv - vec2(0.5)) * offset;
                        float r = texture2D(tDiffuse, uv + offsetVec).r;
                        float g = texture2D(tDiffuse, uv).g;
                        float b = texture2D(tDiffuse, uv - offsetVec).b;
                        gl_FragColor = vec4(r, g, b, 1.0);
                    }
                `
            };

            // Create effect composer
            this.effectComposer = new EffectComposer(this.renderer);
            this.effectComposer.addPass(renderPass);
            this.effectComposer.addPass(bloomPass);

            // Add screen effects if enabled
            if (POST_PROCESSING.CHROMATIC_ABERRATION.ENABLED) {
                const chromaticPass = new ShaderPass(chromaticAberrationShader);
                this.effectComposer.addPass(chromaticPass);
                this.chromaticPass = chromaticPass;
            }

            if (POST_PROCESSING.VIGNETTE.ENABLED) {
                const vignettePass = new ShaderPass(vignetteShader);
                vignettePass.renderToScreen = true; // Last pass should render to screen
                this.effectComposer.addPass(vignettePass);
                this.vignettePass = vignettePass;
            } else {
                bloomPass.renderToScreen = true; // If no vignette, bloom is last
            }

            // Store passes for later access
            this.bloomPass = bloomPass;
            
            // Update bloom pass properties to match constants
            this.bloomPass.strength = POST_PROCESSING.BLOOM.STRENGTH;
            this.bloomPass.radius = POST_PROCESSING.BLOOM.RADIUS;
            this.bloomPass.threshold = POST_PROCESSING.BLOOM.THRESHOLD;
            
            this.logger.log(`[RENDER] Bloom pass configured: strength=${this.bloomPass.strength}, radius=${this.bloomPass.radius}, threshold=${this.bloomPass.threshold}`);

            this.logger.log('[RENDER] Post-processing pipeline initialized successfully');
            this.logger.log(`[RENDER] Bloom: strength=${POST_PROCESSING.BLOOM.STRENGTH}, radius=${POST_PROCESSING.BLOOM.RADIUS}, threshold=${POST_PROCESSING.BLOOM.THRESHOLD}`);
            this.logger.log(`[RENDER] Vignette: ${POST_PROCESSING.VIGNETTE.ENABLED ? 'enabled' : 'disabled'}`);
            this.logger.log(`[RENDER] Chromatic Aberration: ${POST_PROCESSING.CHROMATIC_ABERRATION.ENABLED ? 'enabled' : 'disabled'}`);
        } catch (error) {
            this.logger.warn('[RENDER] Failed to initialize post-processing, falling back to basic rendering:', error);
            this.logger.warn('[RENDER] Post-processing error details:', error.message, error.stack);
            this.postProcessingEnabled = false;
            this.effectComposer = null;
        }
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
        // Slower games (0.5x) should have shorter durations (3.5 frames)
        // Faster games (3x) should have longer durations (21 frames)
        const adjustedDuration = Math.max(1, Math.round(EFFECT_DURATION_BASE * gameSpeed));

        effects.push({
            type: effectType,
            startFrame: this.currentFrame || 0,
            duration: adjustedDuration
        });

        // Add sparkle particles for visual effects
        this.addSparkles(agent, effectType);
    }

    addSparkles(agent, effectType) {
        if (!this.sparklesEnabled) return;
        if (!agent || agent.isDead) return;
        if (this.sparkles.length >= this.maxSparkles) return; // Limit for performance

        // Spawn 3-5 sparkles per effect
        const sparkleCount = 3 + Math.floor(Math.random() * 3);
        const color = effectType === 'collision' ? EMISSIVE_COLORS.EFFECTS.COLLISION : EMISSIVE_COLORS.EFFECTS.EATING;

        for (let i = 0; i < sparkleCount; i++) {
            if (this.sparkles.length >= this.maxSparkles) break;

            const angle = Math.random() * Math.PI * 2;
            const distance = agent.size * (0.5 + Math.random() * 0.5);
            const speed = 0.5 + Math.random() * 1.0;
            const life = 20 + Math.floor(Math.random() * 20); // 20-40 frames

            this.sparkles.push({
                x: agent.x + Math.cos(angle) * distance,
                y: agent.y + Math.sin(angle) * distance,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                color: color,
                life: life,
                maxLife: life,
                size: 2 + Math.random() * 2
            });
        }
    }

    updateSparkles() {
        if (!this.sparklesEnabled) return;
        // Update and remove expired sparkles
        for (let i = this.sparkles.length - 1; i >= 0; i--) {
            const sparkle = this.sparkles[i];
            sparkle.x += sparkle.vx;
            sparkle.y += sparkle.vy;
            sparkle.vx *= 0.95; // Friction
            sparkle.vy *= 0.95;
            sparkle.life--;

            if (sparkle.life <= 0) {
                this.sparkles.splice(i, 1);
            }
        }

        // Update sparkle meshes - reuse when possible
        if (this.sparkles.length > 0) {
            // Reuse or create buffers with growth strategy (1.5x growth factor)
            const neededSize = this.sparkles.length * 3;
            if (!this.sparklePositionsBuffer || this.sparklePositionsBuffer.length < neededSize) {
                const growSize = Math.ceil(neededSize * 1.5); // Allocate 1.5x to reduce reallocations
                this.sparklePositionsBuffer = new Float32Array(growSize);
                this.sparkleColorsBuffer = new Float32Array(growSize);
                this.sparkleSizesBuffer = new Float32Array(Math.ceil(this.sparkles.length * 1.5));
            }
            const positions = this.sparklePositionsBuffer.subarray(0, neededSize);
            const colors = this.sparkleColorsBuffer.subarray(0, neededSize);
            const sizes = this.sparkleSizesBuffer.subarray(0, this.sparkles.length);

            for (let i = 0; i < this.sparkles.length; i++) {
                const sparkle = this.sparkles[i];
                const i3 = i * 3;
                positions[i3] = sparkle.x;
                positions[i3 + 1] = -sparkle.y; // Flip Y for Three.js
                positions[i3 + 2] = 0.2; // Slightly above other objects

                const color = acquireColor();
                color.setHex(sparkle.color);
                const opacity = sparkle.life / sparkle.maxLife;
                colors[i3] = color.r;
                colors[i3 + 1] = color.g;
                colors[i3 + 2] = color.b;
                releaseColor(color); // Release after use

                sizes[i] = sparkle.size * opacity;
            }

            // Reuse existing geometry and Points object if available
            if (!this.sparklePoints) {
                const geometry = acquireBufferGeometry();
                geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

                const material = acquirePointsMaterial({
                    size: 4,
                    vertexColors: true,
                    transparent: true,
                    opacity: 0.8,
                    sizeAttenuation: false
                });

                this.sparklePoints = new THREE.Points(geometry, material);
                this.sparkleGroup.add(this.sparklePoints);
            } else {
                // Update existing attributes instead of creating new ones
                const geometry = this.sparklePoints.geometry;
                const posAttr = geometry.attributes.position;
                const colorAttr = geometry.attributes.color;
                const sizeAttr = geometry.attributes.size;

                // Update existing attributes if buffer size matches, otherwise recreate
                if (posAttr.array.length >= neededSize) {
                    posAttr.array.set(positions);
                    posAttr.needsUpdate = true;
                    posAttr.count = this.sparkles.length;
                } else {
                    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                }

                if (colorAttr.array.length >= neededSize) {
                    colorAttr.array.set(colors);
                    colorAttr.needsUpdate = true;
                    colorAttr.count = this.sparkles.length;
                } else {
                    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                }

                if (sizeAttr.array.length >= this.sparkles.length) {
                    sizeAttr.array.set(sizes);
                    sizeAttr.needsUpdate = true;
                    sizeAttr.count = this.sparkles.length;
                } else {
                    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
                }
            }
        } else {
            // No sparkles - remove Points object but keep it for reuse
            if (this.sparklePoints) {
                this.sparkleGroup.remove(this.sparklePoints);
                if (this.sparklePoints.geometry) releaseBufferGeometry(this.sparklePoints.geometry);
                if (this.sparklePoints.material) releasePointsMaterial(this.sparklePoints.material);
                this.sparklePoints = null;
            }
        }
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

            // PERFORMANCE: In-place removal of expired effects to avoid allocation
            // Iterate backwards to safely splice
            for (let i = effects.length - 1; i >= 0; i--) {
                const effect = effects[i];
                if (currentFrame - effect.startFrame >= effect.duration) {
                    effects.splice(i, 1);
                }
            }

            if (effects.length === 0) {
                this.agentEffects.delete(agent);
            }
        }
    }

    updateCamera(cameraPos) {
        // Guard against accessing disposed camera
        if (!this.camera) {
            return;
        }

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

    // HSL to RGB helper - uses pooled color and caching for performance
    hslToRgb(h, s, l) {
        // Create cache key (round to reduce cache size)
        const hRounded = Math.round(h);
        const sRounded = Math.round(s);
        const lRounded = Math.round(l);
        const cacheKey = `${hRounded},${sRounded},${lRounded}`;

        // Check cache first
        if (this.hslToRgbCache.has(cacheKey)) {
            const cachedRgb = this.hslToRgbCache.get(cacheKey);
            const color = acquireColor();
            color.set(cachedRgb[0], cachedRgb[1], cachedRgb[2]);
            return color;
        }

        // Compute HSL to RGB conversion using precomputed constants
        const hNorm = h * this.MATH_CONSTANTS.ONE_OVER_360;
        const sNorm = s * this.MATH_CONSTANTS.ONE_OVER_100;
        const lNorm = l * this.MATH_CONSTANTS.ONE_OVER_100;
        const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
        const x = c * (1 - Math.abs((hNorm * 6) % 2 - 1));
        const m = lNorm - c * 0.5;
        let r, g, b;
        if (hNorm < this.MATH_CONSTANTS.ONE_OVER_6) { r = c; g = x; b = 0; }
        else if (hNorm < this.MATH_CONSTANTS.TWO_OVER_6) { r = x; g = c; b = 0; }
        else if (hNorm < this.MATH_CONSTANTS.THREE_OVER_6) { r = 0; g = c; b = x; }
        else if (hNorm < this.MATH_CONSTANTS.FOUR_OVER_6) { r = 0; g = x; b = c; }
        else if (hNorm < this.MATH_CONSTANTS.FIVE_OVER_6) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }
        
        const finalR = r + m;
        const finalG = g + m;
        const finalB = b + m;
        
        const color = acquireColor();
        color.set(finalR, finalG, finalB);

        // Cache the RGB values (limit cache size)
        if (this.hslToRgbCache.size >= this.hslCacheMaxSize) {
            // Remove oldest entry (simple FIFO - remove first)
            const firstKey = this.hslToRgbCache.keys().next().value;
            this.hslToRgbCache.delete(firstKey);
        }
        this.hslToRgbCache.set(cacheKey, [finalR, finalG, finalB]);

        return color;
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

                // Apply subtle specialization tint (much lighter to preserve geneId color variation)
                const specialization = geneAgents[0].specializationType;
                // Use very subtle tints (0.95-0.98 multiplier) to preserve geneId color differences
                const tempColor = acquireColor();
                if (specialization === SPECIALIZATION_TYPES.FORAGER) {
                    // Slight green/yellow tint
                    tempColor.set(
                        baseColor.r * 0.95 + 0.05,
                        baseColor.g * 0.95 + 0.05,
                        baseColor.b * 0.98
                    );
                } else if (specialization === SPECIALIZATION_TYPES.PREDATOR) {
                    // Slight red tint
                    tempColor.set(
                        baseColor.r * 0.95 + 0.05,
                        baseColor.g * 0.98,
                        baseColor.b * 0.98
                    );
                } else if (specialization === SPECIALIZATION_TYPES.REPRODUCER) {
                    // Slight cyan/magenta tint
                    tempColor.set(
                        baseColor.r * 0.95 + 0.05,
                        baseColor.g * 0.97 + 0.03,
                        baseColor.b * 0.97 + 0.03
                    );
                } else if (specialization === SPECIALIZATION_TYPES.SCOUT) {
                    // Slight yellow/cyan tint
                    tempColor.set(
                        baseColor.r * 0.98,
                        baseColor.g * 0.97 + 0.03,
                        baseColor.b * 0.95 + 0.05
                    );
                } else if (specialization === SPECIALIZATION_TYPES.DEFENDER) {
                    // Slight orange tint
                    tempColor.set(
                        baseColor.r * 0.95 + 0.05,
                        baseColor.g * 0.97 + 0.03,
                        baseColor.b * 0.98
                    );
                } else {
                    tempColor.copy(baseColor);
                }
                // Release baseColor and use tempColor
                releaseColor(baseColor);
                baseColor = tempColor;

                // Create material for agent body - agents should be the brightest/most visible
                // Very strong emissive to make agents stand out prominently
                const emissiveColor = acquireColor();
                emissiveColor.copy(baseColor);
                emissiveColor.multiplyScalar(0.8); // Very strong emissive for high visibility
                const bodyMaterial = new THREE.MeshStandardMaterial({
                    color: baseColor.clone(), // Clone for material (material owns this)
                    emissive: emissiveColor.clone(), // Clone for material
                    emissiveIntensity: 2.5, // Much higher emissive - agents should be very bright
                    metalness: 0.0, // No metalness to show pure color
                    roughness: 0.6, // Higher roughness for matte, crisp appearance
                    transparent: false, // No transparency for crisper look
                    opacity: 1.0
                });
                releaseColor(emissiveColor); // Release after cloning

                // Border material - bright but not brighter than body
                const specializationColor = acquireColor();
                specializationColor.setHex(COLORS.AGENTS[specialization] || COLORS.AGENTS.FORAGER);
                const borderEmissiveColor = acquireColor();
                borderEmissiveColor.setHex(EMISSIVE_COLORS.AGENTS[specialization] || EMISSIVE_COLORS.AGENTS.FORAGER);
                borderEmissiveColor.multiplyScalar(0.6); // Strong emissive for border
                const borderMaterial = new THREE.MeshStandardMaterial({
                    color: specializationColor.clone(), // Clone for material
                    emissive: borderEmissiveColor.clone(), // Clone for material
                    emissiveIntensity: 1.8, // High emissive - bright but not brighter than body
                    metalness: 0.0, // No metalness
                    roughness: 0.6, // Higher roughness for crisp look
                    transparent: false,
                    opacity: 1.0
                });
                releaseColor(specializationColor);
                releaseColor(borderEmissiveColor);
                releaseColor(baseColor); // Release baseColor after materials are created

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
            const matrix = acquireMatrix4();

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
                    this.testSphere.radius = Math.max(agent.size, AGENT_MINIMUM_BORDER_SIZE) * 3 + 50;

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
                this.logger.warn(`[RENDER] Gene ${geneId} exceeded capacity (${validCount} > ${mesh.maxCapacity}). Resizing to ${newCapacity}`);

                // Remove old meshes
                this.agentGroup.remove(mesh.body);
                this.agentGroup.remove(mesh.border);
                // CRITICAL FIX: DO NOT dispose geometry as it is shared
                // mesh.body.geometry.dispose(); 
                mesh.body.material.dispose();
                // mesh.border.geometry.dispose();
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
                this.logger.warn(`[RENDER] Gene ${geneId}: Can only render ${renderCount} of ${validCount} visible agents (capacity limit)`);
            }

            for (let i = 0; i < renderCount; i++) {
                const agent = validAgents[i];

                // Update body - ensure minimum visible size
                const renderSize = Math.max(agent.size, AGENT_MINIMUM_BORDER_SIZE); // Never smaller than minimum size
                matrix.makeScale(renderSize, renderSize, 1);
                matrix.setPosition(agent.x, -agent.y, 0.1); // Flip Y, slightly in front
                mesh.body.setMatrixAt(i, matrix);

                // Update border (always visible to show specialization)
                const borderSize = Math.max(agent.size, AGENT_MINIMUM_BORDER_SIZE) * AGENT_BORDER_SIZE_MULTIPLIER;
                matrix.makeScale(borderSize, borderSize, 1);
                matrix.setPosition(agent.x, -agent.y, 0.1);
                mesh.border.setMatrixAt(i, matrix);
            }

            // Update instance count
            mesh.body.count = renderCount;
            mesh.border.count = renderCount;

            mesh.body.instanceMatrix.needsUpdate = true;
            mesh.border.instanceMatrix.needsUpdate = true;

            // Release pooled matrix
            releaseMatrix4(matrix);
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
        if (!this.effectMeshPool) {
            this.effectMeshPool = [];
        }
        if (!this.activeEffectMeshes) {
            this.activeEffectMeshes = [];
        }

        // Collect all active effects that need rendering
        const effectsToRender = [];
        for (const [agent, effects] of this.agentEffects.entries()) {
            if (!agent || agent.isDead) continue;

            // Frustum culling - skip effects for agents outside camera view
            this.tempVec.set(agent.x, -agent.y, 0);
            this.testSphere.center = this.tempVec;
            this.testSphere.radius = Math.max(agent.size, AGENT_MINIMUM_BORDER_SIZE) * 2; // Larger radius for effects
            if (!this.frustum.intersectsSphere(this.testSphere)) continue;

            for (const effect of effects) {
                const elapsed = this.currentFrame - effect.startFrame;
                const progress = elapsed / effect.duration;
                const opacity = Math.max(1.0 - progress, 0); // Fade out over time

                effectsToRender.push({
                    agent,
                    effect,
                    progress,
                    opacity
                });
            }
        }

        // Return unused meshes to pool
        while (this.activeEffectMeshes.length > effectsToRender.length) {
            const mesh = this.activeEffectMeshes.pop();
            mesh.visible = false;
            this.effectMeshPool.push(mesh);
        }

        // Reuse or create meshes for active effects
        for (let i = 0; i < effectsToRender.length; i++) {
            const { agent, effect, progress, opacity } = effectsToRender[i];
            let mesh;

            if (i < this.activeEffectMeshes.length) {
                // Reuse existing mesh
                mesh = this.activeEffectMeshes[i];
                mesh.visible = true;
            } else {
                // Get mesh from pool or create new one
                if (this.effectMeshPool.length > 0) {
                    mesh = this.effectMeshPool.pop();
                    mesh.visible = true;
                } else {
                    // Create new mesh
                    const geometry = acquireRingGeometry(1, 2, 32);
                    const material = acquireMeshStandardMaterial({
                        side: THREE.DoubleSide,
                        depthWrite: false
                    });
                    mesh = new THREE.Mesh(geometry, material);
                    this.agentEffectsGroup.add(mesh);
                }
                this.activeEffectMeshes.push(mesh);
            }

            // Update mesh properties
            const effectRadius = agent.size * (1.2 + progress * 0.5);
            const innerRadius = Math.max(agent.size * 1.1, effectRadius * 0.8);
            const outerRadius = effectRadius * 1.3;

            // Update geometry if needed (recreate if size changed significantly)
            if (!mesh.geometry || 
                Math.abs(mesh.geometry.parameters.innerRadius - innerRadius) > 0.1 ||
                Math.abs(mesh.geometry.parameters.outerRadius - outerRadius) > 0.1) {
                if (mesh.geometry) {
                    releaseRingGeometry(mesh.geometry);
                }
                mesh.geometry = acquireRingGeometry(innerRadius, outerRadius, 32);
            }

            // Update material properties
            const color = effect.type === 'collision' ? COLORS.EFFECTS.COLLISION : COLORS.EFFECTS.EATING;
            const emissiveColor = effect.type === 'collision' ? EMISSIVE_COLORS.EFFECTS.COLLISION : EMISSIVE_COLORS.EFFECTS.EATING;
            const emissiveColorObj = acquireColor();
            emissiveColorObj.setHex(emissiveColor);
            emissiveColorObj.multiplyScalar(0.5);

            mesh.material.color.set(color);
            mesh.material.emissive.copy(emissiveColorObj);
            mesh.material.emissiveIntensity = MATERIAL_PROPERTIES.EFFECT.EMISSIVE_INTENSITY * opacity;
            mesh.material.metalness = MATERIAL_PROPERTIES.EFFECT.METALNESS;
            mesh.material.roughness = MATERIAL_PROPERTIES.EFFECT.ROUGHNESS;
            mesh.material.transparent = MATERIAL_PROPERTIES.EFFECT.TRANSPARENT;
            mesh.material.opacity = opacity * 0.5;
            mesh.position.set(agent.x, -agent.y, 0.05);

            releaseColor(emissiveColorObj);
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
            // Food material - dimmed down so agents are more prominent
            const foodEmissiveColor = acquireColor();
            foodEmissiveColor.setHex(EMISSIVE_COLORS.FOOD.NORMAL);
            foodEmissiveColor.multiplyScalar(0.2); // Reduced emissive - food should be dimmer
            const material = new THREE.MeshStandardMaterial({
                color: COLORS.FOOD.NORMAL,
                emissive: foodEmissiveColor.clone(), // Clone for material
                emissiveIntensity: 0.4, // Reduced from 2.5 - food should be dimmer than agents
                metalness: MATERIAL_PROPERTIES.FOOD.METALNESS,
                roughness: MATERIAL_PROPERTIES.FOOD.ROUGHNESS,
                transparent: MATERIAL_PROPERTIES.FOOD.TRANSPARENT,
                opacity: MATERIAL_PROPERTIES.FOOD.OPACITY,
                vertexColors: true // Enable per-instance colors
            });
            releaseColor(foodEmissiveColor);
            this.foodInstancedMesh = new THREE.InstancedMesh(this.foodGeometry, material, maxFood);
            this.foodInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            // Enable per-instance colors for food
            // Reuse existing instanceColor if it exists and is large enough
            if (!this.foodInstancedMesh.instanceColor || this.foodInstancedMesh.instanceColor.count < maxFood) {
                if (this.foodInstancedMesh.instanceColor) {
                    this.foodInstancedMesh.instanceColor.dispose();
                }
                this.foodInstancedMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxFood * 3), 3);
                this.foodInstancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
            }
            this.foodGroup.add(this.foodInstancedMesh);
        }

        // Update instances
        const instanceMatrix = acquireMatrix4();
        const color = acquireColor();
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

        // Release pooled objects
        releaseMatrix4(instanceMatrix);
        releaseColor(color);
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
            // Pheromone material - dimmed down so agents are more prominent
            const pheromoneEmissiveColor = acquireColor();
            pheromoneEmissiveColor.setHex(0x00FFFF); // Default cyan
            pheromoneEmissiveColor.multiplyScalar(0.15); // Reduced emissive - pheromones should be dimmer
            const material = new THREE.MeshStandardMaterial({
                color: 0x00FFFF,
                emissive: pheromoneEmissiveColor.clone(), // Clone for material
                emissiveIntensity: 0.3, // Reduced from 1.5 - pheromones should be dimmer than agents
                metalness: MATERIAL_PROPERTIES.PHEROMONE.METALNESS,
                roughness: MATERIAL_PROPERTIES.PHEROMONE.ROUGHNESS,
                transparent: MATERIAL_PROPERTIES.PHEROMONE.TRANSPARENT,
                opacity: MATERIAL_PROPERTIES.PHEROMONE.OPACITY
            });
            releaseColor(pheromoneEmissiveColor);
            this.pheromoneInstancedMesh = new THREE.InstancedMesh(this.pheromoneGeometry, material, maxPheromones);
            this.pheromoneInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this.pheromoneGroup.add(this.pheromoneInstancedMesh);

            // Enable per-instance colors
            // Reuse existing instanceColor if it exists and is large enough
            if (!this.pheromoneInstancedMesh.instanceColor || this.pheromoneInstancedMesh.instanceColor.count < maxPheromones) {
                if (this.pheromoneInstancedMesh.instanceColor) {
                    this.pheromoneInstancedMesh.instanceColor.dispose();
                }
                this.pheromoneInstancedMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxPheromones * 3), 3);
                this.pheromoneInstancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
            }
        }

        // Update instances
        const instanceMatrix = acquireMatrix4();
        const color = acquireColor();
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

        // Release pooled objects
        releaseMatrix4(instanceMatrix);
        releaseColor(color);
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
                // Release geometry if pooled, otherwise dispose
                if (mesh.geometry.parameters && mesh.geometry.parameters.radius === 1 && mesh.geometry.parameters.segments === 32) {
                    releaseCircleGeometry(mesh.geometry);
                } else {
                    mesh.geometry.dispose();
                }
                mesh.material.dispose();
            });
            this.obstacleMeshes = [];

            // Create obstacle meshes
            obstacles.forEach(obs => {
                // Use pooled geometry for standard size, create new for custom sizes
                const geometry = (obs.radius === 1) 
                    ? acquireCircleGeometry(obs.radius, 32)
                    : new THREE.CircleGeometry(obs.radius, 32);
                // Obstacle material - dimmed down so agents are more prominent
                const obstacleEmissiveColor = acquireColor();
                obstacleEmissiveColor.setHex(EMISSIVE_COLORS.OBSTACLE);
                obstacleEmissiveColor.multiplyScalar(0.2); // Reduced emissive - obstacles should be dimmer
                const material = new THREE.MeshStandardMaterial({
                    color: COLORS.OBSTACLE,
                    emissive: obstacleEmissiveColor.clone(), // Clone for material
                    emissiveIntensity: 0.4, // Reduced from 1.8 - obstacles should be dimmer than agents
                    metalness: MATERIAL_PROPERTIES.OBSTACLE.METALNESS,
                    roughness: MATERIAL_PROPERTIES.OBSTACLE.ROUGHNESS,
                    transparent: MATERIAL_PROPERTIES.OBSTACLE.TRANSPARENT,
                    opacity: MATERIAL_PROPERTIES.OBSTACLE.OPACITY
                });
                releaseColor(obstacleEmissiveColor);
                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.set(obs.x, -obs.y, 0);
                this.obstacleGroup.add(mesh);
                this.obstacleMeshes.push(mesh);

                // Add shadow (hiding radius) - keep basic material for shadow
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
        const frustum = acquireFrustum();
        const matrix = acquireMatrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(matrix);
        const tempVec = acquireVector3();
        const testSphere = acquireSphere();
        testSphere.center = tempVec; // Reuse the acquired vector
        testSphere.radius = 0;

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
        const neededVertexCount = totalRays * 2;
        if (!this.rayLineSegments || this.rayLineSegments.geometry.attributes.position.count < neededVertexCount) {
            // Allocate for max rays with growth strategy (1.5x growth factor)
            const maxRays = Math.max(Math.ceil(totalRays * 1.5), 500);
            const neededPosSize = maxRays * 2 * 3;
            const neededColorSize = maxRays * 2 * 3;
            
            // Reuse or create buffers with growth strategy
            if (!this.rayPositionsBuffer || this.rayPositionsBuffer.length < neededPosSize) {
                this.rayPositionsBuffer = new Float32Array(neededPosSize);
                this.rayColorsBuffer = new Float32Array(neededColorSize);
            }
            
            // Create or resize geometry
            if (this.rayLineSegments) {
                this.rayGroup.remove(this.rayLineSegments);
                // Release pooled resources
                releaseBufferGeometry(this.rayLineSegments.geometry);
                releaseLineBasicMaterial(this.rayLineSegments.material);
            }

            const positions = this.rayPositionsBuffer.subarray(0, neededPosSize);
            const colors = this.rayColorsBuffer.subarray(0, neededColorSize);
            const geometry = acquireBufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

            // Create glowing ray material with emissive properties
            const material = acquireLineBasicMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.8, // Increased opacity for better visibility
                linewidth: 2 // Thicker lines for better glow effect
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


        // Release pooled objects
        releaseFrustum(frustum);
        releaseMatrix4(matrix);
        releaseVector3(tempVec);
        releaseSphere(testSphere);
    }

    render() {
        // Update sparkles
        this.updateSparkles();

        // Render visual effects
        this.updateVisualEffectsRendering();

        // Use post-processing if enabled, otherwise use basic render
        if (this.postProcessingEnabled && this.effectComposer) {
            try {
                this.effectComposer.render();
            } catch (error) {
                // Fallback to basic render if post-processing fails
                this.logger.warn('[RENDER] Post-processing render failed, using basic render:', error);
                this.renderer.render(this.scene, this.camera);
            }
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }

    setShowRays(show) {
        this.showRays = show;
    }

    setPostProcessingEnabled(enabled) {
        this.postProcessingEnabled = enabled;
        if (!enabled && this.effectComposer) {
            // Clean up post-processing
            this.effectComposer.dispose();
            this.effectComposer = null;
        } else if (enabled && !this.effectComposer) {
            // Reinitialize post-processing
            this.setupPostProcessing();
        }
    }

    setSparklesEnabled(enabled) {
        this.sparklesEnabled = enabled !== false;
        if (!this.sparklesEnabled) {
            // Clear existing sparkles
            this.sparkles.length = 0;
            if (this.sparklePoints) {
                this.sparkleGroup.remove(this.sparklePoints);
                if (this.sparklePoints.geometry) releaseBufferGeometry(this.sparklePoints.geometry);
                if (this.sparklePoints.material) releasePointsMaterial(this.sparklePoints.material);
                this.sparklePoints = null;
            }
            while (this.sparkleGroup.children.length > 0) {
                const child = this.sparkleGroup.children[0];
                this.sparkleGroup.remove(child);
                if (child.geometry) releaseBufferGeometry(child.geometry);
                if (child.material) releasePointsMaterial(child.material);
            }
        }
    }

    /**
     * Defragment renderer resources for long-term stability
     * Clears and recreates instanced meshes to prevent memory fragmentation
     */
    defragment() {
        // Clear agent meshes to force recreation with fresh memory
        if (this.agentMeshes) {
            for (const [geneId, mesh] of this.agentMeshes.entries()) {
                if (mesh.body) {
                    this.agentGroup.remove(mesh.body);
                    // CRITICAL FIX: DO NOT dispose geometry as it is shared
                    // mesh.body.geometry.dispose();
                    mesh.body.material.dispose();
                }
                if (mesh.border) {
                    this.agentGroup.remove(mesh.border);
                    // CRITICAL FIX: DO NOT dispose geometry as it is shared
                    // mesh.border.geometry.dispose();
                    mesh.border.material.dispose();
                }
            }
            this.agentMeshes.clear();
        }

        // Clear food instanced mesh
        if (this.foodInstancedMesh) {
            this.foodGroup.remove(this.foodInstancedMesh);
            this.foodInstancedMesh.geometry.dispose();
            this.foodInstancedMesh.material.dispose();
            this.foodInstancedMesh = null;
        }

        // Clear pheromone instanced mesh
        if (this.pheromoneInstancedMesh) {
            this.pheromoneGroup.remove(this.pheromoneInstancedMesh);
            this.pheromoneInstancedMesh.geometry.dispose();
            this.pheromoneInstancedMesh.material.dispose();
            this.pheromoneInstancedMesh = null;
        }

        // Clear ray visualization
        if (this.rayLineSegments) {
            this.rayGroup.remove(this.rayLineSegments);
            releaseBufferGeometry(this.rayLineSegments.geometry);
            releaseLineBasicMaterial(this.rayLineSegments.material);
            this.rayLineSegments = null;
        }

        // Clear GPU resource pools to prevent memory leaks
        clearGPUResourcePools();

        // Clear neural network pools to prevent accumulation of unused array sizes
        neuralArrayPool.clearOldPools();

        this.logger.debug('[RENDER] Renderer defragmentation completed - resources will be recreated on next render');
    }
}
