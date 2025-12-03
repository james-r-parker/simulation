// --- PERFORMANCE TRACKING UTILITIES ---
// FPS calculation and GPU/CPU tracking functions

/**
 * Calculate FPS from frame count and elapsed time
 * @param {number} frameCount - Number of frames since last update
 * @param {number} elapsed - Elapsed time in milliseconds
 * @returns {number} Calculated FPS
 */
export function calculateFps(frameCount, elapsed) {
    if (elapsed <= 0) return 0;
    return Math.round((frameCount * 1000) / elapsed);
}

/**
 * Update GPU/CPU FPS tracking
 * @param {number} gpuFrameCount - Number of GPU frames since last update
 * @param {number} cpuFrameCount - Number of CPU frames since last update
 * @param {Array} gpuFpsHistory - History array for GPU FPS
 * @param {Array} cpuFpsHistory - History array for CPU FPS
 * @param {number} elapsed - Elapsed time in milliseconds
 * @returns {Object} Updated averages: { avgGpuFps, avgCpuFps }
 */
export function updateGpuCpuTracking(gpuFrameCount, cpuFrameCount, gpuFpsHistory, cpuFpsHistory, elapsed) {
    let avgGpuFps = 0;
    let avgCpuFps = 0;

    if (elapsed >= 1000) {
        // Calculate average FPS for GPU and CPU frames
        if (gpuFrameCount > 0) {
            const gpuFps = calculateFps(gpuFrameCount, elapsed);
            gpuFpsHistory.push(gpuFps);
            if (gpuFpsHistory.length > 10) gpuFpsHistory.shift(); // Keep last 10 samples
            avgGpuFps = Math.round(gpuFpsHistory.reduce((a, b) => a + b, 0) / gpuFpsHistory.length);
        }
        if (cpuFrameCount > 0) {
            const cpuFps = calculateFps(cpuFrameCount, elapsed);
            cpuFpsHistory.push(cpuFps);
            if (cpuFpsHistory.length > 10) cpuFpsHistory.shift(); // Keep last 10 samples
            avgCpuFps = Math.round(cpuFpsHistory.reduce((a, b) => a + b, 0) / cpuFpsHistory.length);
        }
    }

    return { avgGpuFps, avgCpuFps };
}

/**
 * Format FPS display text for UI
 * @param {number} currentFps - Current FPS
 * @param {number} avgGpuFps - Average GPU FPS (0 if not available)
 * @param {number} avgCpuFps - Average CPU FPS (0 if not available)
 * @returns {Object} Formatted text and color: { text, color }
 */
export function formatFpsDisplay(currentFps, avgGpuFps, avgCpuFps) {
    let fpsText = `FPS: ${currentFps} `;
    if (avgGpuFps > 0 || avgCpuFps > 0) {
        fpsText += ` (GPU: ${avgGpuFps > 0 ? avgGpuFps : 'N/A'}, CPU: ${avgCpuFps > 0 ? avgCpuFps : 'N/A'})`;
    }
    
    // Color code FPS (green > 30, yellow > 15, red otherwise)
    let color = '#f00';
    if (currentFps >= 30) {
        color = '#0f0';
    } else if (currentFps >= 15) {
        color = '#ff0';
    }
    
    return { text: fpsText, color };
}




