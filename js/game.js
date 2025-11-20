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
        this.obstacles = this.generateObstacles();

        this.quadtree = new Quadtree(new Rectangle(this.worldWidth / 2, this.worldHeight / 2, this.worldWidth / 2, this.worldHeight / 2), 4);
        this.camera = new Camera(this.worldWidth / 2, this.worldHeight / 2, 0.5); // Zoomed out slightly for wider 16:9 view

        this.genePools = {}; // geneId -> array of top agents
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

    generateObstacles() {
        const obstacles = [];
        const numObstacles = 12; // Increased for larger 16:9 world
        const minRadius = 40;
        const maxRadius = 120;
        const minDistance = 400; // Minimum distance between obstacles
        const margin = 200; // Keep obstacles away from world edges

        for (let i = 0; i < numObstacles; i++) {
            let attempts = 50;
            let valid = false;
            let x, y, radius;

            while (attempts > 0 && !valid) {
                // Generate random position with margin from edges
                x = margin + Math.random() * (this.worldWidth - 2 * margin);
                y = margin + Math.random() * (this.worldHeight - 2 * margin);

                // Varied sizes - use a distribution that favors medium sizes but allows extremes
                const sizeRoll = Math.random();
                if (sizeRoll < 0.2) {
                    // 20% chance for small obstacles
                    radius = minRadius + Math.random() * 20;
                } else if (sizeRoll < 0.7) {
                    // 50% chance for medium obstacles
                    radius = minRadius + 30 + Math.random() * 40;
                } else {
                    // 30% chance for large obstacles
                    radius = minRadius + 60 + Math.random() * (maxRadius - minRadius - 60);
                }

                // Check if this position is far enough from existing obstacles
                valid = true;
                for (const existing of obstacles) {
                    const dist = distance(x, y, existing.x, existing.y);
                    if (dist < existing.radius + radius + minDistance) {
                        valid = false;
                        break;
                    }
                }

                attempts--;
            }

            if (valid) {
                // Ensure each obstacle has a unique ID for logging purposes
                obstacles.push({ id: `obs_${i}_${Math.random().toString(36).substr(2, 5)}`, x, y, radius });
            }
        }

        return obstacles;
    }

    updateLoadingScreen(status, progress) {
        const statusEl = document.getElementById('loading-status');
        const progressEl = document.getElementById('loading-progress-bar');
        if (statusEl) statusEl.textContent = status;
        if (progressEl) progressEl.style.width = `${progress}%`;
    }

    hideLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.style.opacity = '0';
            loadingScreen.style.transition = 'opacity 0.5s';
            setTimeout(() => {
                loadingScreen.style.display = 'none';
            }, 500);
        }
    }

    async init() {
        this.updateLoadingScreen('Initializing database...', 10);
        try {
            await this.db.init();
        } catch (e) {
            this.logger.error("Database init failed:", e);
        }

        this.updateLoadingScreen('Loading gene pools...', 30);
        try {
            await this.loadGenePools();
        } catch (e) {
            this.logger.error("Gene pool loading failed:", e);
        }

        // Initialize WebGPU compute with timeout
        let gpuAvailable = false;
        let gpuPhysicsAvailable = false;

        this.updateLoadingScreen('Initializing GPU Compute...', 50);
        try {
            gpuAvailable = await Promise.race([
                this.gpuCompute.init(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('GPU Compute init timeout')), 15000))
            ]).catch(() => false);
        } catch (e) {
            this.logger.warn("GPU Compute init failed or timed out:", e);
            gpuAvailable = false;
        }

        this.updateLoadingScreen('Initializing GPU Physics...', 70);
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

        this.updateLoadingScreen('Creating initial population...', 85);
        this.initPopulation();
        this.setupUIListeners();
        this.updateFoodScalingFactor();

        this.updateLoadingScreen('Starting simulation...', 100);
        // Small delay to show 100% before hiding
        await new Promise(resolve => setTimeout(resolve, 300));
        this.hideLoadingScreen();

        // Start the game loop only after everything is initialized
        this.gameLoop().catch(error => {
            this.logger.error('Error starting game loop:', error);
        });
    }

    setupUIListeners() {
        // Set slider values to match code defaults
        const gameSpeedSlider = document.getElementById('gameSpeed');
        const maxAgentsSlider = document.getElementById('maxAgents');
        gameSpeedSlider.value = this.gameSpeed;
        maxAgentsSlider.value = this.maxAgents;

        gameSpeedSlider.addEventListener('input', e => {
            this.gameSpeed = parseInt(e.target.value, 10);
        });

        maxAgentsSlider.addEventListener('input', e => {
            this.maxAgents = parseInt(e.target.value, 10);
            this.updateFoodScalingFactor();
        });

        document.getElementById('showRays').addEventListener('change', e => {
            this.showRays = e.target.checked;
            this.renderer.setShowRays(e.target.checked);
        });

        const followBestCheckbox = document.getElementById('followBest');
        followBestCheckbox.checked = this.followBest;
        followBestCheckbox.addEventListener('change', e => {
            this.followBest = e.target.checked;
            if (this.followBest) {
                // Reset to center when re-enabling follow best
                this.camera.targetX = this.worldWidth / 2;
                this.camera.targetY = this.worldHeight / 2;
            }
        });

        const useGpuCheckbox = document.getElementById('useGpu');
        useGpuCheckbox.checked = this.useGpu;
        useGpuCheckbox.addEventListener('change', e => {
            this.useGpu = e.target.checked;
            this.logger.log('GPU usage:', this.useGpu ? 'enabled' : 'disabled');
        });

        // Camera controls (pan and zoom)
        this.setupCameraControls();

        // Set other slider values to match code defaults
        const foodRateSlider = document.getElementById('foodRate');
        const mutationRateSlider = document.getElementById('mutationRate');
        foodRateSlider.value = this.foodSpawnRate;
        mutationRateSlider.value = this.mutationRate;

        foodRateSlider.addEventListener('input', e => {
            this.foodSpawnRate = parseFloat(e.target.value);
            this.updateFoodScalingFactor();
        });

        mutationRateSlider.addEventListener('input', e => {
            this.mutationRate = parseFloat(e.target.value);
        });

        document.getElementById('clearStorage').addEventListener('click', async () => {
            await this.db.clearAll();
            alert('Gene pool cleared. Reloading.');
            location.reload();
        });

        window.addEventListener('resize', () => this.resize());
        window.addEventListener('beforeunload', async () => {
            // Flush dead agent queue and save current state
            this.processDeadAgentQueue();
            await this.db.flush();
            await this.saveGenePools();
        });
    }

    setupCameraControls() {
        const container = this.renderer.container;
        const canvas = this.renderer.renderer.domElement;

        let isDragging = false;
        let lastMouseX = 0;
        let lastMouseY = 0;

        canvas.addEventListener('mousedown', (e) => {
            if (this.followBest) return; // Disable when following best agent
            isDragging = true;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            canvas.style.cursor = 'grabbing';
            e.preventDefault();
        });

        canvas.addEventListener('mousemove', (e) => {
            if (!isDragging || this.followBest) return;

            const deltaX = e.clientX - lastMouseX;
            const deltaY = e.clientY - lastMouseY;

            const aspect = container.clientWidth / container.clientHeight;
            const viewSize = Math.max(this.worldWidth, this.worldHeight) * 0.4;

            this.camera.pan(deltaX, deltaY, container.clientWidth, container.clientHeight, viewSize, aspect);

            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            e.preventDefault();
        });

        canvas.addEventListener('mouseup', () => {
            isDragging = false;
            canvas.style.cursor = 'default';
        });

        canvas.addEventListener('mouseleave', () => {
            isDragging = false;
            canvas.style.cursor = 'default';
        });

        canvas.addEventListener('wheel', (e) => {
            if (this.followBest) return; // Disable when following best agent

            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const aspect = container.clientWidth / container.clientHeight;
            this.camera.zoomAt(mouseX, mouseY, e.deltaY, container.clientWidth, container.clientHeight,
                this.worldWidth, this.worldHeight, aspect);

            e.preventDefault();
        });
    }

    resize() {
        const infoBar = document.getElementById('info-bar');
        const controls = document.getElementById('controls');
        const infoBarHeight = infoBar ? infoBar.offsetHeight : 0;
        const controlsHeight = controls ? controls.offsetHeight : 0;
        const width = window.innerWidth;
        const height = window.innerHeight - infoBarHeight - controlsHeight;
        this.renderer.resize(width, height);
    }

    updateFoodScalingFactor() {
        const P_default = 20;
        const P_new = this.maxAgents;
        const populationScaleFactor = P_new / P_default;
        this.finalFoodSpawnMultiplier = this.foodSpawnRate * populationScaleFactor;
    }

    async loadGenePools() {
        try {
            this.genePools = await this.db.loadAllGenePools();
        } catch (e) {
            this.logger.error("Failed to load gene pools:", e);
            this.genePools = {};
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

    async saveGenePools() {
        // Periodic save of all living agents (runs less frequently)
        try {
            // Group agents by gene ID and save top 3 per gene ID
            // Only save agents with fitness >= 50 and foodEaten >= 3
            const agentsByGene = {};
            this.agents.forEach(agent => {
                // Filter: only save high-performing agents
                if (!agent.isDead && agent.fitness >= MIN_FITNESS_TO_SAVE_GENE_POOL && agent.foodEaten >= MIN_FOOD_EATEN_TO_SAVE_GENE_POOL) {
                    if (!agentsByGene[agent.geneId]) {
                        agentsByGene[agent.geneId] = [];
                    }
                    agentsByGene[agent.geneId].push(agent);
                }
            });

            // Save top 3 per gene ID using immediate save (for periodic backup)
            for (const [geneId, geneAgents] of Object.entries(agentsByGene)) {
                const sorted = geneAgents.sort((a, b) => b.fitness - a.fitness);
                const top3 = sorted.slice(0, MAX_AGENTS_TO_SAVE_PER_GENE_POOL);
                if (top3.length > 0) {
                    await this.db.saveGenePool(geneId, top3);
                }
            }

            this.logger.log(`[DATABASE] Periodic save completed for ${Object.keys(agentsByGene).length} gene pools`);
        } catch (e) {
            this.logger.error("Failed to save gene pools:", e);
        }
    }

    initPopulation() {
        const center_x = this.worldWidth / 2;
        const center_y = this.worldHeight / 2;
        const startingAgentCount = Math.min(10, this.maxAgents);

        // Spawn 3 agents right in the center
        for (let i = 0; i < 3; i++) {
            this.spawnAgent({
                x: center_x + randomGaussian(0, 100),
                y: center_y + randomGaussian(0, 100),
                energy: INITIAL_AGENT_ENERGY
            });
        }

        // Spawn remaining agents (try to use gene pools if available)
        for (let i = 3; i < startingAgentCount; i++) {
            let gene = null;
            // Try to get weights from any gene pool
            const geneIds = Object.keys(this.genePools);
            if (geneIds.length > 0) {
                const randomGeneId = geneIds[Math.floor(Math.random() * geneIds.length)];
                const pool = this.genePools[randomGeneId];
                if (pool && pool.length > 0) {
                    gene = { weights: pool[Math.floor(Math.random() * pool.length)].weights };
                }
            }
            this.spawnAgent({ gene: gene, energy: INITIAL_AGENT_ENERGY });
        }

        // Initial food - spread evenly across the entire world
        // Increased to give agents better chance to find food and learn
        const initialFoodCount = Math.min(FOOD_SPAWN_CAP, 400); // Max 400 initial food (doubled for learning)

        for (let i = 0; i < initialFoodCount; i++) {
            const pos = this.randomSpawnAvoidCluster();
            const isHighValue = Math.random() < HIGH_VALUE_FOOD_CHANCE;
            this.food.push(new Food(pos.x, pos.y, isHighValue));
        }
    }

    randomSpawnAvoidCluster() {
        let x, y, safe = false;
        const attempts = 10;
        for (let i = 0; i < attempts; i++) {
            x = Math.random() * this.worldWidth;
            y = Math.random() * this.worldHeight;
            safe = true;

            if (this.obstacles.some(o => distance(x, y, o.x, o.y) < o.radius + 50)) {
                safe = false;
                continue;
            }
            if (this.agents.some(a => distance(x, y, a.x, a.y) < 50)) {
                safe = false;
                continue;
            }
            if (safe) break;
        }
        return { x, y };
    }

    spawnAgent(options = {}) {
        const {
            gene = null,
            x,
            y,
            energy = INITIAL_AGENT_ENERGY
        } = options;

        let startX, startY;
        const startEnergy = energy;

        if (x !== undefined && y !== undefined) {
            startX = x;
            startY = y;
        } else {
            const pos = this.randomSpawnAvoidCluster();
            startX = pos.x;
            startY = pos.y;
        }

        this.agentSpawnQueue.push(new Agent(gene, startX, startY, startEnergy, this.logger, null, this));
    }

    spawnFood() {
        if (this.food.length >= FOOD_SPAWN_CAP) return;

        // Increased base spawn chance from 0.1 to 0.15 for more food availability
        const foodSpawnChance = 0.15 * this.finalFoodSpawnMultiplier * this.foodScarcityFactor * (1 - (this.agents.length / (this.maxAgents * 1.5)));
        if (Math.random() > foodSpawnChance) return;

        let x, y, isHighValue = false;
        const pos = this.randomSpawnAvoidCluster();
        x = pos.x;
        y = pos.y;

        if (Math.random() < HIGH_VALUE_FOOD_CHANCE) isHighValue = true;

        this.food.push(new Food(x, y, isHighValue));
    }

    spawnPheromone(x, y, type) {
        const puff = new PheromonePuff(x, y, type);
        this.pheromones.push(puff);
    }

    crossover(weightsA, weightsB) {
        const crossoverMatrix = (a, b) => {
            const rows = a.length, cols = a[0].length;
            const splitRow = Math.floor(Math.random() * rows);
            const newMatrix = [];
            for (let i = 0; i < rows; i++) {
                if (i < splitRow) newMatrix.push([...a[i]]);
                else newMatrix.push([...b[i]]);
            }
            return newMatrix;
        };

        return {
            weights1: crossoverMatrix(weightsA.weights1, weightsB.weights1),
            weights2: crossoverMatrix(weightsA.weights2, weightsB.weights2),
        };
    }

    selection(geneId) {
        const pool = this.genePools[geneId];
        if (!pool || pool.length === 0) return null;

        // Sort by fitness once
        const sorted = [...pool].sort((a, b) => b.fitness - a.fitness);

        // Select the first parent from the elite (top 3)
        const eliteSize = Math.min(3, sorted.length);
        const parent1Data = sorted[Math.floor(Math.random() * eliteSize)];

        // CRITICAL: If specialization is missing (old data), we can't safely mate.
        if (!parent1Data.specializationType) {
            this.logger.warn(`[LIFECYCLE] Gene pool data for ${geneId} is outdated. Cloning parent to be safe.`);
            return this.crossover(parent1Data.weights, parent1Data.weights);
        }

        const parent1Weights = parent1Data.weights;
        const parent1Specialization = parent1Data.specializationType;

        // Filter the pool to find compatible mates (same specialization)
        const compatibleMates = sorted.filter(agentData => agentData.specializationType === parent1Specialization);

        if (compatibleMates.length < 2) {
            // Not enough compatible mates, so just clone the single parent.
            return this.crossover(parent1Weights, parent1Weights);
        }

        // Select a *different* second parent from the compatible mates
        const otherMates = compatibleMates.filter(m => m !== parent1Data);
        const parent2Data = otherMates[Math.floor(Math.random() * otherMates.length)];
        const parent2Weights = parent2Data.weights;

        return this.crossover(parent1Weights, parent2Weights);
    }

    repopulate() {
        // Count only living agents for population limit
        const livingAgents = this.agents.filter(a => !a.isDead).length;
        if (livingAgents >= this.maxAgents) return;

        this.respawnTimer++;
        if (this.respawnTimer < RESPAWN_DELAY_FRAMES) return;

        // Calculate how many agents to spawn to fill the population
        const agentsToSpawn = Math.min(this.maxAgents - livingAgents, 10); // Cap at 10 per frame for performance

        for (let i = 0; i < agentsToSpawn; i++) {
            const roll = Math.random();

            // CRITICAL FIX: Reduced elitism from 60% to 30% to promote diversity
            // 30% chance for Elitism
            if (roll < 0.3) {
                // Elitism: Pick the absolute best agent from EITHER living agents OR the gene pool
                let bestLivingAgent = null;
                if (this.agents.length > 0) {
                    this.agents.sort((a, b) => b.fitness - a.fitness);
                    bestLivingAgent = this.agents[0];
                }

                let bestStoredAgent = null;
                let bestStoredFitness = -1;

                // Find best agent in gene pools
                for (const pool of Object.values(this.genePools)) {
                    if (pool && pool.length > 0) {
                        // Pools are already sorted by fitness descending
                        const topInPool = pool[0];
                        if (topInPool.fitness > bestStoredFitness) {
                            bestStoredFitness = topInPool.fitness;
                            bestStoredAgent = topInPool;
                        }
                    }
                }

                let eliteGene = null;

                // Compare living vs stored
                if (bestLivingAgent && (!bestStoredAgent || bestLivingAgent.fitness > bestStoredFitness)) {
                    if (bestLivingAgent.fitness > 0) {
                        eliteGene = { weights: bestLivingAgent.getWeights(), geneId: bestLivingAgent.geneId };
                    }
                } else if (bestStoredAgent) {
                    eliteGene = { weights: bestStoredAgent.weights, geneId: bestStoredAgent.geneId };
                }

                if (eliteGene) {
                    this.spawnAgent({ gene: eliteGene });
                } else {
                    // Fallback to random if no suitable elite agent found anywhere
                    this.spawnAgent({ gene: null });
                }
            }
            // 45% chance for Sexual Selection (increased from 30%)
            else if (roll < 0.75) {
                const geneIds = Object.keys(this.genePools);
                if (geneIds.length > 0) {
                    const randomGeneId = geneIds[Math.floor(Math.random() * geneIds.length)];
                    const childWeights = this.selection(randomGeneId);
                    if (childWeights) {
                        this.spawnAgent({ gene: { weights: childWeights } });
                    } else {
                        // Fallback to random if selection fails
                        this.spawnAgent({ gene: null });
                    }
                } else {
                    // Fallback to random if no gene pools
                    this.spawnAgent({ gene: null });
                }
            }
            // 20% chance for Random Generation (increased from 10%)
            else if (roll < 0.95) {
                this.spawnAgent({ gene: null });
            }
            // 5% chance for Novelty Spawning (NEW) - random specialization with moderate mutation
            else {
                const randomGeneId = Object.keys(this.genePools)[Math.floor(Math.random() * Object.keys(this.genePools).length)];
                if (randomGeneId) {
                    const pool = this.genePools[randomGeneId];
                    if (pool && pool.length > 0) {
                        const randomAgent = pool[Math.floor(Math.random() * pool.length)];
                        // Create a hybrid by forcing a different specialization
                        const allTypes = Object.values(SPECIALIZATION_TYPES);
                        const novelSpecialization = allTypes[Math.floor(Math.random() * allTypes.length)];
                        this.spawnAgent({
                            gene: {
                                weights: randomAgent.weights,
                                specializationType: novelSpecialization
                            }
                        });
                    } else {
                        this.spawnAgent({ gene: null });
                    }
                } else {
                    this.spawnAgent({ gene: null });
                }
            }
        }

        this.respawnTimer = 0;
        this.spawnFood();
    }

    calculateFitness(agent) {
        let baseScore = 0;

        // 1. Productive Actions (Contribute to Base Score)
        baseScore += agent.offspring * 400; // Reduced from 600 to balance with other rewards
        baseScore += agent.foodEaten * 200;
        baseScore += agent.kills * 15;

        if (agent.offspring > 0 && agent.foodEaten > 0) {
            baseScore += (agent.offspring * agent.foodEaten) * 5;
        }

        // 2. Efficiency and Exploration
        const efficiency = agent.distanceTravelled / (agent.energySpent || 1);
        baseScore += efficiency * 15;
        baseScore += agent.successfulEscapes * 75;

        // 3. Penalties (Applied to Base Score)
        baseScore -= agent.timesHitObstacle * 100; // CRITICAL FIX: Increased from 15 to 100 to heavily discourage wall-hitting

        // 4. Collision Avoidance Reward (NEW)
        // Reward agents that survive without hitting obstacles
        const collisionFreeFrames = Math.max(0, agent.framesAlive - (agent.timesHitObstacle * 20));
        if (collisionFreeFrames > 100) {
            baseScore += (collisionFreeFrames / 100) * 5; // +5 per 100 frames without hitting
        }

        // 5. Survival Multiplier (The most important factor)
        // This creates a positive feedback loop. A high base score is good,
        // but a high base score sustained over a long life is exponentially better.
        // The multiplier starts at 1x and increases with age.
        // An agent living for 60 seconds (3600 frames) gets a 2x multiplier on its entire life's achievements.
        const survivalMultiplier = 1 + (agent.framesAlive / 3600);

        // Final fitness is the base score amplified by how long the agent survived.
        const finalFitness = baseScore * survivalMultiplier;

        // Add a small bonus for just surviving, rewarding wall-avoiders even if they don't eat.
        // Equivalent to age * 2 (where age is in seconds) -> (frames / 60) * 2 = frames / 30
        const rawSurvivalBonus = agent.framesAlive / 30;

        return Math.max(0, finalFitness + rawSurvivalBonus);
    }

    async updateGenePools() {
        // Calculate raw fitness
        this.agents.forEach(a => a.fitness = this.calculateFitness(a));

        // Normalized fitness (relative to population)
        if (this.agents.length > 1) {
            const fitnesses = this.agents.map(a => a.fitness);
            const mean = fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length;
            const variance = fitnesses.reduce((sum, f) => sum + Math.pow(f - mean, 2), 0) / fitnesses.length;
            const stdDev = Math.sqrt(variance);

            if (stdDev > 0) {
                // Normalize fitness: (fitness - mean) / stdDev
                this.agents.forEach(a => {
                    a.normalizedFitness = (a.fitness - mean) / stdDev;
                });
            } else {
                this.agents.forEach(a => a.normalizedFitness = 0);
            }
        } else {
            this.agents.forEach(a => a.normalizedFitness = a.fitness);
        }

        // Sort by raw fitness for best agent selection
        this.agents.sort((a, b) => b.fitness - a.fitness);
        this.bestAgent = this.agents[0] || null;
        this.generation++;

        // Track fitness for adaptive mutation
        const bestFitness = this.bestAgent ? this.bestAgent.fitness : 0;
        this.fitnessHistory.push(bestFitness);
        if (this.fitnessHistory.length > this.fitnessHistorySize) {
            this.fitnessHistory.shift();
        }

        // Adaptive mutation rate
        if (this.fitnessHistory.length >= 6) {
            const recent = this.fitnessHistory.slice(-3);
            const older = this.fitnessHistory.slice(-6, -3);
            if (older.length >= 3) {
                const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
                const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
                const improvementRate = (recentAvg - olderAvg) / (Math.abs(olderAvg) || 1);

                // High mutation when stagnating, lower when improving
                // improvementRate > 0 means improving, < 0 means declining
                const stagnationFactor = Math.max(0, 1 - improvementRate * 2); // 0 to 1
                this.mutationRate = this.baseMutationRate * (0.7 + stagnationFactor * 0.6); // 0.7x to 1.3x base rate (less aggressive)
                this.mutationRate = Math.max(0.05, Math.min(0.15, this.mutationRate)); // Clamp to narrower range (5%-15%)
            }
        }

        // Update gene pools (top 10 per gene ID)
        // CRITICAL FIX: Lower threshold from 50 to 20, remove foodEaten requirement, increase pool size to 10
        const agentsByGene = {};
        this.agents.forEach(agent => {
            // Filter: only save agents with fitness >= 20 (was 50) and framesAlive >= 600 (10 seconds at 60 FPS)
            // FRAME-BASED to be independent of game speed
            if (agent.fitness >= 20 && agent.framesAlive >= 600) {
                if (!agentsByGene[agent.geneId]) {
                    agentsByGene[agent.geneId] = [];
                }
                agentsByGene[agent.geneId].push(agent);
            }
        });

        for (const [geneId, geneAgents] of Object.entries(agentsByGene)) {
            const sorted = geneAgents.sort((a, b) => b.fitness - a.fitness);
            // Save top 10 for this gene pool (increased from 3)
            if (sorted.length > 0) {
                this.genePools[geneId] = sorted.slice(0, 10).map(a => ({
                    weights: a.getWeights(),
                    fitness: a.fitness,
                    geneId: a.geneId,
                    specializationType: a.specializationType // Store specialization
                }));
            } else {
                // Prune gene pools with no qualifying agents
                delete this.genePools[geneId];
            }
        }

        await this.saveGenePools();

        // Update dashboard every generation for better visibility
        this.updateDashboard();
    }

    updateDashboard() {
        // Only count living agents for dashboard stats
        const livingAgents = this.agents.filter(a => !a.isDead);
        if (livingAgents.length === 0) return;

        // Calculate metrics
        const bestFitness = this.bestAgent ? this.bestAgent.fitness : 0;
        const geneIdCount = new Set(livingAgents.map(a => a.geneId)).size;
        const genePoolCount = Object.keys(this.genePools).length;

        // Specialization distribution
        const specializationCounts = {};
        livingAgents.forEach(a => {
            specializationCounts[a.specializationType] = (specializationCounts[a.specializationType] || 0) + 1;
        });

        // Average stats
        const avgFitness = livingAgents.reduce((sum, a) => sum + a.fitness, 0) / livingAgents.length;
        const avgAge = livingAgents.reduce((sum, a) => sum + a.framesAlive, 0) / livingAgents.length;
        const avgEnergy = livingAgents.reduce((sum, a) => sum + a.energy, 0) / livingAgents.length;
        const avgOffspring = livingAgents.reduce((sum, a) => sum + a.offspring, 0) / livingAgents.length;
        const avgOffspringMate = livingAgents.reduce((sum, a) => sum + a.childrenFromMate, 0) / livingAgents.length;
        const avgOffspringSplit = livingAgents.reduce((sum, a) => sum + a.childrenFromSplit, 0) / livingAgents.length;
        const avgFood = livingAgents.reduce((sum, a) => sum + a.foodEaten, 0) / livingAgents.length;
        const avgKills = livingAgents.reduce((sum, a) => sum + a.kills, 0) / livingAgents.length;
        const avgCollisions = livingAgents.reduce((sum, a) => sum + (a.collisions || 0), 0) / livingAgents.length;
        const avgWallHits = livingAgents.reduce((sum, a) => sum + (a.timesHitObstacle || 0), 0) / livingAgents.length;

        // NEW: Critical lifespan metrics (FRAME-BASED)
        const MATURATION_FRAMES = 900; // 15 seconds at 60 FPS - independent of game speed
        const matureAgents = livingAgents.filter(a => a.framesAlive >= MATURATION_FRAMES).length;
        const maturationRate = (matureAgents / livingAgents.length) * 100;
        const maxAge = Math.max(...livingAgents.map(a => a.framesAlive), 0);
        const maxFrames = Math.max(...livingAgents.map(a => a.framesAlive), 0);

        // NEW: Reproduction metrics
        const totalSexualOffspring = livingAgents.reduce((sum, a) => sum + (a.childrenFromMate || 0), 0);
        const totalAsexualOffspring = livingAgents.reduce((sum, a) => sum + (a.childrenFromSplit || 0), 0);

        // Calculate reproduction rate (events per minute)
        // Store previous offspring count and calculate delta
        if (!this.previousOffspringCount) this.previousOffspringCount = 0;
        if (!this.lastReproductionCheck) this.lastReproductionCheck = Date.now();

        const currentOffspringCount = totalSexualOffspring + totalAsexualOffspring;
        const offspringDelta = currentOffspringCount - this.previousOffspringCount;
        const timeDelta = (Date.now() - this.lastReproductionCheck) / 1000 / 60; // in minutes
        const reproductionRate = timeDelta > 0 ? (offspringDelta / timeDelta).toFixed(1) : 0;

        // Update tracking variables every 10 seconds
        if (timeDelta >= 0.167) { // ~10 seconds
            this.previousOffspringCount = currentOffspringCount;
            this.lastReproductionCheck = Date.now();
        }

        // NEW: Collision-free percentage
        const collisionFreeAgents = livingAgents.filter(a => (a.timesHitObstacle || 0) === 0).length;
        const collisionFreePercent = (collisionFreeAgents / livingAgents.length) * 100;

        // Count qualified agents (NEW THRESHOLD: fitness >= 20, age >= 10)
        const qualifiedAgents = livingAgents.filter(a => a.fitness >= 20 && a.framesAlive >= 600).length;

        // Learning rate (fitness improvement per generation)
        let learningRate = 0;
        if (this.fitnessHistory.length >= 2) {
            const recent = this.fitnessHistory.slice(-5);
            const older = this.fitnessHistory.slice(-10, -5);
            if (older.length > 0) {
                const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
                const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
                learningRate = (recentAvg - olderAvg) / older.length;
            }
        }

        // Fitness delta
        let fitnessDelta = 0;
        if (this.fitnessHistory.length >= 2) {
            fitnessDelta = this.fitnessHistory[this.fitnessHistory.length - 1] - this.fitnessHistory[this.fitnessHistory.length - 2];
        }

        // Update DOM - NEW METRICS
        const matureAgentsEl = document.getElementById('mature-agents');
        const totalAgentsEl = document.getElementById('total-agents');
        const maturationRateEl = document.getElementById('maturation-rate');
        const maxAgeEl = document.getElementById('max-age');

        const totalSexualOffspringEl = document.getElementById('total-sexual-offspring');
        const totalAsexualOffspringEl = document.getElementById('total-asexual-offspring');
        const reproductionRateEl = document.getElementById('reproduction-rate');
        const avgWallHitsEl = document.getElementById('avg-wall-hits');
        const collisionFreePercentEl = document.getElementById('collision-free-percent');

        if (matureAgentsEl) matureAgentsEl.textContent = matureAgents;
        if (totalAgentsEl) totalAgentsEl.textContent = livingAgents.length;
        if (maturationRateEl) {
            maturationRateEl.textContent = maturationRate.toFixed(1);
            maturationRateEl.style.color = maturationRate >= 30 ? '#0f0' : maturationRate >= 10 ? '#ff0' : '#f00';
        }
        if (maxAgeEl) maxAgeEl.textContent = maxAge.toFixed(0);
        if (totalSexualOffspringEl) totalSexualOffspringEl.textContent = totalSexualOffspring;
        if (totalAsexualOffspringEl) totalAsexualOffspringEl.textContent = totalAsexualOffspring;
        if (reproductionRateEl) reproductionRateEl.textContent = reproductionRate;
        if (avgWallHitsEl) avgWallHitsEl.textContent = avgWallHits.toFixed(1);
        if (collisionFreePercentEl) {
            collisionFreePercentEl.textContent = collisionFreePercent.toFixed(1);
            collisionFreePercentEl.style.color = collisionFreePercent >= 50 ? '#0f0' : collisionFreePercent >= 25 ? '#ff0' : '#f00';
        }

        // Update DOM - EXISTING METRICS
        const fitnessValueEl = document.getElementById('fitness-value');
        const fitnessDeltaEl = document.getElementById('fitness-delta');
        const avgFitnessValueEl = document.getElementById('avg-fitness-value');
        const diversityValueEl = document.getElementById('diversity-value');
        const genePoolValueEl = document.getElementById('gene-pool-value');
        const qualifiedAgentsValueEl = document.getElementById('qualified-agents-value');
        const mutationRateValueEl = document.getElementById('mutation-rate-value');
        const specializationListEl = document.getElementById('specialization-list');
        const avgAgeEl = document.getElementById('avg-age');
        const avgEnergyEl = document.getElementById('avg-energy');
        const avgOffspringEl = document.getElementById('avg-offspring');
        const avgOffspringMateEl = document.getElementById('avg-offspring-mate');
        const avgOffspringSplitEl = document.getElementById('avg-offspring-split');
        const avgFoodEl = document.getElementById('avg-food');
        const avgKillsEl = document.getElementById('avg-kills');
        const avgCollisionsEl = document.getElementById('avg-collisions');
        const learningRateEl = document.getElementById('learning-rate-value');

        if (fitnessValueEl) fitnessValueEl.textContent = bestFitness.toFixed(0);
        if (fitnessDeltaEl) {
            fitnessDeltaEl.textContent = (fitnessDelta >= 0 ? '+' : '') + fitnessDelta.toFixed(0);
            fitnessDeltaEl.style.color = fitnessDelta >= 0 ? '#0f0' : '#f00';
        }
        if (avgFitnessValueEl) avgFitnessValueEl.textContent = avgFitness.toFixed(1);
        if (diversityValueEl) diversityValueEl.textContent = geneIdCount;
        if (genePoolValueEl) genePoolValueEl.textContent = genePoolCount;
        if (qualifiedAgentsValueEl) {
            qualifiedAgentsValueEl.textContent = qualifiedAgents;
            qualifiedAgentsValueEl.style.color = qualifiedAgents > 0 ? '#0f0' : '#f00';
        }
        if (mutationRateValueEl) mutationRateValueEl.textContent = (this.mutationRate * 100).toFixed(1) + '%';
        if (specializationListEl) {
            const specList = Object.entries(specializationCounts)
                .map(([type, count]) => `${type}: ${count}`)
                .join(', ');
            specializationListEl.textContent = specList || 'none';
        }
        if (avgAgeEl) {
            avgAgeEl.textContent = avgAge.toFixed(1);
            // Color code based on target: green if >600f (10s), yellow if 300-600f (5-10s), red if <300f
            avgAgeEl.style.color = avgAge >= 600 ? '#0f0' : avgAge >= 300 ? '#ff0' : '#f00';
        }
        if (avgEnergyEl) avgEnergyEl.textContent = avgEnergy.toFixed(1);
        if (avgOffspringEl) avgOffspringEl.textContent = avgOffspring.toFixed(2);
        if (avgOffspringMateEl) avgOffspringMateEl.textContent = avgOffspringMate.toFixed(2);
        if (avgOffspringSplitEl) avgOffspringSplitEl.textContent = avgOffspringSplit.toFixed(2);
        if (avgFoodEl) avgFoodEl.textContent = avgFood.toFixed(1);
        if (avgKillsEl) avgKillsEl.textContent = avgKills.toFixed(2);
        if (avgCollisionsEl) avgCollisionsEl.textContent = avgCollisions.toFixed(1);
        if (learningRateEl) {
            learningRateEl.textContent = (learningRate >= 0 ? '+' : '') + learningRate.toFixed(1);
            learningRateEl.style.color = learningRate >= 0 ? '#0f0' : '#f00';
        }

        // Update fitness chart
        this.updateFitnessChart();
    }

    // Convert GPU ray tracing results to neural network inputs
    // Now uses GPU pheromone detection results instead of CPU
    convertGpuRayResultsToInputs(gpuRayResults, gpuAgents, maxRaysPerAgent) {
        if (!gpuRayResults || gpuRayResults.length === 0 || gpuAgents.length === 0) {
            return;
        }

        this.currentFrameGpuAgentIds.clear();
        this.rayHits = 0;

        for (let agentIdx = 0; agentIdx < gpuAgents.length; agentIdx++) {
            const agent = gpuAgents[agentIdx];
            if (!agent) continue;

            const inputs = [];
            const rayData = [];
            // Use this agent's specific number of rays, but cap it at the max the GPU can handle
            const numSensorRays = agent.numSensorRays;
            const numAlignmentRays = agent.numAlignmentRays;
            const raysToProcess = Math.min(numSensorRays, maxRaysPerAgent);


            if (numSensorRays === 0) {
                // Agent might have 0 rays by design, give it default inputs
                agent.lastInputs = [0, 0, 0, 0, 0, 0.5, 0.5, 0, 0, 0, 0];
                agent.lastRayData = [];
                continue;
            }

            const sensorAngleStep = TWO_PI / numSensorRays;
            const maxRayDist = agent.maxRayDist;

            for (let rayIdx = 0; rayIdx < raysToProcess; rayIdx++) {
                const globalRayIdx = agentIdx * maxRaysPerAgent + rayIdx;
                const offset = globalRayIdx * 4; // Each ray result is 4 floats

                if (offset + 3 >= gpuRayResults.length) {
                    this.logger.error(`GPU result buffer out of bounds for sensor ray`, { agentIdx, rayIdx, offset });
                    continue;
                }

                const distance = gpuRayResults[offset];
                const hitType = gpuRayResults[offset + 1];
                const entityId = gpuRayResults[offset + 2];
                const entitySize = gpuRayResults[offset + 3]; // Read entity size for agent differentiation

                const isHit = hitType > 0 && distance < maxRayDist;

                // Debug: Log GPU raw results for first few rays (disabled - working correctly)
                // if (agentIdx === 0 && rayIdx < 10 && this.frameCount % 60 === 0) {
                //     const hitTypeNames = {0: 'none', 1: 'edge', 2: 'food', 3: 'agent', 4: 'obstacle'};
                //     this.logger.log(`[GPU-RAY-DEBUG] Agent 0, Ray ${rayIdx}: hitType=${hitType} (${hitTypeNames[hitType] || 'unknown'}), dist=${distance.toFixed(1)}, maxDist=${maxRayDist}`);
                // }

                const normalizedDist = 1.0 - (Math.min(distance, maxRayDist) / maxRayDist);

                if (isNaN(normalizedDist)) {
                    this.logger.error('[GPU-CONVERT] normalizedDist became NaN!', {
                        agentId: agent.geneId,
                        agentSpecialization: agent.specializationType,
                        rawDistance: distance,
                        agentMaxRayDist: maxRayDist
                    });
                    // Set to a safe value to prevent crashing the NN
                    inputs.push(0);
                } else {
                    inputs.push(normalizedDist);
                }

                let hitTypeArray = [0, 0, 0, 0];
                let hitTypeName = 'none';
                if (isHit) {
                    this.rayHits++;
                    if (hitType === 1) { // Wall
                        hitTypeArray = [0, 0, 0, 1]; hitTypeName = 'edge';
                    } else if (hitType === 2) { // Food
                        hitTypeArray = [1, 0, 0, 0]; hitTypeName = 'food';
                    } else if (hitType === 3) { // Agent - differentiate by size
                        const agentSize = agent.size;
                        if (entitySize > agentSize * 1.1) {
                            // Larger agent (threat/predator)
                            hitTypeArray = [0, 1, 0, 0]; hitTypeName = 'larger';
                        } else if (entitySize < agentSize * 0.9) {
                            // Smaller agent (prey)
                            hitTypeArray = [0, 0, 1, 0]; hitTypeName = 'smaller';
                        } else {
                            // Same size agent
                            hitTypeArray = [0, 1, 1, 0]; hitTypeName = 'same';
                        }
                    } else if (hitType === 4) { // Obstacle
                        hitTypeArray = [0, 0, 0, 1]; hitTypeName = 'obstacle';
                    }
                }
                inputs.push(...hitTypeArray);

                const angle = agent.angle + (rayIdx - numSensorRays / 2) * sensorAngleStep;

                rayData.push({
                    angle,
                    dist: distance,
                    hit: isHit,
                    type: 'sensor',
                    hitType: hitTypeName,
                    hitTypeValue: hitType
                });
            }

            // --- Process alignment rays (simplified - just add normalized distances) ---
            // Alignment rays are not currently supported by GPU shader, so we add placeholder values
            // These should match what the CPU path would calculate
            for (let rayIdx = 0; rayIdx < numAlignmentRays; rayIdx++) {
                // For now, use a default value of 0.5 (mid-range) as placeholder
                // TODO: Implement proper alignment ray tracing in GPU shader
                inputs.push(0.5);

                const angle = agent.angle + (rayIdx - numAlignmentRays / 2) * (TWO_PI / numAlignmentRays);
                rayData.push({
                    angle,
                    dist: maxRayDist * 0.5, // Approximate mid-range
                    hit: false,
                    type: 'alignment',
                    hitType: 'none'
                });
            }

            // --- Add other inputs (pheromones, energy, etc.) ---
            // Detect pheromones using quadtree proximity search
            let dangerSmell = 0;
            let attackSmell = 0;
            let inShadow = false;

            // Pheromone detection
            const smellRadius = new Rectangle(
                agent.x - PHEROMONE_RADIUS,
                agent.y - PHEROMONE_RADIUS,
                PHEROMONE_DIAMETER,
                PHEROMONE_DIAMETER
            );
            const nearbyPuffs = this.quadtree.query(smellRadius);
            for (const entity of nearbyPuffs) {
                if (entity.data instanceof PheromonePuff) {
                    const pheromone = entity.data;
                    const dist = distance(agent.x, agent.y, pheromone.x, pheromone.y);
                    if (dist < PHEROMONE_RADIUS) {
                        const intensity = 1.0 - (dist / PHEROMONE_RADIUS);
                        if (pheromone.type === 'danger') {
                            dangerSmell = Math.max(dangerSmell, intensity);
                        } else if (pheromone.type === 'attack') {
                            attackSmell = Math.max(attackSmell, intensity);
                        }
                    }
                }
            }

            // Obstacle shadow detection
            for (const obs of this.obstacles) {
                const dist = distance(agent.x, agent.y, obs.x, obs.y);
                if (dist < obs.radius + OBSTACLE_HIDING_RADIUS) {
                    inShadow = true;
                    break;
                }
            }

            agent.dangerSmell = dangerSmell;
            agent.attackSmell = attackSmell;

            // Debug: Log pheromone detection for first agent (disabled by default)
            // if (agentIdx === 0 && (dangerSmell > 0 || attackSmell > 0) && this.frameCount % 60 === 0) {
            //     this.logger.log(`[PHEROMONE-GPU-DEBUG] Agent 0 detected:`, {
            //         dangerSmell: dangerSmell.toFixed(2),
            //         attackSmell: attackSmell.toFixed(2),
            //         nearbyPheromones: nearbyPuffs.filter(e => e.data instanceof PheromonePuff).length
            //     });
            // }

            const currentSpeed = Math.sqrt(agent.vx * agent.vx + agent.vy * agent.vy);
            const velocityAngle = Math.atan2(agent.vy, agent.vx);
            const angleDifference = (velocityAngle - agent.angle + Math.PI * 3) % TWO_PI - Math.PI;

            inputs.push((MAX_ENERGY - agent.energy) / MAX_ENERGY); // Hunger
            inputs.push(Math.min(agent.dangerSmell, 1)); // Fear
            inputs.push(Math.min(agent.attackSmell + (agent.energy / OBESITY_THRESHOLD_ENERGY), 1)); // Aggression
            inputs.push(agent.energy / MAX_ENERGY); // Energy ratio
            inputs.push(Math.min(agent.age / 60, 1)); // Age ratio
            inputs.push(currentSpeed / MAX_VELOCITY); // Speed ratio
            inputs.push(angleDifference / Math.PI); // Velocity-angle difference
            inputs.push(inShadow ? 1 : 0); // In obstacle shadow

            // Recent memory (temporal awareness) - adds 8 inputs
            inputs.push(agent.previousVelocities[1].vx / MAX_VELOCITY); // Previous velocity X (1 frame ago)
            inputs.push(agent.previousVelocities[1].vy / MAX_VELOCITY); // Previous velocity Y (1 frame ago)
            inputs.push(agent.previousVelocities[2].vx / MAX_VELOCITY); // Previous velocity X (2 frames ago)
            inputs.push(agent.previousVelocities[2].vy / MAX_VELOCITY); // Previous velocity Y (2 frames ago)
            inputs.push((agent.previousEnergies[0] - agent.energy) / MAX_ENERGY); // Energy delta (last frame)
            inputs.push(Math.min(agent.previousDanger[1], 1)); // Previous danger (1 frame ago)
            inputs.push(Math.min(agent.previousAggression[1], 1)); // Previous aggression (1 frame ago)
            inputs.push((agent.previousEnergies[1] - agent.previousEnergies[2]) / MAX_ENERGY); // Energy delta (2 frames ago)

            agent.lastInputs = inputs;
            agent.lastRayData = rayData;

            if (inputs.some(isNaN)) {
                this.logger.error('[GPU PERCEPTION] NaN detected in GPU perception inputs', { agentId: agent.geneId, inputs });
            }
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

    checkCollisions() {
        // OPTIMIZED: Collision detection using distance squared to avoid sqrt
        // Limit collision checks per agent to avoid O(n²) scaling
        const numAgents = this.agents.length;
        for (let i = 0; i < numAgents; i++) {
            const agent = this.agents[i];
            if (!agent || agent.isDead) continue;

            const agentSize = agent.size;
            // Reuse pre-allocated Rectangle
            this.collisionQueryRange.x = agent.x;
            this.collisionQueryRange.y = agent.y;
            this.collisionQueryRange.w = agent.diameter;
            this.collisionQueryRange.h = agent.diameter;

            const nearby = this.quadtree.query(this.collisionQueryRange);

            // Limit checks per agent for performance (check closest entities first)
            let checked = 0;
            const maxChecks = 12; // OPTIMIZED: Reduced from 15 to 12

            const nearbyLen = nearby.length;
            for (let j = 0; j < nearbyLen && checked < maxChecks; j++) {
                const other = nearby[j];
                if (agent === other || other.isDead || other instanceof PheromonePuff) continue;
                checked++;

                const dx = agent.x - other.x;
                const dy = agent.y - other.y;
                const distSq = dx * dx + dy * dy;
                const otherSize = other.size || 5;
                const combinedSize = agentSize + otherSize;
                const combinedSizeSq = combinedSize * combinedSize;

                // Use squared distance for comparison (faster, no sqrt needed)
                if (distSq < combinedSizeSq) {
                    agent.collisions++; // Increment collision counter

                    if (other.isFood) {
                        agent.energy += other.energyValue;
                        agent.foodEaten++;
                        agent.fitness += 15; // Immediate fitness reward for food
                        other.isDead = true;
                        // Food collision logging disabled for performance
                    } else if (other instanceof Agent) {
                        // Simple bump physics to prevent overlap
                        const overlap = combinedSize - Math.sqrt(distSq);
                        if (overlap > 0) {
                            const dist = Math.sqrt(distSq) || 1;
                            const pushX = (dx / dist) * overlap * 0.5;
                            const pushY = (dy / dist) * overlap * 0.5;
                            agent.x += pushX;
                            agent.y += pushY;
                            other.x -= pushX;
                            other.y -= pushY;
                        }
                        // Agent collision logging disabled for performance

                        if (agent.wantsToReproduce && other.wantsToReproduce) {
                            if (agent.tryMate(other, this)) {
                                this.logger.log(`[LIFECYCLE] Agent ${agent.geneId} successfully mated with ${other.geneId}.`);
                            }
                        }

                        if (agent.wantsToAttack && agentSize > other.size * 1.1) {
                            agent.energy += other.energy * 0.8;
                            agent.kills++;
                            agent.fitness += 20; // Reward for successful kill
                            other.isDead = true;
                            this.logger.log(`[COMBAT] Agent ${agent.geneId} killed agent ${other.geneId}.`);
                        }
                    }
                }
            }
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
                this.spawnPheromone(this.worldWidth * Math.random(), this.worldHeight * Math.random(), 'danger');
            }
        }
    }

    updateInfo() {
        // Count only living agents for display
        const livingAgents = this.agents.filter(a => !a.isDead);
        document.getElementById('info-pop').innerText = `Population: ${livingAgents.length}/${this.maxAgents}`;
        if (this.bestAgent) {
            document.getElementById('info-best').innerText = `Best Agent: F: ${this.bestAgent.fitness.toFixed(0)}, A: ${this.bestAgent.framesAlive}f, O: ${this.bestAgent.offspring}, K: ${this.bestAgent.kills}, Fd: ${this.bestAgent.foodEaten}, C: ${this.bestAgent.collisions || 0}, RH: ${this.bestAgent.rayHits || 0}`;
        }
        document.getElementById('info-gen').innerText = `Generation: ${this.generation}`;
        document.getElementById('info-genepools').innerText = `Gene Pools: ${Object.keys(this.genePools).length}`;
        const avgEnergy = livingAgents.length > 0 ? livingAgents.reduce((acc, a) => acc + a.energy, 0) / livingAgents.length : 0;
        document.getElementById('info-avg-e').innerText = `Avg. Energy: ${avgEnergy.toFixed(0)} | Scarcity: ${this.foodScarcityFactor.toFixed(2)}`;
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

        // Rebuild quadtree (needed for spatial queries, but expensive)
        // Only rebuild once per frame, not per gameSpeed iteration
        this.quadtree = new Quadtree(new Rectangle(this.worldWidth / 2, this.worldHeight / 2, this.worldWidth / 2, this.worldHeight / 2), 4);

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
        this.repopulate();

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
            this.applyEnvironmentEvents();

            // OPTIMIZED: Rebuild quadtree less frequently - only every 5 iterations or on last iteration
            if (i % 5 === 0 || i === iterations - 1) {
                this.quadtree = new Quadtree(new Rectangle(this.worldWidth / 2, this.worldHeight / 2, this.worldWidth / 2, this.worldHeight / 2), 4);
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
                        this.convertGpuRayResultsToInputs(gpuRayResults, activeAgents, maxRaysPerAgent);
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

            this.checkCollisions();

            // OPTIMIZED: Only remove dead entities on last iteration to avoid index issues
            // This also reduces the number of array operations
            if (i === iterations - 1) {
                // Process dead agents - queue qualifying ones for database save
                for (let j = this.agents.length - 1; j >= 0; j--) {
                    const agent = this.agents[j];
                    if (agent && agent.isDead) {
                        // Check if agent qualifies for saving (fitness >= 50 and foodEaten >= 3)
                        if (agent.fitness >= MIN_FITNESS_TO_SAVE_GENE_POOL && agent.foodEaten >= MIN_FOOD_EATEN_TO_SAVE_GENE_POOL) {
                            this.deadAgentQueue.push(agent);
                        }
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
                if (this.frameCount % 100 === 0) this.updateInfo();
                if (this.frameCount % 500 === 0) this.updateGenePools();
                // Update dashboard more frequently for better real-time feedback
                if (this.frameCount % 30 === 0) this.updateDashboard();
                // Periodic backup save every 3000 frames (~30 seconds at 10x speed)
                if (this.frameCount % 3000 === 0) {
                    this.saveGenePools().catch(e => this.logger.error('Periodic save failed:', e));
                }
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