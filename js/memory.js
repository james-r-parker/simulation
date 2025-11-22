// Memory management functions moved from game.js

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
        if (simulation.currentMemoryUsage > 0) {
            memoryText = `Memory: ${simulation.currentMemoryUsage.toFixed(1)}MB`;
            if (simulation.memoryGrowthRate > 0.1) {
                memoryText += ` (↗️ +${simulation.memoryGrowthRate.toFixed(1)}MB/min)`;
                memoryEl.style.color = '#ff6b6b';
            } else if (simulation.memoryGrowthRate < -0.1) {
                memoryText += ` (↘️ ${simulation.memoryGrowthRate.toFixed(1)}MB/min)`;
                memoryEl.style.color = '#51cf66';
            } else {
                memoryEl.style.color = '#ffd43b';
            }
        } else {
            memoryText = `Memory: ~${(simulation.entityCounts.agents * 2 + simulation.entityCounts.food * 0.1 + simulation.entityCounts.pheromones * 0.05).toFixed(1)}MB (est.)`;
            memoryEl.style.color = '#868e96';
        }
        memoryEl.textContent = memoryText;
    }

    // Update dashboard memory metrics
    const currentMemoryEl = document.getElementById('current-memory');
    const totalEntityCountEl = document.getElementById('total-entity-count');

    if (currentMemoryEl) {
        currentMemoryEl.textContent = simulation.currentMemoryUsage > 0 ? `${simulation.currentMemoryUsage.toFixed(1)}MB` : 'N/A';
    }
    if (totalEntityCountEl) {
        const totalEntities = simulation.entityCounts.agents + simulation.entityCounts.food + simulation.entityCounts.pheromones;
        totalEntityCountEl.textContent = totalEntities;
    }
}

export function handleMemoryPressure(simulation) {
    const now = Date.now();
    const timeSinceLastAction = now - simulation.lastMemoryPressureAction;

    // Only take action if memory usage is high and we haven't acted recently (avoid spam)
    if (simulation.currentMemoryUsage > simulation.memoryPressureThreshold && timeSinceLastAction > 30000) { // 30 seconds minimum between actions
        simulation.logger.warn(`[MEMORY] High memory usage detected: ${(simulation.currentMemoryUsage / 1024 / 1024).toFixed(1)}MB. Taking corrective action.`);

        // Force garbage collection if available
        if (window.gc) {
            window.gc();
            simulation.logger.log('[MEMORY] Forced garbage collection');
        }

        // Aggressive cleanup actions
        aggressiveMemoryCleanup(simulation);

        simulation.memoryPressureActions++;
        simulation.lastMemoryPressureAction = now;

        console.log(`[MEMORY] Memory pressure cleanup completed - reduced usage to ${(simulation.currentMemoryUsage / 1024 / 1024).toFixed(1)}MB`);

        // Update UI to show memory pressure action
        const memoryEl = document.getElementById('info-memory');
        if (memoryEl) {
            const currentText = memoryEl.textContent;
            memoryEl.textContent = currentText + ' (GC)';
            setTimeout(() => {
                if (memoryEl.textContent.includes(' (GC)')) {
                    memoryEl.textContent = memoryEl.textContent.replace(' (GC)', '');
                }
            }, 2000);
        }
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
    const memoryPressureRatio = simulation.currentMemoryUsage / simulation.memoryPressureThreshold;
    if (memoryPressureRatio > 1.2) { // Clear GPU caches if memory usage is 120% of threshold
        if (simulation.gpuCompute && simulation.gpuCompute.clearCache) {
            simulation.gpuCompute.clearCache();
            console.log('[MEMORY] Cleared GPU compute cache (severe memory pressure)');
        }
        if (simulation.gpuPhysics && simulation.gpuPhysics.clearCache) {
            simulation.gpuPhysics.clearCache();
            console.log('[MEMORY] Cleared GPU physics cache (severe memory pressure)');
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

export function periodicMemoryCleanup(simulation) {
    // Comprehensive cleanup that runs periodically to prevent long-term memory buildup
    console.log(`[MEMORY] Starting periodic cleanup - current usage: ${(simulation.currentMemoryUsage / 1024 / 1024).toFixed(1)}MB`);

    // Process any pending database operations
    simulation.processDeadAgentQueue();
    console.log('[MEMORY] Processed dead agent queue');

    // Force database flush under memory pressure
    if (simulation.db && simulation.db.flush && simulation.currentMemoryUsage > simulation.memoryPressureThreshold * 0.8) {
        console.log('[MEMORY] Forcing database flush due to memory pressure');
        simulation.db.flush().catch(err => simulation.logger.warn('[MEMORY] Database flush failed:', err));
    }

    // Clean up old pheromones more aggressively
    const originalPheromoneCount = simulation.pheromones.length;
    const maxPheromones = 1500; // Slightly higher than spawn limit to allow some buffer

    if (simulation.pheromones.length > maxPheromones) {
        // Remove oldest pheromones, keeping the most recent
        const toRemove = simulation.pheromones.length - maxPheromones;
        simulation.pheromones.splice(0, toRemove);
    }

    // Clean up dead references in arrays (shouldn't be necessary but defensive programming)
    simulation.agents = simulation.agents.filter(agent => agent && !agent.isDead);
    simulation.food = simulation.food.filter(food => food && !food.isDead);

    // Clean up validation queue - remove old entries
    const maxAge = 300000; // 5 minutes
    const now = Date.now();
    let validationEntriesRemoved = 0;
    for (const [geneId, entry] of simulation.validationQueue.entries()) {
        if (now - entry.lastValidationTime > maxAge && !entry.isValidated) {
            console.log(`[MEMORY] Removed stale validation entry: ${geneId} (age: ${(now - entry.lastValidationTime)/1000}s)`);
            simulation.validationQueue.delete(geneId);
            validationEntriesRemoved++;
        }
    }
    if (validationEntriesRemoved > 0) {
        console.log(`[MEMORY] Cleaned ${validationEntriesRemoved} stale validation queue entries`);
    }

    // Aggressive cleanup of agent memory arrays to prevent accumulation
    let agentsCleaned = 0;
    for (const agent of simulation.agents) {
        if (agent && !agent.isDead) {
            // Clear and reinitialize memory arrays to prevent memory leaks
            agent.cleanup();
            agentsCleaned++;

            // Force clear any accumulated arrays
            let arraysCleared = 0;
            if (agent.inputs && agent.inputs.length > 1000) {
                agent.inputs.length = 0;
                arraysCleared++;
            }
            if (agent.rayData && agent.rayData.length > 1000) {
                agent.rayData.length = 0;
                arraysCleared++;
            }
            if (agent.lastRayData && agent.lastRayData.length > 1000) {
                agent.lastRayData.length = 0;
                arraysCleared++;
            }
            if (arraysCleared > 0) {
                console.log(`[MEMORY] Cleared ${arraysCleared} large arrays for agent ${agent.geneId}`);
            }
        }
    }
    console.log(`[MEMORY] Cleaned memory arrays for ${agentsCleaned} agents`);

    // Log cleanup activity
    if (originalPheromoneCount > simulation.pheromones.length) {
        simulation.logger.log(`[MEMORY] Periodic cleanup: Reduced pheromones from ${originalPheromoneCount} to ${simulation.pheromones.length}`);
    }
}
