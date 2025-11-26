// Performance Instrumentation Framework
// Tracks timing metrics for different simulation phases

export class PerformanceMonitor {
    constructor(sampleSize = 60) {
        this.sampleSize = sampleSize; // Number of frames to average over (e.g., 60 = 1 second at 60 FPS)

        // Timing buckets for different phases
        this.timings = {
            frame: [],           // Total frame time
            perception: [],      // Agent perception (ray casting)
            neuralNetwork: [],   // Neural network forward pass
            physics: [],         // Physics updates (movement, collisions)
            rendering: [],       // Rendering/visual updates
            cleanup: [],         // Dead agent cleanup
            spawning: [],        // Food/agent spawning
            quadtree: [],        // Quadtree rebuilding
            other: []           // Everything else
        };

        // Current frame measurements (temporary storage)
        this.currentFrame = {};
        this.frameStartTime = 0;

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

    // Start timing a specific phase
    startPhase(phaseName) {
        if (!this.enabled) return;
        if (!this.currentFrame[phaseName]) {
            this.currentFrame[phaseName] = { start: performance.now(), duration: 0 };
        } else {
            this.currentFrame[phaseName].start = performance.now();
        }
    }

    // End timing a specific phase
    endPhase(phaseName) {
        if (!this.enabled) return;
        if (this.currentFrame[phaseName]) {
            const duration = performance.now() - this.currentFrame[phaseName].start;
            this.currentFrame[phaseName].duration += duration;
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

        // Record phase timings
        let accountedTime = 0;
        for (const [phase, data] of Object.entries(this.currentFrame)) {
            if (this.timings[phase]) {
                this.timings[phase].push(data.duration);
                if (this.timings[phase].length > this.sampleSize) {
                    this.timings[phase].shift();
                }
                accountedTime += data.duration;
            }
        }

        // Record "other" time (time not explicitly tracked)
        const otherTime = Math.max(0, totalFrameTime - accountedTime);
        this.timings.other.push(otherTime);
        if (this.timings.other.length > this.sampleSize) {
            this.timings.other.shift();
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

        // Calculate breakdown percentages
        this.stats.breakdown = {};
        for (const [phase, timings] of Object.entries(this.timings)) {
            if (phase !== 'frame' && timings.length > 0) {
                const avg = this.getAverage(timings);
                const percentage = avgFrameTime > 0 ? (avg / avgFrameTime) * 100 : 0;
                this.stats.breakdown[phase] = {
                    time: avg,
                    percentage: percentage
                };
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
            report.phases[phase] = {
                time: data.time.toFixed(2),
                percentage: data.percentage.toFixed(1),
                p95: this.timings[phase] ? this.getPercentile(this.timings[phase], 95).toFixed(2) : '0.00'
            };
        }

        return report;
    }

    // Log report to console
    logReport() {
        const report = this.getReport();
        console.log('=== Performance Report ===');
        console.log(`FPS: ${report.fps} | Frame Time: ${report.frameTime}ms`);
        console.log('\nPhase Breakdown:');
        for (const [phase, data] of Object.entries(report.phases)) {
            console.log(`  ${phase.padEnd(15)} ${data.time.padStart(6)}ms (${data.percentage.padStart(5)}%) | P95: ${data.p95}ms`);
        }
        console.log('========================');
    }

    // Reset all statistics
    reset() {
        for (const key of Object.keys(this.timings)) {
            this.timings[key] = [];
        }
        this.currentFrame = {};
        this.stats = { fps: 0, frameTime: 0, breakdown: {} };
    }

    // Enable/disable monitoring
    setEnabled(enabled) {
        this.enabled = enabled;
    }
}
