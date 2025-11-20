// --- FOOD CLASS ---
// Preserved exactly from original logic

import { HIGH_VALUE_FOOD_CHANCE } from './constants.js';

export class Food {
    constructor(x, y, isHighValue = false) {
        this.x = x; 
        this.y = y;
        this.isHighValue = isHighValue;
        this.energyValue = isHighValue ? (100 + Math.random() * 20) : (40 + Math.random() * 10);
        this.size = isHighValue ? 12 : 8; // Larger to make food easier to see and detect with rays
        this.isFood = true; 
        this.isDead = false;
    }
}

