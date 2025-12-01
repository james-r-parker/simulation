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
    VIEW_SIZE_RATIO, EFFECT_DURATION_BASE, MAX_INSTANCES_PER_BATCH, EFFECT_FADE_DURATION,
    MAX_VELOCITY
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
        // Background will be handled by background plane, keep solid color as fallback
        this.scene.background = new THREE.Color(COLORS.BACKGROUND); // Deep dark blue/black

        // Animated neural network background
        this.backgroundPlane = null;
        this.bestAgentNetworkData = null;
        this.backgroundTime = 0;

        // Obstacle animation tracking
        this.obstaclePulseTime = 0;
        this.obstacleParticleSystems = new Map(); // obstacle id -> particle system

        // Agent trail system
        this.agentTrails = new Map(); // agent id -> trail data
        this.trailGroup = new THREE.Group();
        this.scene.add(this.trailGroup);

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
        
        // Create animated neural network background (behind everything)
        this.createNeuralNetworkBackground();
        
        this.scene.add(this.agentGroup);
        this.scene.add(this.foodGroup);
        this.scene.add(this.pheromoneGroup);
        this.scene.add(this.obstacleGroup);
        this.scene.add(this.rayGroup);

        // Agent meshes (instanced for performance)
        this.agentMeshes = new Map(); // geneId -> mesh
        this.agentGeometry = new THREE.CircleGeometry(1, 16);
        this.agentBorderGeometry = new THREE.RingGeometry(0.88, 1.0, 64); // Thicker border (0.88-1.0 instead of 0.95-1.0) with more segments for smoother appearance

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
     * Create animated neural network background visualization
     */
    createNeuralNetworkBackground() {
        // Create a large plane covering the entire world
        const planeGeometry = new THREE.PlaneGeometry(this.worldWidth * 2, this.worldHeight * 2);
        
        const backgroundShader = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                worldSize: { value: new THREE.Vector2(this.worldWidth, this.worldHeight) },
                networkData: { value: null }, // Will be updated with best agent's network
                cameraPos: { value: new THREE.Vector2(0, 0) }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec2 worldSize;
                uniform vec2 cameraPos;
                varying vec2 vUv;
                
                // Simple neural network visualization - flowing lines and nodes
                void main() {
                    vec2 uv = vUv;
                    vec2 worldPos = (uv - 0.5) * worldSize + cameraPos;
                    
                    // Create flowing grid pattern
                    float gridSize = 200.0;
                    vec2 grid = floor(worldPos / gridSize);
                    vec2 gridUv = fract(worldPos / gridSize);
                    
                    // Animated flowing effect
                    float flow = sin(time * 0.5 + grid.x * 0.1 + grid.y * 0.15) * 0.5 + 0.5;
                    
                    // Create node points
                    float nodeDist = length(gridUv - 0.5);
                    float node = smoothstep(0.3, 0.1, nodeDist) * flow;
                    
                    // Create connecting lines
                    float lineWidth = 0.02;
                    float line1 = smoothstep(lineWidth, 0.0, abs(gridUv.x - 0.5)) * flow * 0.3;
                    float line2 = smoothstep(lineWidth, 0.0, abs(gridUv.y - 0.5)) * flow * 0.3;
                    
                    // Combine with faded colors
                    vec3 color1 = vec3(0.05, 0.1, 0.2); // Deep blue
                    vec3 color2 = vec3(0.1, 0.05, 0.25); // Purple-blue
                    vec3 color = mix(color1, color2, flow);
                    color += vec3(node * 0.1, node * 0.15, node * 0.2); // Cyan nodes
                    color += vec3(line1 + line2) * vec3(0.05, 0.1, 0.15); // Cyan lines
                    
                    // Very low opacity so it doesn't interfere
                    gl_FragColor = vec4(color, 0.15);
                }
            `,
            transparent: true,
            depthWrite: false
        });
        
        this.backgroundPlane = new THREE.Mesh(planeGeometry, backgroundShader);
        this.backgroundPlane.position.set(0, 0, -100); // Behind everything
        this.scene.add(this.backgroundPlane);
    }

    /**
     * Update neural network background with best agent's data
     */
    updateNeuralNetworkBackground(bestAgent, frameCount) {
        if (!this.backgroundPlane) return;
        
        const material = this.backgroundPlane.material;
        if (!material.uniforms) return;
        
        // Update time for animation
        material.uniforms.time.value = frameCount * 0.016; // ~60fps
        
        // Update camera position for parallax effect
        if (this.camera) {
            material.uniforms.cameraPos.value.set(
                this.camera.position.x,
                -this.camera.position.y
            );
        }
        
        // If we have a best agent with neural network, visualize it
        if (bestAgent && bestAgent.neuralNetwork && bestAgent.hiddenState) {
            // Extract network state for visualization
            const hiddenState = bestAgent.hiddenState;
            const stateSize = Math.min(hiddenState.length, 32); // Limit for performance
            
            // Create texture data from hidden state
            if (!material.uniforms.networkData.value) {
                material.uniforms.networkData.value = new Float32Array(stateSize);
            }
            
            const data = material.uniforms.networkData.value;
            for (let i = 0; i < stateSize; i++) {
                data[i] = hiddenState[i] || 0;
            }
        }
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

        // 7. Dispose of agent trails
        if (this.agentTrails) {
            for (const [id, trail] of this.agentTrails.entries()) {
                if (trail.geometry) trail.geometry.dispose();
                if (trail.material) trail.material.dispose();
                if (this.trailGroup) this.trailGroup.remove(trail);
            }
            this.agentTrails.clear();
        }
        if (this.trailGroup) {
            if (this.scene) this.scene.remove(this.trailGroup);
        }

        // 8. Dispose of obstacle particle systems
        if (this.obstacleParticleSystems) {
            for (const [id, particles] of this.obstacleParticleSystems.entries()) {
                if (particles.geometry) particles.geometry.dispose();
                if (particles.material) particles.material.dispose();
                if (this.obstacleGroup) this.obstacleGroup.remove(particles);
            }
            this.obstacleParticleSystems.clear();
        }

        // 9. Dispose of neural network background
        if (this.backgroundPlane) {
            if (this.backgroundPlane.geometry) this.backgroundPlane.geometry.dispose();
            if (this.backgroundPlane.material) this.backgroundPlane.material.dispose();
            if (this.scene) this.scene.remove(this.backgroundPlane);
            this.backgroundPlane = null;
        }

        // 10. Dispose of sparkle system
        if (this.sparkleGroup) {
            while (this.sparkleGroup.children.length > 0) {
                const child = this.sparkleGroup.children[0];
                if (child.geometry) releaseBufferGeometry(child.geometry);
                if (child.material) {
                    // ShaderMaterial is not pooled, dispose directly
                    child.material.dispose();
                }
                this.sparkleGroup.remove(child);
            }
            if (this.scene) this.scene.remove(this.sparkleGroup);
        }
        if (this.sparklePoints) {
            if (this.sparklePoints.geometry) releaseBufferGeometry(this.sparklePoints.geometry);
            if (this.sparklePoints.material) {
                // ShaderMaterial is not pooled, dispose directly
                this.sparklePoints.material.dispose();
            }
            this.sparklePoints = null;
        }
        if (this.sparkles) {
            this.sparkles.length = 0;
        }

        // 11. Clear agent effects map
        if (this.agentEffects) {
            this.agentEffects.clear();
        }

        // 12. Dispose of shared geometries (if they exist)
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

        // 13. Clear groups from scene
        if (this.scene) {
            if (this.agentGroup) this.scene.remove(this.agentGroup);
            if (this.foodGroup) this.scene.remove(this.foodGroup);
            if (this.pheromoneGroup) this.scene.remove(this.pheromoneGroup);
            if (this.obstacleGroup) this.scene.remove(this.obstacleGroup);
            if (this.rayGroup) this.scene.remove(this.rayGroup);
            if (this.agentStateGroup) this.scene.remove(this.agentStateGroup);
            if (this.agentEffectsGroup) this.scene.remove(this.agentEffectsGroup);
        }

        // 14. Dispose of post-processing
        if (this.effectComposer) {
            this.effectComposer.dispose();
            this.effectComposer = null;
        }

        // 15. Dispose of Three.js renderer
        if (this.renderer) {
            this.renderer.dispose();
        }

        // 16. Clear references to prevent memory leaks
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.agentMeshes = null;
        this.agentEffects = null;
        this.agentStateMeshes = null;

        // 17. Clear pre-allocated arrays
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
            releaseVector2(bloomSizeVec); // Release after use

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

            // Create motion blur shader for fast-moving agents
            const motionBlurShader = {
                uniforms: {
                    tDiffuse: { value: null },
                    strength: { value: 0.5 }
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
                    uniform float strength;
                    varying vec2 vUv;
                    void main() {
                        vec4 color = texture2D(tDiffuse, vUv);
                        // Simple directional blur - creates motion effect
                        // This is a simplified motion blur that works without velocity data
                        vec2 blurDir = vec2(0.0, 0.0);
                        float blurAmount = 0.0;
                        
                        // Detect bright areas (likely fast-moving agents) and apply blur
                        float brightness = dot(color.rgb, vec3(0.299, 0.587, 0.114));
                        if (brightness > 0.5) {
                            blurAmount = (brightness - 0.5) * strength;
                            blurDir = normalize(vUv - vec2(0.5)) * blurAmount;
                        }
                        
                        // Sample along blur direction with fixed loop count (8 samples)
                        vec4 blurred = color;
                        if (blurAmount > 0.01) {
                            const int samples = 8;
                            for (int i = 1; i <= samples; i++) {
                                float t = float(i) / float(samples);
                                vec2 offset = blurDir * t;
                                blurred += texture2D(tDiffuse, vUv + offset);
                            }
                            blurred /= float(samples + 1);
                        }
                        
                        gl_FragColor = blurred;
                    }
                `
            };

            // Create effect composer
            this.effectComposer = new EffectComposer(this.renderer);
            this.effectComposer.addPass(renderPass);
            this.effectComposer.addPass(bloomPass);

            // Add motion blur pass (before chromatic aberration for better effect)
            if (POST_PROCESSING.MOTION_BLUR.ENABLED) {
                const motionBlurPass = new ShaderPass(motionBlurShader);
                motionBlurPass.uniforms.strength.value = POST_PROCESSING.MOTION_BLUR.STRENGTH;
                motionBlurPass.enabled = true;
                this.effectComposer.addPass(motionBlurPass);
                this.motionBlurPass = motionBlurPass;
            }

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
                // If no vignette, determine last pass
                if (POST_PROCESSING.CHROMATIC_ABERRATION.ENABLED) {
                    // Chromatic aberration is last
                } else if (POST_PROCESSING.MOTION_BLUR.ENABLED && this.motionBlurPass) {
                    this.motionBlurPass.renderToScreen = true;
                } else {
                    bloomPass.renderToScreen = true;
                }
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
                size: 4 + Math.random() * 6 // Larger sparkles: 4-10 instead of 2-4
            });
        }
    }

    updateSparkles() {
        if (!this.sparklesEnabled) return;
        
        // DEBUG: Log sparkle state for troubleshooting
        if (this.sparkles.length > 0 && (!this.sparklePoints || !this.sparklePoints.visible)) {
            this.logger.debug(`[SPARKLES] ${this.sparkles.length} sparkles exist but sparklePoints is ${this.sparklePoints ? 'not visible' : 'null'}`);
        }
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
            // If sparklePoints exists but was hidden (count=0), we'll update it in the else branch
            if (!this.sparklePoints) {
                // CRITICAL: Create proper array copies instead of subarray views
                // Three.js BufferAttribute needs to own the array data
                const positionsCopy = new Float32Array(positions);
                const colorsCopy = new Float32Array(colors);
                const sizesCopy = new Float32Array(sizes);
                
                const geometry = acquireBufferGeometry();
                const positionAttr = new THREE.BufferAttribute(positionsCopy, 3);
                positionAttr.count = this.sparkles.length;
                geometry.setAttribute('position', positionAttr);
                
                const colorAttr = new THREE.BufferAttribute(colorsCopy, 3);
                colorAttr.count = this.sparkles.length;
                geometry.setAttribute('color', colorAttr);
                
                const sizeAttr = new THREE.BufferAttribute(sizesCopy, 1);
                sizeAttr.count = this.sparkles.length;
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

                this.sparklePoints = new THREE.Points(geometry, sparkleShaderMaterial);
                this.sparklePoints.visible = true;
                
                // CRITICAL: Ensure sparkleGroup is in scene before adding sparklePoints
                if (this.sparkleGroup.parent !== this.scene) {
                    this.scene.add(this.sparkleGroup);
                }
                
                // Only add if not already in the group (safety check)
                if (!this.sparkleGroup.children.includes(this.sparklePoints)) {
                    this.sparkleGroup.add(this.sparklePoints);
                }
                
                // CRITICAL: Compute bounding sphere for proper rendering
                geometry.computeBoundingSphere();
            } else {
                // Update existing attributes instead of creating new ones
                const geometry = this.sparklePoints.geometry;
                const posAttr = geometry.attributes.position;
                const colorAttr = geometry.attributes.color;
                const sizeAttr = geometry.attributes.size;

                // Update existing attributes if buffer size matches, otherwise recreate
                if (posAttr && posAttr.array.length >= neededSize) {
                    posAttr.array.set(positions);
                    posAttr.needsUpdate = true;
                    posAttr.count = this.sparkles.length;
                } else {
                    // CRITICAL: Create proper array copy instead of subarray view
                    // Note: Three.js automatically handles old attribute cleanup when setAttribute is called
                    const positionsCopy = new Float32Array(positions);
                    const newAttr = new THREE.BufferAttribute(positionsCopy, 3);
                    newAttr.count = this.sparkles.length;
                    newAttr.needsUpdate = true;
                    geometry.setAttribute('position', newAttr);
                }

                if (colorAttr && colorAttr.array.length >= neededSize) {
                    colorAttr.array.set(colors);
                    colorAttr.needsUpdate = true;
                    colorAttr.count = this.sparkles.length;
                } else {
                    // CRITICAL: Create proper array copy instead of subarray view
                    // Note: Three.js automatically handles old attribute cleanup when setAttribute is called
                    const colorsCopy = new Float32Array(colors);
                    const newAttr = new THREE.BufferAttribute(colorsCopy, 3);
                    newAttr.count = this.sparkles.length;
                    newAttr.needsUpdate = true;
                    geometry.setAttribute('color', newAttr);
                }

                if (sizeAttr && sizeAttr.array.length >= this.sparkles.length) {
                    sizeAttr.array.set(sizes);
                    sizeAttr.needsUpdate = true;
                    sizeAttr.count = this.sparkles.length;
                } else {
                    // CRITICAL: Create proper array copy instead of subarray view
                    // Note: Three.js automatically handles old attribute cleanup when setAttribute is called
                    const sizesCopy = new Float32Array(sizes);
                    const newAttr = new THREE.BufferAttribute(sizesCopy, 1);
                    newAttr.count = this.sparkles.length;
                    newAttr.needsUpdate = true;
                    geometry.setAttribute('size', newAttr);
                }
                
                // CRITICAL: Ensure sparklePoints is still in the scene hierarchy and visible
                if (this.sparkleGroup.parent !== this.scene) {
                    this.scene.add(this.sparkleGroup);
                }
                if (!this.sparkleGroup.children.includes(this.sparklePoints)) {
                    this.sparkleGroup.add(this.sparklePoints);
                }
                
                // CRITICAL: Always ensure visible and valid when we have sparkles
                this.sparklePoints.visible = true;
                
                // CRITICAL: Recompute bounding sphere when attributes change
                geometry.computeBoundingSphere();
                
                // CRITICAL: Force geometry update to ensure rendering
                geometry.attributes.position.needsUpdate = true;
                geometry.attributes.color.needsUpdate = true;
                geometry.attributes.size.needsUpdate = true;
            }
        } else {
            // No sparkles - hide Points object but keep it for reuse to avoid recreation race conditions
            if (this.sparklePoints) {
                // Set count to 0 instead of removing to avoid recreation timing issues
                const geometry = this.sparklePoints.geometry;
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
                this.sparklePoints.visible = false;
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

        // Find best agent for background visualization
        let bestAgent = null;
        let bestFitness = -Infinity;
        for (let i = 0; i < agents.length; i++) {
            const agent = agents[i];
            if (!agent || agent.isDead) continue;
            const fitness = agent.fitness || 0;
            if (fitness > bestFitness) {
                bestFitness = fitness;
                bestAgent = agent;
            }
        }
        
        // Update neural network background
        this.updateNeuralNetworkBackground(bestAgent, frameCount);

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
                emissiveColor.multiplyScalar(1.2); // Brighter emissive for high visibility
                const bodyMaterial = new THREE.MeshStandardMaterial({
                    color: baseColor.clone().multiplyScalar(1.3), // Brighter base color
                    emissive: emissiveColor.clone(), // Clone for material
                    emissiveIntensity: 5.0, // Much higher emissive - agents should be very bright
                    metalness: 0.0, // No metalness to show pure color
                    roughness: 0.4, // Lower roughness for more reflective/shiny appearance
                    transparent: false, // No transparency for crisper look
                    opacity: 1.0
                });
                releaseColor(emissiveColor); // Release after cloning

                // Border material - darker colors to blend into background
                const specializationColor = acquireColor();
                specializationColor.setHex(COLORS.AGENTS[specialization] || COLORS.AGENTS.FORAGER);
                // Darken the base color significantly (multiply by 0.25 for much darker appearance)
                specializationColor.multiplyScalar(0.25);
                
                const borderEmissiveColor = acquireColor();
                borderEmissiveColor.setHex(EMISSIVE_COLORS.AGENTS[specialization] || EMISSIVE_COLORS.AGENTS.FORAGER);
                // Much darker emissive for subtle glow that blends into background
                borderEmissiveColor.multiplyScalar(0.15);
                
                const borderMaterial = new THREE.MeshStandardMaterial({
                    color: specializationColor.clone(), // Clone for material (darkened)
                    emissive: borderEmissiveColor.clone(), // Clone for material (very dark)
                    emissiveIntensity: 0.4, // Low emissive - subtle glow that blends
                    metalness: 0.0, // No metalness
                    roughness: 0.8, // Higher roughness for matte, less reflective appearance
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

                // Calculate speed for enhanced effects
                const speed = Math.sqrt(agent.vx * agent.vx + agent.vy * agent.vy);
                const speedRatio = Math.min(speed / MAX_VELOCITY, 1.0);

                // Enhanced bloom for fast-moving agents (stored in userData to restore later)
                if (mesh.body.material) {
                    if (!mesh.body.userData.baseEmissiveIntensity) {
                        mesh.body.userData.baseEmissiveIntensity = mesh.body.material.emissiveIntensity || 2.5;
                    }
                    const baseEmissive = mesh.body.userData.baseEmissiveIntensity;
                    if (speedRatio > 0.5) {
                        mesh.body.material.emissiveIntensity = baseEmissive * (1.0 + speedRatio * 0.3);
                    } else {
                        mesh.body.material.emissiveIntensity = baseEmissive;
                    }
                }

                // Update body - ensure minimum visible size
                const renderSize = Math.max(agent.size, AGENT_MINIMUM_BORDER_SIZE); // Never smaller than minimum size
                matrix.makeScale(renderSize, renderSize, 1);
                matrix.setPosition(agent.x, -agent.y, 0.1); // Flip Y, slightly in front
                mesh.body.setMatrixAt(i, matrix);

                // Update border (always visible to show specialization)
                // Border is rendered slightly behind body to prevent z-fighting/tearing
                const borderSize = Math.max(agent.size, AGENT_MINIMUM_BORDER_SIZE) * AGENT_BORDER_SIZE_MULTIPLIER;
                matrix.makeScale(borderSize, borderSize, 1);
                matrix.setPosition(agent.x, -agent.y, 0.09); // Slightly behind body (0.09 vs 0.1) to prevent z-fighting
                mesh.border.setMatrixAt(i, matrix);

                // Add trail for fast-moving agents
                if (speedRatio > 0.3) {
                    this.updateAgentTrail(agent, speedRatio);
                }
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
        // DISABLED: Ring effects are replaced by sparkle particles
        // This method is kept for potential future use but no longer renders rings
        // Sparkles are handled separately via updateSparkles() which is called in render()
        
        // Hide any existing ring meshes to prevent old rings from showing
        if (this.activeEffectMeshes) {
            for (let i = 0; i < this.activeEffectMeshes.length; i++) {
                this.activeEffectMeshes[i].visible = false;
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
            releaseColor(rgbColor); // Release color from hslToRgb
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

            // Create obstacle meshes with menacing effects
            obstacles.forEach(obs => {
                // Create spiky/jagged geometry for more menacing look
                const segments = 16;
                const geometry = new THREE.CircleGeometry(obs.radius, segments);
                
                // Modify vertices to create spiky appearance
                const positions = geometry.attributes.position;
                for (let i = 0; i < positions.count; i++) {
                    const i3 = i * 3;
                    const x = positions.array[i3];
                    const y = positions.array[i3 + 1];
                    const dist = Math.sqrt(x * x + y * y);
                    if (dist > 0.01) { // Skip center vertex
                        // Add random spikes
                        const spikeAmount = 0.15;
                        const angle = Math.atan2(y, x);
                        const spike = Math.sin(angle * segments * 0.5) * spikeAmount;
                        const newDist = dist + spike;
                        positions.array[i3] = (x / dist) * newDist;
                        positions.array[i3 + 1] = (y / dist) * newDist;
                    }
                }
                positions.needsUpdate = true;
                geometry.computeVertexNormals();

                // Darker, more menacing obstacle material with pulsing glow
                const obstacleEmissiveColor = acquireColor();
                obstacleEmissiveColor.setHex(EMISSIVE_COLORS.OBSTACLE);
                obstacleEmissiveColor.multiplyScalar(0.4); // Brighter emissive for pulsing effect
                
                const material = new THREE.MeshStandardMaterial({
                    color: new THREE.Color(COLORS.OBSTACLE).multiplyScalar(0.6), // Darker base color
                    emissive: obstacleEmissiveColor.clone(),
                    emissiveIntensity: 1.2, // Higher for pulsing effect
                    metalness: 0.6, // More metallic
                    roughness: 0.3, // More reflective
                    transparent: false,
                    opacity: 1.0
                });
                releaseColor(obstacleEmissiveColor);
                
                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.set(obs.x, -obs.y, 0);
                mesh.userData.obstacleId = obs.id;
                mesh.userData.baseEmissiveIntensity = 1.2;
                this.obstacleGroup.add(mesh);
                this.obstacleMeshes.push(mesh);

                // Enhanced shadow with pulsing effect
                const shadowGeometry = new THREE.RingGeometry(obs.radius * 0.9, obs.radius + OBSTACLE_HIDING_RADIUS, 32);
                const shadowMaterial = new THREE.MeshBasicMaterial({
                    color: 0x000000,
                    transparent: true,
                    opacity: 0.6 // Darker shadow
                });
                const shadowMesh = new THREE.Mesh(shadowGeometry, shadowMaterial);
                shadowMesh.position.set(obs.x, -obs.y, 0);
                shadowMesh.userData.obstacleId = obs.id;
                this.obstacleGroup.add(shadowMesh);
                this.obstacleMeshes.push(shadowMesh);

                // Add particle system for energy/sparks around obstacle
                this.createObstacleParticles(obs);
            });
        } else {
            // Update positions and animations of existing meshes
            for (let i = 0; i < obstacles.length; i++) {
                const obs = obstacles[i];
                const circleMesh = this.obstacleMeshes[i * 2];     // Circle mesh
                const shadowMesh = this.obstacleMeshes[i * 2 + 1]; // Shadow mesh

                if (circleMesh && shadowMesh) {
                    circleMesh.position.set(obs.x, -obs.y, 0);
                    shadowMesh.position.set(obs.x, -obs.y, 0);
                    
                    // Update pulsing glow effect
                    const pulse = Math.sin(this.obstaclePulseTime * 2 + i) * 0.3 + 0.7;
                    if (circleMesh.material && circleMesh.userData.baseEmissiveIntensity) {
                        circleMesh.material.emissiveIntensity = circleMesh.userData.baseEmissiveIntensity * pulse;
                    }
                }
                
                // Update particle system position
                const particleSystem = this.obstacleParticleSystems.get(obs.id);
                if (particleSystem) {
                    particleSystem.position.set(obs.x, -obs.y, 0.1);
                }
            }
        }
        
        // Update pulse time
        this.obstaclePulseTime += 0.05;
    }

    /**
     * Update agent trail for fast-moving agents
     */
    updateAgentTrail(agent, speedRatio) {
        if (!agent.id) return;

        const trailLength = Math.floor(speedRatio * 8); // 0-8 trail points based on speed
        if (trailLength < 2) return;

        let trail = this.agentTrails.get(agent.id);
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
            this.trailGroup.add(trail);
            this.agentTrails.set(agent.id, trail);
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
        const agentColor = this.hslToRgb(agent.geneColor.h, agent.geneColor.s, agent.geneColor.l);
        
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

    /**
     * Create particle system for obstacle energy/sparks
     */
    createObstacleParticles(obstacle) {
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
        this.obstacleGroup.add(particles);
        this.obstacleParticleSystems.set(obstacle.id, particles);
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
        // Update background animation time
        if (this.backgroundPlane && this.backgroundPlane.material.uniforms) {
            this.backgroundPlane.material.uniforms.time.value += 0.016;
        }
        
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
                if (this.sparklePoints.material) {
                    // ShaderMaterial is not pooled, dispose directly
                    this.sparklePoints.material.dispose();
                }
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
