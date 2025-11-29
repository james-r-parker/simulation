// Performance Instrumentation Framework
// Tracks timing metrics for different simulation phases with async support

export class PerformanceMonitor {
    constructor(logger, sampleSize = 60) {
        this.logger = logger; // Logger instance for debug output
        this.sampleSize = sampleSize; // Number of frames to average over (e.g., 60 = 1 second at 60 FPS)

        // Timing buckets for different phases (hierarchical)
        this.timings = {
            frame: [],           // Total frame time
            perception: {        // Agent perception (parent phase)
                total: [],           // Total perception time
                rayTracing: [],      // GPU ray tracing
                neuralNetwork: [],   // Neural network forward pass
                cpuFallback: []      // CPU perception fallback
            },
            physics: {           // Physics updates (parent phase)
                total: [],           // Total physics time
                collisions: [],      // Collision detection
                agentUpdates: [],    // Agent position/movement updates
                entityUpdates: []    // Food/pheromone updates
            },
            rendering: {         // Rendering/visual updates (parent phase)
                total: [],           // Total rendering time
                updates: [],         // Renderer updates (agents, food, etc.)
                visualEffects: [],   // Visual effects updates
                rayRendering: [],    // Ray visualization
                render: []          // Actual rendering
            },
            cleanup: [],         // Dead agent cleanup
            spawning: [],        // Food/agent spawning
            spawn: [],           // General spawning phase
            spawn_agents: [],    // Agent spawn queue processing
            quadtree: [],        // Quadtree rebuilding
            memory: [],          // Memory management
            camera: [],          // Camera updates
            obstacles: [],       // Obstacle updates
            logging: [],         // Performance logging
            ui: [],             // UI updates and FPS display
            autoAdjust: [],     // Auto-performance adjustment logic
            housekeeping: [],   // FPS tracking, GPU/CPU frame counting, wake lock
            misc: [],          // Miscellaneous operations (logging, warnings, etc.)
            other: []           // Everything else
        };

        // Current frame measurements (temporary storage)
        this.currentFrame = {};
        this.frameStartTime = 0;
        this.phaseStack = []; // Stack for hierarchical phase tracking

        // Statistics
        this.stats = {
            fps: 0,
            frameTime: 0,
            breakdown: {}
        };

        // Enabled flag for performance (can disable in production)
        this.enabled = true;

        // Long-term performance degradation detection
        this.baselineFrameTime = null; // Baseline performance established after first minute
        this.degradationThreshold = 1.5; // 50% performance degradation triggers recovery
        this.baselineEstablished = false;
        this.lastRecoveryAttempt = 0;
        this.recoveryCooldownMs = 300000; // 5 minutes between recovery attempts
        this.degradationHistory = []; // Track degradation over time

        // Cross-frame phase tracking for async operations
        this.pendingPhases = new Map(); // Track phases that span frames
    }

    // Start timing the entire frame
    startFrame() {
        if (!this.enabled) return;
        this.frameStartTime = performance.now();
        this.currentFrame = {};
    }

    // Start timing a specific phase (supports hierarchical phases like 'perception.rayTracing')
    startPhase(phaseName) {
        if (!this.enabled) return;

        const now = performance.now();
        const phasePath = phaseName.split('.');
        const parentPhase = phasePath[0];
        const subPhase = phasePath[1];


        // Check if this phase is already pending from a previous frame
        const pendingKey = `${parentPhase}${subPhase ? '.' + subPhase : ''}`;
        if (this.pendingPhases.has(pendingKey)) {
            // Resume timing from pending phase
            const pendingPhase = this.pendingPhases.get(pendingKey);
            pendingPhase.start = now; // Reset start time for this frame
            this.phaseStack.push({ name: phaseName, start: now, resumed: true });
            return;
        }

        // Initialize phase tracking
        if (!this.currentFrame[parentPhase]) {
            this.currentFrame[parentPhase] = {
                start: now,
                duration: 0,
                subPhases: {}
            };
        }

        // Handle sub-phases
        if (subPhase) {
            if (!this.currentFrame[parentPhase].subPhases[subPhase]) {
                this.currentFrame[parentPhase].subPhases[subPhase] = { start: now, duration: 0 };
            } else {
                this.currentFrame[parentPhase].subPhases[subPhase].start = now;
            }
        } else {
            // Parent phase timing
            this.currentFrame[parentPhase].start = now;
        }

        // Push to phase stack for hierarchical tracking
        this.phaseStack.push({ name: phaseName, start: now });
    }

