# Database Worker Documentation (`database-worker.js`)

## Overview
The `database-worker.js` module runs in a separate Web Worker thread to handle all IndexedDB operations. This prevents database I/O from blocking the main simulation loop, ensuring smooth performance even when saving large amounts of data.

## Why It Exists
- **Performance**: Database operations (opening, reading, writing) are asynchronous but can still cause micro-stutters in the main thread. Moving them to a worker ensures the UI and simulation remain buttery smooth.
- **Data Persistence**: It manages the `BlobEvolutionDB` IndexedDB, allowing gene pools to survive page reloads.
- **Concurrency**: It handles requests from the main thread via a message-passing interface.

## Key Functions

### `initDB()`
Initializes the IndexedDB connection. It creates the `genePools` object store if it doesn't exist.

### `saveGenePool(geneId, agents)`
Saves a batch of agents to the database under a specific `geneId`.
- **Merging**: It retrieves existing agents for that gene ID and merges them with the new ones.
- **Sorting**: Agents are sorted by fitness (descending).
- **Culling**: Only the top `maxAgentsPerPool` (default 10) are kept to save space.
- **Auto-Culling**: Triggers `cullGenePools()` after saving to ensure the total number of gene pools doesn't exceed the limit.

### `cullGenePools()`
Maintains the global limit of gene pools (default 500).
- **Ranking**: Calculates the max fitness for every gene pool.
- **Removal**: Sorts pools by fitness and deletes the lowest-performing ones if the limit is exceeded.

### `loadGenePool(geneId)`
Retrieves the agents for a specific gene ID.

### `loadAllGenePools()`
Loads all gene pools into memory. Used during initialization to populate the simulation with evolved agents.

### `onmessage` (Event Handler)
The entry point for the worker. It listens for messages from the main thread with an `action` (e.g., 'init', 'saveGenePool', 'loadAllGenePools') and payload, executes the corresponding function, and posts the result back.
