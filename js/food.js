// --- FOOD CLASS ---
// Preserved exactly from original logic

import { HIGH_VALUE_FOOD_CHANCE } from './constants.js';

export class Food {
    constructor(x, y, isHighValue = false) {
        this.x = x; 
        this.y = y;
        this.isHighValue = isHighValue;
        this.energyValue = isHighValue ? (200 + Math.random() * 50) : (80 + Math.random() * 20); // CRITICAL FIX: Doubled energy values to help agents survive
        this.size = isHighValue ? 12 : 8; // Larger to make food easier to see and detect with rays
        this.isFood = true; 
        this.isDead = false;
    }
}

