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
Checks memory usage against multiple thresholds and triggers appropriate cleanup actions.
- **Medium Threshold**: 400MB - triggers moderate cleanup (60s cooldown)
- **High Threshold**: 500MB - triggers aggressive cleanup (30s cooldown)
- **Legacy Threshold**: 150MB - triggers light cleanup (30s cooldown)

### Memory Cleanup Functions

#### `lightMemoryCleanup(simulation)`
Basic cleanup for legacy threshold crossings.
- **Process Dead Agents**: Clears dead agent queue
- **Flush DB**: Forces database write

#### `moderateMemoryCleanup(simulation)`
Moderate cleanup for medium memory usage (400MB+).
- **Process Dead Agents**: Clears dead agent queue
- **Flush DB**: Forces database write
- **Reduce Pheromones**: Keeps 70% of pheromones
- **Trim Memory History**: Reduces history size

#### `aggressiveMemoryCleanup(simulation)`
Aggressive cleanup for high memory usage (500MB+).
- **Force GC**: Calls `window.gc()` if available
- **Clear Caches**: Wipes GPU compute and physics caches
- **Cull Pheromones**: Keeps 50% of pheromones
- **Flush DB**: Forces database write
- **Trim Memory History**: Heavily reduces history

#### `emergencyMemoryCleanup(simulation)`
Emergency cleanup for critically high memory usage.
- **Force GC**: Calls `window.gc()` if available
- **Clear All Caches**: Wipes all GPU caches
- **Cull Pheromones**: Keeps only 30% of pheromones
- **Clear Queues**: Removes old validation entries
- **Minimal History**: Keeps only 10 history entries

### `periodicMemoryCleanup(simulation)`
Runs regularly (e.g., every few minutes) to perform maintenance.
- **Stale Data**: Removes stale validation queue entries.
- **Array Reset**: Clears and re-initializes agent input arrays to prevent them from growing too large (though they should be fixed size, JS arrays can sometimes hold onto memory).
