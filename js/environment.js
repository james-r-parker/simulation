// --- SEASONAL ENVIRONMENT SYSTEM ---
// Handles seasonal environmental effects on agents

import {
    SEASON_SPRING_TEMP_MODIFIER, SEASON_SUMMER_TEMP_MODIFIER, SEASON_FALL_TEMP_MODIFIER, SEASON_WINTER_TEMP_MODIFIER,
    SEASON_SPRING_REPRODUCTION_BONUS, SEASON_SUMMER_REPRODUCTION_BONUS, SEASON_FALL_REPRODUCTION_BONUS, SEASON_WINTER_REPRODUCTION_BONUS,
    SEASON_SUMMER_ENERGY_DRAIN, SEASON_FALL_ENERGY_DRAIN, SEASON_WINTER_ENERGY_DRAIN,
    SEASON_SPRING_MUTATION_MULTIPLIER, SEASON_SUMMER_MUTATION_MULTIPLIER, SEASON_WINTER_MUTATION_MULTIPLIER,
    SEASON_SPRING_FOOD_SCARCITY, SEASON_SUMMER_FOOD_SCARCITY, SEASON_FALL_FOOD_SCARCITY, SEASON_WINTER_FOOD_SCARCITY
} from './constants.js';

/**
 * Update seasonal environment effects
 * @param {number} phase - Normalized season phase (0-1)
 * @param {number} seasonLength - Length of season in frames
 * @param {Array} agents - Array of agents to apply effects to
 * @param {number} adaptiveMutationRate - Current adaptive mutation rate (will be modified)
 * @returns {Object} Seasonal modifiers: { globalTemperatureModifier, foodScarcityFactor, newAdaptiveMutationRate }
 */
export function updateSeasonalEnvironment(phase, seasonLength, agents, adaptiveMutationRate) {
    // Four distinct seasons with different environmental pressures
    let globalTemperatureModifier = 0;
    let reproductionBonus = 1.0;
    let mutationMultiplier = 1.0;
    let energyDrainMultiplier = 1.0;
    let foodScarcityFactor = 1.0;

    if (phase < 0.25) {
        // SPRING: Warming temperatures, breeding season, resource recovery
        globalTemperatureModifier = SEASON_SPRING_TEMP_MODIFIER; // Cool but warming
        reproductionBonus = SEASON_SPRING_REPRODUCTION_BONUS; // Breeding season bonus
        foodScarcityFactor = SEASON_SPRING_FOOD_SCARCITY; // Abundant food after winter
        mutationMultiplier = SEASON_SPRING_MUTATION_MULTIPLIER; // Slightly increased variation during reproduction
    } else if (phase < 0.5) {
        // SUMMER: Hot temperatures, peak resources, high energy demands
        globalTemperatureModifier = SEASON_SUMMER_TEMP_MODIFIER; // Hot summer
        reproductionBonus = SEASON_SUMMER_REPRODUCTION_BONUS; // Continued breeding
        foodScarcityFactor = SEASON_SUMMER_FOOD_SCARCITY; // Normal food availability
        energyDrainMultiplier = SEASON_SUMMER_ENERGY_DRAIN; // Higher energy demands in heat
        mutationMultiplier = SEASON_SUMMER_MUTATION_MULTIPLIER; // Normal mutation rate
    } else if (phase < 0.75) {
        // FALL: Cooling temperatures, resource preparation, moderate stress
        globalTemperatureModifier = SEASON_FALL_TEMP_MODIFIER; // Mild temperatures
        reproductionBonus = SEASON_FALL_REPRODUCTION_BONUS; // Reduced breeding as winter approaches
        foodScarcityFactor = SEASON_FALL_FOOD_SCARCITY; // Resources becoming scarce
        energyDrainMultiplier = SEASON_FALL_ENERGY_DRAIN; // Moderate energy stress
    } else {
        // WINTER: Cold temperatures, severe resource scarcity, survival pressure
        globalTemperatureModifier = SEASON_WINTER_TEMP_MODIFIER; // Cold winter
        reproductionBonus = SEASON_WINTER_REPRODUCTION_BONUS; // Very low breeding in winter
        foodScarcityFactor = SEASON_WINTER_FOOD_SCARCITY; // Severe food scarcity
        energyDrainMultiplier = SEASON_WINTER_ENERGY_DRAIN; // High energy drain in cold
        mutationMultiplier = SEASON_WINTER_MUTATION_MULTIPLIER; // Reduced mutation during harsh conditions
    }

    // Apply seasonal environmental effects to agents
    agents.forEach(agent => {
        if (!agent.isDead) {
            // Seasonal reproduction modifier
            // When reproductionBonus > 1.0, suppress reproduction with probability (1.0 / reproductionBonus)
            // When reproductionBonus < 1.0, suppress reproduction with higher probability
            if (agent.wantsToReproduce && Math.random() > (1.0 / reproductionBonus)) {
                agent.wantsToReproduce = false; // Suppress reproduction outside breeding season
            }

            // Seasonal energy drain
            // Apply in summer (phase 0.25-0.5), fall (phase 0.5-0.75), and winter (phase 0.75-1.0)
            if (phase >= 0.25) { // Summer, fall, and winter
                agent.energy -= 0.05 * energyDrainMultiplier;
            }
        }
    });

    // Update mutation rate based on environmental stress
    let newAdaptiveMutationRate = adaptiveMutationRate * mutationMultiplier;
    newAdaptiveMutationRate = Math.max(0.1, Math.min(2.0, newAdaptiveMutationRate));

    return {
        globalTemperatureModifier,
        foodScarcityFactor,
        newAdaptiveMutationRate
    };
}


