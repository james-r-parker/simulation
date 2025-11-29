// --- SIMULATION CLASS ---
// All simulation logic preserved exactly from original

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import {
    WORLD_WIDTH, WORLD_HEIGHT, INITIAL_AGENT_ENERGY, MIN_FOOD_EATEN_TO_SAVE_GENE_POOL,
    MAX_AGENTS_TO_SAVE_PER_GENE_POOL,
    FOOD_SPAWN_CAP, HIGH_VALUE_FOOD_CHANCE,
    SPECIALIZATION_TYPES, // Added for novelty spawning
    RESPAWN_DELAY_FRAMES, MAX_ENERGY,
    MIN_FITNESS_TO_SAVE_GENE_POOL, OBESITY_THRESHOLD_ENERGY, MAX_VELOCITY,
    VALIDATION_REQUIRED_RUNS, VALIDATION_FITNESS_THRESHOLD, MAX_VALIDATION_QUEUE_SIZE,
    PHEROMONE_RADIUS, PHEROMONE_DIAMETER, OBSTACLE_HIDING_RADIUS, TWO_PI,
    MATURATION_AGE_FRAMES, PREGNANCY_DURATION_FRAMES, MIN_ENERGY_TO_REPRODUCE,
    FPS_TARGET, AUTO_ADJUST_COOLDOWN, MIN_AGENTS, MAX_AGENTS_LIMIT,
    MIN_GAME_SPEED, MAX_GAME_SPEED, MEMORY_PRESSURE_THRESHOLD,
    FOOD_SPAWN_RATE, BASE_MUTATION_RATE, SEASON_LENGTH,
    TEMPERATURE_MIN, TEMPERATURE_MAX,
    SEASON_SPRING_TEMP_MODIFIER, SEASON_SUMMER_TEMP_MODIFIER, SEASON_FALL_TEMP_MODIFIER, SEASON_WINTER_TEMP_MODIFIER,
    SEASON_SPRING_REPRODUCTION_BONUS, SEASON_SUMMER_REPRODUCTION_BONUS, SEASON_FALL_REPRODUCTION_BONUS, SEASON_WINTER_REPRODUCTION_BONUS,
    SEASON_SUMMER_ENERGY_DRAIN, SEASON_FALL_ENERGY_DRAIN, SEASON_WINTER_ENERGY_DRAIN,
    SEASON_SPRING_MUTATION_MULTIPLIER, SEASON_SUMMER_MUTATION_MULTIPLIER, SEASON_FALL_MUTATION_MULTIPLIER, SEASON_WINTER_MUTATION_MULTIPLIER,
    SEASON_SPRING_FOOD_SCARCITY, SEASON_SUMMER_FOOD_SCARCITY, SEASON_FALL_FOOD_SCARCITY, SEASON_WINTER_FOOD_SCARCITY,
    FERTILE_ZONE_MAX_COUNT, FERTILE_ZONE_FERTILITY_FACTOR, FERTILE_ZONE_MAX_FERTILITY, FERTILE_ZONE_DECAY_RATE,
    FERTILE_ZONE_MIN_FERTILITY, FERTILE_ZONE_SIZE_FACTOR, FERTILE_ZONE_MIN_RADIUS,
    GPU_INIT_TIMEOUT_MS
} from './constants.js';
import { Agent } from './agent.js';
import { Food } from './food.js';
import { PheromonePuff } from './pheromone.js';
import { Quadtree, Rectangle, Point } from './quadtree.js';
import { Camera } from './camera.js';
import { WebGLRenderer } from './renderer.js';
import { GenePoolDatabase } from './database.js';
import { GPUCompute } from './gpu-compute.js';
import { GPUPhysics } from './gpu-physics.js';
import { distance, randomGaussian } from './utils.js';
import { Logger, LOG_LEVELS } from './logger.js';
import { PointPool } from './point-pool.js';
import { toast } from './toast.js';

// Imported functions from refactored modules
import {
    updateLoadingScreen, hideLoadingScreen, setupUIListeners,
    updateInfo, updateDashboard, resize, openAgentModal
} from './ui.js';
import {
    updateMemoryStats, handleMemoryPressure, periodicMemoryCleanup
} from './memory.js';
import {
    generateObstacles, updateFoodScalingFactor, spawnAgent,
    spawnFood, spawnPheromone, repopulate, randomSpawnAvoidCluster,
    updateObstacles
} from './spawn.js';
import { checkCollisions, convertGpuRayResultsToInputs } from './physics.js';
import { updateFitnessTracking, updatePeriodicValidation, hasValidatedAncestor } from './gene.js';
import { ValidationManager } from './validation.js';
import { PerformanceMonitor } from './performance-monitor.js';

export class Simulation {
    constructor(container) {
        this.logger = new Logger(LOG_LEVELS.DEBUG); // Set to DEBUG for detailed logs
        this.logger.log('Simulation constructor started.');

        this.agents = [];
        this.agentSpawnQueue = [];
        this.food = [];
        this.pheromones = [];
        this.fertileZones = []; // Nutrient-rich areas from decomposed agents

        this.worldWidth = WORLD_WIDTH;
        this.worldHeight = WORLD_HEIGHT;
        this.obstacles = generateObstacles(this);

        this.quadtree = new Quadtree(new Rectangle(this.worldWidth / 2, this.worldHeight / 2, this.worldWidth / 2, this.worldHeight / 2), 4);
        this.camera = new Camera(this.worldWidth / 2, this.worldHeight / 2, 0.5); // Zoomed out slightly for wider 16:9 view

        this.generation = 0;
        this.bestAgent = null;
        this.frameCount = 0;
        this.respawnTimer = 0;
        this.destroyed = false;

        // FPS tracking
        this.lastFpsUpdate = Date.now();
        this.fpsFrameCount = 0;
        this.currentFps = 0;

        // GPU vs CPU FPS tracking
        this.gpuFrameCount = 0;
        this.cpuFrameCount = 0;
        this.gpuFpsHistory = [];
        this.cpuFpsHistory = [];
        this.lastGpuCpuUpdate = Date.now();
        this.avgGpuFps = 0;
        this.avgCpuFps = 0;
        this.currentFrameUsedGpu = false;
        this.currentFrameGpuAgentIds = new Set();

        // Auto-performance adjustment
        this.fpsHistory = []; // Track last 30 seconds of FPS
        this.lastAutoAdjustTime = Date.now();
        this.autoAdjustEnabled = false; // Disable by default
        this.targetFps = FPS_TARGET;
        this.adjustmentCooldown = AUTO_ADJUST_COOLDOWN; // 15 seconds between adjustments
        this.minAgents = MIN_AGENTS;
        this.maxAgentsLimit = MAX_AGENTS_LIMIT;
        this.minGameSpeed = MIN_GAME_SPEED;
        this.maxGameSpeed = MAX_GAME_SPEED;
        // Auto-adjust caps at 75% of maximum to leave headroom for manual adjustment
        this.autoMaxAgents = Math.floor(this.maxAgentsLimit * 0.75); // 75 agents
        this.autoMaxSpeed = this.maxGameSpeed * 0.75; // 7.5x speed

        // Memory monitoring
        this.memoryHistory = [];
        this.memoryHistorySize = 100;
        this.lastMemoryUpdate = Date.now();
        this.currentMemoryUsage = 0;
        this.peakMemoryUsage = 0;

        // Toast notification system
        this.toast = toast;
        this.memoryGrowthRate = 0;
        this.entityCounts = { agents: 0, food: 0, pheromones: 0 };

        // Memory management
        this.memoryPressureThreshold = MEMORY_PRESSURE_THRESHOLD; // 150MB legacy threshold (fallback for basic cleanup)
        this.memoryPressureActions = 0;
        this.lastMemoryPressureAction = 0;
        this.totalAgentsSpawned = 0; // Total agents created in this simulation run

        this.gameSpeed = 0.5; // Start conservative for auto-adjustment
        this.maxAgents = 10; // Start with fewer agents for auto-adjustment
        this.foodSpawnRate = FOOD_SPAWN_RATE; // FURTHER REDUCED from 0.15 to 0.12 to balance food surplus (target ~150-200% buffer instead of 2800%+)
        this.mutationRate = 0.01;
        this.baseMutationRate = BASE_MUTATION_RATE; // Base rate for adaptive mutation
        this.adaptiveMutationRate = BASE_MUTATION_RATE; // Adaptive mutation rate that changes with environment
        this.showRays = false;
        this.followBest = false;
        this.useGpu = true; // Enable GPU by default

        // Dead agent queue for background database saving
        this.deadAgentQueue = [];

        this.validatedLineages = new Set(); // Track gene lineages that have successfully validated
        this.lastPeriodicSave = Date.now();

        // Track simulation start time for runtime calculation
        this.startTime = Date.now();

        this.seasonTimer = 0;
        this.foodScarcityFactor = 1.0;

        // Adaptive mutation tracking
        this.fitnessHistory = []; // Track best fitness over generations
        this.fitnessHistorySize = 10; // Keep last 10 generations

        // Screen wake lock for fullscreen gaming
        this.wakeLock = null;
        this.wakeLockEnabled = false;

        // Dashboard tracking
        this.dashboardHistory = []; // Track metrics for dashboard
        this.dashboardHistorySize = 100; // Keep last 100 data points
        this.finalFoodSpawnMultiplier = 1.0;

        // Real-time timing for critical periodic operations
        this.lastValidationCheckTime = Date.now();
        this.lastMemoryCleanupTime = Date.now();
        this.lastMemoryPressureCheckTime = Date.now();

        // WebGL Renderer
        this.renderer = new WebGLRenderer(container, this.worldWidth, this.worldHeight, this.logger);

        // GPU Compute (WebGPU for RTX 4090 and high-end GPUs)
        this.gpuCompute = new GPUCompute(this.logger);
        this.gpuPhysics = new GPUPhysics(this.logger);

        // IndexedDB
        this.db = new GenePoolDatabase(this.logger);

        // Validation system for multi-run testing of promising agents (initialized after db)
        this.validationManager = new ValidationManager(this.logger, this.db, this);

        // --- Pre-allocated Memory for Performance ---
        this.activeAgents = []; // Pre-allocate active agents array
        this.allEntities = []; // Pre-allocate all entities array
        this.collisionQueryRange = new Rectangle(0, 0, 0, 0); // Pre-allocate collision query range

        // Object pool for quadtree Point objects to reduce GC pressure
        this.pointPool = new PointPool(); // Uses default POINT_POOL_SIZE

        // Performance monitoring framework
        this.perfMonitor = new PerformanceMonitor(this.logger, 60); // 60-frame rolling average
        this.perfMonitor.setEnabled(true); // Enable by default

        // Pre-allocated arrays for filter operations
        this.livingFood = [];
        this.livingPheromones = [];
        this.livingAgents = [];

        // Long-term stability tracking for renderer
        this.rendererSessionStartTime = Date.now();
        this.rendererTotalFramesRendered = 0;
        this.rendererLastDefragTime = Date.now();
        this.rendererDefragIntervalHours = 4; // Defragment renderer every 4 hours

        this.init();
    }

