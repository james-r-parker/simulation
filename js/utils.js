import { TWO_PI } from './constants.js';

// --- MATH & UTILITY FUNCTIONS ---
// ALL FUNCTIONS PRESERVED EXACTLY FROM ORIGINAL

// Optimized matrix multiplication with better cache locality
export function matrixMultiply(a, b) {
    const rowsA = a.length, colsA = a[0].length, rowsB = b.length, colsB = b[0].length;
    if (colsA !== rowsB) throw new Error("Matrix dimensions mismatch");

    // Pre-allocate result array
    const result = new Array(rowsA);
    for (let i = 0; i < rowsA; i++) {
        result[i] = new Array(colsB);
    }

    // Optimized: transpose B for better cache locality (if beneficial)
    // For small matrices, direct multiplication is fine
    if (colsB > 8) {
        // Transpose B for better cache performance on larger matrices
        const bT = new Array(colsB);
        for (let j = 0; j < colsB; j++) {
            bT[j] = new Array(rowsB);
            for (let k = 0; k < rowsB; k++) {
                bT[j][k] = b[k][j];
            }
        }

        for (let i = 0; i < rowsA; i++) {
            for (let j = 0; j < colsB; j++) {
                let sum = 0;
                const aRow = a[i];
                const bTCol = bT[j];
                for (let k = 0; k < colsA; k++) {
                    sum += aRow[k] * bTCol[k];
                }
                result[i][j] = isUnsafe(sum) ? 0 : sum;
            }
        }
    } else {
        // Direct multiplication for small matrices
        for (let i = 0; i < rowsA; i++) {
            const aRow = a[i];
            for (let j = 0; j < colsB; j++) {
                let sum = 0;
                for (let k = 0; k < colsA; k++) {
                    sum += aRow[k] * b[k][j];
                }
                result[i][j] = isUnsafe(sum) ? 0 : sum;
            }
        }
    }

    return result;
}

export function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
}

// Optimized sigmoid application (in-place when possible)
export function applySigmoid(matrix) {
    const result = new Array(matrix.length);
    for (let i = 0; i < matrix.length; i++) {
        const row = matrix[i];
        const newRow = new Array(row.length);
        for (let j = 0; j < row.length; j++) {
            const val = sigmoid(row[j]);
            newRow[j] = isUnsafe(val) ? 0.5 : val;
        }
        result[i] = newRow;
    }
    return result;
}

export function isUnsafe(n) {
    return isNaN(n) || !isFinite(n);
}

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

// Optimized distance calculation (avoid Math.pow, use direct multiplication)
export function distance(x1, y1, x2, y2) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
}

// Fast distance squared (for comparisons, avoids sqrt)
export function distanceSquared(x1, y1, x2, y2) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return dx * dx + dy * dy;
}

// Box-Muller transform for Gaussian random number
export function randomGaussian(mean = 0, stdDev = 1) {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(TWO_PI * v);
    return z * stdDev + mean;
}

// Generate unique gene ID
export function generateId(now) {
    return Date.now() + '_' + Math.random().toString(36).substring(2, 9);
}
export function generateGeneId(id) {
    return 'gene_' + id;
}

// Hash gene ID to HSL color (consistent coloring)
export function geneIdToColor(geneId) {
    let hash = 0;
    for (let i = 0; i < geneId.length; i++) {
        hash = geneId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return { h: hue, s: 70, l: 50 };
}

