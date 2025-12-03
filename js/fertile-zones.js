// --- FERTILE ZONE MANAGEMENT ---
// Handles nutrient-rich areas created from decomposed agents

import {
    FERTILE_ZONE_MAX_COUNT, FERTILE_ZONE_FERTILITY_FACTOR, FERTILE_ZONE_MAX_FERTILITY,
    FERTILE_ZONE_DECAY_RATE, FERTILE_ZONE_MIN_FERTILITY, FERTILE_ZONE_SIZE_FACTOR, FERTILE_ZONE_MIN_RADIUS
} from './constants.js';

/**
 * Update and decay fertile zones over time
 * @param {Array} fertileZones - Array of fertile zones to update
 */
export function updateFertileZones(fertileZones) {
    // Update and decay fertile zones over time
    for (let i = fertileZones.length - 1; i >= 0; i--) {
        const zone = fertileZones[i];
        zone.age++;
        zone.fertility -= zone.decayRate * zone.initialFertility;

        // Remove depleted zones
        if (zone.fertility <= 0.1) {
            fertileZones.splice(i, 1);
        }
    }
}

/**
 * Create a new fertile zone from a dead agent
 * @param {Object} agent - The dead agent
 * @param {Array} fertileZones - Array of fertile zones to add to
 */
export function createFertileZone(agent, fertileZones) {
    // Create nutrient-rich area where agent died
    // Fertility based on agent's final energy and size (larger, well-fed agents create richer soil)
    const fertility = Math.min(agent.energy * FERTILE_ZONE_FERTILITY_FACTOR, FERTILE_ZONE_MAX_FERTILITY); // Cap fertility

    if (fertility > FERTILE_ZONE_MIN_FERTILITY) { // Only create zones for agents with significant energy
        fertileZones.push({
            x: agent.x,
            y: agent.y,
            fertility: fertility,
            initialFertility: fertility,
            radius: Math.max(FERTILE_ZONE_MIN_RADIUS, agent.size * FERTILE_ZONE_SIZE_FACTOR), // Zone size based on agent size
            decayRate: FERTILE_ZONE_DECAY_RATE,
            age: 0
        });

        // Limit total fertile zones to prevent performance issues
        if (fertileZones.length > FERTILE_ZONE_MAX_COUNT) {
            // Remove oldest, least fertile zone
            fertileZones.sort((a, b) => (a.fertility / a.initialFertility) - (b.fertility / b.initialFertility));
            fertileZones.shift();
        }
    }
}