    resize() {
        resize(this);
    }

    /**
     * Comprehensive cleanup method to prevent memory leaks
     * Call this when destroying the simulation or on page unload
     */
    destroy() {
        // Guard against multiple destroy calls
        if (this.destroyed) {
            this.logger.log('Simulation already destroyed, skipping...');
            return;
        }

        this.logger.log('Destroying simulation and cleaning up resources...');
        this.destroyed = true;

        // 1. Cancel the game loop animation frame
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = undefined;
        }

        // 2. Remove event listeners
        this._removeEventListeners();

        // 3. Terminate web worker
        if (this.db && this.db.worker) {
            this.db.worker.terminate();
            this.logger.log('Database worker terminated');
        }

        // 4. Dispose WebGL renderer and all GPU resources
        if (this.renderer && this.renderer.dispose) {
            this.renderer.dispose();
            this.logger.log('WebGL renderer disposed');
        }

        // 5. Clear GPU caches
        if (this.gpuCompute && this.gpuCompute.clearCache) {
            this.gpuCompute.clearCache();
            this.logger.log('GPU compute cache cleared');
        }
        if (this.gpuPhysics && this.gpuPhysics.clearCache) {
            this.gpuPhysics.clearCache();
            this.logger.log('GPU physics cache cleared');
        }

        // 6. Stop UI intervals and remove event listeners (imported from ui.js)
        try {
            import('./ui.js').then(module => {
                if (module.stopPeriodicSummarization) {
                    module.stopPeriodicSummarization();
                }
                if (module.cleanupUIEventListeners) {
                    module.cleanupUIEventListeners();
                }
            });
        } catch (e) {
            this.logger.warn('Could not cleanup UI:', e);
        }

        // 7. Clear arrays and references
        this.agents.length = 0;
        this.agentSpawnQueue.length = 0;
        this.food.length = 0;
        this.pheromones.length = 0;
        this.deadAgentQueue.length = 0;
        this.validatedLineages.clear();

        // 8. Clear point pool
        if (this.pointPool) {
            this.pointPool.releaseAll();
        }

        // 9. Clear performance monitor
        if (this.perfMonitor) {
            this.perfMonitor.setEnabled(false);
        }

        // 10. Release wake lock
        if (this.wakeLockEnabled) {
            this.releaseWakeLock();
        }

