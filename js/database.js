import { MAX_AGENTS_TO_SAVE_PER_GENE_POOL, MAX_GENE_POOLS } from "./constants.js";

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
                    reject(new Error(`Worker request '${action}' timed out after 5000ms`));
                }
            }, 5000);

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

            // 5. Keep only top agents per gene pool
            const topAgents = sorted.slice(0, MAX_AGENTS_TO_SAVE_PER_GENE_POOL);

            // 6. Update in-memory pool with the BEST agents
            this.pool[geneId] = topAgents;

            // 7. Queue save to IndexedDB with the BEST agents
            promises.push(
                this.sendMessage('saveGenePool', { geneId, agents: topAgents })
                    .catch(error => this.logger.error(`[DATABASE] Error saving gene pool for ${geneId}:`, error))
            );
        }

        // Wait for all saves to complete
        await Promise.allSettled(promises);


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

    randomGeneId() {
        const geneIds = Object.keys(this.pool);
        if (geneIds.length === 0) return null;
        return geneIds[Math.floor(Math.random() * geneIds.length)];
    }

    // Helper method: Get a random agent from any gene pool
    getRandomAgent() {
        const randomGeneId = this.randomGeneId();
        const pool = this.pool[randomGeneId];
        if (!pool || pool.length === 0) return null;

        const randomAgent = pool[Math.floor(Math.random() * pool.length)];
        return randomAgent;
    }

    // Helper method: Get a mating pair for a specific geneId
    getMatingPair() {
        const randomGeneId = this.randomGeneId();
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
}
