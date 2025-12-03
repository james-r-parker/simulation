// --- VISUAL EFFECTS MANAGEMENT ---
// Handles visual effects for agents (collision rings, eating effects, etc.)

import { EFFECT_DURATION_BASE } from './constants.js';
import { addSparkles } from './sparkles.js';

/**
 * Add a visual effect for an agent
 * @param {Map} agentEffects - Map of agent to effects array
 * @param {Object} agent - Agent to add effect for
 * @param {string} effectType - Type of effect ('collision' or 'eating')
 * @param {number} currentFrame - Current frame number
 * @param {number} gameSpeed - Current game speed multiplier
 * @param {Array} sparkles - Sparkles array (optional, for sparkle effects)
 * @param {number} maxSparkles - Maximum sparkles allowed
 * @param {boolean} sparklesEnabled - Whether sparkles are enabled
 */
export function addVisualEffect(agentEffects, agent, effectType, currentFrame, gameSpeed, sparkles, maxSparkles, sparklesEnabled) {
    // NEVER add effects to dead agents
    if (!agent || agent.isDead) {
        return;
    }

    if (!agentEffects.has(agent)) {
        agentEffects.set(agent, []);
    }
    const effects = agentEffects.get(agent);

    // FIXED: Multiply by game speed so effects scale correctly
    // Slower games (0.5x) should have shorter durations (3.5 frames)
    // Faster games (3x) should have longer durations (21 frames)
    const adjustedDuration = Math.max(1, Math.round(EFFECT_DURATION_BASE * gameSpeed));

    effects.push({
        type: effectType,
        startFrame: currentFrame || 0,
        duration: adjustedDuration
    });

    // Add sparkle particles for visual effects
    if (sparkles && sparklesEnabled) {
        addSparkles(sparkles, agent, effectType, maxSparkles);
    }
}

/**
 * Update and cleanup visual effects
 * @param {Map} agentEffects - Map of agent to effects array
 * @param {number} currentFrame - Current frame number
 */
export function updateVisualEffects(agentEffects, currentFrame) {
    // Initialize agentEffects if not already done (safety check)
    if (!agentEffects) {
        return;
    }

    // Clean up expired effects and dead agents
    for (const [agent, effects] of agentEffects.entries()) {
        // Remove effects for dead agents immediately
        if (!agent || agent.isDead) {
            agentEffects.delete(agent);
            continue;
        }

        // PERFORMANCE: In-place removal of expired effects to avoid allocation
        // Iterate backwards to safely splice
        for (let i = effects.length - 1; i >= 0; i--) {
            const effect = effects[i];
            if (currentFrame - effect.startFrame >= effect.duration) {
                effects.splice(i, 1);
            }
        }

        if (effects.length === 0) {
            agentEffects.delete(agent);
        }
    }
}

/**
 * Update visual effects rendering (currently disabled, sparkles handle rendering)
 * @param {Map} agentEffects - Map of agent to effects array
 * @param {THREE.Group} effectsGroup - Three.js group for effects
 * @param {Array} activeEffectMeshes - Array of active effect meshes
 */
export function updateVisualEffectsRendering(agentEffects, effectsGroup, activeEffectMeshes) {
    // DISABLED: Ring effects are replaced by sparkle particles
    // This method is kept for potential future use but no longer renders rings
    // Sparkles are handled separately via updateSparkles() which is called in render()
    
    // Hide any existing ring meshes to prevent old rings from showing
    if (activeEffectMeshes) {
        for (let i = 0; i < activeEffectMeshes.length; i++) {
            activeEffectMeshes[i].visible = false;
        }
    }
}




