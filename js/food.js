// --- FOOD CLASS ---
// Preserved exactly from original logic

import { HIGH_VALUE_FOOD_CHANCE } from './constants.js';

export class Food {
    constructor(x, y, isHighValue = false) {
        this.x = x;
        this.y = y;
        this.isHighValue = isHighValue;
        this.initialEnergy = isHighValue ? (200 + Math.random() * 50) : (80 + Math.random() * 20); // Store initial energy
        this.energyValue = this.initialEnergy;
        this.size = isHighValue ? 12 : 8; // Larger to make food easier to see and detect with rays
        this.isFood = true;
        this.isDead = false;
        this.age = 0; // Track how long this food has existed
        this.rotRate = 0.02 + Math.random() * 0.03; // Random rot rate: 0.02-0.05 energy per frame (much slower!)
        this.maxAge = 30000 + Math.random() * 20000; // Random max age: 500-833 seconds at 60 FPS (8-14 minutes!)
    }

    update() {
        if (this.isDead) return;

        this.age++;

        // Energy decay (rotting)
        this.energyValue = Math.max(0, this.energyValue - this.rotRate);

        // Update visual size based on remaining energy
        const energyRatio = this.energyValue / this.initialEnergy;
        this.size = this.isHighValue ?
            Math.max(4, 12 * energyRatio) : // High-value: 12→4
            Math.max(3, 8 * energyRatio);  // Normal: 8→3

        // Die when energy reaches 0 or max age exceeded
        if (this.energyValue <= 0 || this.age > this.maxAge) {
            this.isDead = true;
        }
    }
}

