# database.js Documentation

## Purpose

IndexedDB wrapper for persistent storage of gene pools using a Web Worker for non-blocking operations. Stores top agents per gene ID (up to 10 per pool, maximum 500 pools) to preserve evolved neural network weights across browser sessions.

## Class: GenePoolDatabase

### Overview

Manages persistent storage of evolved neural network weights:
- **Web Worker Integration**: All database operations run in background thread
- **Queue System**: Batches save operations for efficiency
- **Intelligent Caching**: Manages in-memory cache with access tracking
- **Automatic Culling**: Maintains pool limits automatically
- **Error Handling**: Graceful degradation on failures

## Constructor

```javascript
new GenePoolDatabase(logger)
```

**Parameters**:
- `logger`: Logger instance for debugging

**Initialization**:
- Creates Web Worker for database operations
- Initializes message queue system
- Sets up cache management
- Configures limits from constants

## Database Schema

### Database Name
`BlobEvolutionDB`

### Version
`1`

### Object Store
`genePools`

### Key Path
`geneId` (string, unique index)

### Value Structure
```javascript
{
    geneId: "gene_1234567890_abc123",
    agents: [
        {
            id: "agent_123",
            weights: {
                weights1: [[...]],  // Input to hidden weights
                weights2: [[...]]   // Hidden to output weights
            },
            fitness: 1234.5,
            geneId: "gene_1234567890_abc123",
            specializationType: "forager"
        },
        // ... up to MAX_AGENTS_TO_SAVE_PER_GENE_POOL (10) agents
    ]
}
```

## Key Properties

- `worker`: Web Worker instance for database operations
- `messageId`: Counter for request/response matching
- `pendingRequests`: Map of pending async requests
- `saveQueue`: Queue for batched save operations
- `pool`: In-memory cache of gene pools
- `geneIds`: Array of cached gene ID keys
- `cacheAccessTimes`: Map tracking last access time per gene ID
- `maxCacheSize`: Maximum cache size (from `MAX_GENE_POOLS`: 500)

## Methods

### `init()`
Initializes the database worker and establishes connection.

**Process**:
1. Creates Web Worker from `/database-worker.js`
2. Sets up message handlers
3. Sends init message with configuration:
   - `maxGenePools`: `MAX_GENE_POOLS` (500)
   - `maxAgentsPerPool`: `MAX_AGENTS_TO_SAVE_PER_GENE_POOL` (10)
4. Waits for worker confirmation

**Returns**: Promise

**Usage**: Called once at startup

### `sendMessage(action, payload)`
Sends a message to the database worker.

**Parameters**:
- `action`: Action string ('init', 'saveGenePool', 'loadGenePool', etc.)
- `payload`: Action-specific data

**Process**:
1. Generates unique message ID
2. Sets up timeout (5 seconds from `WORKER_REQUEST_TIMEOUT_MS`)
3. Stores pending request
4. Posts message to worker
5. Returns promise that resolves when worker responds

**Returns**: Promise resolving to worker response

**Timeout**: Requests timeout after `WORKER_REQUEST_TIMEOUT_MS` (5000ms)

### `queueSaveGenePool(geneId, agents)`
Queues a save operation (non-blocking).

**Parameters**:
- `geneId`: Gene ID string
- `agents`: Array of Agent instances

**Process**:
1. Filters agents by gene ID and `fit` status
2. Deduplicates by agent ID
3. Sorts by fitness (descending)
4. Takes top `MAX_AGENTS_TO_SAVE_PER_GENE_POOL` (10)
5. Extracts weights and metadata
6. Adds to save queue
7. Triggers queue processing

**Queue Limit**: Maximum 50 pending saves (prevents memory growth)

**Returns**: void (non-blocking)

### `queueSaveAgent(agent)`
Queues individual agent for saving.

**Parameters**:
- `agent`: Agent instance

**Process**:
1. Checks if agent meets `fit` criteria
2. Extracts weights via `getWeights()`
3. Adds to save queue grouped by gene ID
4. Triggers queue processing

**Returns**: void (non-blocking)

### `processQueue()`
Processes the save queue asynchronously.

**Process**:
1. Groups queued agents by gene ID
2. For each gene ID, sends batch save to worker
3. Updates in-memory cache on success
4. Handles errors gracefully
5. Prevents concurrent processing

**Called**: Automatically when items added to queue

### `loadGenePool(geneId)`
Loads agents for a specific gene ID.

