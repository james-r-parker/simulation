// The wall crossing: an agent whose side of the central wall changed since the last frame lights a shimmer at the gap
// it came through (Cross or stay). One side per slot, keyed by genome so a reused slot starts afresh; no allocation.

import { PALETTE } from './colors.js';
import { FX_RECIPES, playRecipe } from './fx-recipes.js';

/**
 * @typedef {object} CrossState
 * @property {number} wallX the wall's x, NaN when the world has none
 * @property {Int8Array} side each slot's side last frame: 0 west, 1 east, -1 unknown
 * @property {Uint32Array} genome the body that side belongs to
 */

/**
 * @param {Record<string, any>} info `ready.info`
 * @returns {CrossState} the state
 */
export function createCrossings(info) {
    const capacity = info.maxAgents ?? 1024;
    return {
        wallX: info.terrain?.wallX ?? Number.NaN,
        side: new Int8Array(capacity).fill(-1),
        genome: new Uint32Array(capacity),
    };
}

/**
 * Plays a shimmer at the wall for each agent that crossed it since the last frame.
 * @param {import('./effects-player.js').EffectsPlayer} player the player (its `crossings` and recipe player)
 * @param {import('../interpolate.js').Interpolated} agents the blended agents
 * @param {number} tick the playhead tick
 * @returns {number} crossings played
 */
export function playCrossings(player, agents, tick) {
    const c = player.crossings;
    if (Number.isNaN(c.wallX)) {
        return 0;
    }
    let n = 0;
    for (let i = 0; i < agents.count; i++) {
        const slot = agents.slot[i];
        const side = agents.x[i] < c.wallX ? 0 : 1;
        const known = c.genome[slot] === agents.genomeId[i] && c.side[slot] >= 0;
        if (known && c.side[slot] !== side) {
            const at = player.at;
            at.x = c.wallX;
            at.y = agents.y[i];
            at.angle = Math.PI / 2;
            at.size = agents.size[i];
            at.tick = tick;
            at.rgb = PALETTE.coolWhite;
            n += playRecipe(player.fx, FX_RECIPES.wallCross, at) > 0 ? 1 : 0;
        }
        c.side[slot] = side;
        c.genome[slot] = agents.genomeId[i];
    }
    return n;
}
