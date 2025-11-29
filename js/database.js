import { MAX_AGENTS_TO_SAVE_PER_GENE_POOL, MAX_GENE_POOLS, WORKER_REQUEST_TIMEOUT_MS } from "./constants.js";
import { toast } from './toast.js';

// --- IndexedDB WRAPPER FOR GENE POOL STORAGE (With Worker) ---
// Uses a Web Worker to avoid blocking the simulation thread

export class GenePoolDatabase {
    constructor(logger) {
        this.logger = logger;
        this.worker = null;
        this.messageId = 0;
        this.pendingRequests = new Map();
        this.saveQueue = []; // Queue for pending save operations (individual agents)
        this.isProcessingQueue = false;
        this.pool = {};
        this.geneIds = [];

        // Intelligent cache management for long-term stability
        this.cacheAccessTimes = new Map(); // geneId -> lastAccessTime
        this.cacheSizeHistory = []; // Track cache size over time
        this.maxCacheSize = MAX_GENE_POOLS; // Default limit
        this.lastCacheTrimTime = Date.now();
        this.cacheTrimIntervalMs = 30 * 60 * 1000; // 30 minutes
    }

    async init() {
        return new Promise((resolve, reject) => {
            try {
                // Worker file is in public/ folder, served at root in both dev and production
                // Files in public/ are automatically served at root by Vite
                const workerPath = '/database-worker.js';
                this.worker = new Worker(workerPath, { type: 'module' });

                this.worker.onmessage = (e) => {
                    const { id, success, result, error } = e.data;
                    const pending = this.pendingRequests.get(id);

                    if (pending) {
                        if (pending.timeoutId) clearTimeout(pending.timeoutId);
                        this.pendingRequests.delete(id);
                        if (success) {
                            pending.resolve(result);
                        } else {
                            this.logger.error('[DATABASE] Worker error:', error);
                            pending.reject(new Error(error));
                        }
                    }
                };

                this.worker.onerror = (error) => {
                    this.logger.error('[DATABASE] Worker error:', error);
                    reject(error);
                };

                // Initialize the worker's database
                this.sendMessage('init', {
                    maxGenePools: MAX_GENE_POOLS,
                    maxAgentsPerPool: MAX_AGENTS_TO_SAVE_PER_GENE_POOL
                })
                    .then(() => {
                        this.logger.log('[DATABASE] Worker initialized successfully.');
                        resolve();
                    })
                    .catch(reject);

            } catch (error) {
                this.logger.error('[DATABASE] Failed to create worker:', error);
                reject(error);
            }
        });
    }

