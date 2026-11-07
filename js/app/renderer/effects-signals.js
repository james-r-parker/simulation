// Calls, smoke, stampedes, pollination and a new strain through the effect pool. An alarm sends two chevron waves to
// the call radius and throbs the caller; a hunt call sends three arcs ahead along the caller's heading and stretches it;
// smoke bursts in puffs (with a bite mark when the releaser was bitten); a stampede shakes the ground in a dust ring.
// Call curves carry the calls-lens flag, so the lens lifts them in the shader.

import { floraColor } from './flora-colors.js';
import { PALETTE, SCENERY_MAX_LUMINANCE } from './colors.js';
import { TWEEN } from './body-tweens.js';
import { BIRTH_SIZE, indexOfGenome, tweenAt } from './effects-combat.js';
import { FX_RECIPES, playRecipe } from './fx-recipes.js';

const SMOKE_BITTEN_SHIFT = 8;
const HUE_MAX = 4095;

/**
 * Fills the player's scratch `at` at the effect, or at the agent with the given genome when it is alive.
 * @param {import('./effects-player.js').EffectsPlayer} player the player, `player.effect` holding the record
 * @param {import('../interpolate.js').Interpolated} agents the blended agents
 * @param {number} genome the agent to centre on
 * @returns {number} the agent's index, -1 when gone
 */
function atAgent(player, agents, genome) {
    const e = player.effect;
    const i = indexOfGenome(agents, genome);
    const at = player.at;
    at.x = i >= 0 ? agents.x[i] : e.x;
    at.y = i >= 0 ? agents.y[i] : e.y;
    at.angle = i >= 0 ? agents.angle[i] : 0;
    at.size = i >= 0 ? agents.size[i] : BIRTH_SIZE;
    at.tick = e.tick;
    return i;
}

/**
 * An alarm or a hunt call at the caller, sized to the call radius and lasting the call.
 * @param {import('./effects-player.js').EffectsPlayer} player the player
 * @param {import('../interpolate.js').Interpolated} agents the blended agents
 * @param {boolean} hunt a hunt call, else an alarm
 * @returns {void}
 */
export function playCall(player, agents, hunt) {
    const i = atAgent(player, agents, player.effect.a);
    const at = player.at;
    const { callRadius, callTicks } = player.info;
    at.size = callRadius;
    at.reach = callRadius * 0.6;
    at.life = callTicks;
    at.rgb = hunt ? PALETTE.huntRing : PALETTE.alarmRing;
    playRecipe(player.fx, hunt ? FX_RECIPES.packCall : FX_RECIPES.alarm, at);
    tweenAt(player, agents, i, hunt ? TWEEN.HOWL : TWEEN.CALL_THROB);
}

/**
 * Smoke released: a burst of puffs, and a bite mark beneath when the releaser was bitten.
 * @param {import('./effects-player.js').EffectsPlayer} player the player
 * @param {import('../interpolate.js').Interpolated} agents the blended agents
 * @returns {void}
 */
export function playSmoke(player, agents) {
    atAgent(player, agents, player.effect.a);
    player.at.rgb = PALETTE.coolWhite;
    playRecipe(player.fx, FX_RECIPES.smoke, player.at);
    if (((player.effect.c >>> SMOKE_BITTEN_SHIFT) & 1) === 1) {
        playRecipe(player.fx, FX_RECIPES.smokeBitten, player.at);
    }
}

/**
 * @param {import('./effects-player.js').EffectsPlayer} player the player
 * @param {'stampede' | 'strain'} which the recipe
 * @returns {void}
 */
export function playAtEffect(player, which) {
    const e = player.effect;
    const at = player.at;
    at.x = e.x;
    at.y = e.y;
    at.angle = 0;
    at.size = BIRTH_SIZE;
    at.tick = e.tick;
    at.rgb = PALETTE.infected;
    playRecipe(player.fx, FX_RECIPES[which], at);
}

/**
 * A seeded patch: a dim ring in the flora hue (scenery luminance) and a sprout that grows at the seedling.
 * @param {import('./effects-player.js').EffectsPlayer} player the player
 * @returns {void}
 */
export function playPollinated(player) {
    const e = player.effect;
    const rgb = floraColor((e.a / HUE_MAX) * 2 - 1, player.rgb);
    const y = 0.2126729 * rgb[0] + 0.7151522 * rgb[1] + 0.072175 * rgb[2];
    const scale = SCENERY_MAX_LUMINANCE / y;
    rgb[0] *= scale;
    rgb[1] *= scale;
    rgb[2] *= scale;
    const at = player.at;
    at.x = e.x;
    at.y = e.y;
    at.angle = 0;
    at.size = BIRTH_SIZE;
    at.tick = e.tick;
    at.rgb = rgb;
    playRecipe(player.fx, FX_RECIPES.pollinated, at);
}
