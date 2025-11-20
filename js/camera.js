// --- CAMERA CLASS ---
// Preserved exactly from original

import { lerp } from './utils.js';

export class Camera {
    constructor(x, y, zoom) {
        this.x = x; 
        this.y = y; 
        this.targetX = x; 
        this.targetY = y; 
        this.zoom = zoom;
        this.targetZoom = zoom;
        this.minZoom = 0.1;
        this.maxZoom = 2.0;
    }
    
    follow(entity) {
        if (entity && typeof entity.x === 'number' && typeof entity.y === 'number' && 
            isFinite(entity.x) && isFinite(entity.y)) { 
            this.targetX = entity.x; 
            this.targetY = entity.y; 
        }
        // If entity is null or invalid, don't change target (allows manual control)
    }
    
    update() {
        // Validate values before lerping to prevent NaN
        if (typeof this.targetX === 'number' && isFinite(this.targetX)) {
            if (typeof this.x === 'number' && isFinite(this.x)) {
                this.x = lerp(this.x, this.targetX, 0.05);
            } else {
                this.x = this.targetX; // Set directly if current is invalid
            }
        } else {
            // Reset to a default center if target is invalid
            // This will be overridden by game.js setting targetX/Y
            this.targetX = 5000;
            this.x = this.targetX;
        }
        
        if (typeof this.targetY === 'number' && isFinite(this.targetY)) {
            if (typeof this.y === 'number' && isFinite(this.y)) {
                this.y = lerp(this.y, this.targetY, 0.05);
            } else {
                this.y = this.targetY;
            }
        } else {
            this.targetY = 5000;
            this.y = this.targetY;
        }
        
        if (typeof this.targetZoom === 'number' && isFinite(this.targetZoom)) {
            if (typeof this.zoom === 'number' && isFinite(this.zoom)) {
                this.zoom = lerp(this.zoom, this.targetZoom, 0.1);
            } else {
                this.zoom = this.targetZoom;
            }
        } else {
            this.targetZoom = 0.6;
            this.zoom = this.targetZoom;
        }
    }
    
    getPosition() {
        return { x: this.x, y: this.y, zoom: this.zoom };
    }
    
    setTarget(x, y) {
        this.targetX = x;
        this.targetY = y;
    }
    
    pan(deltaX, deltaY, containerWidth, containerHeight, viewSize, aspect) {
        // Convert screen delta to world delta
        // viewSize is the base view size, zoom scales it
        const scaledViewSize = viewSize * this.zoom;
        const worldDeltaX = (deltaX / containerWidth) * (scaledViewSize * 2 * aspect);
        const worldDeltaY = (deltaY / containerHeight) * (scaledViewSize * 2);
        this.targetX -= worldDeltaX;
        this.targetY += worldDeltaY; // Flip Y
    }
    
    zoomAt(mouseX, mouseY, delta, containerWidth, containerHeight, worldWidth, worldHeight, aspect) {
        const oldZoom = this.targetZoom;
        const zoomFactor = 1 + (delta * 0.001);
        this.targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.targetZoom * zoomFactor));
        
        // Calculate world position under mouse cursor
        const viewSize = Math.max(worldWidth, worldHeight) * 0.4;
        const normalizedX = (mouseX / containerWidth) * 2 - 1;
        const normalizedY = 1 - (mouseY / containerHeight) * 2;
        
        const worldX = this.targetX + (normalizedX * viewSize * aspect * oldZoom);
        const worldY = this.targetY - (normalizedY * viewSize * oldZoom);
        
        // Adjust camera position to keep world point under mouse
        const newViewSize = viewSize * this.targetZoom;
        this.targetX = worldX - (normalizedX * newViewSize * aspect);
        this.targetY = worldY + (normalizedY * newViewSize);
    }
}