    sendMessage(action, payload) {
        return new Promise((resolve, reject) => {
            const id = this.messageId++;

            // Add 5 second timeout
            const timeoutId = setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`Worker request '${action}' timed out after ${WORKER_REQUEST_TIMEOUT_MS}ms`));
                }
            }, WORKER_REQUEST_TIMEOUT_MS);

            this.pendingRequests.set(id, { resolve, reject, timeoutId });
            this.worker.postMessage({ id, action, payload });
        });
    }

    // Queue a save operation (non-blocking)
    queueSaveGenePool(geneId, agents) {
        // Prevent queue from growing indefinitely
        if (this.saveQueue.length >= 50) {
            // Drop new requests if queue is full to preserve memory
            // This is preferable to crashing the simulation
            return;
        }

        // Prepare agent data (convert to plain objects)
        // First filter for agents that meet minimum quality criteria (this.fit is true)
        const qualifiedAgents = agents.filter(a => a.geneId === geneId && a.fit);

        // Deduplicate by agent ID to prevent saving the same agent multiple times
        const uniqueAgents = qualifiedAgents.filter((agent, index, self) =>
            index === self.findIndex(a => a.id === agent.id)
        );

        const agentData = uniqueAgents
            .sort((a, b) => b.fitness - a.fitness)
            .slice(0, MAX_AGENTS_TO_SAVE_PER_GENE_POOL) // Take top N from qualified agents
            .map(a => ({
                id: a.id,
                weights: a.getWeights(),
                fitness: a.fitness,
                geneId: a.geneId,
                specializationType: a.specializationType
            }));

        if (agentData.length === 0) return;

        // Add to queue
        this.saveQueue.push({ geneId, agents: agentData });

        // Process queue asynchronously
        this.processQueue();
    }

    // Queue individual agent for saving (called from game.js)
    queueSaveAgent(agent) {
        // Only save agents that meet minimum criteria
        if (!agent.fit) return;

        const geneId = agent.geneId;
        const agentFitness = agent.fitness;

        // Check if this gene pool already exists
        const poolExists = this.pool[geneId] !== undefined;

        if (poolExists) {
            // CASE 1: Existing gene pool - must beat worst of top 10
            const existingPool = this.pool[geneId];

            if (existingPool.length >= MAX_AGENTS_TO_SAVE_PER_GENE_POOL) {
                // Pool is full (10 agents), check if new agent beats the worst
                const worstInPool = existingPool[existingPool.length - 1]; // Pool is sorted, last is worst

                if (agentFitness <= worstInPool.fitness) {
                    // New agent is weaker than worst in pool, reject
                    this.logger.log(`[DATABASE] Rejected agent ${agent.id} (fitness: ${agentFitness.toFixed(1)}) - weaker than worst in pool for ${geneId} (worst: ${worstInPool.fitness.toFixed(1)})`);
                    return;
                }
            }

            // Agent either fills empty slot or beats worst agent, proceed to queue
            this.logger.log(`[DATABASE] Queueing agent ${agent.id} for existing pool ${geneId} (fitness: ${agentFitness.toFixed(1)})`);
        } else {
            // CASE 2: New gene pool - check if we're at 500 pool limit
            const currentPoolCount = this.getGenePoolCount();

            if (currentPoolCount >= MAX_GENE_POOLS) {
                // At capacity - new gene must beat weakest existing pool
                const weakest = this.getWeakestGenePool();

                if (weakest && agentFitness <= weakest.maxFitness) {
                    // New gene is weaker than weakest pool, reject
                    this.logger.log(`[DATABASE] Rejected new gene ${geneId} (fitness: ${agentFitness.toFixed(1)}) - weaker than weakest pool ${weakest.geneId} (max: ${weakest.maxFitness.toFixed(1)}). Pool at capacity (${currentPoolCount}/${MAX_GENE_POOLS})`);
                    return;
                }

                // New gene beats weakest pool - will replace it
                this.logger.log(`[DATABASE] New gene ${geneId} (fitness: ${agentFitness.toFixed(1)}) will replace weakest pool ${weakest.geneId} (max: ${weakest.maxFitness.toFixed(1)})`);
                // Note: Actual removal happens in processQueue to avoid async issues
            } else {
                this.logger.log(`[DATABASE] Queueing agent ${agent.id} for NEW pool ${geneId} (fitness: ${agentFitness.toFixed(1)}). Pool count: ${currentPoolCount}/${MAX_GENE_POOLS}`);
            }
        }

        // Prevent queue from growing indefinitely
        if (this.saveQueue.length >= 50) {
            return;
        }

        // Add agent to queue
        this.saveQueue.push({
            geneId: agent.geneId,
            agent: {
                id: agent.id,
                weights: agent.getWeights(),
                fitness: agent.fitness,
                geneId: agent.geneId,
                specializationType: agent.specializationType
            }
        });

        // Process queue asynchronously
        this.processQueue();
    }

    async processQueue() {
        if (this.isProcessingQueue || this.saveQueue.length === 0) return;

        this.isProcessingQueue = true;

        // Group agents by geneId for efficient batching
        const agentsByGene = {};

        // Process the queue - handle both individual agents and batch saves
        while (this.saveQueue.length > 0) {
            const item = this.saveQueue.shift();

            if (item.agent) {
                // Individual agent save
                if (!agentsByGene[item.geneId]) {
                    agentsByGene[item.geneId] = [];
                }
                agentsByGene[item.geneId].push(item.agent);
            } else if (item.agents) {
                // Batch save (legacy format)
                if (!agentsByGene[item.geneId]) {
                    agentsByGene[item.geneId] = [];
                }
                agentsByGene[item.geneId].push(...item.agents);
            }
        }

        // Identify new gene pools (not in this.pool yet)
        const newGenePools = [];
        for (const geneId of Object.keys(agentsByGene)) {
            if (!this.pool[geneId]) {
                newGenePools.push(geneId);
            }
        }

        // Enforce 500 pool limit BEFORE adding new pools
        if (newGenePools.length > 0) {
            const currentPoolCount = this.getGenePoolCount();
            const wouldExceedLimit = currentPoolCount + newGenePools.length > MAX_GENE_POOLS;

            if (wouldExceedLimit) {
                const poolsToRemove = Math.min(newGenePools.length, currentPoolCount + newGenePools.length - MAX_GENE_POOLS);

                this.logger.log(`[DATABASE] Pool at capacity (${currentPoolCount}/${MAX_GENE_POOLS}). Removing ${poolsToRemove} weakest pool(s) to make room for new genes.`);

                // Remove weakest pools
                for (let i = 0; i < poolsToRemove; i++) {
                    const weakest = this.getWeakestGenePool();
                    if (weakest) {
                        this.logger.log(`[DATABASE] Removing weakest pool: ${weakest.geneId} (max fitness: ${weakest.maxFitness.toFixed(1)})`);
                        await this.removeGenePool(weakest.geneId);
                    }
                }
            }
        }

        // Process each gene pool
        const promises = [];
        for (const [geneId, newAgents] of Object.entries(agentsByGene)) {
            // 1. Get existing agents from this.pool
            const existingAgents = this.pool[geneId] || [];

            // 2. Merge existing agents with new agents
            const allAgents = [...existingAgents, ...newAgents];

            // 3. Deduplicate by agent ID
            const uniqueAgents = allAgents.filter((agent, index, self) =>
                index === self.findIndex(a => a.id === agent.id)
            );

            // 4. Sort by fitness (descending)
            const sorted = uniqueAgents.sort((a, b) => b.fitness - a.fitness);

            // 5. Keep only top agents  per gene pool
            const topAgents = sorted.slice(0, MAX_AGENTS_TO_SAVE_PER_GENE_POOL);

            // 6. Update in-memory pool with the BEST agents
            const wasNewPool = !existingAgents || existingAgents.length === 0;
            this.pool[geneId] = topAgents;

            // 7. Show toast notification for new agents added
            for (const newAgent of newAgents) {
                // Find position of this agent in the final top agents
                const position = topAgents.findIndex(a => a.id === newAgent.id) + 1;

                if (position > 0) { // Agent made it into top 10
                    // Check if a pool was replaced for this gene
                    let replacedGene = null;
                    if (wasNewPool && newGenePools.includes(geneId)) {
                        // This was a new pool, check if we replaced a weak pool
                        // Note: replacement already happened earlier in processQueue
                        // We can't easily track which pool was replaced here
                    }

                    toast.showAgentAdded(
                        geneId,
                        newAgent.fitness,
                        position,
                        topAgents.length,
                        replacedGene
                    );
                }
            }

            // 8. Queue save to IndexedDB with the BEST agents
            promises.push(
                this.sendMessage('saveGenePool', { geneId, agents: topAgents })
                    .catch(error => this.logger.error(`[DATABASE] Error saving gene pool for ${geneId}:`, error))
            );
        }

        // Wait for all saves to complete
        await Promise.allSettled(promises);

        // Final verification: Ensure we never exceed 500 pools
        const finalPoolCount = this.getGenePoolCount();
        if (finalPoolCount > MAX_GENE_POOLS) {
            this.logger.error(`[DATABASE] CRITICAL: Pool count exceeded limit! Current: ${finalPoolCount}, Max: ${MAX_GENE_POOLS}`);
        }

        this.isProcessingQueue = false;
    }

    // Immediate save (for periodic saves)
    async saveGenePool(geneId, agents) {
        if (!this.worker) await this.init();

        // Prepare new agents data
        const newAgentsData = agents
            .filter(a => a.geneId === geneId)
            .map(a => ({
                id: a.id,
                weights: a.getWeights(),
                fitness: a.fitness,
                geneId: a.geneId,
                specializationType: a.specializationType
            }));

        if (newAgentsData.length === 0) return;

        // 1. Get existing agents from this.pool
        const existingAgents = this.pool[geneId] || [];

        // 2. Merge existing agents with new agents
        const allAgents = [...existingAgents, ...newAgentsData];

        // 3. Deduplicate by agent ID
        const uniqueAgents = allAgents.filter((agent, index, self) =>
            index === self.findIndex(a => a.id === agent.id)
        );

        // 4. Sort by fitness (descending)
        const sorted = uniqueAgents.sort((a, b) => b.fitness - a.fitness);

        // 5. Keep only top agents
        const topAgents = sorted.slice(0, MAX_AGENTS_TO_SAVE_PER_GENE_POOL);

        // 6. Update in-memory pool with the BEST agents
        this.pool[geneId] = topAgents;

        try {
            await this.sendMessage('saveGenePool', { geneId, agents: topAgents });
            this.logger.log(`[DATABASE] Saved gene pool for ${geneId}`, {
                count: topAgents.length,
                fitness: topAgents[0]?.fitness
            });
        } catch (error) {
            this.logger.error(`[DATABASE] Error saving gene pool for ${geneId}:`, error);
        }
    }

    async loadGenePool(geneId) {
        if (!this.worker) await this.init();
        return await this.sendMessage('loadGenePool', { geneId });
    }

    async loadAllGenePools() {
        if (!this.worker) await this.init();
        this.logger.log('[DATABASE] Loading all gene pools...');
        this.pool = await this.sendMessage('loadAllGenePools', {});
    }

    async clearAll() {
        if (!this.worker) await this.init();

        this.logger.log('[DATABASE] Clearing all gene pools...');
        await this.sendMessage('clearAll', {});
        this.logger.log('[DATABASE] All gene pools cleared successfully.');
    }

    // Ensure all queued saves are processed before shutdown
    async flush() {
        await this.processQueue();
    }

    // Get current count of unique gene pools
    getGenePoolCount() {
        return Object.keys(this.pool).length;
    }

    // Get the weakest gene pool (pool with lowest max fitness)
    getWeakestGenePool() {
        const geneIds = Object.keys(this.pool);
        if (geneIds.length === 0) return null;

        let weakestGeneId = null;
        let weakestMaxFitness = Infinity;

        for (const geneId of geneIds) {
            const pool = this.pool[geneId];
            if (pool && pool.length > 0) {
                const maxFitness = Math.max(...pool.map(a => a.fitness || 0));
                if (maxFitness < weakestMaxFitness) {
                    weakestMaxFitness = maxFitness;
                    weakestGeneId = geneId;
                }
            }
        }

        return weakestGeneId ? { geneId: weakestGeneId, maxFitness: weakestMaxFitness } : null;
    }

    // Remove a specific gene pool from in-memory and IndexedDB
    async removeGenePool(geneId) {
        // Remove from in-memory pool
        if (this.pool[geneId]) {
            delete this.pool[geneId];
            this.logger.log(`[DATABASE] Removed gene pool ${geneId} from in-memory pool`);
        }

        // Queue removal from IndexedDB
        try {
            await this.sendMessage('removeGenePoolById', { geneId });
            this.logger.log(`[DATABASE] Removed gene pool ${geneId} from IndexedDB`);
        } catch (error) {
            this.logger.error(`[DATABASE] Error removing gene pool ${geneId}:`, error);
        }
    }

    randomGeneId() {
        const geneIds = Object.keys(this.pool);
        if (geneIds.length === 0) return null;
        return geneIds[Math.floor(Math.random() * geneIds.length)];
    }

    // Helper method: Get a random agent from any gene pool
    getRandomAgent() {
        const randomGeneId = this.randomGeneId();
        if (randomGeneId) {
            this.updateCacheAccess(randomGeneId);
        }
        const pool = this.pool[randomGeneId];
        if (!pool || pool.length === 0) return null;

        const randomAgent = pool[Math.floor(Math.random() * pool.length)];
        return randomAgent;
    }

    // Helper method: Get a mating pair for a specific geneId
    getMatingPair() {
        const randomGeneId = this.randomGeneId();
        if (randomGeneId) {
            this.updateCacheAccess(randomGeneId);
        }
        const pool = this.pool[randomGeneId];
        if (!pool || pool.length === 0) return null;

        // Sort by fitness once
        const sorted = [...pool].sort((a, b) => b.fitness - a.fitness);

        // Select the first parent from the elite (top 3)
        const eliteSize = Math.min(3, sorted.length);
        const parent1Data = sorted[Math.floor(Math.random() * eliteSize)];

        // Check for specialization compatibility
        if (!parent1Data.specializationType) {
            // Old data, clone parent
            return {
                parent1: parent1Data,
                parent2: parent1Data
            };
        }

        // Filter the pool to find compatible mates (same specialization)
        const compatibleMates = sorted.filter(agentData => agentData.specializationType === parent1Data.specializationType);

        if (compatibleMates.length < 2) {
            // Not enough compatible mates, clone the single parent
            return {
                parent1: parent1Data,
                parent2: parent1Data
            };
        }

        // Select a different second parent from the compatible mates
        const otherMates = compatibleMates.filter(m => m !== parent1Data);
        const parent2Data = otherMates[Math.floor(Math.random() * otherMates.length)];

        return {
            parent1: parent1Data,
            parent2: parent2Data
        };
    }

    // Helper method: Get gene pool health statistics
    getGenePoolHealth() {
        const genePoolCount = Object.keys(this.pool).length;

        // Calculate average fitness across all gene pools
        let totalFitness = 0;
        let totalAgents = 0;
        let specializationCounts = {};

        for (const pool of Object.values(this.pool)) {
            if (pool && pool.length > 0) {
                pool.forEach(agent => {
                    totalFitness += agent.fitness;
                    totalAgents++;
                    if (agent.specializationType) {
                        specializationCounts[agent.specializationType] = (specializationCounts[agent.specializationType] || 0) + 1;
                    }
                });
            }
        }

        const avgFitness = totalAgents > 0 ? totalFitness / totalAgents : 0;

        return {
            genePoolCount,
            avgFitness,
            totalAgents,
            specializationCounts
        };
    }

    /**
     * Update cache access time for a gene pool
     * @param {string} geneId - The gene pool ID that was accessed
     */
    updateCacheAccess(geneId) {
        this.cacheAccessTimes.set(geneId, Date.now());
    }

    /**
     * Intelligent cache trimming to prevent memory bloat during long sessions
     * @param {number} sessionHours - Hours since simulation started
     */
    trimCache(sessionHours = 0) {
        const now = Date.now();
        const timeSinceLastTrim = now - this.lastCacheTrimTime;

        // Adaptive trimming frequency based on session duration
        let shouldTrim = false;
        if (sessionHours < 1) {
            shouldTrim = timeSinceLastTrim > (15 * 60 * 1000); // 15 minutes for new sessions
        } else if (sessionHours < 4) {
            shouldTrim = timeSinceLastTrim > (30 * 60 * 1000); // 30 minutes
        } else {
            shouldTrim = timeSinceLastTrim > (60 * 60 * 1000); // 1 hour for long sessions
        }

        if (!shouldTrim) return;

        this.lastCacheTrimTime = now;

        // Adaptive cache size limits based on session duration
        let maxCacheEntries = MAX_GENE_POOLS; // Base limit
        if (sessionHours > 2) maxCacheEntries = Math.max(300, MAX_GENE_POOLS * 0.8);
        if (sessionHours > 4) maxCacheEntries = Math.max(200, MAX_GENE_POOLS * 0.6);
        if (sessionHours > 8) maxCacheEntries = Math.max(100, MAX_GENE_POOLS * 0.4);
        if (sessionHours > 24) maxCacheEntries = Math.max(50, MAX_GENE_POOLS * 0.2);

        const currentSize = Object.keys(this.pool).length;

        // Track cache size history
        this.cacheSizeHistory.push({ time: now, size: currentSize });
        if (this.cacheSizeHistory.length > 20) {
            this.cacheSizeHistory.shift();
        }

        // Only trim if we're significantly over the adaptive limit
        if (currentSize <= maxCacheEntries * 1.2) {
            return;
        }

        // Sort gene pools by last access time (oldest first)
        const entries = Object.keys(this.pool).map(geneId => ({
            geneId,
            lastAccess: this.cacheAccessTimes.get(geneId) || 0,
            pool: this.pool[geneId]
        }));

        entries.sort((a, b) => a.lastAccess - b.lastAccess);

        // Remove oldest accessed gene pools until we're under the limit
        const toRemove = entries.slice(0, currentSize - maxCacheEntries);
        let removedCount = 0;

        for (const entry of toRemove) {
            // Only remove if the pool has been inactive for a significant time
            const inactiveHours = (now - entry.lastAccess) / (1000 * 60 * 60);
            const minInactiveHours = Math.max(1, sessionHours * 0.1); // 10% of session time

            if (inactiveHours > minInactiveHours) {
                delete this.pool[entry.geneId];
                this.cacheAccessTimes.delete(entry.geneId);
                removedCount++;
            }
        }

        if (removedCount > 0) {
            this.logger.debug(`[DATABASE] Trimmed cache: removed ${removedCount} inactive gene pools (${currentSize - removedCount} remaining, session: ${sessionHours.toFixed(1)}h)`);
        }
    }

    /**
     * Get cache health statistics for monitoring
     */
    getCacheHealth() {
        const now = Date.now();
        const currentSize = Object.keys(this.pool).length;
        const accessTimes = Array.from(this.cacheAccessTimes.values());

        let avgInactiveHours = 0;
        if (accessTimes.length > 0) {
            const totalInactiveMs = accessTimes.reduce((sum, time) => sum + (now - time), 0);
            avgInactiveHours = (totalInactiveMs / accessTimes.length) / (1000 * 60 * 60);
        }

        return {
            currentSize,
            maxSize: MAX_GENE_POOLS,
            avgInactiveHours,
            sizeHistory: this.cacheSizeHistory.slice(-5) // Last 5 measurements
        };
    }

    /**
     * Terminate the web worker to prevent memory leaks
     * Call this when destroying the simulation
     */
    terminate() {
        if (this.worker) {
            // Clear any pending timeouts
            for (const [id, pending] of this.pendingRequests.entries()) {
                if (pending.timeoutId) {
                    clearTimeout(pending.timeoutId);
                }
            }
            this.pendingRequests.clear();

            // Terminate the worker
            this.worker.terminate();
            this.worker = null;
            this.logger.log('[DATABASE] Worker terminated successfully');
        }

        // Clear queues
        this.saveQueue.length = 0;
        this.pool = {};
        this.geneIds.length = 0;

        // Reset cache management tracking
        this.cacheAccessTimes = new Map();
        this.cacheSizeHistory = [];
        this.lastCacheTrimTime = Date.now();

        // Initialize cache access tracking for existing pools
        for (const geneId of Object.keys(this.pool)) {
            this.cacheAccessTimes.set(geneId, Date.now());
        }
    }
}