    // End timing a specific phase
    endPhase(phaseName) {
        if (!this.enabled) return;

        const now = performance.now();
        const phasePath = phaseName.split('.');
        const parentPhase = phasePath[0];
        const subPhase = phasePath[1];
        const pendingKey = `${parentPhase}${subPhase ? '.' + subPhase : ''}`;


        // Check if this phase was resumed from a pending state
        const wasResumed = this.phaseStack.length > 0 && this.phaseStack[this.phaseStack.length - 1].resumed;

        // Validate phase stack
        if (this.phaseStack.length === 0 || this.phaseStack[this.phaseStack.length - 1].name !== phaseName) {
            // Phase not found in current stack - this might be an async operation completing in a different frame
            // Mark it as pending for the next frame
            this.pendingPhases.set(pendingKey, {
                phaseName,
                start: now,
                parentPhase,
                subPhase,
                pendingSince: now
            });
            // Only log cross-frame phase completion occasionally to reduce spam
            if (Math.random() < 0.01) { // Log ~1% of the time
                this.logger.debug(`[PERF] Phase '${phaseName}' completed in different frame, marked as pending`);
            }
            return;
        }

        // If phase was resumed from pending state, calculate its total duration and mark as completed
        if (wasResumed) {
            const pendingData = this.pendingPhases.get(pendingKey);
            if (pendingData) {
                // For resumed phases, the duration should be from the original start time to now
                // But we need to be careful not to double-count time already spent
                const totalDuration = now - pendingData.start;
                pendingData.duration = totalDuration;
                pendingData.completedInThisFrame = true;
                // Don't remove from pending yet - we'll use it in endFrame for accounting
            }
        }

        if (this.currentFrame[parentPhase]) {
            if (subPhase && this.currentFrame[parentPhase].subPhases[subPhase]) {
                // End sub-phase timing
                const duration = now - this.currentFrame[parentPhase].subPhases[subPhase].start;
                this.currentFrame[parentPhase].subPhases[subPhase].duration += duration;
                // Accumulate sub-phase time into parent phase
                this.currentFrame[parentPhase].duration += duration;
            } else {
                // End parent phase timing
                // If parent has no sub-phases accumulated yet, calculate from start time
                // If parent has sub-phases, add any remaining time not covered by sub-phases
                const totalParentTime = now - this.currentFrame[parentPhase].start;
                const remainingTime = totalParentTime - this.currentFrame[parentPhase].duration;
                if (remainingTime > 0) {
                    this.currentFrame[parentPhase].duration += remainingTime;
                }
            }
        }

        // Pop from phase stack
        if (this.phaseStack.length > 0 && this.phaseStack[this.phaseStack.length - 1].name === phaseName) {
            this.phaseStack.pop();
        }
    }

    // Async timing wrapper for operations that return promises
    async timeAsync(phaseName, asyncOperation) {
        if (!this.enabled) {
            return await asyncOperation();
        }

        this.startPhase(phaseName);
        try {
            const result = await asyncOperation();
            this.endPhase(phaseName);
            return result;
        } catch (error) {
            this.endPhase(phaseName);
            throw error;
        }
    }

    // Synchronous timing wrapper for operations
    timeSync(phaseName, syncOperation) {
        if (!this.enabled) {
            return syncOperation();
        }

        this.startPhase(phaseName);
        try {
            const result = syncOperation();
            this.endPhase(phaseName);
            return result;
        } catch (error) {
            this.endPhase(phaseName);
            throw error;
        }
    }

