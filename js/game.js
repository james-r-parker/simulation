// --- SIMULATION CLASS ---
// All simulation logic preserved exactly from original

import * as THREE from 'three';
import {
    WORLD_WIDTH, WORLD_HEIGHT, INITIAL_AGENT_ENERGY,
    FOOD_SPAWN_CAP, HIGH_VALUE_FOOD_CHANCE,
    SPECIALIZATION_TYPES,
    MIN_ENERGY_FOR_SPLITTING,
    MATURATION_AGE_FRAMES, PREGNANCY_DURATION_FRAMES,
    FPS_TARGET, AUTO_ADJUST_COOLDOWN, MIN_AGENTS, MAX_AGENTS_LIMIT,
    MIN_GAME_SPEED, MAX_GAME_SPEED, MEMORY_PRESSURE_THRESHOLD,
    FOOD_SPAWN_RATE, BASE_MUTATION_RATE, SEASON_LENGTH, RENDER_FRAME_SKIP,
    GPU_INIT_TIMEOUT_MS, AGENT_CONFIGS, OBSTACLE_COUNT, GPU_MAX_OBSTACLES
} from './constants.js';
import { Food } from './food.js';
import { Quadtree, Rectangle } from './quadtree.js';
import { Camera } from './camera.js';
import { WebGLRenderer } from './renderer.js';
import { GenePoolDatabase } from './database.js';
import { GPUCompute } from './gpu-compute.js';
import { GPUPhysics } from './gpu-physics.js';
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
import { checkCollisions, convertGpuRayResultsToInputs, collisionSetPool } from './physics.js';
import { distanceSquared } from './utils.js';
import { updatePeriodicValidation, hasValidatedAncestor } from './gene.js';
import { ValidationManager } from './validation.js';
import { PerformanceMonitor } from './performance-monitor.js';
import { updateSeasonalEnvironment } from './environment.js';
import { updateFertileZones, createFertileZone } from './fertile-zones.js';
import { buildSpatialGrid } from './spatial-grid.js';
import { calculateFps, updateGpuCpuTracking, formatFpsDisplay } from './performance-utils.js';
import { performAutoAdjustment } from './performance-adjustment.js';
import { updateFitnessChart } from './chart-utils.js';

