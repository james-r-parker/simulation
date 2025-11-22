// --- SIMULATION CLASS ---
// All simulation logic preserved exactly from original

import {
    WORLD_WIDTH, WORLD_HEIGHT, INITIAL_AGENT_ENERGY, MIN_FOOD_EATEN_TO_SAVE_GENE_POOL,
    MAX_AGENTS_TO_SAVE_PER_GENE_POOL,
    FOOD_SPAWN_CAP, HIGH_VALUE_FOOD_CHANCE,
    SPECIALIZATION_TYPES, // Added for novelty spawning
    RESPAWN_DELAY_FRAMES, MAX_ENERGY,
    MIN_FITNESS_TO_SAVE_GENE_POOL, OBESITY_THRESHOLD_ENERGY, MAX_VELOCITY,
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

// Imported functions from refactored modules
import {
    updateLoadingScreen, hideLoadingScreen, setupUIListeners,
    updateInfo, updateDashboard, resize
} from './ui.js';
import {
    updateMemoryStats, periodicMemoryCleanup
} from './memory.js';
import {
    generateObstacles, updateFoodScalingFactor, spawnAgent,
    spawnFood, spawnPheromone, repopulate, randomSpawnAvoidCluster
} from './spawn.js';
import { checkCollisions, convertGpuRayResultsToInputs } from './physics.js';
import { updateGenePools } from './gene.js';

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
        this.memoryPressureThreshold = 200 * 1024 * 1024; // 200MB threshold
        this.memoryPressureActions = 0;
        this.lastMemoryPressureAction = 0;

        this.gameSpeed = 10;
        this.maxAgents = 100;
        this.foodSpawnRate = 1.0;
        this.mutationRate = 0.1;
        this.baseMutationRate = 0.1; // Base rate for adaptive mutation
        this.showRays = true;
        this.followBest = true;
        this.useGpu = true; // Enable GPU by default

        // Dead agent queue for background database saving
        this.deadAgentQueue = [];
        this.lastPeriodicSave = Date.now();

        this.seasonTimer = 0;
        this.foodScarcityFactor = 1.0;

        // Adaptive mutation tracking
        this.fitnessHistory = []; // Track best fitness over generations
        this.fitnessHistorySize = 10; // Keep last 10 generations

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

        // --- Pre-allocated Memory for Performance ---
        this.activeAgents = []; // Pre-allocate active agents array
        this.allEntities = []; // Pre-allocate all entities array
        this.collisionQueryRange = new Rectangle(0, 0, 0, 0); // Pre-allocate collision query range

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
            const bufferSafetyMargin = 20; // Allow for temporary population spikes from reproduction

            const MAX_RAYS_PER_AGENT = 50; // This must match the hardcoded value in the simulation
            const MAX_ENTITIES = (maxAgentsFromSlider + bufferSafetyMargin) + FOOD_SPAWN_CAP + 100; // Agents + Food + safety buffer
            const MAX_OBSTACLES = 100; // Each circular obstacle becomes 8 line segments, so 10 obstacles = 80 segments (with buffer)

            gpuPhysicsAvailable = await Promise.race([
                this.gpuPhysics.init({
                    maxAgents: maxAgentsFromSlider + bufferSafetyMargin,
                    maxRaysPerAgent: MAX_RAYS_PER_AGENT,
                    maxEntities: MAX_ENTITIES,
                    maxObstacles: MAX_OBSTACLES,
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('GPU Physics init timeout')), 15000))
            ]).catch(() => false);
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
        const center_x = this.worldWidth / 2;
        const center_y = this.worldHeight / 2;
        const startingAgentCount = Math.min(10, this.maxAgents);

        // Spawn 3 agents right in the center
        for (let i = 0; i < 3; i++) {
            spawnAgent(this, {
                x: center_x + randomGaussian(0, 100),
                y: center_y + randomGaussian(0, 100),
                energy: INITIAL_AGENT_ENERGY
            });
        }

        // Spawn remaining agents (try to use gene pools if available)
        for (let i = 3; i < startingAgentCount; i++) {
            const gene = this.db.getRandomAgent();
            spawnAgent(this, { gene: gene, energy: INITIAL_AGENT_ENERGY });
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

        if (this.seasonTimer % (seasonLength * 3) === 0) {
            for (let i = 0; i < 5; i++) {
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

        // Dispose old quadtree and rebuild (needed for spatial queries, but expensive)
        // Only rebuild once per frame, not per gameSpeed iteration
        // Dispose old quadtree and rebuild (needed for spatial queries, but expensive)
        // Only rebuild once per frame, not per gameSpeed iteration
        if (!this.quadtree) {
            this.quadtree = new Quadtree(new Rectangle(this.worldWidth / 2, this.worldHeight / 2, this.worldWidth / 2, this.worldHeight / 2), 4);
        } else {
            this.quadtree.clear();
        }

        // OPTIMIZED: Use for loops instead of spread/filter for better performance
        const numAgents = this.agents.length;
        const numFood = this.food.length;
        const numPheromones = this.pheromones.length;

        for (let i = 0; i < numAgents; i++) {
            const agent = this.agents[i];
            if (!agent.isDead) {
                this.quadtree.insert(new Point(agent.x, agent.y, agent));
            }
        }
        for (let i = 0; i < numFood; i++) {
            const food = this.food[i];
            if (!food.isDead) {
                this.quadtree.insert(new Point(food.x, food.y, food));
            }
        }
        for (let i = 0; i < numPheromones; i++) {
            const pheromone = this.pheromones[i];
            if (!pheromone.isDead) {
                this.quadtree.insert(new Point(pheromone.x, pheromone.y, pheromone));
            }
        }

        // Repopulate before game loop to include new agents
        repopulate(this);

        // Use Math.max to ensure at least 1 iteration, and Math.floor to handle fractional speeds
        const iterations = Math.max(1, Math.floor(this.gameSpeed));
        for (let i = 0; i < iterations; i++) {
            // OPTIMIZED: Update pheromones with for loop, skip dead ones
            // Use actual length, not cached, since arrays can be modified
            for (let j = 0; j < this.pheromones.length; j++) {
                const p = this.pheromones[j];
                if (p && !p.isDead) {
                    p.update();
                }
            }
            // Update food spawning continuously (INSIDE LOOP for speed scaling)
            spawnFood(this);

            this.applyEnvironmentEvents();

            // OPTIMIZED: Rebuild quadtree less frequently - only every 5 iterations or on last iteration
            if (i % 5 === 0 || i === iterations - 1) {
                // Reuse quadtree structure
                this.quadtree.clear();
                // Only insert non-dead entities - use actual lengths, not cached
                for (let j = 0; j < this.agents.length; j++) {
                    const agent = this.agents[j];
                    if (agent && !agent.isDead) {
                        this.quadtree.insert(new Point(agent.x, agent.y, agent));
                    }
                }
                for (let j = 0; j < this.food.length; j++) {
                    const food = this.food[j];
                    if (food && !food.isDead) {
                        this.quadtree.insert(new Point(food.x, food.y, food));
                    }
                }
                for (let j = 0; j < this.pheromones.length; j++) {
                    const pheromone = this.pheromones[j];
                    if (pheromone && !pheromone.isDead) {
                        this.quadtree.insert(new Point(pheromone.x, pheromone.y, pheromone));
                    }
                }
            }

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

            // GPU Ray Tracing + Pheromone Detection - SYNC for immediate results
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

                    // Run GPU ray tracing operation
                    const gpuRayResults = await this.gpuPhysics.batchRayTracing(
                        activeAgents,
                        allEntities,
                        this.obstacles,
                        maxRaysPerAgent,
                        this.worldWidth,
                        this.worldHeight
                    );

                    if (gpuRayResults && gpuRayResults.length > 0) {
                        // Convert GPU ray results to neural network inputs
                        convertGpuRayResultsToInputs(this, gpuRayResults, activeAgents, maxRaysPerAgent);
                        gpuRayTracingSucceeded = true;
                    } else {
                        if (this.frameCount < 10) {
                            this.logger.warn('GPU ray tracing returned null or empty results');
                        }
                    }
                } catch (error) {
                    if (this.frameCount < 10) {
                        this.logger.warn('GPU ray tracing failed, using CPU:', error);
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

            // GPU Neural Network processing - SYNC for immediate results
            // Threshold aligned with ray tracing (10 agents) to ensure consistent GPU usage
            if (this.useGpu && this.gpuCompute.isAvailable() && activeAgents.length >= 10) {
                try {
                    await this.gpuCompute.batchNeuralNetworkForward(activeAgents);
                    // GPU results are now in agent.lastOutput and agent.newHiddenState
                    gpuNeuralNetSucceeded = true;
                } catch (error) {
                    // GPU failed, agents will use CPU in update()
                }
            }

            if (!gpuNeuralNetSucceeded) {
                this.logger.warn('GPU Neural Network processing failed, using CPU');
            }

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
            }

            checkCollisions(this);

            // OPTIMIZED: Only remove dead entities on last iteration to avoid index issues
            // This also reduces the number of array operations
            if (i === iterations - 1) {
                // Process dead agents - queue qualifying ones for database save
                for (let j = this.agents.length - 1; j >= 0; j--) {
                    const agent = this.agents[j];
                    if (agent.isDead && agent.fit) {
                        this.deadAgentQueue.push(agent);
                        this.agents.splice(j, 1);
                    }
                }

                // Process dead agent queue (background save)
                this.processDeadAgentQueue();
                // Remove dead food
                for (let j = this.food.length - 1; j >= 0; j--) {
                    if (this.food[j] && this.food[j].isDead) {
                        this.food.splice(j, 1);
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
                if (this.frameCount % 60 === 0) updateMemoryStats(this, false);
                if (this.frameCount % 100 === 0) updateInfo(this);
                if (this.frameCount % 500 === 0) updateGenePools(this);
                // Update dashboard more frequently for better real-time feedback
                if (this.frameCount % 30 === 0) updateDashboard(this);
                // Periodic comprehensive memory cleanup every 1000 frames (~16 seconds at 60 FPS)
                if (this.frameCount % 1000 === 0) periodicMemoryCleanup(this);
            }
        }

        // Update camera
        if (this.followBest) {
            if (this.bestAgent && !this.bestAgent.isDead &&
                typeof this.bestAgent.x === 'number' && typeof this.bestAgent.y === 'number' &&
                isFinite(this.bestAgent.x) && isFinite(this.bestAgent.y)) {
                this.camera.follow(this.bestAgent);
            } else if (this.agents.length > 0) {
                // Find first agent with valid position
                const validAgent = this.agents.find(a => !a.isDead &&
                    typeof a.x === 'number' && typeof a.y === 'number' &&
                    isFinite(a.x) && isFinite(a.y));
                if (validAgent) {
                    this.bestAgent = validAgent;
                    this.camera.follow(this.bestAgent);
                } else {
                    // No valid agents, center camera
                    this.camera.targetX = this.worldWidth / 2;
                    this.camera.targetY = this.worldHeight / 2;
                }
            } else {
                // No agents, center camera
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

        this.renderer.updateAgents(this.agents);
        this.renderer.updateFood(this.food);
        this.renderer.updatePheromones(this.pheromones);
        this.renderer.updateObstacles(this.obstacles);

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