    // End timing the entire frame and update statistics
    endFrame() {
        if (!this.enabled) return;

        const totalFrameTime = performance.now() - this.frameStartTime;

        // Record frame time
        this.timings.frame.push(totalFrameTime);
        if (this.timings.frame.length > this.sampleSize) {
            this.timings.frame.shift();
        }

        // Record phase timings (handle hierarchical structure and iteration-specific phases)
        let accountedTime = 0;
        const aggregatedPhases = {};

        // First, aggregate phases by base name (remove iteration suffix)
        for (const [phase, data] of Object.entries(this.currentFrame)) {
            const basePhase = phase.replace(/_\d+$/, ''); // Remove iteration suffix like _0, _1, etc.

            if (!aggregatedPhases[basePhase]) {
                aggregatedPhases[basePhase] = {
                    duration: 0,
                    subPhases: {}
                };
            }

            // Aggregate duration
            aggregatedPhases[basePhase].duration += data.duration || 0;

            // Aggregate sub-phases
            for (const [subPhase, subData] of Object.entries(data.subPhases || {})) {
                if (!aggregatedPhases[basePhase].subPhases[subPhase]) {
                    aggregatedPhases[basePhase].subPhases[subPhase] = { duration: 0 };
                }
                aggregatedPhases[basePhase].subPhases[subPhase].duration += subData.duration;
            }
        }

        // Also include completed pending phases in aggregation
        for (const [pendingKey, pendingData] of this.pendingPhases.entries()) {
            if (pendingData.completedInThisFrame) {
                // Handle both iteration suffixes and sub-phases
                let fullPhaseName = pendingKey;
                let basePhase = fullPhaseName;
                let subPhase = null;

                // Check if it's a sub-phase (contains dot)
                const dotIndex = fullPhaseName.indexOf('.');
                if (dotIndex !== -1) {
                    basePhase = fullPhaseName.substring(0, dotIndex);
                    subPhase = fullPhaseName.substring(dotIndex + 1);
                }

                // Remove iteration suffix from base phase
                basePhase = basePhase.replace(/_\d+$/, '');

                if (!aggregatedPhases[basePhase]) {
                    aggregatedPhases[basePhase] = { duration: 0, subPhases: {} };
                }

                if (subPhase) {
                    // This is a sub-phase
                    if (!aggregatedPhases[basePhase].subPhases[subPhase]) {
                        aggregatedPhases[basePhase].subPhases[subPhase] = { duration: 0 };
                    }
                    aggregatedPhases[basePhase].subPhases[subPhase].duration += pendingData.duration || 0;
                    // Also add to parent phase total
                    aggregatedPhases[basePhase].duration += pendingData.duration || 0;
                } else {
                    // This is a parent phase
                    aggregatedPhases[basePhase].duration += pendingData.duration || 0;
                }
            }
        }

        // Now record the aggregated timings
        for (const [basePhase, data] of Object.entries(aggregatedPhases)) {
            if (this.timings[basePhase]) {
                if (typeof this.timings[basePhase] === 'object' && !Array.isArray(this.timings[basePhase])) {
                    // Hierarchical phase (perception, physics, rendering)
                    const totalDuration = data.duration;

                    // Record total time for parent phase
                    this.timings[basePhase].total.push(totalDuration);
                    if (this.timings[basePhase].total.length > this.sampleSize) {
                        this.timings[basePhase].total.shift();
                    }

                    // Record sub-phase times
                    for (const [subPhase, subData] of Object.entries(data.subPhases || {})) {
                        if (this.timings[basePhase][subPhase]) {
                            this.timings[basePhase][subPhase].push(subData.duration);
                            if (this.timings[basePhase][subPhase].length > this.sampleSize) {
                                this.timings[basePhase][subPhase].shift();
                            }
                        }
                    }

                    accountedTime += totalDuration;
                } else {
                    // Flat phase (cleanup, spawning, quadtree, other)
                    this.timings[basePhase].push(data.duration);
                    if (this.timings[basePhase].length > this.sampleSize) {
                        this.timings[basePhase].shift();
                    }
                    accountedTime += data.duration;
                }
            } else {
                // Warn about undefined phases
                this.logger.warn(`[PERF] Undefined phase detected: ${basePhase}`);
            }
        }

        // Also account for any pending phases that were completed in this frame
        // These are phases that started in previous frames but ended in this one
        for (const [pendingKey, pendingData] of this.pendingPhases.entries()) {
            if (pendingData.completedInThisFrame) {
                // This pending phase was completed in the current frame
                const phaseName = pendingData.phaseName;
                const duration = pendingData.duration || 0;

                // If this is a sub-phase, also accumulate its time into the parent phase
                const phasePath = phaseName.split('.');
                const parentPhase = phasePath[0];
                const subPhase = phasePath[1];

                if (subPhase && this.currentFrame[parentPhase]) {
                    // This is a sub-phase that completed, accumulate into parent
                    this.currentFrame[parentPhase].duration += duration;
                }

                // Add to the appropriate timing array
                if (this.timings[phaseName]) {
                    if (typeof this.timings[phaseName] === 'object' && !Array.isArray(this.timings[phaseName])) {
                        // Hierarchical phase
                        this.timings[phaseName].total.push(duration);
                        if (this.timings[phaseName].total.length > this.sampleSize) {
                            this.timings[phaseName].total.shift();
                        }
                    } else {
                        // Flat phase
                        this.timings[phaseName].push(duration);
                        if (this.timings[phaseName].length > this.sampleSize) {
                            this.timings[phaseName].shift();
                        }
                    }
                    accountedTime += duration;
                }
            }
        }

        // Record "other" time (time not explicitly tracked)
        const otherTime = Math.max(0, totalFrameTime - accountedTime);
        this.timings.other.push(otherTime);
        if (this.timings.other.length > this.sampleSize) {
            this.timings.other.shift();
        }

        // Validate frame accounting (warn if unaccounted time is too high)
        const accountedPercentage = accountedTime / totalFrameTime;
        if (accountedPercentage < 0.8 && totalFrameTime > 1 && this.pendingPhases.size === 0) { // Less than 80% accounted for, but only warn if no pending phases
            this.logger.warn(`[PERF] Poor frame accounting: ${accountedPercentage.toFixed(2)} (${accountedTime.toFixed(2)}ms / ${totalFrameTime.toFixed(2)}ms)`);
            // Debug: Log what phases were recorded this frame
            const phaseNames = Object.keys(aggregatedPhases);
            this.logger.warn(`[PERF] Recorded phases this frame: ${phaseNames.join(', ')}`);
            if (this.pendingPhases.size > 0) {
                const pendingNames = Array.from(this.pendingPhases.keys());
                const completedPending = Array.from(this.pendingPhases.values())
                    .filter(p => p.completedInThisFrame)
                    .map(p => `${p.phaseName}(${p.duration?.toFixed(2)}ms)`);
                this.logger.warn(`[PERF] Pending phases: ${pendingNames.join(', ')}`);
                if (completedPending.length > 0) {
                    this.logger.warn(`[PERF] Completed pending phases this frame: ${completedPending.join(', ')}`);
                }
            }

            // Log detailed timing breakdown for debugging
            let totalBreakdown = 0;
            const breakdown = [];
            for (const [phase, data] of Object.entries(aggregatedPhases)) {
                const duration = data.duration || 0;
                totalBreakdown += duration;
                breakdown.push(`${phase}: ${duration.toFixed(2)}ms`);
            }
            this.logger.warn(`[PERF] Current frame breakdown: ${breakdown.join(', ')} (total: ${totalBreakdown.toFixed(2)}ms)`);
        }

        // Clean up completed pending phases and reset for next frame
        for (const [key, pending] of this.pendingPhases.entries()) {
            if (pending.completedInThisFrame) {
                this.pendingPhases.delete(key);
            }
        }

        this.currentFrame = {};
        this.phaseStack = [];

        // Clean up old pending phases (older than 1 second to prevent memory leaks)
        const now = performance.now();
        for (const [key, pending] of this.pendingPhases.entries()) {
            if (now - pending.pendingSince > 1000) {
                this.pendingPhases.delete(key);
                this.logger.warn(`[PERF] Removed stale pending phase: ${key}`);
            }
        }

        // Update statistics (rolling average)
        this.updateStats();
    }

