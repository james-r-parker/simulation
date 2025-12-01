// Memory management functions moved from game.js

// Import pool clearing functions for periodic cleanup
import { clearGPUResourcePools } from './three-object-pool.js';
import { neuralArrayPool } from './neural-network.js';
import { collisionSetPool } from './physics.js';

export function updateMemoryStats(simulation, updateUI = true) {
    // Update memory usage every second
    const now = Date.now();
    if (now - simulation.lastMemoryUpdate >= 1000) {
        simulation.lastMemoryUpdate = now;

        // Get memory usage if available (Chrome/Edge)
        let memoryUsage = 0;
        if (performance.memory) {
            memoryUsage = performance.memory.usedJSHeapSize / 1024 / 1024; // Convert to MB
            simulation.currentMemoryUsage = memoryUsage;
            simulation.peakMemoryUsage = Math.max(simulation.peakMemoryUsage, memoryUsage);
        }

        // Track entity counts and database queue
        simulation.entityCounts = {
            agents: simulation.agents.filter(a => !a.isDead).length,
            food: simulation.food.filter(f => !f.isDead).length,
            pheromones: simulation.pheromones.filter(p => !p.isDead).length,
            dbQueue: simulation.db.saveQueue.length
        };

        // Calculate memory growth rate (MB per minute)
        simulation.memoryHistory.push({
            time: now,
            memory: memoryUsage,
            entities: { ...simulation.entityCounts }
        });

        if (simulation.memoryHistory.length > simulation.memoryHistorySize) {
            simulation.memoryHistory.shift();
        }

        if (simulation.memoryHistory.length >= 2) {
            const recent = simulation.memoryHistory.slice(-10); // Last 10 samples
            if (recent.length >= 2) {
                const oldest = recent[0];
                const newest = recent[recent.length - 1];
                const timeDiff = (newest.time - oldest.time) / 1000 / 60; // minutes
                const memoryDiff = newest.memory - oldest.memory;
                simulation.memoryGrowthRate = timeDiff > 0 ? memoryDiff / timeDiff : 0;
            }
        }

        // Update UI if requested
        if (updateUI) {
            updateMemoryUI(simulation);
        }
    }
}

export function updateMemoryUI(simulation) {
    // Update info bar memory display
    const memoryEl = document.getElementById('info-memory');
    if (memoryEl) {
        let memoryText = '';
        const memoryUsageMB = simulation.currentMemoryUsage;

        if (memoryUsageMB > 0) {
            memoryText = `Memory: ${memoryUsageMB.toFixed(1)}MB`;

            // Color based on absolute memory usage thresholds
            if (memoryUsageMB >= 500) { // High memory threshold
                memoryEl.style.color = '#ff1744'; // Bright red for critical
            } else if (memoryUsageMB >= 400) { // Medium memory threshold
                memoryEl.style.color = '#ff9800'; // Orange for warning
            } else if (simulation.memoryGrowthRate > 0.1) {
                memoryText += ` (↗️ +${simulation.memoryGrowthRate.toFixed(1)}MB/min)`;
                memoryEl.style.color = '#ff6b6b'; // Red for growing memory
            } else if (simulation.memoryGrowthRate < -0.1) {
                memoryText += ` (↘️ ${simulation.memoryGrowthRate.toFixed(1)}MB/min)`;
                memoryEl.style.color = '#51cf66'; // Green for decreasing memory
            } else {
                memoryEl.style.color = '#ffd43b'; // Yellow for stable memory
            }
        } else {
            memoryText = `Memory: ~${(simulation.entityCounts.agents * 2 + simulation.entityCounts.food * 0.1 + simulation.entityCounts.pheromones * 0.05).toFixed(1)}MB (est.)`;
            memoryEl.style.color = '#868e96'; // Gray for estimated memory
        }
        memoryEl.textContent = memoryText;
    }
}

