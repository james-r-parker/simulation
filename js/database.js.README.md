# database.js Documentation

## Purpose

IndexedDB wrapper for persistent storage of gene pools. Stores top 3 agents per gene ID (not just top 10 overall).

## Class: GenePoolDatabase

### Overview

Manages persistent storage of evolved neural network weights:
- Stores top 3 agents per gene ID
- Enables tracking multiple genetic lineages
- Migrates from old localStorage format
- Async operations for non-blocking

## Database Schema

### Database Name
`BlobEvolutionDB`

### Version
`1`

### Object Store
`genePools`

### Key Path
`geneId` (string)

### Value Structure
```javascript
{
    geneId: "gene_1234567890_abc123",
    agents: [
        {
            weights: { weights1: [[...]], weights2: [[...]] },
            fitness: 1234.5,
            geneId: "gene_1234567890_abc123"
        },
        // ... up to 3 agents
    ]
}
```

## Constructor

```javascript
new GenePoolDatabase()
```

**Initialization**:
- Database connection created on first use
- Handles version upgrades

## Methods

### `init()`

Initializes database connection.

**Process**:
1. Open IndexedDB database
2. Create object store if needed (on upgrade)
3. Store database reference

**Returns**: Promise

**Usage**: Called once at startup

---

### `saveGenePool(geneId, agents)`

Saves top 3 agents for a gene ID.

**Parameters**:
- `geneId`: Gene ID string
- `agents`: Array of Agent instances

**Process**:
1. Filter agents by gene ID
2. Sort by fitness (descending)
3. Take top 3
4. Extract weights and metadata
5. Save to IndexedDB

**Returns**: Promise

**Called**: Every 500 frames (via `updateGenePools`)

---

### `loadGenePool(geneId)`

Loads agents for a specific gene ID.

**Parameters**:
- `geneId`: Gene ID string

**Returns**: Promise resolving to array of agent data

**Usage**: Load specific gene pool for spawning

---

### `loadAllGenePools()`

Loads all gene pools from database.

**Returns**: Promise resolving to object:
```javascript
{
    "gene_123...": [agent1, agent2, agent3],
    "gene_456...": [agent1, agent2, agent3],
    // ...
}
```

**Usage**: Called at startup to restore gene pools

---

### `clearAll()`

Clears all stored gene pools.

**Returns**: Promise

**Usage**: "Clear Gene Pool" button

---

### `migrateFromLocalStorage()`

Migrates old localStorage data to IndexedDB.

**Process**:
1. Check for `agentGenePool` in localStorage
2. Parse old format (array of weights)
3. Convert to new format (grouped by gene ID)
4. Save to IndexedDB
5. Clear localStorage

**Old Format**: Array of weight objects
**New Format**: Object mapping geneId → top 3 agents

**Returns**: Promise resolving to boolean (migration occurred)

**Usage**: Called once at startup

## Key Features

### Top 3 Per Gene ID
- Not just top 10 overall
- Enables tracking multiple lineages
- Preserves genetic diversity

### Async Operations
- All operations return Promises
- Non-blocking UI
- Handles errors gracefully

### Migration Support
- Automatic migration from localStorage
- Backwards compatible
- Cleans up old storage

### Error Handling
- Try-catch blocks
- Console error logging
- Graceful degradation

## Usage Example

```javascript
import { GenePoolDatabase } from './database.js';

const db = new GenePoolDatabase();

// Initialize
await db.init();

// Save gene pool
await db.saveGenePool(geneId, agents);

// Load all gene pools
const genePools = await db.loadAllGenePools();

// Clear all
await db.clearAll();
```

## Database Lifecycle

```
Startup:
1. init() → Create/open database
2. migrateFromLocalStorage() → Migrate old data
3. loadAllGenePools() → Restore gene pools

Runtime:
1. updateGenePools() → Every 500 frames
2. saveGenePool() → Save top 3 per gene ID

Shutdown:
1. beforeunload → saveGenePools() → Save all
```

## Performance

- Async operations don't block UI
- Efficient storage (only top 3 per gene ID)
- IndexedDB handles large datasets
- Minimal overhead

## Browser Support

- Modern browsers with IndexedDB
- Chrome, Firefox, Edge (latest)
- Safari (with limitations)

## Storage Limits

- IndexedDB: Typically 50% of disk space
- Per-origin quota
- Automatic cleanup on quota exceeded