export class Simulation {
    constructor(container) {
        // Set log level based on environment - DEBUG for dev, INFO for production
        const isProduction = typeof __PRODUCTION__ !== 'undefined' && __PRODUCTION__;
        this.logger = new Logger(isProduction ? LOG_LEVELS.INFO : LOG_LEVELS.DEBUG);

        // Performance monitoring framework - disabled in production for performance
        this.perfMonitor = new PerformanceMonitor(this.logger, 60); // 60-frame rolling average
        this.perfMonitor.setEnabled(!isProduction); // Enable only in development
        this.logger.log('Simulation constructor started.');

        this.agents = [];
        this.agentSpawnQueue = [];
        this.food = [];
        this.pheromones = [];
        this.fertileZones = []; // Nutrient-rich areas from decomposed agents

        this.worldWidth = WORLD_WIDTH;
        this.worldHeight = WORLD_HEIGHT;
        this.obstacles = generateObstacles(this);

        // PERFORMANCE: Increased capacity from 4 to 8 to reduce tree depth and improve performance
        this.quadtree = new Quadtree(new Rectangle(this.worldWidth / 2, this.worldHeight / 2, this.worldWidth / 2, this.worldHeight / 2), 8);
        this.camera = new Camera(this.worldWidth / 2, this.worldHeight / 2, 0.5, this.logger); // Zoomed out slightly for wider 16:9 view

        this.generation = 0;
        this.bestAgent = null;
        this.frameCount = 0;
        this.renderFrameCounter = 0; // Counter for frame skipping in rendering
        this.respawnTimer = 0;
        this.spawnStaggerTimer = 0; // Timer for staggering individual agent spawns
        this.recentPopulationHistory = []; // Track recent population for smoothing
        this.populationChangeRate = 0; // Rate of population change (-1 to 1)
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

        this.gameSpeed = 1; // Start conservative for auto-adjustment
        this.maxAgents = 10; // Start with fewer agents for auto-adjustment
        this.foodSpawnRate = FOOD_SPAWN_RATE; // FURTHER REDUCED from 0.15 to 0.12 to balance food surplus (target ~150-200% buffer instead of 2800%+)
        this.mutationRate = 0.01;
        this.baseMutationRate = BASE_MUTATION_RATE; // Base rate for adaptive mutation
        this.adaptiveMutationRate = BASE_MUTATION_RATE; // Adaptive mutation rate that changes with environment
        this.showRays = false;
        this.followBest = false;
        this.useGpu = true; // Enable GPU by default
        this.renderingEnabled = true; // Enable rendering by default

        // Dead agent queue for background database saving
        this.deadAgentQueue = [];

        this.validatedLineages = new Set(); // Track gene lineages that have successfully validated
        this.lastPeriodicSave = Date.now();

        // Track simulation start time for runtime calculation
        this.startTime = Date.now();

        this.seasonTimer = 0;
        this.seasonPhase = 0.0; // Normalized season phase (0-1) for neural network input
        this.foodScarcityFactor = 1.0;

        // Adaptive mutation tracking
        this.fitnessHistory = []; // Track best fitness over generations
        this.averageFitnessHistory = []; // Track average fitness over generations
        this.medianFitnessHistory = []; // Track median fitness over generations
        this.fitnessHistorySize = 50; // Keep last 50 generations for better chart visualization

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
        
        // PERFORMANCE: Spatial grid for ray tracing optimization
        this.spatialGridEnabled = true; // Enable spatial partitioning
        this.spatialGridCellSize = 200; // Size of each grid cell (pixels) - balances performance vs accuracy
        this.spatialGridWidth = Math.ceil(this.worldWidth / this.spatialGridCellSize);
        this.spatialGridHeight = Math.ceil(this.worldHeight / this.spatialGridCellSize);
        this.spatialGrid = null; // Will be initialized when needed
        this.spatialGridEntityIndices = null; // Entity indices per grid cell

        // Object pool for quadtree Point objects to reduce GC pressure
        this.pointPool = new PointPool(); // Uses default POINT_POOL_SIZE

        // PERFORMANCE: Quadtree caching - track entity positions to avoid unnecessary rebuilds
        this.lastAgentPositions = new Map(); // Map<agent, {x, y}>
        this.lastFoodPositions = new Map(); // Map<food, {x, y}>
        this.quadtreeRebuildThreshold = 10; // Rebuild if entity moved more than 10 pixels

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

    /**
     * Build spatial grid for ray tracing optimization
     * Assigns entities to grid cells based on their position
     * @param {Array} entities - Array of entities (food + agents)
     * @returns {Object} Grid data with entity indices per cell
     */
    buildSpatialGrid(entities) {
        if (!this.spatialGridEnabled) {
            return null;
        }

        const gridState = this.spatialGrid ? {
            spatialGrid: this.spatialGrid,
            spatialGridEntityIndices: this.spatialGridEntityIndices,
            spatialGridWidth: this.spatialGridWidth,
            spatialGridHeight: this.spatialGridHeight
        } : null;

        const result = buildSpatialGrid(entities, this.worldWidth, this.worldHeight, this.spatialGridCellSize, gridState);
        
        // Store grid arrays for reuse
        if (result) {
            this.spatialGrid = result.spatialGrid;
            this.spatialGridEntityIndices = result.spatialGridEntityIndices;
        }

        return result;
    }

    resize() {
        resize(this);
    }

    /**
     * Toggle rendering on/off while keeping simulation running
     */
    toggleRendering() {
        this.renderingEnabled = !this.renderingEnabled;
        this.logger.log(`Rendering ${this.renderingEnabled ? 'enabled' : 'disabled'}`);
        return this.renderingEnabled;
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
        // Clean up all living agents before clearing arrays
        for (const agent of this.agents) {
            if (!agent.isDead) {
                agent.cleanup();
                this.logger.debug(`[LIFECYCLE] 🔄 Agent ${agent.id} (${agent.geneId}) cleaned up during simulation reset - Age: ${agent.age.toFixed(1)}s, Fitness: ${agent.fitness.toFixed(1)}`);
            }
        }
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
        performAutoAdjustment(this, this.fpsHistory, this.targetFps, this.logger, this.toast);
    }

    updateFitnessChart() {
        const canvas = document.getElementById('fitness-chart');
        if (!canvas || this.fitnessHistory.length < 2) return;
        updateFitnessChart(canvas, this.fitnessHistory, this.averageFitnessHistory, this.medianFitnessHistory);
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
            const MAX_ENTITIES = MAX_AGENTS_LIMIT + FOOD_SPAWN_CAP + OBSTACLE_COUNT;

            const gpuConfig = {
                maxAgents: MAX_AGENTS_LIMIT,
                maxRaysPerAgent: AGENT_CONFIGS[SPECIALIZATION_TYPES.SCOUT].numSensorRays,
                maxEntities: MAX_ENTITIES,
                maxObstacles: GPU_MAX_OBSTACLES,
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

        const queueSize = this.deadAgentQueue.length;
        
        // Log warning if queue is getting large (potential memory leak indicator)
        if (queueSize > 100) {
            this.logger.warn(`[MEMORY] Dead agent queue is large: ${queueSize} agents. Processing now.`);
        }

        // MEMORY LEAK FIX: Clean up position tracking Maps for dead agents
        let positionMapCleanups = 0;
        for (const agent of this.deadAgentQueue) {
            if (this.lastAgentPositions.has(agent)) {
                this.lastAgentPositions.delete(agent);
                positionMapCleanups++;
            }
        }
        if (positionMapCleanups > 0) {
            this.logger.debug(`[MEMORY] Cleaned up ${positionMapCleanups} dead agent entries from position tracking Map`);
        }

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
        
        if (queueSize > 10) {
            this.logger.debug(`[MEMORY] Processed ${queueSize} dead agents from queue`);
        }
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
                energy: INITIAL_AGENT_ENERGY,
                mutationProcess: gene ? 'initial_elite' : 'initial_random'
            });
        }

        // Initial food - spread evenly across the entire world
        // Increased to give agents better chance to find food and learn
        const initialFoodCount = Math.min(FOOD_SPAWN_CAP, 400); // Max 400 initial food (doubled for learning)

