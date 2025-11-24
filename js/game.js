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
    PHEROMONE_RADIUS, PHEROMONE_DIAMETER, OBSTACLE_HIDING_RADIUS, TWO_PI
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

// Imported functions from refactored modules
import {
    updateLoadingScreen, hideLoadingScreen, setupUIListeners,
    updateInfo, updateDashboard, resize
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

export class Simulation {
    constructor(container) {
        this.logger = new Logger(LOG_LEVELS.DEBUG); // Set to DEBUG for detailed logs
        this.logger.log('Simulation constructor started.');

        this.agents = [];
        this.agentSpawnQueue = [];
        this.food = [];
        this.pheromones = [];

        this.worldWidth = WORLD_WIDTH;
        this.worldHeight = WORLD_HEIGHT;
        this.obstacles = generateObstacles(this);

        this.quadtree = new Quadtree(new Rectangle(this.worldWidth / 2, this.worldHeight / 2, this.worldWidth / 2, this.worldHeight / 2), 4);
        this.camera = new Camera(this.worldWidth / 2, this.worldHeight / 2, 0.5); // Zoomed out slightly for wider 16:9 view

        this.generation = 0;
        this.bestAgent = null;
        this.frameCount = 0;
        this.respawnTimer = 0;

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

        // Memory monitoring
        this.memoryHistory = [];
        this.memoryHistorySize = 100;
        this.lastMemoryUpdate = Date.now();
        this.currentMemoryUsage = 0;
        this.peakMemoryUsage = 0;
        this.memoryGrowthRate = 0;
        this.entityCounts = { agents: 0, food: 0, pheromones: 0 };

        // Memory management
        this.memoryPressureThreshold = 150 * 1024 * 1024; // 150MB threshold (lower for more frequent cleanup)
        this.memoryPressureActions = 0;
        this.lastMemoryPressureAction = 0;
        this.totalAgentsSpawned = 0; // Total agents created in this simulation run

        this.gameSpeed = 1;
        this.maxAgents = 25;
        this.foodSpawnRate = 2.0;
        this.mutationRate = 0.01;
        this.baseMutationRate = 0.1; // Base rate for adaptive mutation
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

        // WebGL Renderer
        this.renderer = new WebGLRenderer(container, this.worldWidth, this.worldHeight, this.logger);

        // GPU Compute (WebGPU for RTX 4090 and high-end GPUs)
        this.gpuCompute = new GPUCompute(this.logger);
        this.gpuPhysics = new GPUPhysics(this.logger);

        // IndexedDB
        this.db = new GenePoolDatabase(this.logger);

        // Validation system for multi-run testing of promising agents (initialized after db)
        this.validationManager = new ValidationManager(this.logger, this.db);

        // --- Pre-allocated Memory for Performance ---
        this.activeAgents = []; // Pre-allocate active agents array
        this.allEntities = []; // Pre-allocate all entities array
        this.collisionQueryRange = new Rectangle(0, 0, 0, 0); // Pre-allocate collision query range

        // Object pool for quadtree Point objects to reduce GC pressure
        this.pointPool = new PointPool(5000); // Pre-allocate 5000 Points

        // Pre-allocated arrays for filter operations
        this.livingFood = [];
        this.livingPheromones = [];
        this.livingAgents = [];

        this.init();
    }

    resize() {
        resize(this);
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
                new Promise((_, reject) => setTimeout(() => reject(new Error('GPU Compute init timeout')), 15000))
            ]).catch(() => false);
        } catch (e) {
            this.logger.warn("GPU Compute init failed or timed out:", e);
            gpuAvailable = false;
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
            console.log('[GPU-INIT] Initializing GPU Physics with config:', gpuConfig);

            gpuPhysicsAvailable = await Promise.race([
                this.gpuPhysics.init(gpuConfig),
                new Promise((_, reject) => setTimeout(() => reject(new Error('GPU Physics init timeout')), 15000))
            ]).catch((error) => {
                console.error('[GPU-INIT] GPU Physics init failed:', error);
                return false;
            });

            if (gpuPhysicsAvailable) {
                console.log('[GPU-INIT] GPU Physics initialized successfully');
            } else {
                console.warn('[GPU-INIT] GPU Physics initialization failed or timed out');
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

        // Start the game loop only after everything is initialized
        this.gameLoop().catch(error => {
            this.logger.error('Error starting game loop:', error);
        });
    }






    async requestWakeLock() {
        if (!('wakeLock' in navigator)) {
            console.warn('[WAKE] Screen Wake Lock API not supported in this browser');
            return false;
        }

        try {
            this.wakeLock = await navigator.wakeLock.request('screen');
            this.wakeLockEnabled = true;
            console.log('[WAKE] 🔋 Screen wake lock activated - display will stay on');

            // Handle wake lock release (when system needs to save power)
            this.wakeLock.addEventListener('release', () => {
                console.log('[WAKE] 🔋 Screen wake lock released by system');
                this.wakeLock = null;
                this.wakeLockEnabled = false;
            });

            return true;
        } catch (err) {
            console.warn('[WAKE] Failed to acquire wake lock:', err.message);
            this.wakeLockEnabled = false;
            return false;
        }
    }

    async releaseWakeLock() {
        if (this.wakeLock) {
            await this.wakeLock.release();
            this.wakeLock = null;
            this.wakeLockEnabled = false;
            console.log('[WAKE] 🔋 Screen wake lock released');
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
        const seasonLength = 1800;
        const phase = (this.seasonTimer % seasonLength) / seasonLength;

        this.foodScarcityFactor = 1.0 - (0.5 * Math.abs(Math.sin(phase * TWO_PI)));

        if (phase > 0.5 && phase < 0.75) {
            this.agents.forEach(a => a.energy -= 0.1);
        }

        if (this.seasonTimer % (seasonLength * 6) === 0) { // Reduced frequency from *3 to *6
            for (let i = 0; i < 2; i++) { // Reduced count from 5 to 2
                spawnPheromone(this, this.worldWidth * Math.random(), this.worldHeight * Math.random(), 'danger');
            }
        }
    }







    async gameLoop() {


        // FPS calculation
        this.fpsFrameCount++;
        const now = Date.now();
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

            // Update FPS display
            const fpsEl = document.getElementById('info-fps');
            if (fpsEl) {
                let fpsText = `FPS: ${this.currentFps}`;
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
        }

        // Track if this frame used GPU or CPU
        this.currentFrameUsedGpu = false;

        // Initialize quadtree if needed
        if (!this.quadtree) {
            this.quadtree = new Quadtree(new Rectangle(this.worldWidth / 2, this.worldHeight / 2, this.worldWidth / 2, this.worldHeight / 2), 4);
        }

        // Repopulate before game loop to include new agents
        repopulate(this);

        // ACCURACY PRESERVED: Allow full game speed without capping
        const iterations = Math.max(1, Math.floor(this.gameSpeed));
        for (let i = 0; i < iterations; i++) {
            // REBUILD quadtree every iteration for accurate collision detection
            // This ensures all collision queries use current entity positions
            this.quadtree.clear();

            // Return all Points to pool before rebuilding
            this.pointPool.releaseAll();

            for (let j = 0; j < this.agents.length; j++) {
                const agent = this.agents[j];
                if (agent && !agent.isDead) {
                    // Use Point pool instead of allocating new objects
                    const point = this.pointPool.acquire(agent.x, agent.y, agent, agent.size / 2);
                    this.quadtree.insert(point);
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
                spawnFood(this);
            }

            this.applyEnvironmentEvents();

            // Quadtree is now rebuilt once per frame outside the iteration loop

            // GPU processing per iteration for accurate perception
            // Reuse activeAgents array
            this.activeAgents.length = 0;
            for (let j = 0; j < this.agents.length; j++) {
                if (!this.agents[j].isDead) {
                    this.activeAgents.push(this.agents[j]);
                }
            }
            const activeAgents = this.activeAgents;

            let gpuRayTracingSucceeded = false;
            let gpuNeuralNetSucceeded = false;

            // Update obstacles BEFORE ray tracing so rays detect current positions
            updateObstacles(this.obstacles, this.worldWidth, this.worldHeight);

            // Update renderer immediately with new obstacle positions
            this.renderer.updateObstacles(this.obstacles);

            // PERFORMANCE OPTIMIZATION: Run GPU operations in parallel for better throughput
            // ACCURACY PRESERVED: Full neural networks and ray tracing, just parallelized
            const canUseGpu = this.useGpu && this.gpuPhysics.isAvailable() && activeAgents.length >= 10;

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
                    const maxRaysPerAgent = 50; // Max rays across all specializations

                    // PERFORMANCE: Start both GPU operations in parallel
                    const gpuRayPromise = this.gpuPhysics.batchRayTracing(
                        activeAgents,
                        allEntities,
                        this.obstacles,
                        maxRaysPerAgent,
                        this.worldWidth,
                        this.worldHeight
                    );

                    const gpuNeuralPromise = this.gpuCompute.batchNeuralNetworkForward(activeAgents);

                    // Wait for both operations to complete in parallel
                    const [gpuRayResults, gpuNeuralResults] = await Promise.all([
                        gpuRayPromise,
                        gpuNeuralPromise
                    ]);

                    // Process ray tracing results
                    if (gpuRayResults && gpuRayResults.length > 0) {
                        convertGpuRayResultsToInputs(this, gpuRayResults, activeAgents, maxRaysPerAgent);
                        gpuRayTracingSucceeded = true;
                    } else {
                        if (this.frameCount < 10) {
                            this.logger.warn('GPU ray tracing returned null or empty results');
                        }
                    }

                    // Neural network results are already in agent.lastOutput and agent.newHiddenState
                    gpuNeuralNetSucceeded = true;

                } catch (error) {
                    if (this.frameCount < 10) {
                        this.logger.warn('Parallel GPU operations failed:', error);
                    }
                }
            }

            // CPU perception fallback (if GPU ray tracing failed or not available)
            if (!gpuRayTracingSucceeded && activeAgents.length > 0) {
                for (let j = 0; j < activeAgents.length; j++) {
                    const agent = activeAgents[j];
                    const perception = agent.perceiveWorld(this.quadtree, this.obstacles, this.worldWidth, this.worldHeight);
                    agent.lastInputs = perception.inputs;
                    agent.lastRayData = perception.rayData;
                }
            }

            // Neural network processing now happens in parallel with ray tracing above

            if (!gpuNeuralNetSucceeded) {
                this.logger.warn('GPU Neural Network processing failed, using CPU');
            }

            // CRITICAL FIX: Always check collisions to prevent tunneling
            // Both agents can move, so we must check every iteration
            checkCollisions(this);

            // Update agents (will use GPU results if available, otherwise CPU)
            // OPTIMIZED: Use for loop instead of forEach
            // Use actual length, not cached, since arrays can be modified
            for (let j = 0; j < this.agents.length; j++) {
                const agent = this.agents[j];

                if (!agent || agent.isDead) continue;

                // Let the agent think and update its state
                if (!agent.isDead) {
                    agent.update(this.worldWidth, this.worldHeight, this.obstacles, this.quadtree, this);
                }
            }

            // PERFORMANCE OPTIMIZATION: GPU-accelerated food updates
            if (this.useGpu && this.gpuPhysics && this.gpuPhysics.isAvailable()) {
                try {
                    // Reuse pre-allocated array instead of filter()
                    this.livingFood.length = 0;
                    for (let j = 0; j < this.food.length; j++) {
                        const f = this.food[j];
                        if (f && !f.isDead) {
                            this.livingFood.push(f);
                        }
                    }
                    if (this.livingFood.length > 0) {
                        await this.gpuPhysics.batchFoodUpdate(this.livingFood);
                    }
                } catch (error) {
                    // Fallback to CPU updates
                    for (let j = 0; j < this.food.length; j++) {
                        const food = this.food[j];
                        if (food && !food.isDead) {
                            food.update();
                        }
                    }
                }
            } else {
                // CPU fallback for food updates
                for (let j = 0; j < this.food.length; j++) {
                    const food = this.food[j];
                    if (food && !food.isDead) {
                        food.update();
                    }
                }
            }

            // PERFORMANCE OPTIMIZATION: GPU-accelerated pheromone updates
            if (this.useGpu && this.gpuPhysics && this.gpuPhysics.isAvailable()) {
                try {
                    // Reuse pre-allocated array instead of filter()
                    this.livingPheromones.length = 0;
                    for (let j = 0; j < this.pheromones.length; j++) {
                        const p = this.pheromones[j];
                        if (p && !p.isDead) {
                            this.livingPheromones.push(p);
                        }
                    }
                    if (this.livingPheromones.length > 0) {
                        await this.gpuPhysics.batchPheromoneUpdate(this.livingPheromones);
                    }
                } catch (error) {
                    // Fallback to CPU updates
                    for (let j = 0; j < this.pheromones.length; j++) {
                        const pheromone = this.pheromones[j];
                        if (pheromone && !pheromone.isDead) {
                            pheromone.update();
                        }
                    }
                }
            } else {
                // CPU fallback for pheromone updates
                for (let j = 0; j < this.pheromones.length; j++) {
                    const pheromone = this.pheromones[j];
                    if (pheromone && !pheromone.isDead) {
                        pheromone.update();
                    }
                }
            }

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
                    const livingAgents = this.agents.filter(a => !a.isDead).length;
                    console.log(`[PERF] Low FPS detected (${this.currentFps}). Try: Reduce agents (${livingAgents}), game speed (${this.gameSpeed}), or disable GPU features`);
                }
            }

            // OPTIMIZED: Only remove dead entities on last iteration to avoid index issues
            // This also reduces the number of array operations
            if (i === iterations - 1) {
                // Process dead agents - queue qualifying ones for database save, remove all dead agents
                for (let j = this.agents.length - 1; j >= 0; j--) {
                    const agent = this.agents[j];
                    if (agent.isDead) {
                        // Check if this agent was in validation queue first (highest priority)
                        if (this.validationManager.isInValidation(agent.geneId)) {
                            // Debug: Log validation agent death details
                            console.log(`[VALIDATION] Agent ${agent.geneId} died during validation - Age: ${agent.framesAlive / 60}s, Energy: ${agent.energy}, Fitness: ${agent.fitness}`);
                            // Handle validation agent death
                            this.validationManager.handleValidationDeath(agent, this.deadAgentQueue);
                        } else if (agent.fitness >= VALIDATION_FITNESS_THRESHOLD) {
                            // Handle promising agents with validation queue system
                            console.log(`[VALIDATION] 💀 Death: Adding deceased agent ${agent.geneId} (fitness: ${agent.fitness.toFixed(1)}) to validation`);
                            const result = this.validationManager.addToValidationQueue(agent, false);
                            if (result === false) {
                                // Agent was skipped (already in gene pool), add to dead queue
                                this.deadAgentQueue.push(agent);
                            }
                        } else if (agent.fit) {
                            // Directly add proven agents to gene pool
                            this.deadAgentQueue.push(agent);
                        } else if (hasValidatedAncestor(agent, this)) {
                            // Children of validated agents get saved to gene pool automatically
                            console.log(`[GENEPOOL] 👶 Auto-saving child of validated lineage: ${agent.geneId} (fitness: ${agent.fitness.toFixed(1)})`);
                            this.deadAgentQueue.push(agent);
                        }
                        // Remove ALL dead agents from active array to prevent memory leaks
                        this.agents.splice(j, 1);
                        j--; // Adjust index since we removed an element
                    }
                }

                // Process dead agent queue (background save)
                this.processDeadAgentQueue();

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

                    console.log(`[PERF] Frame ${this.frameCount}: ${livingAgents} agents, ${livingFood} food, ${livingPheromones} pheromones, ${this.validationManager.validationQueue.size} validation, GPU cache: ${gpuComputeCache} compute, ${gpuPhysicsCache} physics, FPS: ${this.avgCpuFps?.toFixed(1) || 'N/A'}`);
                }
                // Remove dead food
                for (let j = this.food.length - 1; j >= 0; j--) {
                    if (this.food[j] && this.food[j].isDead) {
                        this.food.splice(j, 1);
                    }
                }

                // Clean up unreachable food (food that's been alive too long)
                // This prevents food accumulation in areas agents never visit
                if (this.frameCount % 5000 === 0) { // Check every ~83 seconds at 60 FPS
                    const maxFoodAge = 3000; // ~50 seconds at 60 FPS
                    let cleanedCount = 0;
                    for (let j = this.food.length - 1; j >= 0; j--) {
                        const food = this.food[j];
                        if (food && !food.isDead && food.age !== undefined && food.age > maxFoodAge) {
                            // Mark old unreachable food as dead
                            food.isDead = true;
                            cleanedCount++;
                        }
                        // Initialize age tracking for new food
                        if (food && food.age === undefined) {
                            food.age = 0;
                        } else if (food && !food.isDead) {
                            food.age++;
                        }
                    }
                    if (cleanedCount > 0) {
                        console.log(`[CLEANUP] Removed ${cleanedCount} unreachable food items`);
                    }
                }
            }
            // Remove dead pheromones - only on last iteration
            if (i === iterations - 1) {
                for (let j = this.pheromones.length - 1; j >= 0; j--) {
                    if (this.pheromones[j] && this.pheromones[j].isDead) {
                        this.pheromones.splice(j, 1);
                    }
                }
            }

            if (i === iterations - 1) {
                this.frameCount++;
                // Update memory stats every 60 frames (1 second at 60 FPS) without UI update
                if (this.frameCount % 60 === 0) {
                    updateMemoryStats(this, false);
                    handleMemoryPressure(this);
                }
                if (this.frameCount % 100 === 0) updateInfo(this);
                // Periodic validation checks - add high-performing agents to validation queue
                if (this.frameCount % 500 === 0) {
                    updatePeriodicValidation(this);
                    // Log validation queue status periodically
                    if (this.validationManager.validationQueue.size > 0) {
                        console.log(`[VALIDATION] Queue status: ${this.validationManager.validationQueue.size} agents pending validation`);
                    }
                    // Clean up validation queue
                    this.validationManager.cleanupValidationQueue();

                    // Resync active validation agents counter
                    const actualValidationAgents = this.agents.filter(a => !a.isDead && this.validationManager.isInValidation(a.geneId)).length;
                    if (actualValidationAgents !== this.validationManager.activeValidationAgents) {
                        console.log(`[VALIDATION] Resyncing counter: ${this.validationManager.activeValidationAgents} → ${actualValidationAgents}`);
                        this.validationManager.activeValidationAgents = actualValidationAgents;
                    }
                }
                // Update dashboard more frequently for better real-time feedback
                if (this.frameCount % 30 === 0) updateDashboard(this);
                // Periodic comprehensive memory cleanup every 5000 frames (~83 seconds at 60 FPS)
                if (this.frameCount % 5000 === 0) {
                    console.log(`[PERF] Frame ${this.frameCount}: Starting periodic memory cleanup`);
                    periodicMemoryCleanup(this);
                    // Force GPU cache clearing every 5000 frames to prevent memory buildup
                    if (this.gpuCompute && this.gpuCompute.clearCache) {
                        this.gpuCompute.clearCache();
                        console.log('[PERF] GPU compute cache cleared');
                    }
                    if (this.gpuPhysics && this.gpuPhysics.clearCache) {
                        this.gpuPhysics.clearCache();
                        console.log('[PERF] GPU physics cache cleared');
                    }
                    // Force garbage collection if available
                    if (window.gc) {
                        window.gc();
                        console.log('[PERF] Forced garbage collection');
                    }
                    console.log(`[PERF] Frame ${this.frameCount}: Periodic memory cleanup completed`);
                }
            }
        }

        // Update camera
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
                const livingAgents = this.agents.filter(a => !a.isDead &&
                    typeof a.x === 'number' && typeof a.y === 'number' &&
                    isFinite(a.x) && isFinite(a.y));

                // Check frustum for each agent (reuse cached frustum from renderer)

                const tempVec = new THREE.Vector3();
                const testSphere = new THREE.Sphere(tempVec, 0);

                // Find the highest fitness agent that's actually visible
                let bestVisibleAgent = null;
                let bestFitness = -Infinity;

                for (const agent of livingAgents) {
                    tempVec.set(agent.x, -agent.y, 0);
                    testSphere.center = tempVec;
                    testSphere.radius = agent.size || 5;

                    if (this.renderer.frustum.intersectsSphere(testSphere) && (agent.fitness || 0) > bestFitness) {
                        bestFitness = agent.fitness || 0;
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
        this.camera.update();

        // Update renderer
        const camPos = this.camera.getPosition();
        this.renderer.updateCamera(camPos);

        this.renderer.updateAgents(this.agents, this.frameCount);
        this.renderer.updateFood(this.food);
        this.renderer.updatePheromones(this.pheromones);
        // Obstacles already updated after movement

        this.renderer.updateRays(this.agents, this.frameCount);
        this.renderer.render();

        // Process the agent spawn queue, enforcing the max population limit
        if (this.agentSpawnQueue.length > 0) {
            // Count only living agents for population limit
            const livingAgents = this.agents.filter(a => !a.isDead).length;
            const availableSlots = this.maxAgents - livingAgents;
            if (availableSlots > 0) {
                const newAgents = this.agentSpawnQueue.splice(0, availableSlots);
                this.agents.push(...newAgents);
                this.totalAgentsSpawned += newAgents.length; // Track total agents spawned in this run
            }

            if (this.agentSpawnQueue.length > 0) {
                this.logger.log(`[LIFECYCLE] Population at limit. ${this.agentSpawnQueue.length} offspring were stillborn.`);
            }

            this.agentSpawnQueue.length = 0; // Clear any remaining (stillborn) agents
        }

        requestAnimationFrame(() => {
            this.gameLoop().catch(error => {
                this.logger.error('Error in game loop:', error);
            });
        });
    }
}
