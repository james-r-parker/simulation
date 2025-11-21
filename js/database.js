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
    }

    async init() {
        return new Promise((resolve, reject) => {
            try {
                this.worker = new Worker('./js/database-worker.js');

                this.worker.onmessage = (e) => {
                    const { id, success, result, error } = e.data;
                    const pending = this.pendingRequests.get(id);

                    if (pending) {
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
            this.pendingRequests.set(id, { resolve, reject });
            this.worker.postMessage({ id, action, payload });
        });
    }

    // Queue a save operation (non-blocking)
    queueSaveGenePool(geneId, agents) {
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
        for (const [geneId, agents] of Object.entries(agentsByGene)) {
            // Keep only top agents per gene pool
            const sorted = agents.sort((a, b) => b.fitness - a.fitness);
            const topAgents = sorted.slice(0, MAX_AGENTS_TO_SAVE_PER_GENE_POOL);

            // Update in-memory pool
            this.pool[geneId] = topAgents;

            // Queue save to IndexedDB
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

        // Keep top 10 agents per gene ID (increased from 3 for better diversity)
        const topAgents = agents
            .filter(a => a.geneId === geneId)
            .sort((a, b) => b.fitness - a.fitness)
            .slice(0, MAX_AGENTS_TO_SAVE_PER_GENE_POOL)
            .map(a => ({
                id: a.id,
                weights: a.getWeights(),
                fitness: a.fitness,
                geneId: a.geneId,
                specializationType: a.specializationType
            }));

        if (topAgents.length === 0) return;

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

    // Helper method: Get a random agent from any gene pool
    getRandomAgent() {
        const geneIds = Object.keys(this.pool);
        if (geneIds.length === 0) return null;

        const randomGeneId = geneIds[Math.floor(Math.random() * geneIds.length)];
        const pool = this.pool[randomGeneId];
        if (!pool || pool.length === 0) return null;

        const randomAgent = pool[Math.floor(Math.random() * pool.length)];
        return { weights: randomAgent.weights };
    }

    // Helper method: Get a mating pair for a specific geneId
    getMatingPair(geneId) {
        const pool = this.pool[geneId];
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
                weights1: parent1Data.weights,
                weights2: parent1Data.weights
            };
        }

        const parent1Weights = parent1Data.weights;
        const parent1Specialization = parent1Data.specializationType;

        // Filter the pool to find compatible mates (same specialization)
        const compatibleMates = sorted.filter(agentData => agentData.specializationType === parent1Specialization);

        if (compatibleMates.length < 2) {
            // Not enough compatible mates, clone the single parent
            return {
                weights1: parent1Weights,
                weights2: parent1Weights
            };
        }

        // Select a different second parent from the compatible mates
        const otherMates = compatibleMates.filter(m => m !== parent1Data);
        const parent2Data = otherMates[Math.floor(Math.random() * otherMates.length)];
        const parent2Weights = parent2Data.weights;

        return {
            weights1: parent1Weights,
            weights2: parent2Weights
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
