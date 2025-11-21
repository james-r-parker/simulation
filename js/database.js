import { MAX_AGENTS_TO_SAVE_PER_GENE_POOL, MAX_GENE_POOLS } from "./constants.js";

// --- IndexedDB WRAPPER FOR GENE POOL STORAGE (With Worker) ---
// Uses a Web Worker to avoid blocking the simulation thread

export class GenePoolDatabase {
    constructor(logger) {
        this.logger = logger;
        this.worker = null;
        this.messageId = 0;
        this.pendingRequests = new Map();
        this.saveQueue = []; // Queue for pending save operations
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
        const agentData = agents
            .filter(a => a.geneId === geneId)
            .sort((a, b) => b.fitness - a.fitness)
            .slice(0, MAX_AGENTS_TO_SAVE_PER_GENE_POOL) // Increased from 3 to 10
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

    async processQueue() {
        if (this.isProcessingQueue || this.saveQueue.length === 0) return;


        // Process in batches to avoid overwhelming the worker
        const batchSize = 5;
        while (this.saveQueue.length > 0) {
            const batch = this.saveQueue.splice(0, batchSize);

            // Send all in parallel (worker will handle sequentially)
            await Promise.allSettled(
                batch.map(({ geneId, agents }) =>
                    this.sendMessage('saveGenePool', { geneId, agents })
                )
            );
        }

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
}
