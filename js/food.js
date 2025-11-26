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
        this.rotRate = 0.002 + Math.random() * 0.003; // Random rot rate: 0.002-0.005 energy per frame (10x slower!)
        this.maxAge = 60000 + Math.random() * 30000; // Random max age: 1000-1500 seconds at 60 FPS (16-25 minutes!)
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

