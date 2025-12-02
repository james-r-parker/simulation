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
    // Increased saturation and adjusted lightness for more vibrant, distinct colors
    return { h: hue, s: 85, l: 60 };
}

// HSL to RGB helper - uses caching for performance
// Note: This function uses a cache Map and returns a THREE.Color object
// The cache should be provided by the caller and managed externally
export function hslToRgb(h, s, l, cache, cacheMaxSize) {
    // Create cache key (round to reduce cache size)
    const hRounded = Math.round(h);
    const sRounded = Math.round(s);
    const lRounded = Math.round(l);
    const cacheKey = `${hRounded},${sRounded},${lRounded}`;

    // Check cache first
    if (cache && cache.has(cacheKey)) {
        const cachedRgb = cache.get(cacheKey);
        // Return as array [r, g, b] for compatibility
        // Caller should use acquireColor() and set() if they need a THREE.Color
        return { r: cachedRgb[0], g: cachedRgb[1], b: cachedRgb[2] };
    }

    // Precomputed math constants for performance
    const MATH_CONSTANTS = {
        ONE_OVER_360: 1 / 360,
        ONE_OVER_100: 1 / 100,
        ONE_OVER_6: 1 / 6,
        TWO_OVER_6: 2 / 6,
        THREE_OVER_6: 3 / 6,
        FOUR_OVER_6: 4 / 6,
        FIVE_OVER_6: 5 / 6
    };

    // Compute HSL to RGB conversion using precomputed constants
    const hNorm = h * MATH_CONSTANTS.ONE_OVER_360;
    const sNorm = s * MATH_CONSTANTS.ONE_OVER_100;
    const lNorm = l * MATH_CONSTANTS.ONE_OVER_100;
    const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
    const x = c * (1 - Math.abs((hNorm * 6) % 2 - 1));
    const m = lNorm - c * 0.5;
    let r, g, b;
    if (hNorm < MATH_CONSTANTS.ONE_OVER_6) { r = c; g = x; b = 0; }
    else if (hNorm < MATH_CONSTANTS.TWO_OVER_6) { r = x; g = c; b = 0; }
    else if (hNorm < MATH_CONSTANTS.THREE_OVER_6) { r = 0; g = c; b = x; }
    else if (hNorm < MATH_CONSTANTS.FOUR_OVER_6) { r = 0; g = x; b = c; }
    else if (hNorm < MATH_CONSTANTS.FIVE_OVER_6) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    
    const finalR = r + m;
    const finalG = g + m;
    const finalB = b + m;
    
    // Cache the RGB values (limit cache size)
    if (cache) {
        if (cache.size >= cacheMaxSize) {
            // Remove oldest entry (simple FIFO - remove first)
            const firstKey = cache.keys().next().value;
            cache.delete(firstKey);
        }
        cache.set(cacheKey, [finalR, finalG, finalB]);
    }

    return { r: finalR, g: finalG, b: finalB };
}