    // Update rolling statistics
    updateStats() {
        // Calculate FPS
        const avgFrameTime = this.getAverage(this.timings.frame);
        this.stats.fps = avgFrameTime > 0 ? 1000 / avgFrameTime : 0;
        this.stats.frameTime = avgFrameTime;

        // Calculate breakdown percentages (handle hierarchical structure)
        this.stats.breakdown = {};
        for (const [phase, timings] of Object.entries(this.timings)) {
            if (phase !== 'frame') {
                if (typeof timings === 'object' && !Array.isArray(timings)) {
                    // Hierarchical phase
                    const totalAvg = this.getAverage(timings.total);
                    // For infrequent phases, amortize the time across all frames
                    const amortizedTime = totalAvg * (timings.total.length / Math.max(1, this.timings.frame.length));
                    const percentage = avgFrameTime > 0 ? (amortizedTime / avgFrameTime) * 100 : 0;

                    this.stats.breakdown[phase] = {
                        time: amortizedTime,
                        percentage: percentage,
                        subPhases: {}
                    };

                    // Calculate sub-phase stats
                    for (const [subPhase, subTimings] of Object.entries(timings)) {
                        if (subPhase !== 'total' && subTimings.length > 0) {
                            const subAvg = this.getAverage(subTimings);
                            const subAmortizedTime = subAvg * (subTimings.length / Math.max(1, this.timings.frame.length));
                            const subPercentage = amortizedTime > 0 ? (subAmortizedTime / amortizedTime) * 100 : 0;
                            this.stats.breakdown[phase].subPhases[subPhase] = {
                                time: subAmortizedTime,
                                percentage: subPercentage
                            };
                        }
                    }
                } else if (Array.isArray(timings) && timings.length > 0) {
                    // Flat phase - amortize across all frames
                    const avg = this.getAverage(timings);
                    const amortizedTime = avg * (timings.length / Math.max(1, this.timings.frame.length));
                    const percentage = avgFrameTime > 0 ? (amortizedTime / avgFrameTime) * 100 : 0;
                    this.stats.breakdown[phase] = {
                        time: amortizedTime,
                        percentage: percentage
                    };
                }
            }
        }
    }

