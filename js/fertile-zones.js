// --- FERTILE ZONE MANAGEMENT ---
// Handles nutrient-rich areas created from decomposed agents

import {
    FERTILE_ZONE_MAX_COUNT, FERTILE_ZONE_FERTILITY_FACTOR, FERTILE_ZONE_MAX_FERTILITY,
    FERTILE_ZONE_DECAY_RATE, FERTILE_ZONE_MIN_FERTILITY, FERTILE_ZONE_SIZE_FACTOR, FERTILE_ZONE_MIN_RADIUS,
    FERTILE_ZONE_TEMP_EFFECT_MULTIPLIER
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
 * @param {number} temperatureModifier - Global temperature modifier from season (affects decomposition rate)
 */
export function createFertileZone(agent, fertileZones, temperatureModifier = 0) {
    // Safety checks: validate agent properties
    if (!agent || !fertileZones) {
        return; // Invalid input
    }

    // Validate agent position and properties
    const agentX = typeof agent.x === 'number' && isFinite(agent.x) ? agent.x : null;
    const agentY = typeof agent.y === 'number' && isFinite(agent.y) ? agent.y : null;
    const agentSize = typeof agent.size === 'number' && isFinite(agent.size) && agent.size > 0 ? agent.size : 10; // Default size if invalid

    // Skip if position is invalid
    if (agentX === null || agentY === null) {
        return;
    }

    // Create nutrient-rich area where agent died
    // Fertility based on agent's size (biomass) - larger agents have more biomass and create richer soil
    // Note: We use size instead of energy because dead agents always have 0 energy
    // Size represents the agent's biomass/nutrient content, which decomposes into fertile soil
    
    // Temperature affects decomposition rate: warmer = faster decomposition = higher fertility
    // Temperature modifier ranges from ~-15 (winter) to +15 (summer)
    // Convert to a multiplier: 0°C baseline = 1.0x, warmer = >1.0x, colder = <1.0x
    // Using a scaling factor so temperature has meaningful but not overwhelming effect
    const temperatureMultiplier = 1.0 + (temperatureModifier * FERTILE_ZONE_TEMP_EFFECT_MULTIPLIER);
    const baseFertility = agentSize * FERTILE_ZONE_FERTILITY_FACTOR;
    const fertility = Math.min(baseFertility * temperatureMultiplier, FERTILE_ZONE_MAX_FERTILITY); // Cap fertility

    // Create zone if fertility meets minimum threshold (allows even small agents to contribute)
    if (fertility >= FERTILE_ZONE_MIN_FERTILITY) {
        fertileZones.push({
            x: agentX,
            y: agentY,
            fertility: fertility,
            initialFertility: fertility,
            radius: Math.max(FERTILE_ZONE_MIN_RADIUS, agentSize * FERTILE_ZONE_SIZE_FACTOR), // Zone size based on agent size
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













