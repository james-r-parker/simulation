// --- AUTO-PERFORMANCE ADJUSTMENT ---
// Automatically adjusts game performance based on FPS

/**
 * Perform auto-performance adjustment based on FPS history
 * @param {Object} simulation - Simulation instance with adjustment properties
 * @param {Array} fpsHistory - Array of recent FPS values
 * @param {number} targetFps - Target FPS to maintain
 * @param {Object} logger - Logger instance
 * @param {Object} toast - Toast notification system
 * @returns {boolean} True if adjustment was made
 */
export function performAutoAdjustment(simulation, fpsHistory, targetFps, logger, toast) {
    if (!fpsHistory || fpsHistory.length === 0) {
        return false;
    }

    // Calculate average FPS over the history
    const avgFps = fpsHistory.reduce((sum, fps) => sum + fps, 0) / fpsHistory.length;
    const minFps = Math.min(...fpsHistory);
    const maxFps = Math.max(...fpsHistory);

    // Count living agents
    const livingAgents = simulation.agents.filter(a => !a.isDead).length;

    logger.info(`[AUTO-ADJUST] FPS: avg=${avgFps.toFixed(1)}, range=${minFps}-${maxFps}, agents=${livingAgents}/${simulation.maxAgents}, speed=${simulation.gameSpeed}`);

    // Determine if we need to adjust
    let adjustmentNeeded = false;
    let increasePerformance = false;
    let decreasePerformance = false;

    // If consistently below target FPS, decrease performance
    if (avgFps < targetFps - 5 && minFps < targetFps - 10) {
        decreasePerformance = true;
        adjustmentNeeded = true;
        logger.info(`[AUTO-ADJUST] ⚠️ Low FPS detected - decreasing performance`);
    }
    // If consistently above target FPS with headroom, increase performance
    else if (avgFps > targetFps + 5 && minFps > targetFps - 5) {
        increasePerformance = true;
        adjustmentNeeded = true;
        logger.info(`[AUTO-ADJUST] ✅ High FPS detected - increasing performance`);
    } else {
        logger.info(`[AUTO-ADJUST] ➡️ FPS within target range (${targetFps} ±5) - no adjustment needed`);
    }

    if (adjustmentNeeded) {
        // Prioritize: agents first (more impactful), then speed
        if (decreasePerformance) {
            // Decrease performance: reduce agents first, then speed
            if (simulation.maxAgents > simulation.minAgents) {
                const oldValue = simulation.maxAgents;
                const newMaxAgents = Math.max(simulation.minAgents, Math.floor(simulation.maxAgents * 0.8));
                if (newMaxAgents !== simulation.maxAgents) {
                    simulation.maxAgents = newMaxAgents;
                    logger.info(`[AUTO-ADJUST] ↓ Reduced max agents to ${simulation.maxAgents} (FPS: ${avgFps.toFixed(1)})`);
                    // Update UI slider
                    const slider = document.getElementById('maxAgents');
                    if (slider) slider.value = simulation.maxAgents;
                    // Update food scaling
                    import('./spawn.js').then(module => module.updateFoodScalingFactor(simulation));
                    // Show toast notification
                    if (toast) {
                        toast.showAutoAdjust('down', 'max agents', oldValue, newMaxAgents, avgFps);
                    }
                    return true; // Only make one adjustment per cycle
                }
            }
            if (simulation.gameSpeed > simulation.minGameSpeed) {
                const oldValue = simulation.gameSpeed;
                simulation.gameSpeed = Math.max(simulation.minGameSpeed, simulation.gameSpeed - 0.5);
                logger.info(`[AUTO-ADJUST] ↓ Reduced game speed to ${simulation.gameSpeed} (FPS: ${avgFps.toFixed(1)})`);
                // Update UI slider
                const slider = document.getElementById('gameSpeed');
                if (slider) slider.value = simulation.gameSpeed;
                // Show toast notification
                if (toast) {
                    toast.showAutoAdjust('down', 'game speed', oldValue, simulation.gameSpeed, avgFps);
                }
                return true;
            }
        }
        else if (increasePerformance) {
            // Increase performance: increase agents first (more impactful), then speed
            if (simulation.maxAgents < simulation.autoMaxAgents) {
                // Increase agents more aggressively when performance is consistently good (up to 75% cap)
                const oldValue = simulation.maxAgents;
                const newMaxAgents = Math.min(simulation.autoMaxAgents, Math.floor(simulation.maxAgents * 1.5));
                if (newMaxAgents !== simulation.maxAgents) {
                    simulation.maxAgents = newMaxAgents;
                    logger.info(`[AUTO-ADJUST] ↑ Increased max agents to ${simulation.maxAgents}/${simulation.autoMaxAgents} cap (FPS: ${avgFps.toFixed(1)})`);
                    // Update UI slider
                    const slider = document.getElementById('maxAgents');
                    if (slider) slider.value = simulation.maxAgents;
                    // Update food scaling
                    import('./spawn.js').then(module => module.updateFoodScalingFactor(simulation));
                    // Show toast notification
                    if (toast) {
                        toast.showAutoAdjust('up', 'max agents', oldValue, newMaxAgents, avgFps);
                    }
                    return true; // Only make one adjustment per cycle
                }
            }
            if (simulation.gameSpeed < simulation.autoMaxSpeed) {
                const oldValue = simulation.gameSpeed;
                simulation.gameSpeed = Math.min(simulation.autoMaxSpeed, simulation.gameSpeed + 0.5);
                logger.info(`[AUTO-ADJUST] ↑ Increased game speed to ${simulation.gameSpeed}/${simulation.autoMaxSpeed} cap (FPS: ${avgFps.toFixed(1)})`);
                // Update UI slider
                const slider = document.getElementById('gameSpeed');
                if (slider) slider.value = simulation.gameSpeed;
                // Show toast notification
                if (toast) {
                    toast.showAutoAdjust('up', 'game speed', oldValue, simulation.gameSpeed, avgFps);
                }
                return true;
            }
        }
    } else {
        logger.debug(`[AUTO-ADJUST] No adjustment needed (FPS: ${avgFps.toFixed(1)}, target: ${targetFps})`);
    }

    return false;
}













