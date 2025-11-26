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

        // Intuitive emotion-based coloring
        if (type === 'danger') {
            this.color = { h: 0, s: 100, l: 50 }; // Red for danger/fear
        } else if (type === 'attack') {
            this.color = { h: 120, s: 80, l: 45 }; // Green for hunting/aggression
        } else if (type === 'reproduction') {
            this.color = { h: 320, s: 85, l: 65 }; // Pink for love/mating
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