export function handleMemoryPressure(simulation) {
    const now = Date.now();
    const timeSinceLastAction = now - simulation.lastMemoryPressureAction;
    const memoryUsageMB = simulation.currentMemoryUsage;

    // Define memory thresholds (in MB)
    const MEDIUM_MEMORY_THRESHOLD = 400;
    const HIGH_MEMORY_THRESHOLD = 500;

    let shouldTakeAction = false;
    let actionLevel = 'none';

    // Determine action level based on memory usage
    if (memoryUsageMB > HIGH_MEMORY_THRESHOLD) {
        shouldTakeAction = true;
        actionLevel = 'high';
    } else if (memoryUsageMB > MEDIUM_MEMORY_THRESHOLD && timeSinceLastAction > 60000) { // 60 seconds for medium
        shouldTakeAction = true;
        actionLevel = 'medium';
    } else if (memoryUsageMB > simulation.memoryPressureThreshold && timeSinceLastAction > 30000) { // 30 seconds for legacy threshold
        shouldTakeAction = true;
        actionLevel = 'legacy';
    }

    if (shouldTakeAction) {
        simulation.logger.warn(`[MEMORY] ${actionLevel.charAt(0).toUpperCase() + actionLevel.slice(1)} memory usage detected: ${memoryUsageMB.toFixed(1)}MB. Taking corrective action.`);

        // Force garbage collection if available
        if (window.gc) {
            window.gc();
            simulation.logger.log('[MEMORY] Forced garbage collection');
        }

        // Clear object pools to free memory immediately
        simulation.logger.log('[MEMORY] Clearing object pools due to memory pressure');
        clearGPUResourcePools();
        neuralArrayPool.clearOldPools();

        // Apply cleanup based on severity
        if (actionLevel === 'high') {
            // Most aggressive cleanup for high memory usage
            aggressiveMemoryCleanup(simulation);
            // Additional high-memory actions
            emergencyMemoryCleanup(simulation);
        } else if (actionLevel === 'medium') {
            // Moderate cleanup for medium memory usage
            moderateMemoryCleanup(simulation);
        } else {
            // Legacy cleanup for basic threshold
            lightMemoryCleanup(simulation);
        }

        simulation.memoryPressureActions++;
        simulation.lastMemoryPressureAction = now;

        simulation.logger.info(`[MEMORY] ${actionLevel} memory pressure cleanup completed`);

        // Update UI to show memory pressure action
        const memoryEl = document.getElementById('info-memory');
        if (memoryEl) {
            const currentText = memoryEl.textContent;
            const indicator = actionLevel === 'high' ? ' (HIGH)' : actionLevel === 'medium' ? ' (MED)' : ' (GC)';
            memoryEl.textContent = currentText + indicator;
            setTimeout(() => {
                if (memoryEl.textContent.includes(indicator)) {
                    memoryEl.textContent = memoryEl.textContent.replace(indicator, '');
                }
            }, 3000);
        }
    }
}

export function lightMemoryCleanup(simulation) {
    // Basic cleanup for legacy threshold
    simulation.processDeadAgentQueue();

    // Force database flush
    if (simulation.db && simulation.db.flush) {
        simulation.db.flush().catch(err => simulation.logger.warn('[MEMORY] Database flush failed:', err));
    }
}

export function moderateMemoryCleanup(simulation) {
    // Moderate cleanup for medium memory usage (400MB+)
    simulation.processDeadAgentQueue();

    // Force database flush
    if (simulation.db && simulation.db.flush) {
        simulation.db.flush().catch(err => simulation.logger.warn('[MEMORY] Database flush failed:', err));
    }

    // Reduce pheromone count moderately
    if (simulation.pheromones.length > 1500) {
        // Remove oldest pheromones (keep newest 70% to maintain behavior)
        const keepCount = Math.floor(simulation.pheromones.length * 0.7);
        simulation.pheromones.splice(0, simulation.pheromones.length - keepCount);
        simulation.logger.log(`[MEMORY] Moderate pheromone reduction: kept ${keepCount} of ${simulation.pheromones.length + (simulation.pheromones.length - keepCount)}`);
    }

    // Clear some memory history
    if (simulation.memoryHistory.length > simulation.memoryHistorySize * 0.75) {
        const keepRecent = Math.floor(simulation.memoryHistorySize / 2);
        simulation.memoryHistory.splice(0, simulation.memoryHistory.length - keepRecent);
    }
}

