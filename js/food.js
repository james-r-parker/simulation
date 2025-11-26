// --- FOOD CLASS ---
// Preserved exactly from original logic

import {
    HIGH_VALUE_FOOD_CHANCE,
    FOOD_ENERGY_NORMAL_BASE, FOOD_ENERGY_NORMAL_VARIANCE,
    FOOD_ENERGY_HIGH_BASE, FOOD_ENERGY_HIGH_VARIANCE,
    FOOD_SIZE_NORMAL, FOOD_SIZE_HIGH,
    FOOD_SIZE_MIN_NORMAL, FOOD_SIZE_MIN_HIGH,
    FOOD_ROT_RATE_BASE, FOOD_ROT_RATE_VARIANCE,
    FOOD_MAX_AGE_BASE, FOOD_MAX_AGE_VARIANCE
} from './constants.js';

export class Food {
    constructor(x, y, isHighValue = null) {
        this.x = x;
        this.y = y;

        // Determine high value status internally if not provided
        if (isHighValue === null) {
            this.isHighValue = Math.random() < HIGH_VALUE_FOOD_CHANCE;
        } else {
            this.isHighValue = isHighValue;
        }

        // Use constants for initial energy
        if (isHighValue) {
            this.initialEnergy = FOOD_ENERGY_HIGH_BASE + Math.random() * FOOD_ENERGY_HIGH_VARIANCE;
        } else {
            this.initialEnergy = FOOD_ENERGY_NORMAL_BASE + Math.random() * FOOD_ENERGY_NORMAL_VARIANCE;
        }

        this.energyValue = this.initialEnergy;
        this.size = isHighValue ? FOOD_SIZE_HIGH : FOOD_SIZE_NORMAL;
        this.isFood = true;
        this.isDead = false;
        this.age = 0; // Track how long this food has existed

        // Use constants for rot rate and max age
        this.rotRate = FOOD_ROT_RATE_BASE + Math.random() * FOOD_ROT_RATE_VARIANCE;
        this.maxAge = FOOD_MAX_AGE_BASE + Math.random() * FOOD_MAX_AGE_VARIANCE;
    }

    update() {
        if (this.isDead) return;

        this.age++;

        // Energy decay (rotting)
        this.energyValue = Math.max(0, this.energyValue - this.rotRate);

        // Update visual size based on remaining energy
        const energyRatio = this.energyValue / this.initialEnergy;
        this.size = this.isHighValue ?
            Math.max(FOOD_SIZE_MIN_HIGH, FOOD_SIZE_HIGH * energyRatio) :
            Math.max(FOOD_SIZE_MIN_NORMAL, FOOD_SIZE_NORMAL * energyRatio);

        // Die when energy reaches 0 or max age exceeded
        if (this.energyValue <= 0 || this.age > this.maxAge) {
            this.isDead = true;
        }
    }
}