    // Calculate average of an array
    getAverage(arr) {
        if (arr.length === 0) return 0;
        const sum = arr.reduce((a, b) => a + b, 0);
        return sum / arr.length;
    }

    // Get percentile value (e.g., 95th percentile for worst-case performance)
    getPercentile(arr, percentile) {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const index = Math.floor(sorted.length * (percentile / 100));
        return sorted[index];
    }

    // Get current statistics
    getStats() {
        return {
            fps: this.stats.fps.toFixed(1),
            frameTime: this.stats.frameTime.toFixed(2),
            breakdown: this.stats.breakdown
        };
    }

    // Get detailed report
    getReport() {
        const stats = this.getStats();
        const report = {
            fps: parseFloat(stats.fps),
            frameTime: parseFloat(stats.frameTime),
            phases: {}
        };

        // Sort phases by time (descending), but put 'other' last
        const sortedPhases = Object.entries(stats.breakdown)
            .filter(([phase]) => phase !== 'other')
            .sort((a, b) => b[1].time - a[1].time);

        // Add 'other' at the end if it exists
        const otherPhase = Object.entries(stats.breakdown).find(([phase]) => phase === 'other');
        if (otherPhase) {
            sortedPhases.push(otherPhase);
        }

        for (const [phase, data] of sortedPhases) {
            if (data.subPhases) {
                // Hierarchical phase
                report.phases[phase] = {
                    time: data.time.toFixed(2),
                    percentage: data.percentage.toFixed(1),
                    p95: this.timings[phase].total ? this.getPercentile(this.timings[phase].total, 95).toFixed(2) : '0.00',
                    subPhases: {}
                };

                // Sort sub-phases by time
                const sortedSubPhases = Object.entries(data.subPhases)
                    .sort((a, b) => b[1].time - a[1].time);

                for (const [subPhase, subData] of sortedSubPhases) {
                    report.phases[phase].subPhases[subPhase] = {
                        time: subData.time.toFixed(2),
                        percentage: subData.percentage.toFixed(1),
                        p95: this.timings[phase][subPhase] ? this.getPercentile(this.timings[phase][subPhase], 95).toFixed(2) : '0.00'
                    };
                }
            } else {
                // Flat phase
                report.phases[phase] = {
                    time: data.time.toFixed(2),
                    percentage: data.percentage.toFixed(1),
                    p95: Array.isArray(this.timings[phase]) ? this.getPercentile(this.timings[phase], 95).toFixed(2) : '0.00'
                };
            }
        }

        return report;
    }

    // Log report to logger (debug level)
    logReport() {
        const report = this.getReport();

        // Calculate accounted time excluding 'other' since it's derived from frameTime - accountedTime
        const phasesExceptOther = Object.entries(report.phases)
            .filter(([phase]) => phase !== 'other (untracked)' && phase !== 'other');
        const totalAccounted = phasesExceptOther.reduce((sum, [, phase]) => sum + parseFloat(phase.time), 0);
        const accountedPercentage = report.frameTime > 0 ? (totalAccounted / parseFloat(report.frameTime)) * 100 : 0;

        this.logger.debug('=== Performance Report ===');
        this.logger.debug(`FPS: ${report.fps} | Frame Time: ${report.frameTime}ms | Tracked: ${accountedPercentage.toFixed(1)}%`);
        this.logger.debug('\nPhase Breakdown (amortized % of total frame time):');
        this.logger.debug('Note: infrequent operations are amortized across all frames');

        for (const [phase, data] of Object.entries(report.phases)) {
            if (data.subPhases) {
                // Hierarchical phase - show parent with sub-phases indented
                this.logger.debug(`  ${phase.padEnd(15)} ${data.time.padStart(6)}ms (${data.percentage.padStart(5)}%) | P95: ${data.p95}ms`);

                // Show sub-phases
                for (const [subPhase, subData] of Object.entries(data.subPhases)) {
                    this.logger.debug(`    └─ ${subPhase.padEnd(12)} ${subData.time.padStart(6)}ms (${subData.percentage.padStart(5)}% of ${phase}) | P95: ${subData.p95}ms`);
                }
            } else {
                // Flat phase
                const phaseLabel = phase === 'other' ?
                    'other (untracked)' :
                    phase.padEnd(15);
                this.logger.debug(`  ${phaseLabel} ${data.time.padStart(6)}ms (${data.percentage.padStart(5)}%) | P95: ${data.p95}ms`);
            }
        }
        this.logger.debug('========================');
    }

