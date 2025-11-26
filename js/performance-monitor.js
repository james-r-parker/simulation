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
            quadtree: [],        // Quadtree rebuilding
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

        if (this.currentFrame[parentPhase]) {
            if (subPhase && this.currentFrame[parentPhase].subPhases[subPhase]) {
                // End sub-phase timing
                const duration = now - this.currentFrame[parentPhase].subPhases[subPhase].start;
                this.currentFrame[parentPhase].subPhases[subPhase].duration += duration;
                // Accumulate sub-phase time into parent phase
                this.currentFrame[parentPhase].duration += duration;
            } else {
                // End parent phase timing
                const duration = now - this.currentFrame[parentPhase].start;
                this.currentFrame[parentPhase].duration += duration;
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

        // Record phase timings (handle hierarchical structure)
        let accountedTime = 0;
        for (const [phase, data] of Object.entries(this.currentFrame)) {
            if (this.timings[phase]) {
                if (typeof this.timings[phase] === 'object' && !Array.isArray(this.timings[phase])) {
                    // Hierarchical phase (perception, physics, rendering)
                    const totalDuration = data.duration || 0;

                    // Record total time for parent phase
                    this.timings[phase].total.push(totalDuration);
                    if (this.timings[phase].total.length > this.sampleSize) {
                        this.timings[phase].total.shift();
                    }

                    // Record sub-phase times
                    for (const [subPhase, subData] of Object.entries(data.subPhases || {})) {
                        if (this.timings[phase][subPhase]) {
                            this.timings[phase][subPhase].push(subData.duration);
                            if (this.timings[phase][subPhase].length > this.sampleSize) {
                                this.timings[phase][subPhase].shift();
                            }
                        }
                    }

                    accountedTime += totalDuration;
                } else {
                    // Flat phase (cleanup, spawning, quadtree, other)
                    this.timings[phase].push(data.duration);
                    if (this.timings[phase].length > this.sampleSize) {
                        this.timings[phase].shift();
                    }
                    accountedTime += data.duration;
                }
            }
        }

        // Record "other" time (time not explicitly tracked)
        const otherTime = Math.max(0, totalFrameTime - accountedTime);
        this.timings.other.push(otherTime);
        if (this.timings.other.length > this.sampleSize) {
            this.timings.other.shift();
        }

        // Reset for next frame
        this.currentFrame = {};
        this.phaseStack = [];

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
                    const percentage = avgFrameTime > 0 ? (totalAvg / avgFrameTime) * 100 : 0;

                    this.stats.breakdown[phase] = {
                        time: totalAvg,
                        percentage: percentage,
                        subPhases: {}
                    };

                    // Calculate sub-phase stats
                    for (const [subPhase, subTimings] of Object.entries(timings)) {
                        if (subPhase !== 'total' && subTimings.length > 0) {
                            const subAvg = this.getAverage(subTimings);
                            const subPercentage = totalAvg > 0 ? (subAvg / totalAvg) * 100 : 0;
                            this.stats.breakdown[phase].subPhases[subPhase] = {
                                time: subAvg,
                                percentage: subPercentage
                            };
                        }
                    }
                } else if (Array.isArray(timings) && timings.length > 0) {
                    // Flat phase
                    const avg = this.getAverage(timings);
                    const percentage = avgFrameTime > 0 ? (avg / avgFrameTime) * 100 : 0;
                    this.stats.breakdown[phase] = {
                        time: avg,
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

        // Sort phases by time (descending)
        const sortedPhases = Object.entries(stats.breakdown)
            .sort((a, b) => b[1].time - a[1].time);

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
        this.logger.debug('=== Performance Report ===');
        this.logger.debug(`FPS: ${report.fps} | Frame Time: ${report.frameTime}ms`);
        this.logger.debug('\nPhase Breakdown:');

        for (const [phase, data] of Object.entries(report.phases)) {
            if (data.subPhases) {
                // Hierarchical phase - show parent with sub-phases indented
                this.logger.debug(`  ${phase.padEnd(15)} ${data.time.padStart(6)}ms (${data.percentage.padStart(5)}%) | P95: ${data.p95}ms`);

                // Show sub-phases
                for (const [subPhase, subData] of Object.entries(data.subPhases)) {
                    this.logger.debug(`    └─ ${subPhase.padEnd(12)} ${subData.time.padStart(6)}ms (${subData.percentage.padStart(5)}%) | P95: ${subData.p95}ms`);
                }
            } else {
                // Flat phase
                this.logger.debug(`  ${phase.padEnd(15)} ${data.time.padStart(6)}ms (${data.percentage.padStart(5)}%) | P95: ${data.p95}ms`);
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
}
