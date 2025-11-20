// --- PHEROMONE CLASS ---
// Updated with action-based coloring (visual only, logic preserved)

import { PHEROMONE_FADE_RATE } from './constants.js';

export class PheromonePuff {
    constructor(x, y, type) {
        this.x = x; 
        this.y = y; 
        this.type = type; // 'danger', 'attack', or 'reproduction'
        this.life = 1.0; 
        this.isDead = false; 
        this.size = 5;
        
        // Action-based coloring
        if (type === 'danger') {
            this.color = { h: 200, s: 80, l: 50 }; // Blue/cyan for flight
        } else if (type === 'attack') {
            this.color = { h: 0, s: 100, l: 50 }; // Red/orange for fight
        } else if (type === 'reproduction') {
            this.color = { h: 120, s: 80, l: 60 }; // Green for reproduction
        } else {
            this.color = { h: 30, s: 100, l: 50 }; // Default orange
        }
    }
    
    update() {
        this.life -= PHEROMONE_FADE_RATE;
        this.size += 0.2;
        if (this.life <= 0) this.isDead = true;
    }
    
    getColor() {
        return this.color;
    }
}