    // Reset all statistics
    reset() {
        // Reset hierarchical timings
        for (const [key, value] of Object.entries(this.timings)) {
            if (typeof value === 'object' && !Array.isArray(value)) {
                // Hierarchical phase
                for (const subKey of Object.keys(value)) {
                    value[subKey] = [];
                }
            } else {
                // Flat phase
                this.timings[key] = [];
            }
        }
        this.currentFrame = {};
        this.phaseStack = [];
        this.stats = { fps: 0, frameTime: 0, breakdown: {} };
    }

    // Enable/disable monitoring
    setEnabled(enabled) {
        this.enabled = enabled;
    }

    /**
     * Check for performance degradation and trigger recovery if needed
     * @param {number} sessionTimeMs - Time since simulation started (milliseconds)
     * @returns {boolean} - True if recovery was triggered
     */
    checkPerformanceDegradation(sessionTimeMs) {
        if (!this.enabled || !this.baselineEstablished) return false;

        const currentFrameTime = this.stats.frameTime;
        const degradationRatio = currentFrameTime / this.baselineFrameTime;

        // Record degradation for trend analysis
        this.degradationHistory.push({
            time: sessionTimeMs,
            ratio: degradationRatio,
            frameTime: currentFrameTime
        });

        // Keep last 20 degradation measurements
        if (this.degradationHistory.length > 20) {
            this.degradationHistory.shift();
        }

        // Check if degradation exceeds threshold
        if (degradationRatio > this.degradationThreshold) {
            const timeSinceLastRecovery = sessionTimeMs - this.lastRecoveryAttempt;

            if (timeSinceLastRecovery > this.recoveryCooldownMs) {
                this.logger.warn(`[PERF-DEGRADATION] Performance degraded ${degradationRatio.toFixed(2)}x (baseline: ${this.baselineFrameTime.toFixed(2)}ms, current: ${currentFrameTime.toFixed(2)}ms)`);
                this.lastRecoveryAttempt = sessionTimeMs;
                return true; // Trigger recovery
            }
        }

        return false; // No recovery needed
    }

    /**
     * Establish baseline performance after initial warmup period
     * @param {number} sessionTimeMs - Time since simulation started (milliseconds)
     */
    establishBaseline(sessionTimeMs) {
        if (this.baselineEstablished) return;

        // Establish baseline after 1 minute of stable operation
        if (sessionTimeMs > 60000 && this.timings.frame.length >= 30) {
            // Use 95th percentile to avoid outliers
            const frameTimes = [...this.timings.frame].sort((a, b) => a - b);
            const p95Index = Math.floor(frameTimes.length * 0.95);
            this.baselineFrameTime = frameTimes[p95Index];

            this.baselineEstablished = true;
            this.logger.info(`[PERF-BASELINE] Established baseline frame time: ${this.baselineFrameTime.toFixed(2)}ms (95th percentile)`);
        }
    }

    /**
     * Get performance health status
     * @returns {Object} - Performance health metrics
     */
    getHealthStatus() {
        if (!this.baselineEstablished) {
            return { status: 'warming_up', baselineFrameTime: null, currentFrameTime: this.stats.frameTime };
        }

        const degradationRatio = this.stats.frameTime / this.baselineFrameTime;
        let status = 'healthy';

        if (degradationRatio > this.degradationThreshold) {
            status = 'degraded';
        } else if (degradationRatio > 1.2) {
            status = 'warning';
        }

        return {
            status,
            baselineFrameTime: this.baselineFrameTime,
            currentFrameTime: this.stats.frameTime,
            degradationRatio,
            sessionHealth: this.degradationHistory.length > 0 ?
                this.degradationHistory[this.degradationHistory.length - 1].ratio : 1.0
        };
    }
}
