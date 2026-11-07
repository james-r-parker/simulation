// A cold body's breath: an agent below the cold-stress temperature puffs a frost-white breath ahead every
// `BREATH_TICKS`, staggered by slot so a cold crowd does not breathe in step. One counter per slot, no allocation.

import { PALETTE } from './colors.js';
import { FX_RECIPES, playRecipe } from './fx-recipes.js';

/** Ticks between two breaths of one cold agent. */
export const BREATH_TICKS = 90;
const STAGGER = 37;

/**
 * @param {number} capacity the most slots
 * @returns {Int32Array} each slot's last breath period, -1 before one
 */
export function createBreaths(capacity) {
    return new Int32Array(capacity).fill(-1);
}

/**
 * Plays a breath for each cold agent whose breath period turned over since the last frame.
 * @param {import('./effects-player.js').EffectsPlayer} player the player
 * @param {import('../interpolate.js').Interpolated} agents the blended agents
 * @param {number} tick the playhead tick
 * @returns {number} breaths played
 */
export function playBreaths(player, agents, tick) {
    const { breaths } = player.edges;
    const cold01 = player.info.cold01;
    const at = player.at;
    let n = 0;
    for (let i = 0; i < agents.count; i++) {
        const slot = agents.slot[i];
        const period = Math.floor((tick + slot * STAGGER) / BREATH_TICKS);
        if (agents.temperature[i] >= cold01 || slot >= breaths.length || breaths[slot] === period) {
            continue;
        }
        const first = breaths[slot] < 0;
        breaths[slot] = period;
        if (first) {
            continue;
        }
        const size = agents.size[i];
        at.x = agents.x[i] + Math.cos(agents.angle[i]) * size;
        at.y = agents.y[i] + Math.sin(agents.angle[i]) * size;
        at.angle = agents.angle[i];
        at.size = size;
        at.tick = tick;
        at.rgb = PALETTE.coolWhite;
        n += playRecipe(player.fx, FX_RECIPES.breath, at) > 0 ? 1 : 0;
    }
    return n;
}