        for (let i = 0; i < initialFoodCount; i++) {
            if (this.food.length >= FOOD_SPAWN_CAP) break;
            const pos = randomSpawnAvoidCluster(this);
            const isHighValue = Math.random() < HIGH_VALUE_FOOD_CHANCE;
            this.food.push(new Food(pos.x, pos.y, isHighValue));
        }
    }

    applyEnvironmentEvents() {
        this.seasonTimer++;
        const seasonLength = SEASON_LENGTH;
        const phase = (this.seasonTimer % seasonLength) / seasonLength;
        this.seasonPhase = phase; // Store phase for neural network access

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
        const result = updateSeasonalEnvironment(phase, seasonLength, this.agents, this.adaptiveMutationRate);
        this.globalTemperatureModifier = result.globalTemperatureModifier;
        this.foodScarcityFactor = result.foodScarcityFactor;
        this.adaptiveMutationRate = result.newAdaptiveMutationRate;
    }

    updateFertileZones() {
        updateFertileZones(this.fertileZones);
    }

    createFertileZone(agent) {
        createFertileZone(agent, this.fertileZones);
    }

    async gameLoop() {
        // Guard against running game loop after destruction
        if (this.destroyed) {
            return;
        }

        if (!this.gpuPhysics.isRayTracingBusy) {


            const now = Date.now();

            // Start performance monitoring for this frame
            this.perfMonitor.startFrame();

            // Housekeeping tasks (FPS calculation, GPU/CPU tracking, wake lock)
            this.perfMonitor.timeSync('housekeeping', () => {
                // FPS calculation
                this.fpsFrameCount++;
                const elapsed = now - this.lastFpsUpdate;
                if (elapsed >= 1000) { // Update FPS every second
                    this.currentFps = calculateFps(this.fpsFrameCount, elapsed);
                    this.fpsFrameCount = 0;
                    this.lastFpsUpdate = now;

                    // Track GPU vs CPU FPS
                    const gpuCpuElapsed = now - this.lastGpuCpuUpdate;
                    if (gpuCpuElapsed >= 1000) {
                        const { avgGpuFps, avgCpuFps } = updateGpuCpuTracking(
                            this.gpuFrameCount,
                            this.cpuFrameCount,
                            this.gpuFpsHistory,
                            this.cpuFpsHistory,
                            gpuCpuElapsed
                        );
                        this.avgGpuFps = avgGpuFps;
                        this.avgCpuFps = avgCpuFps;

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
                    const { text, color } = formatFpsDisplay(this.currentFps, this.avgGpuFps, this.avgCpuFps);
                    fpsEl.textContent = text;
                    fpsEl.style.color = color;
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

                if (this.gpuPhysics.isRayTracingBusy) {
                    continue;
                }

                // PERFORMANCE: Quadtree caching - only rebuild if entities moved significantly
                this.perfMonitor.startPhase(`quadtree_${i}`);
                
                // Check if quadtree needs rebuilding by comparing current positions to last positions
                let needsRebuild = false;
                const thresholdSq = this.quadtreeRebuildThreshold * this.quadtreeRebuildThreshold;
                
                // Check agents for movement
                for (let j = 0; j < this.agents.length; j++) {
                    const agent = this.agents[j];
                    if (agent && !agent.isDead) {
                        const lastPos = this.lastAgentPositions.get(agent);
                        if (!lastPos) {
                            needsRebuild = true;
                            break;
                        }
                        const dx = agent.x - lastPos.x;
                        const dy = agent.y - lastPos.y;
                        if (dx * dx + dy * dy > thresholdSq) {
                            needsRebuild = true;
                            break;
                        }
                    }
                }
                
                // Check food for movement (only if agents didn't trigger rebuild)
                if (!needsRebuild) {
                    for (let j = 0; j < this.food.length; j++) {
                        const food = this.food[j];
                        if (food && !food.isDead) {
                            const lastPos = this.lastFoodPositions.get(food);
                            if (!lastPos) {
                                needsRebuild = true;
                                break;
                            }
                            const dx = food.x - lastPos.x;
                            const dy = food.y - lastPos.y;
                            if (dx * dx + dy * dy > thresholdSq) {
                                needsRebuild = true;
                                break;
                            }
                        }
                    }
                }
                
                // Only rebuild if entities moved significantly or this is first frame
                if (needsRebuild || this.lastAgentPositions.size === 0) {
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
                                
                                // Update position tracking
                                this.lastAgentPositions.set(agent, { x: agent.x, y: agent.y });
                            } else if (agent && agent.isDead) {
                                // Remove dead agents from tracking
                                this.lastAgentPositions.delete(agent);
                            }
                        }
                        for (let j = 0; j < this.food.length; j++) {
                            const food = this.food[j];
                            if (food && !food.isDead) {
                                // Use Point pool instead of allocating new objects
                                const point = this.pointPool.acquire(food.x, food.y, food, food.size / 2 || 2.5);
                                this.quadtree.insert(point);
                                
                                // Update position tracking
                                this.lastFoodPositions.set(food, { x: food.x, y: food.y });
                            } else if (food && food.isDead) {
                                // Remove dead food from tracking
                                this.lastFoodPositions.delete(food);
                            }
                        }
                        for (let j = 0; j < this.pheromones.length; j++) {
                            const pheromone = this.pheromones[j];
                            if (pheromone && !pheromone.isDead) {
                                const point = this.pointPool.acquire(pheromone.x, pheromone.y, pheromone, pheromone.radius || 2.5);
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
                        this.logger.error('Error rebuilding quadtree:', error);
                        // Fallback: clear and rebuild on error
                        this.quadtree.clear();
                        this.pointPool.releaseAll();
                    }
                } else {
                    // PERFORMANCE: Skip rebuild, but still update activeAgents list and position tracking
                    this.activeAgents.length = 0;
                    for (let j = 0; j < this.agents.length; j++) {
                        const agent = this.agents[j];
                        if (agent && !agent.isDead) {
                            this.activeAgents.push(agent);
                            // Update position tracking (even if not rebuilding, keep tracking current)
                            this.lastAgentPositions.set(agent, { x: agent.x, y: agent.y });
                        } else if (agent && agent.isDead) {
                            this.lastAgentPositions.delete(agent);
                        }
                    }
                    // Update food position tracking
                    for (let j = 0; j < this.food.length; j++) {
                        const food = this.food[j];
                        if (food && !food.isDead) {
                            this.lastFoodPositions.set(food, { x: food.x, y: food.y });
                        } else if (food && food.isDead) {
                            this.lastFoodPositions.delete(food);
                        }
                    }
                }
                this.perfMonitor.endPhase(`quadtree_${i}`);

                // PERFORMANCE OPTIMIZATION: Reduce pheromone update frequency for better performance
                // ACCURACY MAINTAINED: Pheromones don't need to update every frame
                if (i % 2 === 0 || i === iterations - 1) { // Update every other iteration
                    this.perfMonitor.timeSync('pheromoneUpdates', () => {
                        for (let j = 0; j < this.pheromones.length; j++) {
                            const p = this.pheromones[j];
                            if (p && !p.isDead) {
                                p.update();
                            }
                        }
                    });
                }

                // PERFORMANCE OPTIMIZATION: Reduce food spawning frequency
                // ACCURACY MAINTAINED: Food still spawns regularly, just not every iteration
                if (i % Math.max(1, Math.floor(this.gameSpeed / 2)) === 0 || i === iterations - 1) {
                    this.perfMonitor.startPhase('spawning');
                    spawnFood(this);
                    this.perfMonitor.endPhase('spawning');
                }

                this.perfMonitor.timeSync('environmentEvents', () => {
                    this.applyEnvironmentEvents();
                });

                // Quadtree is now rebuilt once per frame outside the iteration loop

                // GPU processing per iteration for accurate perception
                // activeAgents array is now built during quadtree phase
                const activeAgents = this.activeAgents;

                let gpuRayTracingSucceeded = false;
                let gpuNeuralNetSucceeded = false;

                // Update obstacles BEFORE ray tracing so rays detect current positions
                this.perfMonitor.timeSync('obstacles', () => {
                    updateObstacles(this.obstacles, this.worldWidth, this.worldHeight);
                });

                // Renderer update moved to end of frame (outside physics loop)

                // PERFORMANCE OPTIMIZATION: Run GPU operations in parallel for better throughput
                // ACCURACY PRESERVED: Full neural networks and ray tracing, just parallelized
                this.perfMonitor.startPhase(`perception_${i}`);
                const canUseGpu = this.useGpu && this.gpuPhysics.isAvailable() && activeAgents.length >= 1;

                if (canUseGpu) {
                    try {

                        // Build arrays with current state - Reuse allEntities
                        this.allEntities.length = 0;
                        
                        // PERFORMANCE: Filter entities to only include those within maxRayDist of any agent
                        // This is mathematically correct - entities beyond maxRayDist cannot be detected anyway
                        this.perfMonitor.timeSync('perception.entityFiltering', () => {
                            // Find maximum maxRayDist among all active agents
                            let maxRayDist = 0;
                            for (let j = 0; j < activeAgents.length; j++) {
                                const agent = activeAgents[j];
                                if (agent && !agent.isDead && agent.maxRayDist > maxRayDist) {
                                    maxRayDist = agent.maxRayDist;
                                }
                            }
                            
                            // If no agents, skip entity filtering
                            if (maxRayDist > 0 && activeAgents.length > 0) {
                                const maxRayDistSq = maxRayDist * maxRayDist;
                                
                                // Filter food - only include if within maxRayDist of any agent
                                for (let j = 0; j < this.food.length; j++) {
                                    const food = this.food[j];
                                    if (food && !food.isDead) {
                                        // Check if food is within range of any agent
                                        let inRange = false;
                                        const foodSize = food.size || 0;
                                        const maxCheckDistSq = (maxRayDist + foodSize) * (maxRayDist + foodSize);
                                        
                                        for (let k = 0; k < activeAgents.length; k++) {
                                            const agent = activeAgents[k];
                                            if (agent && !agent.isDead) {
                                                const distSq = distanceSquared(agent.x, agent.y, food.x, food.y);
                                                if (distSq <= maxCheckDistSq) {
                                                    inRange = true;
                                                    break; // Early exit once found
                                                }
                                            }
                                        }
                                        
                                        if (inRange) {
                                            this.allEntities.push(food);
                                        }
                                    }
                                }
                                
                                // Always include all active agents (they need to detect each other)
                                for (let j = 0; j < activeAgents.length; j++) {
                                    this.allEntities.push(activeAgents[j]);
                                }
                            } else {
                                // Fallback: include all entities if no agents or maxRayDist is 0
                                for (let j = 0; j < this.food.length; j++) {
                                    if (!this.food[j].isDead) {
                                        this.allEntities.push(this.food[j]);
                                    }
                                }
                                for (let j = 0; j < activeAgents.length; j++) {
                                    this.allEntities.push(activeAgents[j]);
                                }
                            }
                        });

                        const allEntities = this.allEntities;

                        const maxRaysPerAgent = AGENT_CONFIGS[SPECIALIZATION_TYPES.SCOUT].numSensorRays;

                        // PERFORMANCE: Build spatial grid for optimized ray tracing
                        const spatialGrid = this.perfMonitor.timeSync('perception.spatialGrid', () => {
                            return this.spatialGridEnabled ? this.buildSpatialGrid(allEntities) : null;
                        });

                        // CRITICAL: Ray tracing must complete BEFORE neural network processing
                        // because the neural network needs the converted ray results as inputs
                        const gpuRayResults = await this.perfMonitor.timeAsync('perception.rayTracing', async () => {
                            return this.gpuPhysics.batchRayTracing(
                                activeAgents,
                                allEntities,
                                this.obstacles,
                                maxRaysPerAgent,
                                this.worldWidth,
                                this.worldHeight,
                                spatialGrid // Pass spatial grid data
                            );
                        });

                        // Process ray tracing results and convert to neural network inputs
                        if (gpuRayResults && gpuRayResults.length > 0) {
                            this.perfMonitor.timeSync('perception.gpuRayResultProcessing', () => {
                                convertGpuRayResultsToInputs(this, gpuRayResults, activeAgents, maxRaysPerAgent);
                            });
                            gpuRayTracingSucceeded = true;
                        } else {
                            this.logger.warn(`[RAY-TRACE] GPU ray tracing failed - results: ${gpuRayResults}, length: ${gpuRayResults ? gpuRayResults.length : 'N/A'}`);
                            // Force CPU fallback when GPU fails
                            gpuRayTracingSucceeded = false;
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
                                this.logger.error(`[CPU-PERCEPTION-ERROR] Agent ${agent.id} (${agent.geneId}) CPU perception failed:`, perceptionError);
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
                this.perfMonitor.endPhase(`perception_${i}`);

                // CRITICAL FIX: Always check collisions to prevent tunneling
                // Both agents can move, so we must check every iteration
                this.perfMonitor.startPhase(`physics_${i}`);

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

                this.perfMonitor.endPhase(`physics_${i}`);

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
                    if (this.frameCount % 300 === 0 && this.currentFps < 50 && this.frameCount > 100) {
                        this.perfMonitor.timeSync('misc', () => {
                            let livingAgents = 0;
                            for (let i = 0; i < this.agents.length; i++) {
                                if (!this.agents[i].isDead) livingAgents++;
                            }
                            this.logger.warn(`[PERF] Low FPS detected(${this.currentFps}).Try: Reduce agents(${livingAgents}), game speed(${this.gameSpeed}), or disable GPU features`);
                        });
                    }
                }

                this.perfMonitor.startPhase(`cleanup_${i}`);

                // OPTIMIZED: Only remove dead entities on last iteration to avoid index issues
                // This also reduces the number of array operations
                if (i === iterations - 1) {

                    // === REPRODUCTION SYSTEM ===
                    // Check for reproduction opportunities (once per frame)
                    this.perfMonitor.timeSync('reproduction', () => {
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
                            // Require agent to be mature (not "fit" - that's too strict and blocks all reproduction)
                            if (agent.framesAlive >= MATURATION_AGE_FRAMES &&
                                agent.energy > MIN_ENERGY_FOR_SPLITTING &&
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
                    });

                    // Process dead agents - queue qualifying ones for database save, remove all dead agents
                    this.perfMonitor.timeSync('deadAgentProcessing', () => {
                        for (let j = this.agents.length - 1; j >= 0; j--) {
                        const agent = this.agents[j];
                        if (agent.isDead) {
                            // CRITICAL: Extract weights IMMEDIATELY when agent dies, before any cleanup
                            // This ensures we can add agents to validation even if cleanup occurs later
                            let agentWeights = null;
                            let hasValidWeights = false;
                            
                            // Try multiple methods to extract weights
                            // 1. Check if weights were already extracted and stored
                            if (agent._extractedWeights) {
                                agentWeights = agent._extractedWeights;
                                hasValidWeights = agentWeights &&
                                    typeof agentWeights === 'object' &&
                                    agentWeights.weights1 && agentWeights.weights2 &&
                                    Array.isArray(agentWeights.weights1) && Array.isArray(agentWeights.weights2) &&
                                    agentWeights.weights1.length > 0 && agentWeights.weights2.length > 0;
                            }
                            // 2. Try to get weights from neural network if it exists
                            else if (agent.nn) {
                                try {
                                    agentWeights = agent.getWeights();
                                    hasValidWeights = agentWeights &&
                                        typeof agentWeights === 'object' &&
                                        agentWeights.weights1 && agentWeights.weights2 &&
                                        Array.isArray(agentWeights.weights1) && Array.isArray(agentWeights.weights2) &&
                                        agentWeights.weights1.length > 0 && agentWeights.weights2.length > 0;
                                } catch (error) {
                                    this.logger.debug(`[VALIDATION] Could not extract weights from agent ${agent.id} (${agent.geneId}) via nn.getWeights(): ${error.message}`);
                                }
                            }
                            // 3. Try to call getWeights() directly even if nn is null (might be a method override)
                            else if (typeof agent.getWeights === 'function') {
                                try {
                                    agentWeights = agent.getWeights();
                                    hasValidWeights = agentWeights &&
                                        typeof agentWeights === 'object' &&
                                        agentWeights.weights1 && agentWeights.weights2 &&
                                        Array.isArray(agentWeights.weights1) && Array.isArray(agentWeights.weights2) &&
                                        agentWeights.weights1.length > 0 && agentWeights.weights2.length > 0;
                                } catch (error) {
                                    this.logger.debug(`[VALIDATION] Could not extract weights from agent ${agent.id} (${agent.geneId}) via getWeights(): ${error.message}`);
                                }
                            }
                            
                            // Store weights on agent temporarily so validation can access them even after cleanup
                            if (hasValidWeights && agentWeights) {
                                agent._extractedWeights = agentWeights;
                            } else {
                                // Log why we couldn't extract weights for debugging
                                if (!agent.nn && typeof agent.getWeights !== 'function') {
                                    this.logger.debug(`[VALIDATION] Agent ${agent.id} (${agent.geneId}) has no neural network and no getWeights method`);
                                }
                            }

                            // Check if this agent was in validation queue first (highest priority)
                            if (this.validationManager.isInValidation(agent.geneId) && agent.isValidationAgent) {
                                // This is a SPAWNED validation test agent - handle specially
                                this.logger.info(`[LIFECYCLE] ⚔️ Validation test agent ${agent.id} (${agent.geneId}) died during testing - Age: ${agent.age.toFixed(1)}s, Fitness: ${agent.fitness.toFixed(1)}, Energy: ${agent.energy.toFixed(1)}, Specialization: ${agent.specializationType}`);
                                // Handle validation agent death
                                this.validationManager.handleValidationDeath(agent, this.db);
                                // Validation agents get cleaned up in handleValidationDeath if validation completes,
                                // or they get respawned if validation continues - don't clean up here

                                // CRITICAL: Skip the rest of death processing for validation agents
                                // They are handled entirely by handleValidationDeath
                                this.agents.splice(j, 1);
                                j--; // Adjust index since we removed an element
                                continue;
                            } else if (this.validationManager.isInValidation(agent.geneId)) {
                                // This is an ORIGINAL agent whose gene is in validation - treat as normal death
                                // but log that it died during validation testing
                                this.logger.info(`[LIFECYCLE] 💥 Original agent ${agent.id} (${agent.geneId}) died while gene undergoing validation - Age: ${agent.age.toFixed(1)}s, Fitness: ${agent.fitness.toFixed(1)}, Energy: ${agent.energy.toFixed(1)}, Specialization: ${agent.specializationType}`);
                                // Continue with normal death processing below
                            }

                            if (agent.fit) {
                                // Agent meets comprehensive fit criteria - check if gene pool exists
                                const genePoolExists = this.db.pool[agent.geneId] !== undefined;

                                if (genePoolExists) {
                                    // CASE 1: Existing gene pool - skip validation, go directly to save queue
                                    this.logger.info(`[LIFECYCLE] 🏆 Agent ${agent.id} (${agent.geneId}) died - Age: ${agent.age.toFixed(1)}s, Fitness: ${agent.fitness.toFixed(1)}, Energy: ${agent.energy.toFixed(1)}, Specialization: ${agent.specializationType} (saved to gene pool)`);
                                    this.db.queueSaveAgent(agent);
                                } else {
                                    // CASE 2: New gene pool - enter validation (agent must be fit to enter initially)
                                    this.logger.info(`[LIFECYCLE] 🎯 Agent ${agent.id} (${agent.geneId}) died - Age: ${agent.age.toFixed(1)}s, Fitness: ${agent.fitness.toFixed(1)}, Energy: ${agent.energy.toFixed(1)}, Specialization: ${agent.specializationType} (entering validation)`);

                                    // Use weights extracted earlier (before any cleanup)
                                    if (!hasValidWeights || !agentWeights) {
                                        // Try one more time to get weights if we have the method
                                        if (typeof agent.getWeights === 'function' && !agentWeights) {
                                            try {
                                                agentWeights = agent.getWeights();
                                                hasValidWeights = agentWeights &&
                                                    typeof agentWeights === 'object' &&
                                                    agentWeights.weights1 && agentWeights.weights2 &&
                                                    Array.isArray(agentWeights.weights1) && Array.isArray(agentWeights.weights2) &&
                                                    agentWeights.weights1.length > 0 && agentWeights.weights2.length > 0;
                                                if (hasValidWeights) {
                                                    agent._extractedWeights = agentWeights;
                                                }
                                            } catch (error) {
                                                // Ignore - we'll skip validation
                                            }
                                        }
                                        
                                        if (!hasValidWeights || !agentWeights) {
                                            this.logger.warn(`[VALIDATION] ⚠️ Skipping validation for agent ${agent.id} (${agent.geneId}) - no valid neural network weights (nn: ${agent.nn ? 'exists' : 'null'}, getWeights: ${typeof agent.getWeights}, extracted: ${agent._extractedWeights ? 'yes' : 'no'})`);
                                            // Continue to cleanup - agent can't enter validation without weights
                                        } else {
                                            // We got weights on retry, continue with validation
                                        }
                                    }
                                    
                                    if (hasValidWeights && agentWeights) {
                                        // Temporarily attach weights to agent if neural network is missing
                                        // This allows addToValidationQueue to work properly
                                        const originalNN = agent.nn;
                                        if (!agent.nn && agentWeights) {
                                            // Create a temporary getWeights function that returns the extracted weights
                                            agent.getWeights = () => agentWeights;
                                        }

                                        const result = this.validationManager.addToValidationQueue(agent, false);
                                        
                                        // Restore original state if we modified it
                                        if (!originalNN && agentWeights) {
                                            // Only delete if we added it (check if it's our temporary function)
                                            if (agent.getWeights && !agent.nn) {
                                                delete agent.getWeights;
                                            }
                                        }
                                        
                                        this.logger.debug(`[VALIDATION] Agent ${agent.id} (${agent.geneId}) validation entry result: ${result}`);
                                    }
                                }
                            } else if (hasValidatedAncestor(agent, this)) {
                                // Children of validated agents get saved to gene pool automatically
                                this.logger.info(`[LIFECYCLE] 👼 Agent ${agent.id} (${agent.geneId}) died - Age: ${agent.age.toFixed(1)}s, Fitness: ${agent.fitness.toFixed(1)}, Energy: ${agent.energy.toFixed(1)}, Specialization: ${agent.specializationType} (auto-saved as validated descendant)`);
                                this.db.queueSaveAgent(agent);
                            }
                            else {
                                // Log regular agent death
                                this.logger.info(`[LIFECYCLE] 💀 Agent ${agent.id} (${agent.geneId}) died - Age: ${agent.age.toFixed(1)}s, Fitness: ${agent.fitness.toFixed(1)}, Fit: ${agent.fit}, Energy: ${agent.energy.toFixed(1)}, Specialization: ${agent.specializationType}`);

                                // CRITICAL: Extract weights before cleanup for ALL agents (not just fit ones)
                                // This ensures validation can access weights even after cleanup if needed
                                // The cleanup() method will also extract weights, but doing it here ensures
                                // weights are available before any validation processing
                                if (agent.nn && !agent._extractedWeights) {
                                    try {
                                        agent._extractedWeights = agent.nn.getWeights();
                                    } catch (error) {
                                        this.logger.debug(`[LIFECYCLE] Could not extract weights before cleanup for agent ${agent.id}: ${error.message}`);
                                    }
                                }

                                // CRITICAL: Call cleanup to break circular references before removal
                                // This allows the agent to be garbage collected immediately
                                agent.cleanup();
                            }

                            // NUTRIENT CYCLING: Create fertile zone from decomposed agent
                            this.createFertileZone(agent);

                            // AMAZING DEATH EFFECT: Add dramatic visual effect when agent dies
                            if (this.renderer) {
                                this.renderer.addVisualEffect(agent, 'death', this.gameSpeed);
                            }

                            // PERFORMANCE: Release collision tracking Set back to pool
                            if (agent.processedCollisions) {
                                collisionSetPool.release(agent.processedCollisions);
                                agent.processedCollisions = null;
                            }

                            // Remove ALL dead agents from active array to prevent memory leaks
                            this.agents.splice(j, 1);
                            j--; // Adjust index since we removed an element
                        }
                        }
                    });

                    // Periodic performance monitoring (every 1000 frames)
                    if (this.frameCount % 1000 === 0) {
                        // Process dead agent queue periodically to prevent accumulation
                        if (this.deadAgentQueue.length > 0) {
                            this.processDeadAgentQueue();
                        }

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


                    // Remove dead food and pheromones
                    this.perfMonitor.timeSync('deadEntityRemoval', () => {
                        // Remove dead food
                        for (let j = this.food.length - 1; j >= 0; j--) {
                            if (this.food[j] && this.food[j].isDead) {
                                this.food.splice(j, 1);
                            }
                        }

                        // Clean up unreachable food logic REMOVED
                        // Food now has its own natural decay/rotting process in food.js
                        // This prevents "random" disappearance of valid food items

                        // Remove dead pheromones - only on last iteration
                        for (let j = this.pheromones.length - 1; j >= 0; j--) {
                            if (this.pheromones[j] && this.pheromones[j].isDead) {
                                this.pheromones.splice(j, 1);
                            }
                        }
                    });
                }

                this.perfMonitor.endPhase(`cleanup_${i}`);
            }

            // Always increment frame count, even if iterations were skipped
            this.frameCount++;
            this.perfMonitor.startPhase('memory');
            // Update memory stats every ~0.5 seconds using real time to avoid throttling
            // PERFORMANCE: Reduced interval from 1000ms to 500ms for more frequent cleanup
            if (now - this.lastMemoryPressureCheckTime >= 500) {
                this.lastMemoryPressureCheckTime = now;
                updateMemoryStats(this, false);
                handleMemoryPressure(this);
            }
            // UI updates
            if (this.frameCount % 100 === 0) updateInfo(this);

            // Periodic agent data cleanup - prevent array accumulation
            // PERFORMANCE: Reduced interval from 30 to 10 frames for more aggressive cleanup
            if (this.frameCount % 10 === 0) { // More frequent cleanup: every ~0.17 seconds at 60 FPS
                for (const agent of this.agents) {
                    if (agent && !agent.isDead) {
                        // Limit array sizes to prevent unbounded growth
                        // PERFORMANCE: Lowered limits from 1000/500 to 500/250 for more aggressive cleanup
                        if (agent.inputs && agent.inputs.length > 500) {
                            agent.inputs.length = 0;
                        }
                        if (agent.rayData && agent.rayData.length > 250) {
                            agent.rayData.length = 0;
                        }
                        if (agent.lastRayData && agent.lastRayData.length > 250) {
                            agent.lastRayData.length = 0;
                        }
                    }
                }
            }

            // Periodic validation checks - use real time for consistent timing
            if (now - this.lastValidationCheckTime >= 8333) { // ~500 frames at 60fps = 8333ms
                this.lastValidationCheckTime = now;
                updatePeriodicValidation(this, this.logger);
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
                        this.gpuCompute.deepCleanup(sessionDurationHours, this.agents);
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

            // Update camera
            this.perfMonitor.startPhase('camera');
            if (this.followBest) {
                // Clear bestAgent if it's dead (prevent following ghosts)
                if (this.bestAgent && this.bestAgent.isDead) {
                    this.bestAgent = null;
                }

                // Find the absolute best living agent using priority system
                let targetAgent = null;
                if (this.agents.length > 0) {
                    const livingAgents = [];
                    for (let i = 0; i < this.agents.length; i++) {
                        const agent = this.agents[i];
                        if (!agent.isDead && typeof agent.x === 'number' && typeof agent.y === 'number' &&
                            isFinite(agent.x) && isFinite(agent.y)) {
                            livingAgents.push(agent);
                        }
                    }

                    // Find the best agent with prioritization:
                    // 1. Qualified agents (.fit = true), by fitness
                    // 2. Agents in validation tests, by fitness
                    // 3. All agents, by fitness
                    let bestAgent = null;
                    let bestPriority = 3; // Lower number = higher priority
                    let bestFitness = -Infinity;

                    for (const agent of livingAgents) {
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
                            bestAgent = agent;
                        }
                    }

                    if (bestAgent && !bestAgent.isDead) {
                        targetAgent = bestAgent;
                        // Open agent modal if this is a new best agent
                        if (bestAgent !== this.bestAgent) {
                            openAgentModal(bestAgent, this);
                        }
                        this.bestAgent = bestAgent; // Update bestAgent reference
                    }
                }

                if (targetAgent && !targetAgent.isDead) {
                    this.camera.follow(targetAgent);
                } else {
                    // Target died between check and follow - center camera
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
            this.perfMonitor.endPhase('camera');

            // Only update renderer and render if rendering is enabled
            if (this.renderingEnabled) {
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

                // PERFORMANCE: Only update visual effects and rays on render frames
                // Use adaptive frame skip if FPS is low
                let adaptiveFrameSkip = RENDER_FRAME_SKIP;
                if (this.currentFps > 0 && this.currentFps < 30) {
                    adaptiveFrameSkip = Math.min(RENDER_FRAME_SKIP * 2, 4);
                } else if (this.currentFps > 0 && this.currentFps < 45) {
                    adaptiveFrameSkip = Math.min(RENDER_FRAME_SKIP + 1, 3);
                }
                
                this.renderFrameCounter++;
                const isRenderFrame = (this.renderFrameCounter % adaptiveFrameSkip === 0);
                
                if (isRenderFrame) {
                    this.perfMonitor.timeSync('rendering.visualEffects', () => {
                        this.renderer.updateVisualEffects(this.frameCount);
                    });

                    this.perfMonitor.timeSync('rendering.rayRendering', () => {
                        // Only update rays if they're enabled
                        if (this.showRays) {
                            this.renderer.updateRays(this.agents, this.frameCount);
                        }
                    });
                }

                this.perfMonitor.timeSync('rendering.render', () => {
                    // Only render every Nth frame based on RENDER_FRAME_SKIP
                    if (isRenderFrame) {
                        this.renderer.render();
                    }
                });

                this.perfMonitor.endPhase('rendering');
            }

            this.perfMonitor.startPhase('spawn_agents');
            // Process the agent spawn queue, enforcing the max population limit
            // When at max, allow replacement of weakest agents to make room for new offspring
            if (this.agentSpawnQueue.length > 0) {
                // Count only living agents for population limit
                let livingAgents = 0;
                for (let i = 0; i < this.agents.length; i++) {
                    if (!this.agents[i].isDead) livingAgents++;
                }
                const availableSlots = this.maxAgents - livingAgents;
                
                if (availableSlots > 0) {
                    // Normal case: spawn up to available slots
                    const newAgents = this.agentSpawnQueue.splice(0, availableSlots);
                    this.agents.push(...newAgents);
                    this.totalAgentsSpawned += newAgents.length; // Track total agents spawned in this run
                } else if (availableSlots === 0 && this.agentSpawnQueue.length > 0) {
                    // At max population: replace weakest agents with new offspring
                    // Sort living agents by fitness (lowest first) to find weakest
                    const livingAgentsList = [];
                    for (let i = 0; i < this.agents.length; i++) {
                        if (!this.agents[i].isDead) {
                            livingAgentsList.push(this.agents[i]);
                        }
                    }
                    
                    // Sort by fitness (ascending) - weakest first
                    livingAgentsList.sort((a, b) => (a.fitness || 0) - (b.fitness || 0));
                    
                    // Replace up to the number of queued agents, but limit to reasonable number per frame
                    const maxReplacements = Math.min(this.agentSpawnQueue.length, 5); // Max 5 replacements per frame
                    const newAgents = this.agentSpawnQueue.splice(0, maxReplacements);
                    
                    // Remove weakest agents to make room
                    for (let i = 0; i < newAgents.length && i < livingAgentsList.length; i++) {
                        const weakestAgent = livingAgentsList[i];
                        weakestAgent.isDead = true;
                        this.logger.debug(`[REPRODUCTION] Replaced weakest agent ${weakestAgent.id} (fitness: ${weakestAgent.fitness.toFixed(1)}) with new offspring`);
                    }
                    
                    // Add new agents
                    this.agents.push(...newAgents);
                    this.totalAgentsSpawned += newAgents.length;
                }
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
                this.perfMonitor.timeSync('logging', () => {
                    this.perfMonitor.logReport();

                    // Also log health status
                    const health = this.perfMonitor.getHealthStatus();
                    if (health.status !== 'warming_up') {
                        this.logger.info(`[PERF-HEALTH] Status: ${health.status}, degradation: ${health.degradationRatio.toFixed(2)}x`);
                    }
                });
            }
        }

        this.animationFrameId = requestAnimationFrame(() => {
            this.gameLoop().catch(error => {
                this.logger.error('Error in game loop:', error);
            });
        });
    }
}
