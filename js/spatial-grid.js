// --- SPATIAL GRID FOR RAY TRACING OPTIMIZATION ---
// Builds spatial grid structure for efficient entity queries

/**
 * Build spatial grid for ray tracing optimization
 * Assigns entities to grid cells based on their position
 * @param {Array} entities - Array of entities (food + agents)
 * @param {number} worldWidth - World width in pixels
 * @param {number} worldHeight - World height in pixels
 * @param {number} cellSize - Size of each grid cell (pixels)
 * @param {Object} gridState - Optional existing grid state to reuse: { spatialGrid, spatialGridEntityIndices, spatialGridWidth, spatialGridHeight }
 * @returns {Object|null} Grid data with entity indices per cell, or null if disabled
 */
export function buildSpatialGrid(entities, worldWidth, worldHeight, cellSize, gridState = null) {
    if (!entities || entities.length === 0) {
        return null;
    }

    const spatialGridWidth = Math.ceil(worldWidth / cellSize);
    const spatialGridHeight = Math.ceil(worldHeight / cellSize);
    const totalCells = spatialGridWidth * spatialGridHeight;

    // Initialize or reuse grid arrays
    let spatialGrid, spatialGridEntityIndices;
    if (gridState && gridState.spatialGrid && gridState.spatialGridEntityIndices) {
        spatialGrid = gridState.spatialGrid;
        spatialGridEntityIndices = gridState.spatialGridEntityIndices;
        
        // Clear previous grid
        for (let i = 0; i < totalCells; i++) {
            spatialGrid[i].length = 0;
            spatialGridEntityIndices[i].length = 0;
        }
    } else {
        // Initialize new grid
        spatialGrid = [];
        spatialGridEntityIndices = [];
        for (let i = 0; i < totalCells; i++) {
            spatialGrid[i] = [];
            spatialGridEntityIndices[i] = [];
        }
    }

    // Assign entities to grid cells
    for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        if (!entity || entity.isDead) continue;

        const entityX = entity.x;
        const entityY = entity.y;
        const entitySize = entity.size || 0;

        // Calculate grid cell coordinates
        const cellX = Math.floor(entityX / cellSize);
        const cellY = Math.floor(entityY / cellSize);

        // Entity can span multiple cells if it's large, so check neighboring cells too
        const cellRadius = Math.ceil(entitySize / cellSize) + 1;
        const minCellX = Math.max(0, cellX - cellRadius);
        const maxCellX = Math.min(spatialGridWidth - 1, cellX + cellRadius);
        const minCellY = Math.max(0, cellY - cellRadius);
        const maxCellY = Math.min(spatialGridHeight - 1, cellY + cellRadius);

        // Add entity to all relevant cells
        for (let cy = minCellY; cy <= maxCellY; cy++) {
            for (let cx = minCellX; cx <= maxCellX; cx++) {
                const cellIndex = cy * spatialGridWidth + cx;
                if (cellIndex >= 0 && cellIndex < totalCells) {
                    spatialGrid[cellIndex].push(entity);
                    spatialGridEntityIndices[cellIndex].push(i);
                }
            }
        }
    }

    // Build flat arrays for GPU
    const cellEntityCounts = new Uint32Array(totalCells);
    const cellStartIndices = new Uint32Array(totalCells);
    const cellEntityIndices = [];
    
    // Count entities per cell and build start indices
    let currentOffset = 0;
    for (let i = 0; i < totalCells; i++) {
        const count = spatialGridEntityIndices[i].length;
        cellEntityCounts[i] = count;
        cellStartIndices[i] = currentOffset;
        // Add entity indices to flat array
        for (let j = 0; j < count; j++) {
            cellEntityIndices.push(spatialGridEntityIndices[i][j]);
        }
        currentOffset += count;
    }

    return {
        cellSize: cellSize,
        gridWidth: spatialGridWidth,
        gridHeight: spatialGridHeight,
        cellEntityCounts: cellEntityCounts, // Uint32Array: number of entities per cell
        cellStartIndices: cellStartIndices, // Uint32Array: starting index for each cell
        cellEntityIndices: new Uint32Array(cellEntityIndices), // Uint32Array: flat array of entity indices
        // Store grid arrays for reuse
        spatialGrid: spatialGrid,
        spatialGridEntityIndices: spatialGridEntityIndices
    };
}