**Parameters**:
- `geneId`: Gene ID string

**Process**:
1. Checks in-memory cache first
2. If not cached, requests from worker
3. Updates cache and access time
4. Returns agent data

**Returns**: Promise resolving to array of agent data

**Caching**: Results cached in memory for fast access

### `loadAllGenePools()`
Loads all gene pools from database.

**Process**:
1. Sends request to worker
2. Populates in-memory cache
3. Updates gene ID list
4. Returns all pools

**Returns**: Promise resolving to object: `{ geneId: [agents...], ... }`

**Usage**: Called at startup to restore gene pools

### `getGenePoolHealth()`
Returns statistics about gene pool health.

**Returns**: Object with:
- `genePoolCount`: Number of gene pools
- `totalAgents`: Total agents across all pools
- `pools`: Array of pool info with fitness stats

### `clearAll()`
Clears all stored gene pools.

**Process**:
1. Sends clear request to worker
2. Clears in-memory cache
3. Resets gene ID list

**Returns**: Promise

**Usage**: "Clear Gene Pool" button in UI

### `removeGenePoolById(geneId)`
Removes a specific gene pool by ID.

**Parameters**:
- `geneId`: Gene ID string

**Process**:
1. Sends delete request to worker
2. Removes from in-memory cache
3. Updates gene ID list

**Returns**: Promise

## Cache Management

### Intelligent Caching
- In-memory cache for fast access
- Tracks access times for LRU-style management
- Automatic trimming when cache grows too large
- Periodic cleanup (every 30 minutes)

### Cache Trimming
- Monitors cache size over time
- Trims least-recently-used entries when limit exceeded
- Prevents memory growth in long-running simulations

## Key Features

### Web Worker Integration
- All database operations in background thread
- Non-blocking main simulation loop
- Request/response matching via message IDs
- Timeout handling for stuck requests

### Queue System
- Batches save operations for efficiency
- Prevents queue overflow (max 50 items)
- Automatic processing
- Groups by gene ID before saving

### Quality Filtering
- Only saves agents with `fit === true`
- Deduplicates by agent ID
- Sorts by fitness before saving
- Limits to top N per gene ID

### Error Handling
- Graceful degradation on worker failures
- Timeout protection (5 seconds)
- Logging for debugging
- Continues operation on individual failures

### Cache Management
- In-memory cache for performance
- Access time tracking
- Automatic trimming
- Prevents memory leaks

## Usage Example

```javascript
import { GenePoolDatabase } from './database.js';
import { Logger, LOG_LEVELS } from './logger.js';

const logger = new Logger(LOG_LEVELS.INFO);
const db = new GenePoolDatabase(logger);

// Initialize
await db.init();

// Load all gene pools at startup
const genePools = await db.loadAllGenePools();

// Queue save (non-blocking)
db.queueSaveGenePool(geneId, agents);

// Load specific gene pool
const agents = await db.loadGenePool(geneId);

// Get statistics
const health = db.getGenePoolHealth();

// Clear all
await db.clearAll();
```

## Integration Points

### With `game.js`
- Called during initialization to load gene pools
- Queues saves when agents qualify for gene pool
- Provides gene pools for spawning

### With `validation.js`
- Saves validated agents to gene pool
- Checks if gene already exists before validation
- Provides persistent storage for elite agents

### With `spawn.js`
- Uses gene pools to spawn evolved agents
- Provides genetic diversity for population

## Performance

- **Non-Blocking**: All operations via Web Worker
- **Batched Saves**: Queue system groups operations
- **In-Memory Cache**: Fast access to frequently used pools
- **Automatic Culling**: Maintains pool limits
- **Timeout Protection**: Prevents hanging requests

## Constants Used

- `MAX_GENE_POOLS`: Maximum gene pools (500)
- `MAX_AGENTS_TO_SAVE_PER_GENE_POOL`: Agents per pool (10)
- `WORKER_REQUEST_TIMEOUT_MS`: Request timeout (5000ms)

## Browser Support

- Modern browsers with Web Workers and IndexedDB
- Chrome, Firefox, Edge (latest)
- Safari (with limitations)
- Mobile browsers supported

## Storage Limits

- **IndexedDB**: Typically 50% of available disk space
- **Per-Origin Quota**: Browser-dependent
- **Automatic Cleanup**: Culling prevents quota issues
- **Maximum Storage**: 500 pools × 10 agents = 5,000 agents max