        this.logger.log('Simulation destroyed and all resources cleaned up');
    }

    /**
     * Static method to create a new simulation, destroying the old one if it exists
     * @param {HTMLElement} container - The container element for the simulation
     * @param {Simulation} oldSimulation - The old simulation to destroy (optional)
     * @returns {Promise<Simulation>} - Promise that resolves to the new simulation
     */
    static async createNew(container, oldSimulation = null) {
        // Destroy the old simulation if provided
        if (oldSimulation && oldSimulation.destroy) {
            oldSimulation.destroy();
        }

        // Clear the global reference
        window.currentSimulation = null;

        // Create new simulation
        const newSim = new Simulation(container);

        // Store the new reference
        window.currentSimulation = newSim;

        // Initialize the new simulation
        await newSim.init();

        // Resize after initialization
        newSim.resize();
        setTimeout(() => {
            newSim.resize();
        }, 100);

        return newSim;
    }

    /**
     * Remove all event listeners to prevent memory leaks
     */
    _removeEventListeners() {
        // Canvas click listener
        if (this.renderer && this.renderer.renderer && this.renderer.renderer.domElement) {
            this.renderer.renderer.domElement.removeEventListener('click', this.handleCanvasClick);
        }

        // Wake lock listener
        if (this.wakeLock) {
            this.wakeLock.removeEventListener('release', () => {
                this.logger.info('[WAKE] 🔋 Screen wake lock released by system');
                this.wakeLock = null;
                this.wakeLockEnabled = false;
            });
        }

        // UI event listeners are handled by the UI module's cleanup
        // The UI module should have its own cleanup method
    }

    performAutoAdjustment() {
        // Calculate average FPS over the last 30 seconds
        const avgFps = this.fpsHistory.reduce((sum, fps) => sum + fps, 0) / this.fpsHistory.length;
        const minFps = Math.min(...this.fpsHistory);
        const maxFps = Math.max(...this.fpsHistory);

        // Count living agents
        const livingAgents = this.agents.filter(a => !a.isDead).length;

        this.logger.info(`[AUTO-ADJUST] FPS: avg=${avgFps.toFixed(1)}, range=${minFps}-${maxFps}, agents=${livingAgents}/${this.maxAgents}, speed=${this.gameSpeed}`);

        // Determine if we need to adjust
        let adjustmentNeeded = false;
        let increasePerformance = false;
        let decreasePerformance = false;

        // If consistently below target FPS, decrease performance
        if (avgFps < this.targetFps - 5 && minFps < this.targetFps - 10) {
            decreasePerformance = true;
            adjustmentNeeded = true;
            this.logger.info(`[AUTO-ADJUST] ⚠️ Low FPS detected - decreasing performance`);
        }
        // If consistently above target FPS with headroom, increase performance
        else if (avgFps > this.targetFps + 5 && minFps > this.targetFps - 5) {
            increasePerformance = true;
            adjustmentNeeded = true;
            this.logger.info(`[AUTO-ADJUST] ✅ High FPS detected - increasing performance`);
        } else {
            this.logger.info(`[AUTO-ADJUST] ➡️ FPS within target range (${this.targetFps} ±5) - no adjustment needed`);
        }

        if (adjustmentNeeded) {
            // Prioritize: agents first (more impactful), then speed
            if (decreasePerformance) {
                // Decrease performance: reduce agents first, then speed
                if (this.maxAgents > this.minAgents) {
                    const oldValue = this.maxAgents;
                    const newMaxAgents = Math.max(this.minAgents, Math.floor(this.maxAgents * 0.8));
                    if (newMaxAgents !== this.maxAgents) {
                        this.maxAgents = newMaxAgents;
                        this.logger.info(`[AUTO-ADJUST] ↓ Reduced max agents to ${this.maxAgents} (FPS: ${avgFps.toFixed(1)})`);
                        // Update UI slider
                        const slider = document.getElementById('maxAgents');
                        if (slider) slider.value = this.maxAgents;
                        // Update food scaling
                        import('./spawn.js').then(module => module.updateFoodScalingFactor(this));
                        // Show toast notification
                        if (this.toast) {
                            this.toast.showAutoAdjust('down', 'max agents', oldValue, newMaxAgents, avgFps);
                        }
                        return; // Only make one adjustment per cycle
                    }
                }
                if (this.gameSpeed > this.minGameSpeed) {
                    const oldValue = this.gameSpeed;
                    this.gameSpeed = Math.max(this.minGameSpeed, this.gameSpeed - 0.5);
                    this.logger.info(`[AUTO-ADJUST] ↓ Reduced game speed to ${this.gameSpeed} (FPS: ${avgFps.toFixed(1)})`);
                    // Update UI slider
                    const slider = document.getElementById('gameSpeed');
                    if (slider) slider.value = this.gameSpeed;
                    // Show toast notification
                    if (this.toast) {
                        this.toast.showAutoAdjust('down', 'game speed', oldValue, this.gameSpeed, avgFps);
                    }
                    return;
                }
            }
            else if (increasePerformance) {
                // Increase performance: increase agents first (more impactful), then speed
                if (this.maxAgents < this.autoMaxAgents) {
                    // Increase agents more aggressively when performance is consistently good (up to 75% cap)
                    const oldValue = this.maxAgents;
                    const newMaxAgents = Math.min(this.autoMaxAgents, Math.floor(this.maxAgents * 1.5));
                    if (newMaxAgents !== this.maxAgents) {
                        this.maxAgents = newMaxAgents;
                        this.logger.info(`[AUTO-ADJUST] ↑ Increased max agents to ${this.maxAgents}/${this.autoMaxAgents} cap (FPS: ${avgFps.toFixed(1)})`);
                        // Update UI slider
                        const slider = document.getElementById('maxAgents');
                        if (slider) slider.value = this.maxAgents;
                        // Update food scaling
                        import('./spawn.js').then(module => module.updateFoodScalingFactor(this));
                        // Show toast notification
                        if (this.toast) {
                            this.toast.showAutoAdjust('up', 'max agents', oldValue, newMaxAgents, avgFps);
                        }
                        return; // Only make one adjustment per cycle
                    }
                }
                if (this.gameSpeed < this.autoMaxSpeed) {
                    const oldValue = this.gameSpeed;
                    this.gameSpeed = Math.min(this.autoMaxSpeed, this.gameSpeed + 0.5);
                    this.logger.info(`[AUTO-ADJUST] ↑ Increased game speed to ${this.gameSpeed}/${this.autoMaxSpeed} cap (FPS: ${avgFps.toFixed(1)})`);
                    // Update UI slider
                    const slider = document.getElementById('gameSpeed');
                    if (slider) slider.value = this.gameSpeed;
                    // Show toast notification
                    if (this.toast) {
                        this.toast.showAutoAdjust('up', 'game speed', oldValue, this.gameSpeed, avgFps);
                    }
                    return;
                }
            }
        } else {
            this.logger.debug(`[AUTO-ADJUST] No adjustment needed (FPS: ${avgFps.toFixed(1)}, target: ${this.targetFps})`);
        }
    }

    updateFitnessChart() {
        const canvas = document.getElementById('fitness-chart');
        if (!canvas || this.fitnessHistory.length < 2) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // Clear
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, width, height);

        // Draw grid
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = (height / 4) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // Get data to plot (last 50 points or all if less)
        const dataPoints = Math.min(50, this.fitnessHistory.length);
        const data = this.fitnessHistory.slice(-dataPoints);
        const maxFitness = Math.max(...data, 1);
        const minFitness = Math.min(...data, 0);
        const range = maxFitness - minFitness || 1;

        // Draw line
        ctx.strokeStyle = '#0f0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        data.forEach((fitness, i) => {
            const x = (width / (dataPoints - 1)) * i;
            const y = height - ((fitness - minFitness) / range) * height;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();

        // Draw points
        ctx.fillStyle = '#0f0';
        data.forEach((fitness, i) => {
            const x = (width / (dataPoints - 1)) * i;
            const y = height - ((fitness - minFitness) / range) * height;
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, TWO_PI);
            ctx.fill();
        });
    }

    async init() {
        updateLoadingScreen('Initializing database...', 10);
        try {
            await this.db.init();
        } catch (e) {
            this.logger.error("Database init failed:", e);
        }

        updateLoadingScreen('Loading gene pools...', 30);
        try {
            await this.db.loadAllGenePools();
        } catch (e) {
            this.logger.error("Gene pool loading failed:", e);
        }

        // Initialize WebGPU compute with timeout
        let gpuAvailable = false;
        let gpuPhysicsAvailable = false;

        updateLoadingScreen('Initializing GPU Compute...', 50);
        try {
            gpuAvailable = await Promise.race([
                this.gpuCompute.init(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('GPU Compute init timeout')), GPU_INIT_TIMEOUT_MS))
            ]).catch(() => false);
        } catch (e) {
            this.logger.warn("GPU Compute init failed or timed out:", e);
            gpuAvailable = false;
        }

        if (gpuAvailable) {
            this.logger.log('GPU Compute initialized successfully');
        } else {
            this.logger.warn('GPU Compute initialization failed, neural networks will use CPU');
        }

        updateLoadingScreen('Initializing GPU Physics...', 70);
        try {
            const maxAgentsSlider = document.getElementById('maxAgents');
            const maxAgentsFromSlider = maxAgentsSlider ? parseInt(maxAgentsSlider.max, 10) : 100;
            const bufferSafetyMargin = 50; // Increased safety margin for population growth

            const MAX_RAYS_PER_AGENT = 50; // This must match the hardcoded value in the simulation
            const MAX_ENTITIES = (maxAgentsFromSlider + bufferSafetyMargin) * 2 + FOOD_SPAWN_CAP + 200; // Doubled agents + Food + larger safety buffer
            const MAX_OBSTACLES = 600; // Increased for more complex environments

            const gpuConfig = {
                maxAgents: (maxAgentsFromSlider + bufferSafetyMargin) * 2, // Double the agent buffer size
                maxRaysPerAgent: MAX_RAYS_PER_AGENT,
                maxEntities: MAX_ENTITIES,
                maxObstacles: MAX_OBSTACLES,
            };
            this.logger.info('[GPU-INIT] Initializing GPU Physics with config:', gpuConfig);

            gpuPhysicsAvailable = await Promise.race([
                this.gpuPhysics.init(gpuConfig),
                new Promise((_, reject) => setTimeout(() => reject(new Error('GPU Physics init timeout')), GPU_INIT_TIMEOUT_MS))
            ]).catch((error) => {
                this.logger.error('[GPU-INIT] GPU Physics init failed:', error);
                return false;
            });

            if (gpuPhysicsAvailable) {
                this.logger.info('[GPU-INIT] GPU Physics initialized successfully');
            } else {
                this.logger.warn('[GPU-INIT] GPU Physics initialization failed or timed out');
            }
        } catch (e) {
            this.logger.warn("GPU Physics init failed or timed out:", e);
            gpuPhysicsAvailable = false;
        }

        if (gpuAvailable) {
            this.logger.log('WebGPU acceleration enabled - using GPU for computations');
        } else {
            this.logger.log('Using optimized CPU fallback for computations');
        }

        if (gpuPhysicsAvailable) {
            this.logger.log('GPU Physics enabled - using GPU for ray tracing and collisions');
        }

        updateLoadingScreen('Creating initial population...', 85);
        this.initPopulation();
        setupUIListeners(this);
        updateFoodScalingFactor(this);

        updateLoadingScreen('Starting simulation...', 100);
        // Small delay to show 100% before hiding
        await new Promise(resolve => setTimeout(resolve, 300));
        hideLoadingScreen();

        // Add click listener for agent selection
        this.renderer.renderer.domElement.addEventListener('click', (e) => this.handleCanvasClick(e));

        // Start the game loop only after everything is initialized
        this.gameLoop().catch(error => {
            this.logger.error('Error starting game loop:', error);
        });
    }

    handleCanvasClick(event) {
        const rect = this.renderer.renderer.domElement.getBoundingClientRect();
        const clientX = event.clientX;
        const clientY = event.clientY;

        // Convert to normalized device coordinates (NDC) [-1, 1]
        const x = ((clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((clientY - rect.top) / rect.height) * 2 + 1;

        // Unproject to world coordinates using the renderer's camera
        const threeCamera = this.renderer.camera;
        const vector = new THREE.Vector3(x, y, 0);
        vector.unproject(threeCamera);

        // Renderer flips Y for drawing, so we flip back to get simulation coordinates
        const worldX = vector.x;
        const worldY = -vector.y;

        // Find closest agent - now checks ALL living agents regardless of distance
        let closestAgent = null;
        let minDist = Infinity;

        // Count living agents first to provide feedback if none exist
        let livingAgents = 0;
        for (const agent of this.agents) {
            if (!agent.isDead) {
                livingAgents++;
                const dx = agent.x - worldX;
                const dy = agent.y - worldY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < minDist) {
                    minDist = dist;
                    closestAgent = agent;
                }
            }
        }

        if (closestAgent) {
            // Show feedback about which agent was selected and distance
            this.logger.debug(`[AGENT-SELECT] Selected agent ${closestAgent.id} (${closestAgent.geneId}) at distance ${minDist.toFixed(1)} world units`);
            openAgentModal(closestAgent, this);
        } else if (livingAgents === 0) {
            // No living agents to select
            this.toast?.show('No living agents to select', 'info', 2000);
        } else {
            // This shouldn't happen, but just in case
            this.logger.warn('[AGENT-SELECT] No closest agent found despite living agents existing');
        }
    }






    async requestWakeLock() {
        if (!('wakeLock' in navigator)) {
            this.logger.warn('[WAKE] Screen Wake Lock API not supported in this browser');
            return false;
        }

        try {
            this.wakeLock = await navigator.wakeLock.request('screen');
            this.wakeLockEnabled = true;
            this.logger.info('[WAKE] 🔋 Screen wake lock activated - display will stay on');

            // Handle wake lock release (when system needs to save power)
            this.wakeLock.addEventListener('release', () => {
                this.logger.info('[WAKE] 🔋 Screen wake lock released by system');
                this.wakeLock = null;
                this.wakeLockEnabled = false;
            });

            return true;
        } catch (err) {
            this.logger.warn('[WAKE] Failed to acquire wake lock:', err.message);
            this.wakeLockEnabled = false;
            return false;
        }
    }

    async releaseWakeLock() {
        if (this.wakeLock) {
            await this.wakeLock.release();
            this.wakeLock = null;
            this.wakeLockEnabled = false;
            this.logger.info('[WAKE] 🔋 Screen wake lock released');
        }
    }

    async toggleWakeLock() {
        if (this.wakeLockEnabled) {
            await this.releaseWakeLock();
        } else {
            await this.requestWakeLock();
        }
    }

    processDeadAgentQueue() {
        // Process dead agents in batches (non-blocking)
        if (this.deadAgentQueue.length === 0) return;

        // Group by gene ID and queue for background save
        const agentsByGene = {};
        this.deadAgentQueue.forEach(agent => {
            if (!agentsByGene[agent.geneId]) {
                agentsByGene[agent.geneId] = [];
            }
            agentsByGene[agent.geneId].push(agent);
        });

        // Queue each gene pool for background save
        for (const [geneId, geneAgents] of Object.entries(agentsByGene)) {
            this.db.queueSaveGenePool(geneId, geneAgents);
        }

        // Clear the queue
        this.deadAgentQueue = [];
    }

    initPopulation() {
        const startingAgentCount = Math.min(10, this.maxAgents);

        // Spawn all agents evenly distributed across the world
        // Divide the world into a grid to ensure even distribution
        const gridCols = Math.ceil(Math.sqrt(startingAgentCount));
        const gridRows = Math.ceil(startingAgentCount / gridCols);

        // Calculate cell size, leaving margins to avoid spawning too close to edges
        const margin = 200; // Keep agents away from world edges
        const cellWidth = (this.worldWidth - 2 * margin) / gridCols;
        const cellHeight = (this.worldHeight - 2 * margin) / gridRows;

        for (let i = 0; i < startingAgentCount; i++) {
            // Calculate grid position
            const gridX = i % gridCols;
            const gridY = Math.floor(i / gridCols);

            // Calculate position within the grid cell with some randomness
            const baseX = margin + gridX * cellWidth + cellWidth / 2;
            const baseY = margin + gridY * cellHeight + cellHeight / 2;

            // Add small random offset within the cell to avoid perfect alignment
            const offsetX = (Math.random() - 0.5) * Math.min(cellWidth * 0.3, 100);
            const offsetY = (Math.random() - 0.5) * Math.min(cellHeight * 0.3, 100);

            const x = Math.max(margin, Math.min(this.worldWidth - margin, baseX + offsetX));
            const y = Math.max(margin, Math.min(this.worldHeight - margin, baseY + offsetY));

            // Try to use gene pools for some agents, random for others
            let gene = null;
            if (i > 0 && Math.random() < 0.7) { // 70% chance to use existing genes after first agent
                gene = this.db.getRandomAgent();
            }

            spawnAgent(this, {
                gene: gene,
                x: x,
                y: y,
                energy: INITIAL_AGENT_ENERGY
            });
        }

        // Initial food - spread evenly across the entire world
        // Increased to give agents better chance to find food and learn
        const initialFoodCount = Math.min(FOOD_SPAWN_CAP, 400); // Max 400 initial food (doubled for learning)

        for (let i = 0; i < initialFoodCount; i++) {
            const pos = randomSpawnAvoidCluster(this);
            const isHighValue = Math.random() < HIGH_VALUE_FOOD_CHANCE;
            this.food.push(new Food(pos.x, pos.y, isHighValue));
        }
    }







    applyEnvironmentEvents() {
        this.seasonTimer++;
        const seasonLength = SEASON_LENGTH;
        const phase = (this.seasonTimer % seasonLength) / seasonLength;

        // Enhanced seasonal cycles with multiple environmental factors
        this.updateSeasonalEnvironment(phase, seasonLength);

        // Update fertile zones (nutrient cycling)
        this.updateFertileZones();

        // Seasonal danger events (storms, predators, etc.)
        if (this.seasonTimer % (seasonLength * 6) === 0) {
            for (let i = 0; i < 2; i++) {
                spawnPheromone(this, this.worldWidth * Math.random(), this.worldHeight * Math.random(), 'danger');
            }
        }
    }

    updateSeasonalEnvironment(phase, seasonLength) {
        // Four distinct seasons with different environmental pressures
        let globalTemperatureModifier = 0;
        let reproductionBonus = 1.0;
        let mutationMultiplier = 1.0;
        let energyDrainMultiplier = 1.0;

        if (phase < 0.25) {
            // SPRING: Warming temperatures, breeding season, resource recovery
            globalTemperatureModifier = SEASON_SPRING_TEMP_MODIFIER; // Cool but warming
            reproductionBonus = SEASON_SPRING_REPRODUCTION_BONUS; // Breeding season bonus
            this.foodScarcityFactor = SEASON_SPRING_FOOD_SCARCITY; // Abundant food after winter
            mutationMultiplier = SEASON_SPRING_MUTATION_MULTIPLIER; // Slightly increased variation during reproduction
        } else if (phase < 0.5) {
            // SUMMER: Hot temperatures, peak resources, high energy demands
            globalTemperatureModifier = SEASON_SUMMER_TEMP_MODIFIER; // Hot summer
            reproductionBonus = SEASON_SUMMER_REPRODUCTION_BONUS; // Continued breeding
            this.foodScarcityFactor = SEASON_SUMMER_FOOD_SCARCITY; // Normal food availability
            energyDrainMultiplier = SEASON_SUMMER_ENERGY_DRAIN; // Higher energy demands in heat
            mutationMultiplier = SEASON_SUMMER_MUTATION_MULTIPLIER; // Normal mutation rate
        } else if (phase < 0.75) {
            // FALL: Cooling temperatures, resource preparation, moderate stress
            globalTemperatureModifier = SEASON_FALL_TEMP_MODIFIER; // Mild temperatures
            reproductionBonus = SEASON_FALL_REPRODUCTION_BONUS; // Reduced breeding as winter approaches
            this.foodScarcityFactor = SEASON_FALL_FOOD_SCARCITY; // Resources becoming scarce
            energyDrainMultiplier = SEASON_FALL_ENERGY_DRAIN; // Moderate energy stress
        } else {
            // WINTER: Cold temperatures, severe resource scarcity, survival pressure
            globalTemperatureModifier = SEASON_WINTER_TEMP_MODIFIER; // Cold winter
            reproductionBonus = SEASON_WINTER_REPRODUCTION_BONUS; // Very low breeding in winter
            this.foodScarcityFactor = SEASON_WINTER_FOOD_SCARCITY; // Severe food scarcity
            energyDrainMultiplier = SEASON_WINTER_ENERGY_DRAIN; // High energy drain in cold
            mutationMultiplier = SEASON_WINTER_MUTATION_MULTIPLIER; // Reduced mutation during harsh conditions
        }

        // Apply seasonal environmental effects (temperature is now handled by agent metabolism)
        this.agents.forEach(agent => {
            if (!agent.isDead) {
                // Seasonal reproduction modifier
                if (agent.wantsToReproduce && Math.random() > reproductionBonus) {
                    agent.wantsToReproduce = false; // Suppress reproduction outside breeding season
                }

                // Seasonal energy drain
                if (phase > 0.5) { // Fall and winter
                    agent.energy -= 0.05 * energyDrainMultiplier;
                }
            }
        });

        // Update mutation rate based on environmental stress
        this.adaptiveMutationRate *= mutationMultiplier;
        this.adaptiveMutationRate = Math.max(0.1, Math.min(2.0, this.adaptiveMutationRate));
    }

    updateFertileZones() {
        // Update and decay fertile zones over time
        for (let i = this.fertileZones.length - 1; i >= 0; i--) {
            const zone = this.fertileZones[i];
            zone.age++;
            zone.fertility -= zone.decayRate * zone.initialFertility;

            // Remove depleted zones
            if (zone.fertility <= 0.1) {
                this.fertileZones.splice(i, 1);
            }
        }
    }

    createFertileZone(agent) {
        // Create nutrient-rich area where agent died
        // Fertility based on agent's final energy and size (larger, well-fed agents create richer soil)
        const fertility = Math.min(agent.energy * FERTILE_ZONE_FERTILITY_FACTOR, FERTILE_ZONE_MAX_FERTILITY); // Cap fertility

        if (fertility > FERTILE_ZONE_MIN_FERTILITY) { // Only create zones for agents with significant energy
            this.fertileZones.push({
                x: agent.x,
                y: agent.y,
                fertility: fertility,
                initialFertility: fertility,
                radius: Math.max(FERTILE_ZONE_MIN_RADIUS, agent.size * FERTILE_ZONE_SIZE_FACTOR), // Zone size based on agent size
                decayRate: FERTILE_ZONE_DECAY_RATE,
                age: 0
            });

            // Limit total fertile zones to prevent performance issues
            if (this.fertileZones.length > FERTILE_ZONE_MAX_COUNT) {
                // Remove oldest, least fertile zone
                this.fertileZones.sort((a, b) => (a.fertility / a.initialFertility) - (b.fertility / b.initialFertility));
                this.fertileZones.shift();
            }
        }
    }







    async gameLoop() {
        // Guard against running game loop after destruction
        if (this.destroyed) {
            return;
        }

        // Start performance monitoring for this frame
        this.perfMonitor.startFrame();

        const now = Date.now();

        // Housekeeping tasks (FPS calculation, GPU/CPU tracking, wake lock)
        this.perfMonitor.timeSync('housekeeping', () => {
            // FPS calculation
            this.fpsFrameCount++;
            const elapsed = now - this.lastFpsUpdate;
            if (elapsed >= 1000) { // Update FPS every second
                this.currentFps = Math.round((this.fpsFrameCount * 1000) / elapsed);
                this.fpsFrameCount = 0;
                this.lastFpsUpdate = now;

                // Track GPU vs CPU FPS
                const gpuCpuElapsed = now - this.lastGpuCpuUpdate;
                if (gpuCpuElapsed >= 1000) {
                    // Calculate average FPS for GPU and CPU frames
                    if (this.gpuFrameCount > 0) {
                        const gpuFps = Math.round((this.gpuFrameCount * 1000) / gpuCpuElapsed);
                        this.gpuFpsHistory.push(gpuFps);
                        if (this.gpuFpsHistory.length > 10) this.gpuFpsHistory.shift(); // Keep last 10 samples
                        this.avgGpuFps = Math.round(this.gpuFpsHistory.reduce((a, b) => a + b, 0) / this.gpuFpsHistory.length);
                    }
                    if (this.cpuFrameCount > 0) {
                        const cpuFps = Math.round((this.cpuFrameCount * 1000) / gpuCpuElapsed);
                        this.cpuFpsHistory.push(cpuFps);
                        if (this.cpuFpsHistory.length > 10) this.cpuFpsHistory.shift(); // Keep last 10 samples
                        this.avgCpuFps = Math.round(this.cpuFpsHistory.reduce((a, b) => a + b, 0) / this.cpuFpsHistory.length);
                    }

                    this.gpuFrameCount = 0;
                    this.cpuFrameCount = 0;
                    this.lastGpuCpuUpdate = now;
                }
            }

            // Wake lock management
            if (this.wakeLockEnabled) {
                // Wake lock is maintained automatically, just check if it's still active
                if (!this.wakeLock) {
                    this.logger.warn('[WAKE] Screen wake lock was released unexpectedly');
                    this.wakeLockEnabled = false;
                }
            }
        });

        // Update FPS display
        this.perfMonitor.timeSync('ui', () => {
            const fpsEl = document.getElementById('info-fps');
            if (fpsEl) {
                let fpsText = `FPS: ${this.currentFps} `;
                if (this.avgGpuFps > 0 || this.avgCpuFps > 0) {
                    fpsText += ` (GPU: ${this.avgGpuFps > 0 ? this.avgGpuFps : 'N/A'}, CPU: ${this.avgCpuFps > 0 ? this.avgCpuFps : 'N/A'})`;
                }
                fpsEl.textContent = fpsText;
                // Color code FPS (green > 30, yellow > 15, red otherwise)
                if (this.currentFps >= 30) {
                    fpsEl.style.color = '#0f0';
                } else if (this.currentFps >= 15) {
                    fpsEl.style.color = '#ff0';
                } else {
                    fpsEl.style.color = '#f00';
                }
            }
        });

        // Auto-performance adjustment
        if (this.autoAdjustEnabled) {
            this.perfMonitor.timeSync('autoAdjust', () => {
                // Track FPS history (keep last 30 seconds)
                this.fpsHistory.push(this.currentFps);
                if (this.fpsHistory.length > 30) {
                    this.fpsHistory.shift();
                }

                // Auto-adjust every 30 seconds if we have enough history (only when focused)
                const timeSinceLastAdjust = now - this.lastAutoAdjustTime;
                if (timeSinceLastAdjust >= this.adjustmentCooldown && this.fpsHistory.length >= 10 && document.hasFocus()) {
                    this.performAutoAdjustment();
                    this.lastAutoAdjustTime = now;
                }
            });
        }

        // Track if this frame used GPU or CPU
        this.currentFrameUsedGpu = false;



        this.perfMonitor.startPhase('spawn');
        // Repopulate before game loop to include new agents
        repopulate(this);
        this.perfMonitor.endPhase('spawn');

        // ACCURACY PRESERVED: Allow full game speed without capping
        const iterations = Math.max(1, Math.floor(this.gameSpeed));
        for (let i = 0; i < iterations; i++) {
            // REBUILD quadtree every iteration for accurate collision detection
            this.perfMonitor.startPhase('quadtree_active');
            // This ensures all collision queries use current entity positions
            this.quadtree.clear();

            // MEMORY LEAK FIX: Use try-finally to ensure points are always released
            // Return all Points to pool before rebuilding
            this.pointPool.releaseAll();

            // OPTIMIZATION: Build activeAgents list here to avoid iterating agents again later
            this.activeAgents.length = 0;

            try {
                for (let j = 0; j < this.agents.length; j++) {
                    const agent = this.agents[j];
                    if (agent && !agent.isDead) {
                        // Use Point pool instead of allocating new objects
                        const point = this.pointPool.acquire(agent.x, agent.y, agent, agent.size / 2);
                        this.quadtree.insert(point);

                        // Add to active agents list
                        this.activeAgents.push(agent);
                    }
                }
                for (let j = 0; j < this.food.length; j++) {
                    const food = this.food[j];
                    if (food && !food.isDead) {
                        // Use Point pool instead of allocating new objects
                        const point = this.pointPool.acquire(food.x, food.y, food, food.size / 2 || 2.5);
                        this.quadtree.insert(point);
                    }
                }
                for (let j = 0; j < this.pheromones.length; j++) {
                    const pheromone = this.pheromones[j];
                    if (pheromone && !pheromone.isDead) {
                        // Use Point pool instead of allocating new objects
                        const point = this.pointPool.acquire(pheromone.x, pheromone.y, pheromone, 0);
                        this.quadtree.insert(point);
                    }
                }
                // Insert obstacles into quadtree for collision detection
                for (const obstacle of this.obstacles) {
                    // Use Point pool instead of allocating new objects
                    const point = this.pointPool.acquire(obstacle.x, obstacle.y, obstacle, obstacle.radius);
                    this.quadtree.insert(point);
                }
            } catch (error) {
                // If quadtree building fails, log and ensure pool is still released
                this.logger.error('[QUADTREE] Error building quadtree:', error);
                // Point pool will be released in finally block
            }
            this.perfMonitor.endPhase('quadtree');

            // PERFORMANCE OPTIMIZATION: Reduce pheromone update frequency for better performance
            // ACCURACY MAINTAINED: Pheromones don't need to update every frame
            if (i % 2 === 0 || i === iterations - 1) { // Update every other iteration
                for (let j = 0; j < this.pheromones.length; j++) {
                    const p = this.pheromones[j];
                    if (p && !p.isDead) {
                        p.update();
                    }
                }
            }

            // PERFORMANCE OPTIMIZATION: Reduce food spawning frequency
            // ACCURACY MAINTAINED: Food still spawns regularly, just not every iteration
            if (i % Math.max(1, Math.floor(this.gameSpeed / 2)) === 0 || i === iterations - 1) {
                this.perfMonitor.startPhase('spawning');
                spawnFood(this);
                this.perfMonitor.endPhase('spawning');
            }

            this.applyEnvironmentEvents();

            // Quadtree is now rebuilt once per frame outside the iteration loop

            // GPU processing per iteration for accurate perception
            // activeAgents array is now built during quadtree phase
            const activeAgents = this.activeAgents;

            let gpuRayTracingSucceeded = false;
            let gpuNeuralNetSucceeded = false;

            // Update obstacles BEFORE ray tracing so rays detect current positions
            updateObstacles(this.obstacles, this.worldWidth, this.worldHeight);

            // Renderer update moved to end of frame (outside physics loop)

            // PERFORMANCE OPTIMIZATION: Run GPU operations in parallel for better throughput
            // ACCURACY PRESERVED: Full neural networks and ray tracing, just parallelized
            this.perfMonitor.startPhase('perception');
            const canUseGpu = this.useGpu && this.gpuPhysics.isAvailable() && activeAgents.length >= 1;

            if (canUseGpu) {
                try {
                    // Build arrays with current state - Reuse allEntities
                    this.allEntities.length = 0;
                    for (let j = 0; j < this.food.length; j++) {
                        if (!this.food[j].isDead) {
                            this.allEntities.push(this.food[j]);
                        }
                    }
                    for (let j = 0; j < activeAgents.length; j++) {
                        this.allEntities.push(activeAgents[j]);
                    }
                    const allEntities = this.allEntities;
                    const maxRaysPerAgent = 100; // Increased from 50 for better batching efficiency

                    // CRITICAL: Ray tracing must complete BEFORE neural network processing
                    // because the neural network needs the converted ray results as inputs
                    const gpuRayResults = await this.perfMonitor.timeAsync('perception.rayTracing', async () => {
                        return this.gpuPhysics.batchRayTracing(
                            activeAgents,
                            allEntities,
                            this.obstacles,
                            maxRaysPerAgent,
                            this.worldWidth,
                            this.worldHeight
                        );
                    });

                    // Process ray tracing results and convert to neural network inputs
                    if (gpuRayResults && gpuRayResults.length > 0) {
                        this.perfMonitor.timeSync('perception.rayTracing', () => {
                            convertGpuRayResultsToInputs(this, gpuRayResults, activeAgents, maxRaysPerAgent);
                        });
                        gpuRayTracingSucceeded = true;
                    } else {
                        if (this.frameCount % 300 === 0) { // Log every 5 seconds instead of just first 10 frames
                            this.logger.warn(`GPU ray tracing returned null or empty results (results: ${gpuRayResults}, length: ${gpuRayResults ? gpuRayResults.length : 'N/A'})`);
                        }
                    }

                    // NOW run neural network with the fresh inputs from ray tracing
                    await this.perfMonitor.timeAsync('perception.neuralNetwork', async () => {
                        try {
                            const gpuNeuralResults = await this.gpuCompute.batchNeuralNetworkForward(activeAgents);
                            // Neural network results are already in agent.lastOutput and agent.newHiddenState
                            gpuNeuralNetSucceeded = true;
                            return gpuNeuralResults;
                        } catch (neuralError) {
                            if (this.frameCount % 300 === 0) { // Log every 5 seconds
                                this.logger.warn('GPU Neural Network processing failed:', neuralError);
                            }
                            throw neuralError; // Re-throw to be caught by outer try-catch
                        }
                    });

                } catch (error) {
                    if (this.frameCount < 10) {
                        this.logger.warn('Parallel GPU operations failed:', error);
                    }
                }
            }

            // CPU perception fallback (ONLY if GPU ray tracing failed)
            if (!gpuRayTracingSucceeded && activeAgents.length > 0) {
                // Debug: Log why we're falling back to CPU
                this.logger.warn(`[CPU-FALLBACK] Frame ${this.frameCount}: GPU ray tracing failed, using CPU for ${activeAgents.length} agents`);

                this.perfMonitor.timeSync('perception.cpuFallback', () => {
                    for (let j = 0; j < activeAgents.length; j++) {
                        const agent = activeAgents[j];
                        try {
                            const perception = agent.perceiveWorld(this.quadtree, this.obstacles, this.worldWidth, this.worldHeight);
                            agent.lastInputs = perception.inputs;
                            agent.lastRayData = perception.rayData;
                        } catch (perceptionError) {
                            // If even CPU perception fails, provide safe fallback inputs
                            this.logger.error(`[CPU-PERCEPTION-ERROR] Agent ${agent.geneId} CPU perception failed:`, perceptionError);
                            agent.lastInputs = new Array(agent.inputSize).fill(0.5); // Safe neutral inputs
                            agent.lastRayData = [];
                        }
                    }
                });

                // Track GPU failures to potentially disable GPU temporarily
                if (!this.gpuFailureCount) this.gpuFailureCount = 0;
                this.gpuFailureCount++;

                // If GPU fails repeatedly, temporarily disable it
                if (this.gpuFailureCount >= 10 && this.useGpu) {
                    this.logger.warn(`[GPU-DISABLE] Too many GPU failures (${this.gpuFailureCount}), temporarily disabling GPU acceleration`);
                    this.useGpu = false;
                    // Reset failure count and try to re-enable GPU after some time
                    this.gpuFailureCount = 0;
                    setTimeout(() => {
                        if (this.gpuCompute && this.gpuCompute.isAvailable()) {
                            this.logger.info('[GPU-REENABLE] Re-enabling GPU acceleration after cooldown');
                            this.useGpu = true;
                        }
                    }, 30000); // 30 second cooldown
                }
            } else if (gpuRayTracingSucceeded) {
                // Reset failure count on success
                this.gpuFailureCount = 0;
            }

            // Neural network processing now happens in parallel with ray tracing above

            if (!gpuNeuralNetSucceeded) {
                this.logger.warn('GPU Neural Network processing failed, using CPU');
            }
            this.perfMonitor.endPhase('perception');

            // CRITICAL FIX: Always check collisions to prevent tunneling
            // Both agents can move, so we must check every iteration
            this.perfMonitor.startPhase('physics');

            // Collision detection
            this.perfMonitor.timeSync('physics.collisions', () => {
                checkCollisions(this);
            });

            // Agent updates (will use GPU results if available, otherwise CPU)
            // OPTIMIZED: Use for loop instead of forEach
            // Use actual length, not cached, since arrays can be modified
            this.perfMonitor.timeSync('physics.agentUpdates', () => {
                // OPTIMIZED: Iterate activeAgents instead of all agents
                const activeCount = this.activeAgents.length;
                for (let j = 0; j < activeCount; j++) {
                    const agent = this.activeAgents[j];
                    // No need to check isDead or null, activeAgents only contains living agents
                    agent.update(this.worldWidth, this.worldHeight, this.obstacles, this.quadtree, this);
                }
            });

            // Entity updates (food and pheromones)
            this.perfMonitor.timeSync('physics.entityUpdates', () => {
                // Food updates (CPU path)
                for (let j = 0; j < this.food.length; j++) {
                    const food = this.food[j];
                    if (food && !food.isDead) {
                        food.update();
                    }
                }

                // Pheromone updates (CPU path)
                for (let j = 0; j < this.pheromones.length; j++) {
                    const pheromone = this.pheromones[j];
                    if (pheromone && !pheromone.isDead) {
                        pheromone.update();
                    }
                }
            });

            this.perfMonitor.endPhase('physics');

            // Count frame as GPU or CPU based on whether GPU actually ran
            // Only count on last iteration to avoid double counting
            // With Solution 4, GPU runs per iteration, so we track if it succeeded
            if (i === iterations - 1) {
                if (gpuRayTracingSucceeded && this.useGpu) {
                    // GPU ray tracing succeeded for this frame
                    this.gpuFrameCount++;
                } else {
                    // GPU wasn't available or failed, fell back to CPU
                    this.cpuFrameCount++;
                }

                // PERFORMANCE OPTIMIZATION: Skip expensive operations when not needed
                // Only rebuild quadtree every 5 iterations to reduce overhead
                if (i % 5 === 0 || i === iterations - 1) {
                    // Quadtree rebuild happens here (already optimized)
                }

                // PERFORMANCE MONITORING: Suggest optimizations when FPS is low
                if (this.frameCount % 300 === 0 && this.currentFps < 50) {
                    this.perfMonitor.timeSync('misc', () => {
                        let livingAgents = 0;
                        for (let i = 0; i < this.agents.length; i++) {
                            if (!this.agents[i].isDead) livingAgents++;
                        }
                        this.logger.warn(`[PERF] Low FPS detected(${this.currentFps}).Try: Reduce agents(${livingAgents}), game speed(${this.gameSpeed}), or disable GPU features`);
                    });
                }
            }

            this.perfMonitor.startPhase('cleanup');

            // OPTIMIZED: Only remove dead entities on last iteration to avoid index issues
            // This also reduces the number of array operations
            if (i === iterations - 1) {

                // === REPRODUCTION SYSTEM ===
                // Check for reproduction opportunities (once per frame)
                for (let j = 0; j < this.agents.length; j++) {
                    const agent = this.agents[j];

                    // Skip dead or immature agents
                    if (agent.isDead || agent.framesAlive < MATURATION_AGE_FRAMES) continue;

                    // Decrement reproduction cooldown
                    if (agent.reproductionCooldown > 0) {
                        agent.reproductionCooldown--;
                    }

                    // Increment pregnancy timer
                    if (agent.isPregnant && agent.pregnancyTimer < PREGNANCY_DURATION_FRAMES) {
                        agent.pregnancyTimer++;
                    }

                    // === BIRTH SYSTEM ===
                    // Check if agent is ready to give birth
                    if (agent.isPregnant && agent.pregnancyTimer >= PREGNANCY_DURATION_FRAMES) {
                        const child = agent.birthChild();
                        if (child) {
                            this.agentSpawnQueue.push(child);
                            this.logger.info(`[REPRODUCTION] 🍼 Birth: ${child.geneId} from ${agent.geneId} (queued for spawn)`);

                            // Show toast notification
                            if (this.toast) {
                                this.toast.showReproduction('birth', agent.geneId, child.geneId);
                            }
                        }
                    }

                    // === ASEXUAL REPRODUCTION (SPLITTING) ===
                    // When energy is very high, split to create clone
                    // Require agent to be "fit" for splitting
                    if (agent.fit &&
                        agent.energy > MAX_ENERGY * 0.7 &&
                        agent.reproductionCooldown <= 0 &&
                        !agent.isPregnant) {

                        const child = agent.split();
                        if (child) {
                            this.agentSpawnQueue.push(child);
                            this.logger.info(`[REPRODUCTION] 🔄 Split: ${agent.geneId} energy ${agent.energy.toFixed(0)} (queued for spawn)`);

                            // Show toast notification
                            if (this.toast) {
                                this.toast.showReproduction('split', agent.geneId, child.geneId, agent.energy);
                            }
                        }
                    }

                }

                // Process dead agents - queue qualifying ones for database save, remove all dead agents
                for (let j = this.agents.length - 1; j >= 0; j--) {
                    const agent = this.agents[j];
                    if (agent.isDead) {
                        // Check if this agent was in validation queue first (highest priority)
                        if (this.validationManager.isInValidation(agent.geneId)) {
                            // Debug: Log validation agent death details
                            this.logger.debug(`[VALIDATION] Agent ${agent.geneId} died during validation - Age: ${agent.age.toFixed(1)} s, Energy: ${agent.energy}, Fitness: ${agent.fitness} `);
                            // Handle validation agent death
                            this.validationManager.handleValidationDeath(agent, this.db);
                        } else if (agent.fit) {
                            // Agent meets comprehensive fit criteria - check if gene pool exists
                            const genePoolExists = this.db.pool[agent.geneId] !== undefined;

                            if (genePoolExists) {
                                // CASE 1: Existing gene pool - skip validation, go directly to save queue
                                this.logger.debug(`[GENEPOOL] 💀 Death: Agent ${agent.geneId} (fitness: ${agent.fitness.toFixed(1)}) from existing pool, queueing for save`);
                                this.db.queueSaveAgent(agent);
                            } else {
                                // CASE 2: New gene pool - enter validation (agent must be fit to enter initially)
                                this.logger.debug(`[VALIDATION] 💀 Death: Fit agent ${agent.geneId} (fitness: ${agent.fitness.toFixed(1)}) entering validation`);
                                const result = this.validationManager.addToValidationQueue(agent, false);
                                // If validation returns something other than false, it's handling the agent
                                // If it returns false, it means cooldown or other skip reason
                            }
                        } else if (hasValidatedAncestor(agent, this)) {
                            // Children of validated agents get saved to gene pool automatically
                            this.logger.debug(`[GENEPOOL] 👶 Auto - saving child of validated lineage: ${agent.geneId} (fitness: ${agent.fitness.toFixed(1)})`);
                            this.db.queueSaveAgent(agent);
                        }

                        // NUTRIENT CYCLING: Create fertile zone from decomposed agent
                        this.createFertileZone(agent);

                        // Remove ALL dead agents from active array to prevent memory leaks
                        this.agents.splice(j, 1);
                        j--; // Adjust index since we removed an element
                    }
                }

                // Periodic performance monitoring (every 1000 frames)
                if (this.frameCount % 1000 === 0) {
                    // Reuse pre-allocated arrays instead of filter()
                    this.livingAgents.length = 0;
                    this.livingFood.length = 0;
                    this.livingPheromones.length = 0;

                    for (const a of this.agents) {
                        if (!a.isDead) this.livingAgents.push(a);
                    }
                    for (const f of this.food) {
                        if (!f.isDead) this.livingFood.push(f);
                    }
                    for (const p of this.pheromones) {
                        if (!p.isDead) this.livingPheromones.push(p);
                    }

                    const livingAgents = this.livingAgents.length;
                    const livingFood = this.livingFood.length;
                    const livingPheromones = this.livingPheromones.length;

                    // Check GPU cache sizes if available
                    let gpuComputeCache = 0;
                    let gpuPhysicsCache = 0;
                    if (this.gpuCompute && this.gpuCompute.bufferCache) {
                        gpuComputeCache = this.gpuCompute.bufferCache.size;
                    }
                    if (this.gpuPhysics && this.gpuPhysics.buffers) {
                        gpuPhysicsCache = 1; // Physics has buffers
                    }

                    this.logger.debug(`[PERF] Frame ${this.frameCount}: ${livingAgents} agents, ${livingFood} food, ${livingPheromones} pheromones, ${this.validationManager.validationQueue.size} validation, GPU cache: ${gpuComputeCache} compute, ${gpuPhysicsCache} physics, FPS: ${this.avgCpuFps?.toFixed(1) || 'N/A'} `);
                }


                // Remove dead food
                for (let j = this.food.length - 1; j >= 0; j--) {
                    if (this.food[j] && this.food[j].isDead) {
                        this.food.splice(j, 1);
                    }
                }

                // Clean up unreachable food logic REMOVED
                // Food now has its own natural decay/rotting process in food.js
                // This prevents "random" disappearance of valid food items
            }
            // Remove dead pheromones - only on last iteration
            if (i === iterations - 1) {
                for (let j = this.pheromones.length - 1; j >= 0; j--) {
                    if (this.pheromones[j] && this.pheromones[j].isDead) {
                        this.pheromones.splice(j, 1);
                    }
                }
            }

            this.perfMonitor.endPhase('cleanup');

            if (i === iterations - 1) {
                this.frameCount++;
                this.perfMonitor.startPhase('memory');
                // Update memory stats every ~1 second using real time to avoid throttling
                if (now - this.lastMemoryPressureCheckTime >= 1000) {
                    this.lastMemoryPressureCheckTime = now;
                    updateMemoryStats(this, false);
                    handleMemoryPressure(this);
                }
                // UI updates
                if (this.frameCount % 100 === 0) updateInfo(this);

                // Periodic agent data cleanup - prevent array accumulation
                if (this.frameCount % 30 === 0) { // More frequent cleanup: every 0.5 seconds at 60 FPS
                    for (const agent of this.agents) {
                        if (agent && !agent.isDead) {
                            // Limit array sizes to prevent unbounded growth
                            if (agent.inputs && agent.inputs.length > 1000) {
                                agent.inputs.length = 0;
                            }
                            if (agent.rayData && agent.rayData.length > 500) {
                                agent.rayData.length = 0;
                            }
                            if (agent.lastRayData && agent.lastRayData.length > 500) {
                                agent.lastRayData.length = 0;
                            }
                        }
                    }
                }

                // Periodic validation checks - use real time for consistent timing
                if (now - this.lastValidationCheckTime >= 8333) { // ~500 frames at 60fps = 8333ms
                    this.lastValidationCheckTime = now;
                    updatePeriodicValidation(this);
                    // Log validation queue status periodically
                    if (this.validationManager.validationQueue.size > 0) {
                        this.logger.debug(`[VALIDATION] Queue status: ${this.validationManager.validationQueue.size} agents pending validation`);
                    }
                    // Clean up validation queue
                    this.validationManager.cleanupValidationQueue();

                    // Resync active validation agents counter
                    this.validationManager.resyncActiveAgentsCount(this);
                }

                // Dashboard updates (only when focused)
                if (this.frameCount % 30 === 0 && document.hasFocus()) {
                    this.perfMonitor.timeSync('ui', () => {
                        updateDashboard(this);
                    });
                }
                // Periodic comprehensive memory cleanup - use real time to avoid throttling
                if (now - this.lastMemoryCleanupTime >= 83333) { // ~5000 frames at 60fps = 83333ms (~83 seconds)
                    this.lastMemoryCleanupTime = now;
                    this.logger.info(`[PERF] Time ${Math.floor((now - this.startTime) / 1000)}s: Starting periodic memory cleanup`);
                    periodicMemoryCleanup(this);

                    // Calculate session duration for all cleanup operations
                    const sessionDurationHours = (now - this.startTime) / (1000 * 60 * 60);

                    // Intelligent database cache management for long-term stability
                    if (this.db && this.db.trimCache) {
                        this.db.trimCache(sessionDurationHours);
                    }

                    // Selective GPU cache management - trim instead of full clear to avoid performance spikes
                    let shouldTrimCache = sessionDurationHours >= 1 || this.currentMemoryUsage > this.memoryPressureThreshold * 0.8;

                    // More aggressive trimming as simulation runs longer
                    let maxCacheSize = 10;
                    if (sessionDurationHours > 1) maxCacheSize = 5;
                    if (sessionDurationHours > 2) maxCacheSize = 3;

                    // Also trim every cleanup cycle if we're using a lot of GPU resources
                    if (this.gpuCompute && this.gpuCompute.pipelines.size > maxCacheSize) {
                        shouldTrimCache = true;
                    }

                    if (shouldTrimCache) {
                        this.logger.debug(`[PERF] Periodic GPU cache maintenance (${sessionDurationHours.toFixed(1)}h session, maxCacheSize: ${maxCacheSize})`);

                        // Use enhanced selective trimming for GPU Compute
                        if (this.gpuCompute && this.gpuCompute.deepCleanup) {
                            this.gpuCompute.deepCleanup(sessionDurationHours);
                        }

                            // Enhanced GPU Physics cleanup
                        if (this.gpuPhysics && this.gpuPhysics.deepCleanup) {
                            this.gpuPhysics.deepCleanup(sessionDurationHours);
                        }
                    }

                    // Renderer defragmentation for long-term stability
                    const rendererAgeHours = (now - this.rendererSessionStartTime) / (1000 * 60 * 60);
                    if (rendererAgeHours > this.rendererDefragIntervalHours) {
                        this.logger.debug(`[RENDERER] Defragmenting renderer resources (${rendererAgeHours.toFixed(1)}h session)`);

                        // Force renderer cleanup and recreation of instanced meshes
                        if (this.renderer && this.renderer.defragment) {
                            this.renderer.defragment();
                        } else {
                            // Fallback: clear agent meshes to force recreation
                            if (this.renderer && this.renderer.agentMeshes) {
                                for (const [geneId, mesh] of this.renderer.agentMeshes.entries()) {
                                    if (mesh.body) {
                                        this.renderer.agentGroup.remove(mesh.body);
                                        mesh.body.geometry.dispose();
                                        mesh.body.material.dispose();
                                    }
                                    if (mesh.border) {
                                        this.renderer.agentGroup.remove(mesh.border);
                                        mesh.border.geometry.dispose();
                                        mesh.border.material.dispose();
                                    }
                                }
                                this.renderer.agentMeshes.clear();
                                this.logger.debug('[RENDERER] Cleared agent meshes for defragmentation');
                            }
                        }

                        this.rendererLastDefragTime = now;
                        this.rendererDefragIntervalHours = Math.min(this.rendererDefragIntervalHours + 1, 8); // Gradually increase interval
                    }

                    // Force garbage collection if available
                    if (window.gc) {
                        window.gc();
                        this.logger.info('[PERF] Forced garbage collection');
                    }
                    this.logger.info(`[PERF] Time ${Math.floor((now - this.startTime) / 1000)}s: Periodic memory cleanup completed`);
                }
                this.perfMonitor.endPhase('memory');
            }
        }

        // Update camera
        this.perfMonitor.startPhase('camera');
        if (this.followBest) {
            // Check if current bestAgent is visible and valid
            let shouldFollow = false;
            let targetAgent = null;

            // Clear bestAgent if it's dead (prevent following ghosts)
            if (this.bestAgent && this.bestAgent.isDead) {
                this.bestAgent = null;
            }

            // Double-check bestAgent is still alive and valid
            if (this.bestAgent && !this.bestAgent.isDead &&
                typeof this.bestAgent.x === 'number' && typeof this.bestAgent.y === 'number' &&
                isFinite(this.bestAgent.x) && isFinite(this.bestAgent.y)) {

                // Check if bestAgent is actually visible on screen (frustum culling)
                this.renderer.updateFrustum();

                const tempVec = new THREE.Vector3();
                const testSphere = new THREE.Sphere(tempVec, 0);
                tempVec.set(this.bestAgent.x, -this.bestAgent.y, 0);
                testSphere.center = tempVec;
                testSphere.radius = this.bestAgent.size || 5;

                if (this.renderer.frustum.intersectsSphere(testSphere)) {
                    shouldFollow = true;
                    targetAgent = this.bestAgent;
                }
            }

            if (!shouldFollow && this.agents.length > 0) {
                // Find best living agent that is actually visible on screen
                const livingAgents = [];
                for (let i = 0; i < this.agents.length; i++) {
                    const agent = this.agents[i];
                    if (!agent.isDead && typeof agent.x === 'number' && typeof agent.y === 'number' &&
                        isFinite(agent.x) && isFinite(agent.y)) {
                        livingAgents.push(agent);
                    }
                }

                // Check frustum for each agent (reuse cached frustum from renderer)

                const tempVec = new THREE.Vector3();
                const testSphere = new THREE.Sphere(tempVec, 0);

                // Find the best agent with prioritization:
                // 1. Qualified agents (.fit = true), by fitness
                // 2. Agents in validation tests, by fitness
                // 3. All agents, by fitness
                let bestVisibleAgent = null;
                let bestPriority = 3; // Lower number = higher priority
                let bestFitness = -Infinity;

                for (const agent of livingAgents) {
                    tempVec.set(agent.x, -agent.y, 0);
                    testSphere.center = tempVec;
                    testSphere.radius = agent.size || 5;

                    if (!this.renderer.frustum.intersectsSphere(testSphere)) {
                        continue; // Skip if not visible
                    }

                    const agentFitness = agent.fitness || 0;
                    let agentPriority = 3; // Default: all agents

                    // Priority 1: Qualified agents (.fit = true)
                    if (agent.fit === true) {
                        agentPriority = 1;
                    }
                    // Priority 2: Agents in validation tests
                    else if (this.validationManager && this.validationManager.isInValidation(agent.geneId)) {
                        agentPriority = 2;
                    }

                    // Select this agent if:
                    // - Higher priority (lower number), OR
                    // - Same priority but higher fitness
                    const shouldSelect = (agentPriority < bestPriority) ||
                        (agentPriority === bestPriority && agentFitness > bestFitness);

                    if (shouldSelect) {
                        bestPriority = agentPriority;
                        bestFitness = agentFitness;
                        bestVisibleAgent = agent;
                    }
                }

                if (bestVisibleAgent && !bestVisibleAgent.isDead) {
                    shouldFollow = true;
                    targetAgent = bestVisibleAgent;
                    this.bestAgent = bestVisibleAgent; // Update bestAgent to visible living one
                }
            }

            if (shouldFollow && targetAgent) {
                // Final check before following - ensure target is still alive
                if (!targetAgent.isDead) {
                    this.camera.follow(targetAgent);
                } else {
                    // Target died between check and follow - center camera
                    this.camera.targetX = this.worldWidth / 2;
                    this.camera.targetY = this.worldHeight / 2;
                }
            } else {
                // No visible agents to follow, center camera
                this.camera.targetX = this.worldWidth / 2;
                this.camera.targetY = this.worldHeight / 2;
            }
        } else {
            // Not following - don't change camera target (allows manual control)
            // But ensure target is valid
            if (!isFinite(this.camera.targetX) || !isFinite(this.camera.targetY)) {
                this.camera.targetX = this.worldWidth / 2;
                this.camera.targetY = this.worldHeight / 2;
            }
        }
        this.perfMonitor.timeSync('rendering.updates', () => {
            this.camera.update();
            // Update renderer data structures
            const camPos = this.camera.getPosition();
            this.renderer.updateCamera(camPos);
            this.renderer.updateAgents(this.agents, this.frameCount);
            this.renderer.updateFood(this.food);
            this.renderer.updatePheromones(this.pheromones);
            // Obstacles already updated after movement
            this.renderer.updateObstacles(this.obstacles);
        });

        // Render the scene
        this.perfMonitor.startPhase('rendering');

        this.perfMonitor.timeSync('rendering.visualEffects', () => {
            this.renderer.updateVisualEffects(this.frameCount);
        });

        this.perfMonitor.timeSync('rendering.rayRendering', () => {
            this.renderer.updateRays(this.agents, this.frameCount);
        });

        this.perfMonitor.timeSync('rendering.render', () => {
            this.renderer.render();
        });

        this.perfMonitor.endPhase('rendering');

        this.perfMonitor.startPhase('spawn_agents');
        // Process the agent spawn queue, enforcing the max population limit
        if (this.agentSpawnQueue.length > 0) {
            // Count only living agents for population limit
            let livingAgents = 0;
            for (let i = 0; i < this.agents.length; i++) {
                if (!this.agents[i].isDead) livingAgents++;
            }
            const availableSlots = this.maxAgents - livingAgents;
            if (availableSlots > 0) {
                const newAgents = this.agentSpawnQueue.splice(0, availableSlots);
                this.agents.push(...newAgents);
                this.totalAgentsSpawned += newAgents.length; // Track total agents spawned in this run
            }

            if (this.agentSpawnQueue.length > 0) {
                this.logger.log(`[LIFECYCLE] Population at limit.${this.agentSpawnQueue.length} offspring were stillborn.`);
            }

            this.agentSpawnQueue.length = 0; // Clear any remaining (stillborn) agents
        }

        this.perfMonitor.endPhase('spawn_agents');

        // Performance degradation detection and recovery
        const sessionTimeMs = now - this.startTime;
        this.perfMonitor.establishBaseline(sessionTimeMs);

        if (this.perfMonitor.checkPerformanceDegradation(sessionTimeMs)) {
            // Trigger performance recovery
            this.logger.warn('[PERF-RECOVERY] Triggering performance recovery due to degradation');

            // Force garbage collection
            if (window.gc) {
                window.gc();
                this.logger.info('[PERF-RECOVERY] Forced garbage collection');
            }

            // Clear GPU caches aggressively
            if (this.gpuCompute && this.gpuCompute.clearCache) {
                this.gpuCompute.clearCache();
                this.logger.info('[PERF-RECOVERY] Cleared GPU compute cache');
            }
            if (this.gpuPhysics && this.gpuPhysics.clearCache) {
                this.gpuPhysics.clearCache();
                this.logger.info('[PERF-RECOVERY] Cleared GPU physics cache');
            }

            // Defragment renderer
            if (this.renderer && this.renderer.defragment) {
                this.renderer.defragment();
                this.logger.info('[PERF-RECOVERY] Defragmented renderer resources');
            }

            // Reset performance baseline to current state
            this.perfMonitor.baselineEstablished = false;
            this.logger.info('[PERF-RECOVERY] Reset performance baseline for re-establishment');
        }

        // End frame timing and log performance report every 5 seconds
        this.perfMonitor.endFrame();
        if (this.frameCount % (FPS_TARGET * 5) === 0) {
            this.perfMonitor.logReport();

            // Also log health status
            const health = this.perfMonitor.getHealthStatus();
            if (health.status !== 'warming_up') {
                this.logger.info(`[PERF-HEALTH] Status: ${health.status}, degradation: ${health.degradationRatio.toFixed(2)}x`);
            }
        }

        this.animationFrameId = requestAnimationFrame(() => {
            this.gameLoop().catch(error => {
                this.logger.error('Error in game loop:', error);
            });
        });
    }
}