export function aggressiveMemoryCleanup(simulation) {
    // Force processing of dead agent queue
    simulation.processDeadAgentQueue();

    // Force database flush
    if (simulation.db && simulation.db.flush) {
        simulation.db.flush().catch(err => simulation.logger.warn('[MEMORY] Database flush failed:', err));
    }

    // Clear GPU caches under memory pressure
    const memoryPressureRatio = simulation.currentMemoryUsage / 500; // Use 500MB as reference
    if (memoryPressureRatio > 1.2) { // Clear GPU caches if memory usage is 120% of high threshold
        if (simulation.gpuCompute && simulation.gpuCompute.clearCache) {
            simulation.gpuCompute.clearCache();
            simulation.logger.info('[MEMORY] Cleared GPU compute cache (severe memory pressure)');
        }
        if (simulation.gpuPhysics && simulation.gpuPhysics.clearCache) {
            simulation.gpuPhysics.clearCache();
            simulation.logger.info('[MEMORY] Cleared GPU physics cache (severe memory pressure)');
        }
    }

    // Reduce pheromone count if too high
    if (simulation.pheromones.length > 1000) {
        // Remove oldest pheromones (keep newest 50% to maintain behavior)
        const keepCount = Math.floor(simulation.pheromones.length * 0.5);
        simulation.pheromones.splice(0, simulation.pheromones.length - keepCount);
        simulation.logger.log(`[MEMORY] Reduced pheromones from ${simulation.pheromones.length + (simulation.pheromones.length - keepCount)} to ${simulation.pheromones.length}`);
    }

    // Clear memory history if it's getting too large
    if (simulation.memoryHistory.length > simulation.memoryHistorySize / 2) {
        const keepRecent = Math.floor(simulation.memoryHistorySize / 4);
        simulation.memoryHistory.splice(0, simulation.memoryHistory.length - keepRecent);
    }
}

export function emergencyMemoryCleanup(simulation) {
    // Emergency cleanup for very high memory usage (500MB+)
    simulation.logger.error('[MEMORY] EMERGENCY CLEANUP: Memory usage critically high!');

    // Most aggressive pheromone reduction
    if (simulation.pheromones.length > 500) {
        const keepCount = Math.floor(simulation.pheromones.length * 0.3); // Keep only 30%
        simulation.pheromones.splice(0, simulation.pheromones.length - keepCount);
        simulation.logger.warn(`[MEMORY] Emergency pheromone reduction: kept ${keepCount} of ${simulation.pheromones.length + (simulation.pheromones.length - keepCount)}`);
    }

    // Force clear all GPU caches
    if (simulation.gpuCompute && simulation.gpuCompute.clearCache) {
        simulation.gpuCompute.clearCache();
        simulation.logger.info('[MEMORY] Emergency: Cleared GPU compute cache');
    }
    if (simulation.gpuPhysics && simulation.gpuPhysics.clearCache) {
        simulation.gpuPhysics.clearCache();
        simulation.logger.info('[MEMORY] Emergency: Cleared GPU physics cache');
    }

    // Clear most of memory history
    if (simulation.memoryHistory.length > 10) {
        simulation.memoryHistory.splice(0, simulation.memoryHistory.length - 10);
    }

    // MEMORY LEAK FIX: Aggressively clear validation queue weights
    const now = Date.now();
    let weightsCleared = 0;
    let emergencyEntriesRemoved = 0;
    const maxAge = 60000; // 1 minute for emergency
    
    for (const [geneId, entry] of simulation.validationManager.validationQueue.entries()) {
        // Clear weights from validated entries immediately (they're already saved)
        if (entry.isValidated && entry.weights) {
            entry.weights = null;
            weightsCleared++;
        }
        // Clear weights from old entries that haven't been accessed recently
        if (!entry.isValidated && entry.weights && (now - entry.lastValidationTime > maxAge)) {
            entry.weights = null;
            weightsCleared++;
        }
        // Remove very old entries
        if (now - entry.lastValidationTime > maxAge) {
            simulation.validationManager.validationQueue.delete(geneId);
            emergencyEntriesRemoved++;
        }
    }
    if (weightsCleared > 0) {
        simulation.logger.info(`[MEMORY] Emergency: Cleared weights from ${weightsCleared} validation queue entries`);
    }
    if (emergencyEntriesRemoved > 0) {
        simulation.logger.info(`[MEMORY] Emergency: Removed ${emergencyEntriesRemoved} validation queue entries`);
    }

    // MEMORY LEAK FIX: Clean up position tracking Maps
    let positionMapCleanups = 0;
    if (simulation.lastAgentPositions) {
        for (const [agent] of simulation.lastAgentPositions.entries()) {
            if (!agent || agent.isDead || !simulation.agents.includes(agent)) {
                simulation.lastAgentPositions.delete(agent);
                positionMapCleanups++;
            }
        }
    }
    if (simulation.lastFoodPositions) {
        for (const [food] of simulation.lastFoodPositions.entries()) {
            if (!food || food.isDead || !simulation.food.includes(food)) {
                simulation.lastFoodPositions.delete(food);
                positionMapCleanups++;
            }
        }
    }
    if (positionMapCleanups > 0) {
        simulation.logger.info(`[MEMORY] Emergency: Cleaned up ${positionMapCleanups} stale position tracking Map entries`);
    }

    // MEMORY LEAK FIX: Clean up GPU weight cache for dead agents
    if (simulation.gpuCompute && simulation.gpuCompute.cleanupWeightCache) {
        simulation.gpuCompute.cleanupWeightCache(simulation.agents);
        simulation.logger.info('[MEMORY] Emergency: Cleaned GPU weight cache');
    }

    // MEMORY LEAK FIX: Clean up database cache access times
    if (simulation.db && simulation.db.cleanupStaleCacheAccessTimes) {
        simulation.db.cleanupStaleCacheAccessTimes();
        simulation.logger.info('[MEMORY] Emergency: Cleaned database cache access times');
    }
}

