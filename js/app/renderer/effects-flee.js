// The flee cue: each frame pairs running hunters with the prey they close on (`findPursuits`, the same rule as the chase
// tether) and marks the prey by its index, so the agent shader stretches it into a streamline with a wide eye, and
// kicks a dust puff behind a prey sprinting above `FLEE_KICK_SPEED` of `maxVelocity` every `FLEE_KICK_TICKS`.

import { createPursuits, findPursuits, pursuitRules } from '../pursuit.js';
import { PALETTE } from './colors.js';
import { FX_RECIPES, playRecipe } from './fx-recipes.js';

/** Ticks between two dust kicks of one fleeing prey. */
export const FLEE_KICK_TICKS = 12;
/** The share of `maxVelocity` above which a fleeing prey kicks dust. */
export const FLEE_KICK_SPEED = 0.6;

/**
 * @typedef {object} FleeState
 * @property {import('../pursuit.js').Pursuits} pursuits this frame's pairs
 * @property {{canHunt: Uint8Array, maxVelocity: number}} rules who hunts, and the speed scale
 * @property {Uint8Array} fleeing 1 for each agent index under pursuit this frame
 * @property {Int32Array} kicked each slot's last kick period, by slot
 */

/**
 * @param {Record<string, any>} info `ready.info`
 * @returns {FleeState} the state
 */
export function createFlee(info) {
    const capacity = info.maxAgents ?? 1024;
    return {
        pursuits: createPursuits(),
        rules: pursuitRules(info),
        fleeing: new Uint8Array(capacity),
        kicked: new Int32Array(capacity).fill(-1),
    };
}

/**
 * Finds this frame's fleeing prey and kicks dust behind the fast ones.
 * @param {import('./effects-player.js').EffectsPlayer} player the player (its `flee` state and recipe player)
 * @param {import('../interpolate.js').Interpolated} agents the blended agents
 * @param {number} tick the playhead tick
 * @returns {number} prey under pursuit
 */
export function playFlee(player, agents, tick) {
    const { flee } = player;
    flee.fleeing.fill(0, 0, Math.min(agents.count, flee.fleeing.length));
    findPursuits(agents, flee.rules, flee.pursuits);
    const fast = FLEE_KICK_SPEED * flee.rules.maxVelocity;
    for (let k = 0; k < flee.pursuits.count; k++) {
        const i = flee.pursuits.prey[k];
        flee.fleeing[i] = 1;
        const slot = agents.slot[i];
        const period = Math.floor(tick / FLEE_KICK_TICKS);
        if (agents.speed[i] >= fast && slot < flee.kicked.length && flee.kicked[slot] !== period) {
            flee.kicked[slot] = period;
            kick(player, agents, i, tick);
        }
    }
    return flee.pursuits.count;
}

/**
 * @param {import('./effects-player.js').EffectsPlayer} player the player
 * @param {import('../interpolate.js').Interpolated} agents the blended agents
 * @param {number} i the prey's index
 * @param {number} tick the playhead tick
 * @returns {void}
 */
function kick(player, agents, i, tick) {
    const at = player.at;
    const size = agents.size[i];
    at.x = agents.x[i] - Math.cos(agents.angle[i]) * size;
    at.y = agents.y[i] - Math.sin(agents.angle[i]) * size;
    at.angle = agents.angle[i] + Math.PI;
    at.size = size;
    at.tick = tick;
    at.rgb = PALETTE.stampedeDust;
    playRecipe(player.fx, FX_RECIPES.fleeDust, at);
}
