// --- FITNESS CHART RENDERING ---
// Draws fitness charts for visualization

/**
 * Update and draw fitness chart
 * @param {HTMLCanvasElement} canvas - Canvas element to draw on
 * @param {Array} fitnessHistory - Best fitness history
 * @param {Array} averageFitnessHistory - Average fitness history
 * @param {Array} medianFitnessHistory - Median fitness history
 */
export function updateFitnessChart(canvas, fitnessHistory, averageFitnessHistory, medianFitnessHistory) {
    if (!canvas || !fitnessHistory || fitnessHistory.length < 2) return;

    // Ensure arrays are initialized (backward compatibility)
    const avgData = averageFitnessHistory || [];
    const medianData = medianFitnessHistory || [];

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = (height / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }

    // Get data to plot (last 50 points or all if less)
    const dataPoints = Math.min(50, fitnessHistory.length);
    const bestData = fitnessHistory.slice(-dataPoints);
    const avgDataSlice = avgData.slice(-dataPoints);
    const medianDataSlice = medianData.slice(-dataPoints);
    
    // Find global min/max across all datasets for consistent scaling
    const allData = [...bestData, ...avgDataSlice, ...medianDataSlice];
    const maxFitness = Math.max(...allData, 1);
    const minFitness = Math.min(...allData, 0);
    const range = maxFitness - minFitness || 1;

    // Helper function to draw a line
    const drawLine = (data, color, lineWidth = 2) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        data.forEach((fitness, i) => {
            const x = (width / (dataPoints - 1)) * i;
            const y = height - ((fitness - minFitness) / range) * height;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
    };

    // Draw median (bottom line, dimmer) - represents typical agent
    if (medianDataSlice.length > 0) {
        drawLine(medianDataSlice, 'rgba(100, 200, 255, 0.6)', 1.5);
    }

    // Draw average (middle line) - represents population health
    if (avgDataSlice.length > 0) {
        drawLine(avgDataSlice, '#0ff', 2);
    }

    // Draw best (top line, brightest) - represents peak performance
    drawLine(bestData, '#0f0', 2.5);

    // Draw legend
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    // Best
    ctx.fillStyle = '#0f0';
    ctx.fillRect(5, 5, 12, 2);
    ctx.fillStyle = '#fff';
    ctx.fillText('Best', 20, 3);
    
    // Average
    ctx.fillStyle = '#0ff';
    ctx.fillRect(5, 18, 12, 2);
    ctx.fillStyle = '#fff';
    ctx.fillText('Avg', 20, 16);
    
    // Median
    ctx.fillStyle = 'rgba(100, 200, 255, 0.6)';
    ctx.fillRect(5, 31, 12, 2);
    ctx.fillStyle = '#fff';
    ctx.fillText('Median', 20, 29);
}