export function periodicMemoryCleanup(simulation) {
    // Comprehensive cleanup that runs periodically to prevent long-term memory buildup
    const sessionDurationHours = (Date.now() - simulation.startTime) / (1000 * 60 * 60);
    simulation.logger.info(`[MEMORY] Starting periodic cleanup (session: ${sessionDurationHours.toFixed(1)}h) - current usage: ${(simulation.currentMemoryUsage / 1024 / 1024).toFixed(1)}MB`);

    // Advanced garbage collection management for long-term stability
    performAdvancedGC(simulation, sessionDurationHours);

    // Process any pending database operations
    simulation.processDeadAgentQueue();
        simulation.logger.info('[MEMORY] Processed dead agent queue');

    // Force database flush under memory pressure (medium threshold)
    if (simulation.db && simulation.db.flush && simulation.currentMemoryUsage > 400) { // 400MB medium threshold
        simulation.logger.info('[MEMORY] Forcing database flush due to memory pressure');
        simulation.db.flush().catch(err => simulation.logger.warn('[MEMORY] Database flush failed:', err));
    }

    // Clean up old pheromones more aggressively over time
    const originalPheromoneCount = simulation.pheromones.length;
    let maxPheromones = 1500; // Base limit

    // Reduce pheromone limits as simulation runs longer to prevent accumulation
    if (sessionDurationHours > 1) maxPheromones = 1200;
    if (sessionDurationHours > 2) maxPheromones = 1000;
    if (sessionDurationHours > 4) maxPheromones = 800;
    if (sessionDurationHours > 8) maxPheromones = 600;
    if (sessionDurationHours > 24) maxPheromones = 400;

    if (simulation.pheromones.length > maxPheromones) {
        // Remove oldest pheromones, keeping the most recent
        const toRemove = simulation.pheromones.length - maxPheromones;
        simulation.pheromones.splice(0, toRemove);
        simulation.logger.log(`[MEMORY] Reduced pheromones to ${maxPheromones} limit (${sessionDurationHours.toFixed(1)}h session)`);
    }

    // Clean up dead references in arrays (shouldn't be necessary but defensive programming)
    simulation.agents = simulation.agents.filter(agent => agent && !agent.isDead);
    simulation.food = simulation.food.filter(food => food && !food.isDead);

    // Clean up validation queue - remove old entries (more aggressive over time)
    let maxAge = 300000; // 5 minutes base
    if (sessionDurationHours > 1) maxAge = 240000; // 4 minutes
    if (sessionDurationHours > 2) maxAge = 180000; // 3 minutes
    if (sessionDurationHours > 4) maxAge = 120000; // 2 minutes

    const now = Date.now();
    let validationEntriesRemoved = 0;
    for (const [geneId, entry] of simulation.validationManager.validationQueue.entries()) {
        if (now - entry.lastValidationTime > maxAge && !entry.isValidated) {
            simulation.logger.info(`[MEMORY] Removed stale validation entry: ${geneId} (age: ${(now - entry.lastValidationTime)/1000}s)`);
            simulation.validationManager.validationQueue.delete(geneId);
            validationEntriesRemoved++;
        }
    }
    if (validationEntriesRemoved > 0) {
        simulation.logger.info(`[MEMORY] Cleaned ${validationEntriesRemoved} stale validation queue entries`);
    }

    // Aggressive cleanup of agent memory arrays to prevent accumulation (more frequent over time)
    let agentsCleaned = 0;
    let arraySizeLimit = 1000; // Base limit

    // PERFORMANCE: More aggressive array size limits applied earlier to prevent degradation
    // Reduce array size limits as simulation runs longer
    if (sessionDurationHours > 0.5) arraySizeLimit = 600; // Start reducing after 30 minutes
    if (sessionDurationHours > 1) arraySizeLimit = 400;
    if (sessionDurationHours > 2) arraySizeLimit = 300;
    if (sessionDurationHours > 4) arraySizeLimit = 200;
    if (sessionDurationHours > 8) arraySizeLimit = 100; // More aggressive for 8+ hour sessions
    if (sessionDurationHours > 24) arraySizeLimit = 50; // Very aggressive for 24+ hour sessions

    for (const agent of simulation.agents) {
        if (agent && !agent.isDead) {
            // Only clear accumulated arrays that cause memory issues
            // DO NOT call agent.cleanup() on living agents as it breaks their neural network state!
            let arraysCleared = 0;
            if (agent.inputs && agent.inputs.length > arraySizeLimit) {
                agent.inputs.length = 0;
                arraysCleared++;
            }
            if (agent.rayData && agent.rayData.length > arraySizeLimit) {
                agent.rayData.length = 0;
                arraysCleared++;
            }
            if (agent.lastRayData && agent.lastRayData.length > arraySizeLimit) {
                agent.lastRayData.length = 0;
                arraysCleared++;
            }

            // Clean up target memory on living agents (efficient)
            if (agent.targetMemory) {
                // Limit target history (use index-based, not slice)
                if (agent.targetMemory.targetHistoryCount > 5) {
                    // Shift array efficiently
                    const keepCount = 5;
                    for (let i = 0; i < keepCount; i++) {
                        agent.targetMemory.targetHistory[i] = agent.targetMemory.targetHistory[agent.targetMemory.targetHistoryCount - keepCount + i];
                    }
                    agent.targetMemory.targetHistoryCount = keepCount;
                    arraysCleared++;
                }
                // Clear expired targets (frame-based check, efficient)
                if (agent.targetMemory.currentTarget && agent.targetMemory.lastTargetSeen > 0) {
                    const framesSinceSeen = agent.framesAlive - agent.targetMemory.lastTargetSeen;
                    if (framesSinceSeen > agent.targetMemory.attentionSpan) {
                        agent.targetMemory.currentTarget = null;
                        agent.targetMemory.lastTargetSeen = 0;
                    }
                }
            }

            // Limit goal memory history
            if (agent.goalMemory && agent.goalMemory.recentGoals && agent.goalMemory.recentGoals.length > 20) {
                // Use efficient array trimming
                const keepCount = 20;
                for (let i = 0; i < keepCount; i++) {
                    agent.goalMemory.recentGoals[i] = agent.goalMemory.recentGoals[agent.goalMemory.recentGoals.length - keepCount + i];
                }
                agent.goalMemory.recentGoals.length = keepCount;
                arraysCleared++;
            }

            if (arraysCleared > 0) {
                agentsCleaned++;
                simulation.logger.info(`[MEMORY] Cleared ${arraysCleared} large arrays for agent ${agent.geneId} (${arraySizeLimit} limit)`);
            }
        }
    }
    simulation.logger.info(`[MEMORY] Cleaned memory arrays for ${agentsCleaned} agents (${arraySizeLimit} limit)`);

    // Force cleanup of any remaining visual effects that might have leaked
    if (simulation.renderer && simulation.renderer.agentEffectsGroup) {
        const effectsBefore = simulation.renderer.agentEffectsGroup.children.length;
        // The renderer updateVisualEffectsRendering already disposes properly,
        // but force a cleanup just in case
        while (simulation.renderer.agentEffectsGroup.children.length > 0) {
            const child = simulation.renderer.agentEffectsGroup.children[0];
            simulation.renderer.agentEffectsGroup.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        }
        if (effectsBefore > 0) {
            simulation.logger.info(`[MEMORY] Cleaned up ${effectsBefore} visual effect meshes`);
        }
    }

    // Clear dashboard history if it's getting too large (prevent memory bloat)
    const maxDashboardHistory = 100; // Base limit
    if (sessionDurationHours > 1) {
        // Reduce dashboard history retention over time
        if (simulation.dashboardHistory.length > maxDashboardHistory / 2) {
            const keepRecent = Math.floor(maxDashboardHistory / 4);
            simulation.dashboardHistory.splice(0, simulation.dashboardHistory.length - keepRecent);
            simulation.logger.info(`[MEMORY] Trimmed dashboard history to ${keepRecent} entries (${sessionDurationHours.toFixed(1)}h session)`);
        }
    }

    // Clear fitness history if getting too large (prevent memory bloat)
    const maxFitnessHistory = 100; // Base limit
    if (simulation.fitnessHistory.length > maxFitnessHistory) {
        const keepRecent = Math.floor(maxFitnessHistory / 2);
        simulation.fitnessHistory.splice(0, simulation.fitnessHistory.length - keepRecent);
        if (simulation.averageFitnessHistory) {
            simulation.averageFitnessHistory.splice(0, simulation.averageFitnessHistory.length - keepRecent);
        }
        if (simulation.medianFitnessHistory) {
            simulation.medianFitnessHistory.splice(0, simulation.medianFitnessHistory.length - keepRecent);
        }
        simulation.logger.info(`[MEMORY] Trimmed fitness history to ${keepRecent} entries`);
    }

    // Force JavaScript garbage collection if available (more aggressive over time)
    if (window.gc) {
        if (sessionDurationHours > 1 || simulation.currentMemoryUsage > 400) {
            window.gc();
            simulation.logger.info('[MEMORY] Forced garbage collection (session-aware)');
        }
    }

    // Log cleanup activity
    if (originalPheromoneCount > simulation.pheromones.length) {
        simulation.logger.log(`[MEMORY] Periodic cleanup: Reduced pheromones from ${originalPheromoneCount} to ${simulation.pheromones.length} (${sessionDurationHours.toFixed(1)}h session)`);
    }

    // Log memory trends for debugging long-term stability
    if (simulation.memoryHistory.length >= 2) {
        const recent = simulation.memoryHistory.slice(-10);
        if (recent.length >= 2) {
            const oldest = recent[0];
            const newest = recent[recent.length - 1];
            const timeDiff = (newest.time - oldest.time) / 1000 / 60; // minutes
            const memoryDiff = newest.memory - oldest.memory;
            const growthRate = timeDiff > 0 ? memoryDiff / timeDiff : 0;
            if (Math.abs(growthRate) > 0.5) { // Log significant trends
                simulation.logger.info(`[MEMORY] Trend: ${growthRate > 0 ? '+' : ''}${growthRate.toFixed(2)}MB/min over last ${timeDiff.toFixed(1)}min`);
            }
        }
    }

    // MEMORY LEAK FIX: Clean up position tracking Maps periodically
    let positionMapCleanups = 0;
    if (simulation.lastAgentPositions) {
        for (const [agent] of simulation.lastAgentPositions.entries()) {
            if (!agent || agent.isDead || !simulation.agents.includes(agent)) {
                simulation.lastAgentPositions.delete(agent);
                positionMapCleanups++;
            }
        }
    }
    if (simulation.lastFoodPositions) {
        for (const [food] of simulation.lastFoodPositions.entries()) {
            if (!food || food.isDead || !simulation.food.includes(food)) {
                simulation.lastFoodPositions.delete(food);
                positionMapCleanups++;
            }
        }
    }
    if (positionMapCleanups > 0) {
        simulation.logger.info(`[MEMORY] Cleaned up ${positionMapCleanups} stale position tracking Map entries`);
    }

    // MEMORY LEAK FIX: Clean up GPU weight cache for dead agents (more frequent for long sessions)
    if (simulation.gpuCompute && simulation.gpuCompute.cleanupWeightCache) {
        const shouldCleanup = sessionDurationHours > 1 || simulation.currentMemoryUsage > 300;
        if (shouldCleanup) {
            simulation.gpuCompute.cleanupWeightCache(simulation.agents);
            simulation.logger.info('[MEMORY] Cleaned GPU weight cache');
        }
    }

    // MEMORY LEAK FIX: Clean up database cache access times
    if (simulation.db && simulation.db.cleanupStaleCacheAccessTimes) {
        simulation.db.cleanupStaleCacheAccessTimes();
    }

    // MEMORY LEAK FIX: Clear validation queue weights more aggressively (not just for 8+ hour sessions)
    if (sessionDurationHours > 0.5) { // Start clearing weights after 30 minutes
        let weightsCleared = 0;
        const now = Date.now();
        const weightRetentionTime = sessionDurationHours > 24 ? 300000 : 900000; // 5 min for 24+ hour sessions, 15 min otherwise
        
        for (const [geneId, entry] of simulation.validationManager.validationQueue.entries()) {
            // Clear weights from validated entries immediately (they're already saved)
            if (entry.isValidated && entry.weights) {
                entry.weights = null;
                weightsCleared++;
            }
            // Clear weights from old entries that haven't been accessed recently
            else if (!entry.isValidated && entry.weights && (now - entry.lastValidationTime > weightRetentionTime)) {
                entry.weights = null;
                weightsCleared++;
            }
        }
        if (weightsCleared > 0) {
            simulation.logger.info(`[MEMORY] Cleared weights from ${weightsCleared} validation queue entries (${sessionDurationHours.toFixed(1)}h session)`);
        }
    }

    // Clear object pools to prevent long-term memory accumulation
    simulation.logger.info('[MEMORY] Clearing object pools to prevent memory leaks');
    clearGPUResourcePools();
    neuralArrayPool.clearOldPools();

    // More aggressive cleanup for 8+ hour sessions
    if (sessionDurationHours >= 8) {
        simulation.logger.info(`[MEMORY] Performing aggressive cleanup for long session (${sessionDurationHours.toFixed(1)}h)`);
        
        // Force GPU cache cleanup more aggressively
        if (simulation.gpuCompute && simulation.gpuCompute.deepCleanup) {
            simulation.gpuCompute.deepCleanup(sessionDurationHours, simulation.agents);
        }
        if (simulation.gpuPhysics && simulation.gpuPhysics.deepCleanup) {
            simulation.gpuPhysics.deepCleanup(sessionDurationHours);
        }

        // MEMORY LEAK FIX: More aggressive validation queue weight clearing
        let weightsCleared = 0;
        const now = Date.now();
        const weightRetentionTime = sessionDurationHours > 24 ? 300000 : 600000; // 5 min for 24+ hour sessions, 10 min otherwise
        
        for (const [geneId, entry] of simulation.validationManager.validationQueue.entries()) {
            // Clear weights from validated entries immediately (they're already saved)
            if (entry.isValidated && entry.weights) {
                entry.weights = null;
                weightsCleared++;
            }
            // Clear weights from old entries that haven't been accessed recently
            else if (!entry.isValidated && entry.weights && (now - entry.lastValidationTime > weightRetentionTime)) {
                entry.weights = null;
                weightsCleared++;
            }
        }
        if (weightsCleared > 0) {
            simulation.logger.info(`[MEMORY] Cleared weights from ${weightsCleared} validation queue entries (${sessionDurationHours.toFixed(1)}h session)`);
        }

        // More aggressive fitness history cleanup for very long sessions
        if (sessionDurationHours >= 24 && simulation.fitnessHistory.length > 20) {
            const keepRecent = 10; // Keep only last 10 entries for 24+ hour sessions
            simulation.fitnessHistory.splice(0, simulation.fitnessHistory.length - keepRecent);
            if (simulation.averageFitnessHistory) {
                simulation.averageFitnessHistory.splice(0, simulation.averageFitnessHistory.length - keepRecent);
            }
            if (simulation.medianFitnessHistory) {
                simulation.medianFitnessHistory.splice(0, simulation.medianFitnessHistory.length - keepRecent);
            }
            simulation.logger.info(`[MEMORY] Aggressively trimmed fitness history to ${keepRecent} entries (24+ hour session)`);
        }

        // More aggressive dashboard history cleanup
        if (sessionDurationHours >= 24 && simulation.dashboardHistory.length > 20) {
            const keepRecent = 10;
            simulation.dashboardHistory.splice(0, simulation.dashboardHistory.length - keepRecent);
            simulation.logger.info(`[MEMORY] Aggressively trimmed dashboard history to ${keepRecent} entries (24+ hour session)`);
        }

        // Force garbage collection more frequently for very long sessions
        if (window.gc && sessionDurationHours >= 12) {
            window.gc();
            simulation.logger.info('[MEMORY] Forced garbage collection (12+ hour session)');
        }
    }

    // Log pool statistics for debugging
    const poolStats = {
        gpuRingGeometry: 0, // Would need to expose stats
        gpuMaterials: 0,
        neuralArrays: Object.keys(neuralArrayPool.getStats()).length,
        collisionSets: collisionSetPool.getStats().poolSize
    };
    simulation.logger.info(`[MEMORY] Pool cleanup completed - Neural array pools: ${poolStats.neuralArrays} sizes, Collision sets: ${poolStats.collisionSets}`);
}

