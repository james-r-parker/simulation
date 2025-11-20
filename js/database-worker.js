// --- DATABASE WORKER ---
// Handles all IndexedDB operations in a background thread

const DB_NAME = 'BlobEvolutionDB';
const DB_VERSION = 1;
const STORE_NAME = 'genePools';

let db = null;

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

// Save a gene pool (batch of agents)
async function saveGenePool(geneId, agents) {
    if (!db) await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        const dataToPut = {
            geneId: geneId,
            agents: agents
        };

        const request = store.put(dataToPut);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
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

// Handle messages from main thread
self.onmessage = async (e) => {
    const { id, action, payload } = e.data;
    
    try {
        let result;
        
        switch (action) {
            case 'init':
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
                
            default:
                throw new Error(`Unknown action: ${action}`);
        }
        
        self.postMessage({ id, success: true, result });
    } catch (error) {
        self.postMessage({ id, success: false, error: error.message });
    }
};

