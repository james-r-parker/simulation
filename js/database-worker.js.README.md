# Database Worker Documentation (`database-worker.js`)

## Overview

The `database-worker.js` module runs in a separate Web Worker thread to handle all IndexedDB operations. This prevents database I/O from blocking the main simulation loop, ensuring smooth performance even when saving large amounts of data.

## Why It Exists

- **Performance**: Database operations (opening, reading, writing) are asynchronous but can still cause micro-stutters in the main thread. Moving them to a worker ensures the UI and simulation remain buttery smooth.
- **Data Persistence**: It manages the `BlobEvolutionDB` IndexedDB, allowing gene pools to survive page reloads.
- **Concurrency**: It handles requests from the main thread via a message-passing interface.
- **Isolation**: Database errors don't crash the main simulation thread.

## Database Configuration

- **Database Name**: `BlobEvolutionDB`
- **Version**: `1`
- **Object Store**: `genePools`
- **Key Path**: `geneId` (string, unique index)
- **Max Gene Pools**: 500 (configurable via `MAX_GENE_POOLS` constant)
- **Max Agents Per Pool**: 10 (configurable via `MAX_AGENTS_TO_SAVE_PER_GENE_POOL` constant)

## Key Functions

### `initDB()`
Initializes the IndexedDB connection. Creates the `genePools` object store if it doesn't exist.

**Process**:
1. Opens IndexedDB database
2. Creates object store on upgrade if needed
3. Creates unique index on `geneId`
4. Returns database reference

**Returns**: Promise resolving to database instance

### `saveGenePool(geneId, agents)`
Saves a batch of agents to the database under a specific `geneId`.

**Parameters**:
- `geneId`: Unique gene identifier string
- `agents`: Array of agent data objects with weights, fitness, etc.

**Process**:
1. Retrieves existing agents for that gene ID
2. Merges new agents with existing ones
3. Sorts by fitness (descending)
4. Keeps only the top `maxAgentsPerPool` (default 10)
5. Saves to IndexedDB
6. Automatically triggers `cullGenePools()` after save

**Returns**: Promise

**Auto-Culling**: Triggers `cullGenePools()` after saving to ensure the total number of gene pools doesn't exceed the limit.

### `cullGenePools()`
Maintains the global limit of gene pools (default 500).

**Process**:
1. Gets all gene pools from database
2. Calculates max fitness for each pool (highest fitness of any agent in pool)
3. Sorts pools by max fitness (descending)
4. Deletes pools beyond the limit (lowest fitness first)
5. Only runs if pool count exceeds `maxGenePools`

**Returns**: Promise

**Note**: This ensures the database doesn't grow indefinitely while preserving the best-performing gene pools.

### `loadGenePool(geneId)`
Retrieves the agents for a specific gene ID.

**Parameters**:
- `geneId`: Gene identifier string

**Returns**: Promise resolving to array of agent data objects, or empty array if not found

**Usage**: Load specific gene pool for spawning agents

### `loadAllGenePools()`
Loads all gene pools into memory. Used during initialization to populate the simulation with evolved agents.

**Returns**: Promise resolving to object mapping geneId → array of agents:
```javascript
{
    "gene_123...": [agent1, agent2, ...],
    "gene_456...": [agent1, agent2, ...],
    // ...
}
```

**Usage**: Called at startup to restore all gene pools

### `clearAll()`
Clears all gene pools from the database.

**Returns**: Promise

**Usage**: "Clear Gene Pool" button in UI

### `removeGenePoolById(geneId)`
Removes a specific gene pool by ID.

**Parameters**:
- `geneId`: Gene identifier string

**Returns**: Promise

**Usage**: Manual cleanup of specific gene pools

### `onmessage` (Event Handler)
The entry point for the worker. It listens for messages from the main thread with an `action` and payload, executes the corresponding function, and posts the result back.

**Message Format**:
```javascript
{
    id: number,        // Unique message ID for request/response matching
    action: string,    // 'init', 'saveGenePool', 'loadGenePool', etc.
    payload: object    // Action-specific data
}
```

**Response Format**:
```javascript
{
    id: number,        // Matches request ID
    success: boolean,  // Whether operation succeeded
    result: any,       // Operation result (if success)
    error: string      // Error message (if failed)
}
```

**Supported Actions**:
- `init`: Initialize database with optional config
  - Payload: `{ maxGenePools?, maxAgentsPerPool? }`
- `saveGenePool`: Save agents to gene pool
  - Payload: `{ geneId, agents }`
- `loadGenePool`: Load specific gene pool
  - Payload: `{ geneId }`
- `loadAllGenePools`: Load all gene pools
  - Payload: none
- `clearAll`: Clear all gene pools
  - Payload: none
- `removeGenePoolById`: Remove specific gene pool
  - Payload: `{ geneId }`

## Data Structure

### Gene Pool Entry
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
        // ... up to maxAgentsPerPool (10) agents
    ]
}
```

## Performance Considerations

### Automatic Culling
- After each save, checks if total pools exceed limit
- Removes lowest-fitness pools automatically
- Prevents database from growing indefinitely

### Efficient Storage
- Only stores top N agents per gene ID
- Sorted by fitness before storage
- Minimal data per agent (weights, fitness, metadata)

### Async Operations
- All operations are asynchronous
- Non-blocking for main thread
- Error handling prevents crashes

## Error Handling

- All database operations wrapped in try-catch
- Errors sent back to main thread via message
- Worker continues operating even if one operation fails
- Logs errors to console for debugging

## Usage Example

The worker is used indirectly through `database.js`:

```javascript
// In database.js
this.worker.postMessage({
    id: this.messageId++,
    action: 'saveGenePool',
    payload: { geneId, agents }
});

// Worker responds with:
this.worker.onmessage = (e) => {
    const { id, success, result } = e.data;
    // Handle response
};
```

## Integration

The worker is created and managed by `GenePoolDatabase` class in `database.js`:
- Created during `init()`
- All database operations go through worker
- Request/response matching via message IDs
- Timeout handling for stuck requests

## Browser Support

- Modern browsers with Web Workers and IndexedDB
- Chrome, Firefox, Edge (latest)
- Safari (with limitations)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Storage Limits

- IndexedDB: Typically 50% of available disk space
- Per-origin quota
- Automatic cleanup via culling prevents quota issues
- Maximum 500 gene pools × 10 agents = 5,000 stored agents max