/**
 * Advanced garbage collection management for long-term stability
 * @param {Simulation} simulation - The simulation instance
 * @param {number} sessionDurationHours - Hours since simulation started
 */
export function performAdvancedGC(simulation, sessionDurationHours) {
    const now = Date.now();

    // Initialize GC tracking if not already done
    if (!simulation.gcStats) {
        simulation.gcStats = {
            lastGC: 0,
            gcCount: 0,
            totalGCTime: 0,
            heapSizeHistory: [],
            gcPressureHistory: []
        };
    }

    // Track heap size if available
    if (performance.memory) {
        const heapSize = performance.memory.usedJSHeapSize / 1024 / 1024; // MB
        simulation.gcStats.heapSizeHistory.push({ time: now, size: heapSize });

        // Keep only last 50 heap measurements
        if (simulation.gcStats.heapSizeHistory.length > 50) {
            simulation.gcStats.heapSizeHistory.shift();
        }
    }

    // Adaptive GC triggering based on session duration and memory trends
    let shouldTriggerGC = false;
    let gcReason = '';

    // Always trigger GC for very long sessions
    if (sessionDurationHours > 24) {
        shouldTriggerGC = true;
        gcReason = 'long_session';
    } else if (sessionDurationHours > 8) {
        // For long sessions, trigger GC every 2 hours
        const timeSinceLastGC = now - simulation.gcStats.lastGC;
        if (timeSinceLastGC > (2 * 60 * 60 * 1000)) { // 2 hours
            shouldTriggerGC = true;
            gcReason = 'regular_long_session';
        }
    } else if (sessionDurationHours > 2) {
        // For medium sessions, trigger GC every 4 hours
        const timeSinceLastGC = now - simulation.gcStats.lastGC;
        if (timeSinceLastGC > (4 * 60 * 60 * 1000)) { // 4 hours
            shouldTriggerGC = true;
            gcReason = 'regular_medium_session';
        }
    }

    // Trigger GC based on memory growth trends
    if (!shouldTriggerGC && simulation.gcStats.heapSizeHistory.length >= 5) {
        const recent = simulation.gcStats.heapSizeHistory.slice(-5);
        const growthRate = calculateMemoryGrowthRate(recent);

        // Trigger GC if memory is growing rapidly (> 10MB per hour)
        if (growthRate > 10) {
            shouldTriggerGC = true;
            gcReason = 'memory_growth';
        }

        // Track GC pressure
        simulation.gcStats.gcPressureHistory.push({
            time: now,
            growthRate,
            heapSize: recent[recent.length - 1].size
        });

        // Keep only last 20 pressure measurements
        if (simulation.gcStats.gcPressureHistory.length > 20) {
            simulation.gcStats.gcPressureHistory.shift();
        }
    }

    // Trigger GC based on memory pressure patterns
    if (!shouldTriggerGC && simulation.memoryHistory.length >= 10) {
        const recentMemory = simulation.memoryHistory.slice(-10);
        const memoryVariance = calculateMemoryVariance(recentMemory);

        // High variance indicates unstable memory usage
        if (memoryVariance > 50) { // 50MB variance
            shouldTriggerGC = true;
            gcReason = 'memory_instability';
        }
    }

    if (shouldTriggerGC && window.gc) {
        const gcStart = performance.now();
        window.gc();
        const gcTime = performance.now() - gcStart;

        simulation.gcStats.lastGC = now;
        simulation.gcStats.gcCount++;
        simulation.gcStats.totalGCTime += gcTime;

        simulation.logger.info(`[GC] Triggered garbage collection (${gcReason}) - took ${gcTime.toFixed(2)}ms, session: ${sessionDurationHours.toFixed(1)}h`);
    }
}

