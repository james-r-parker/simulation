// --- DATABASE WORKER ---
// Handles all IndexedDB operations in a background thread

const DB_NAME = 'BlobEvolutionDB';
const DB_VERSION = 1;
const STORE_NAME = 'genePools';

let db = null;

let maxGenePools = 500;
let maxAgentsPerPool = 10;

// Initialize database
async function initDB() {
    if (db) return db;

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const objectStore = database.createObjectStore(STORE_NAME, { keyPath: 'geneId' });
                objectStore.createIndex('geneId', 'geneId', { unique: true });
            }
        };
    });
}

// Cull poor gene pools if limit is reached
async function cullGenePools() {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const pools = request.result;
            if (pools.length <= maxGenePools) {
                resolve();
                return;
            }

            // Calculate fitness for each pool (max fitness of agents in pool)
            const poolsWithFitness = pools.map(pool => {
                let maxFitness = 0;
                if (pool.agents && pool.agents.length > 0) {
                    maxFitness = Math.max(...pool.agents.map(a => a.fitness || 0));
                }
                return { geneId: pool.geneId, fitness: maxFitness };
            });

            // Sort by fitness descending (best first)
            poolsWithFitness.sort((a, b) => b.fitness - a.fitness);

            // Identify pools to delete (those beyond the limit)
            const poolsToDelete = poolsWithFitness.slice(maxGenePools);

            if (poolsToDelete.length > 0) {
                poolsToDelete.forEach(pool => {
                    store.delete(pool.geneId);
                });
            }
        };

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        request.onerror = () => reject(request.error);
    });
}

// Save a gene pool (batch of agents)
async function saveGenePool(geneId, agents) {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        // First get existing agents for this gene pool
        const getRequest = store.get(geneId);

        getRequest.onsuccess = () => {
            const existingData = getRequest.result;
            let allAgents = agents;

            if (existingData && existingData.agents) {
                // Merge new agents with existing ones
                allAgents = existingData.agents.concat(agents);
            }

            // Sort by fitness descending
            allAgents.sort((a, b) => b.fitness - a.fitness);

            // Keep only the top N agents
            const topAgents = allAgents.slice(0, maxAgentsPerPool);

            const dataToPut = {
                geneId: geneId,
                agents: topAgents
            };

            const putRequest = store.put(dataToPut);

            putRequest.onsuccess = () => {
                // Success, transaction will complete
            };

            putRequest.onerror = () => reject(putRequest.error);
        };

        getRequest.onerror = () => reject(getRequest.error);

        transaction.oncomplete = async () => {
            // Attempt to cull after successful save
            try {
                await cullGenePools();
                resolve();
            } catch (err) {
                console.error('Error culling gene pools:', err);
                resolve(); // Resolve anyway, culling failure shouldn't fail the save
            }
        };

        transaction.onerror = () => reject(transaction.error);
    });
}

// Load a specific gene pool
async function loadGenePool(geneId) {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(geneId);

        request.onsuccess = () => {
            const result = request.result;
            resolve(result ? result.agents : []);
        };
        request.onerror = () => reject(request.error);
    });
}

// Load all gene pools
async function loadAllGenePools() {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const allPools = {};
            request.result.forEach(pool => {
                allPools[pool.geneId] = pool.agents;
            });
            resolve(allPools);
        };
        request.onerror = () => reject(request.error);
    });
}

// Clear all gene pools
async function clearAll() {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Remove a specific gene pool by ID
async function removeGenePoolById(geneId) {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(geneId);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Handle messages from main thread
self.onmessage = async (e) => {
    const { id, action, payload } = e.data;

    try {
        let result;

        switch (action) {
            case 'init':
                if (payload) {
                    if (payload.maxGenePools) maxGenePools = payload.maxGenePools;
                    if (payload.maxAgentsPerPool) maxAgentsPerPool = payload.maxAgentsPerPool;
                }
                await initDB();
                result = { success: true };
                break;

            case 'saveGenePool':
                await saveGenePool(payload.geneId, payload.agents);
                result = { success: true };
                break;

            case 'loadGenePool':
                result = await loadGenePool(payload.geneId);
                break;

            case 'loadAllGenePools':
                result = await loadAllGenePools();
                break;

            case 'clearAll':
                await clearAll();
                result = { success: true };
                break;

            case 'removeGenePoolById':
                await removeGenePoolById(payload.geneId);
                result = { success: true };
                break;

            default:
                throw new Error(`Unknown action: ${action}`);
        }

        self.postMessage({ id, success: true, result });
    } catch (error) {
        self.postMessage({ id, success: false, error: error.message });
    }
};
