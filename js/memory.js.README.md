# Memory Management Documentation (`memory.js`)

## Overview
The `memory.js` module monitors the application's memory usage and implements strategies to prevent leaks and crashes, ensuring the simulation can run indefinitely.

## Why It Exists
- **Stability**: WebGL and extensive object creation (agents, arrays) can lead to memory leaks. This module actively fights them.
- **Performance**: High memory usage triggers garbage collection (GC) pauses, causing stutter. Keeping memory low ensures smooth framerates.

## Key Functions

### `updateMemoryStats(simulation)`
Tracks current memory usage (using `performance.memory` in Chrome) and calculates growth trends.
- **History**: Maintains a history of memory usage to detect slow leaks.
- **Growth Rate**: Calculates MB/min growth to warn the user if the simulation is "leaking".

### `handleMemoryPressure(simulation)`
Checks if memory usage exceeds the threshold (default 300MB). If so, it triggers corrective actions.
- **Threshold**: `memoryPressureThreshold` in constants.
- **Cooldown**: Prevents spamming cleanup actions (30s cooldown).

### `aggressiveMemoryCleanup(simulation)`
Triggered under high memory pressure.
- **Force GC**: Calls `window.gc()` if available (requires specific browser flags).
- **Clear Caches**: Wipes GPU compute and physics caches.
- **Cull Pheromones**: Removes old pheromones to free up object count.
- **Flush DB**: Forces a database write to clear pending queues.

### `periodicMemoryCleanup(simulation)`
Runs regularly (e.g., every few minutes) to perform maintenance.
- **Stale Data**: Removes stale validation queue entries.
- **Array Reset**: Clears and re-initializes agent input arrays to prevent them from growing too large (though they should be fixed size, JS arrays can sometimes hold onto memory).