/**
 * Calculate memory growth rate from heap size history
 * @param {Array} heapHistory - Array of {time, size} objects
 * @returns {number} - Growth rate in MB per hour
 */
function calculateMemoryGrowthRate(heapHistory) {
    if (heapHistory.length < 2) return 0;

    const first = heapHistory[0];
    const last = heapHistory[heapHistory.length - 1];
    const timeDiffHours = (last.time - first.time) / (1000 * 60 * 60);
    const sizeDiff = last.size - first.size;

    return timeDiffHours > 0 ? sizeDiff / timeDiffHours : 0;
}

/**
 * Calculate memory usage variance
 * @param {Array} memoryHistory - Array of memory history objects
 * @returns {number} - Variance in MB
 */
function calculateMemoryVariance(memoryHistory) {
    if (memoryHistory.length < 2) return 0;

    const values = memoryHistory.map(entry => entry.memory);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;

    return Math.sqrt(variance);
}

/**
 * Get garbage collection statistics
 * @param {Simulation} simulation - The simulation instance
 * @returns {Object} - GC statistics
 */
export function getGCStats(simulation) {
    if (!simulation.gcStats) {
        return { available: false };
    }

    const stats = simulation.gcStats;
    const avgGCTime = stats.gcCount > 0 ? stats.totalGCTime / stats.gcCount : 0;

    return {
        available: true,
        gcCount: stats.gcCount,
        avgGCTime,
        totalGCTime: stats.totalGCTime,
        lastGC: stats.lastGC,
        heapHistorySize: stats.heapSizeHistory.length,
        pressureHistorySize: stats.gcPressureHistory.length
    };
}
