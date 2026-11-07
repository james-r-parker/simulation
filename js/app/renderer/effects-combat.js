// Bites, kills and deaths through the effect pool: the jaw spray and the bite mark, a recipe per death cause, the pack
// kill's double ring, and the lunge, flinch and gulp tweens on the bodies involved.

import { familyColor, PALETTE } from './colors.js';
import { startTween, TWEEN } from './body-tweens.js';
import { DEATH_RECIPES, FX_RECIPES, playRecipe } from './fx-recipes.js';

/** Where on the biter a bite spray starts, in biter radii ahead of its centre. */
export const JAW_REACH = 0.9;
/** A newborn's or a corpse's burst scale when its body is gone, in world units. */
export const BIRTH_SIZE = 24;
const CAUSE_MASK = 255;
const CAUSE_SHIFT = 8;
const PACK_BIT = 65536;

/**
 * @param {import('../interpolate.js').Interpolated} agents the blended agents
 * @param {number} genomeId the agent to find
 * @returns {number} its index, -1 when it is not alive
 */
export function indexOfGenome(agents, genomeId) {
    for (let i = 0; i < agents.count; i++) {
        if (agents.genomeId[i] === genomeId) {
            return i;
        }
    }
    return -1;
}

/**
 * Starts a tween on the agent at an index.
 * @param {import('./effects-player.js').EffectsPlayer} player the player
 * @param {import('../interpolate.js').Interpolated} agents the blended agents
 * @param {number} i the agent's index, ignored when negative
 * @param {number} kind a `TWEEN` kind
 * @returns {void}
 */
export function tweenAt(player, agents, i, kind) {
    if (i < 0 || agents.slot[i] >= player.tweens.kind.length) {
        return;
    }
    player.who.slot = agents.slot[i];
    player.who.genome = agents.genomeId[i];
    startTween(player.tweens, player.who, kind, player.effect.tick);
}

/**
 * @param {import('./effects-player.js').EffectsPlayer} player the player
 * @param {{x: number, y: number, angle: number, size: number}} where the scratch position fields
 * @returns {import('./fx-recipes.js').FxAt} the player's scratch `at`, filled with the effect's tick
 */
function atOf(player, { x, y, angle, size }) {
    const at = player.at;
    at.x = x;
    at.y = y;
    at.angle = angle;
    at.size = size;
    at.tick = player.effect.tick;
    return at;
}

const SPOT = { x: 0, y: 0, angle: 0, size: 0 };

/**
 * Fills the player's scratch `at` at the effect record's position and tick, facing 0, at the birth size.
 * @param {import('./effects-player.js').EffectsPlayer} player the player, `player.effect` holding the record
 * @returns {import('./fx-recipes.js').FxAt} the scratch `at`
 */
export function atEffect(player) {
    const e = player.effect;
    const at = player.at;
    at.x = e.x;
    at.y = e.y;
    at.angle = 0;
    at.size = BIRTH_SIZE;
    at.tick = e.tick;
    return at;
}

/**
 * Fills the player's scratch `at` on an agent's body, facing 0.
 * @param {import('./effects-player.js').EffectsPlayer} player the player
 * @param {import('../interpolate.js').Interpolated} agents the blended agents
 * @param {number} i the agent's index
 * @param {number} tick the tick the effect starts
 * @returns {import('./fx-recipes.js').FxAt} the scratch `at`
 */
export function atBody(player, agents, i, tick) {
    const at = player.at;
    at.x = agents.x[i];
    at.y = agents.y[i];
    at.size = agents.size[i];
    at.angle = 0;
    at.tick = tick;
    return at;
}

/**
 * A bite: a spray at the biter's jaw (at the effect when the biter is gone), a bite mark on the victim's rim facing
 * the biter, a lunge on the biter and a flinch on the victim.
 * @param {import('./effects-player.js').EffectsPlayer} player the player, `player.effect` holding the record
 * @param {import('../interpolate.js').Interpolated} agents the blended agents
 * @returns {void}
 */
export function playBite(player, agents) {
    const e = player.effect;
    const biter = indexOfGenome(agents, e.a);
    const victim = indexOfGenome(agents, e.b);
    SPOT.x = e.x;
    SPOT.y = e.y;
    SPOT.angle = 0;
    SPOT.size = BIRTH_SIZE;
    if (biter >= 0) {
        SPOT.size = agents.size[biter];
        SPOT.angle = agents.angle[biter];
        SPOT.x = agents.x[biter] + Math.cos(SPOT.angle) * SPOT.size * JAW_REACH;
        SPOT.y = agents.y[biter] + Math.sin(SPOT.angle) * SPOT.size * JAW_REACH;
    }
    player.at.rgb = PALETTE.biteFlash;
    playRecipe(player.fx, FX_RECIPES.biteJaw, atOf(player, SPOT));
    if (victim >= 0) {
        const toward = Math.atan2(SPOT.y - agents.y[victim], SPOT.x - agents.x[victim]);
        SPOT.size = agents.size[victim];
        SPOT.angle = toward;
        SPOT.x = agents.x[victim] + Math.cos(toward) * SPOT.size * 0.75;
        SPOT.y = agents.y[victim] + Math.sin(toward) * SPOT.size * 0.75;
        playRecipe(player.fx, FX_RECIPES.biteMark, atOf(player, SPOT));
    }
    tweenAt(player, agents, biter, TWEEN.LUNGE);
    tweenAt(player, agents, victim, TWEEN.FLINCH);
}

/**
 * A death: the recipe for its cause in the family colour, the pack kill's double ring, and a gulp on the killer of a
 * body eaten.
 * @param {import('./effects-player.js').EffectsPlayer} player the player, `player.effect` holding the record
 * @param {import('../interpolate.js').Interpolated} agents the blended agents
 * @returns {void}
 */
export function playDeath(player, agents) {
    const e = player.effect;
    const cause = (e.c >>> CAUSE_SHIFT) & CAUSE_MASK;
    const name = player.causeNames[cause];
    player.at.rgb = familyColor(player.slots, e.d, 0.6, player.rgb);
    SPOT.x = e.x;
    SPOT.y = e.y;
    SPOT.angle = 0;
    SPOT.size = BIRTH_SIZE;
    const r = DEATH_RECIPES[/** @type {keyof typeof DEATH_RECIPES} */ (name)] ?? FX_RECIPES.died;
    playRecipe(player.fx, r, atOf(player, SPOT));
    if ((e.c & PACK_BIT) !== 0) {
        playRecipe(player.fx, FX_RECIPES.packKill, atOf(player, SPOT));
    }
    if (name === 'EATEN') {
        tweenAt(player, agents, indexOfGenome(agents, e.b), TWEEN.GULP);
    }
}
