// Bites, kills and deaths through the effect pool: the jaw spray and the bite mark, a recipe per death cause, the pack
// kill's double ring, and the lunge, flinch and gulp tweens on the bodies involved.

import { familyColor, PALETTE } from './colors.js';
import { startTween, TWEEN } from './body-tweens.js';
import { startDent } from './dents.js';
import { beginDeath, deathBody, positionOf } from './dying.js';
import { DEATH_RECIPES, FX_RECIPES, playRecipe } from './fx-recipes.js';

/** Where on the biter a bite spray starts, in biter radii ahead of its centre. */
export const JAW_REACH = 0.9;
/** How deep a bite presses the victim's membrane, as a share of its radius. */
export const BITE_DENT = 0.3;
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
 * @param {boolean} [wall] whether the effect keeps wall time (`FxAt.wall`)
 * @returns {import('./fx-recipes.js').FxAt} the player's scratch `at`, filled with the effect's tick
 */
function atOf(player, { x, y, angle, size }, wall = false) {
    const at = player.at;
    at.wall = wall;
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

const DENT_WHO = { slot: 0, genome: 0 };

/**
 * Presses the victim's membrane in at the contact.
 * @param {import('./effects-player.js').EffectsPlayer} player the player
 * @param {{agents: import('../interpolate.js').Interpolated, victim: number, toward: number}} bite the blended agents,
 *   the victim's index and the bearing from the victim to the biter
 * @returns {void}
 */
function dentVictim(player, { agents, victim, toward }) {
    if (player.dents === undefined || player.dents === null) {
        return;
    }
    DENT_WHO.slot = agents.slot[victim];
    DENT_WHO.genome = agents.genomeId[victim];
    startDent(player.dents, DENT_WHO, { angle: toward, depth: BITE_DENT, tick: player.effect.tick });
}

/**
 * The energy-transfer cue: a few motes leave the victim's rim and run to the biter's mouth.
 * @param {import('./effects-player.js').EffectsPlayer} player the player
 * @param {{toward: number, gap: number}} drain the bearing from the victim to the biter and the gap in world units
 * @returns {void}
 */
function playDrain(player, { toward, gap }) {
    SPOT.angle = toward;
    const at = atOf(player, SPOT);
    at.reach = gap;
    at.rgb = PALETTE.meat;
    playRecipe(player.fx, FX_RECIPES.biteDrain, at);
    at.reach = 0;
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
    const jawX = SPOT.x;
    const jawY = SPOT.y;
    player.at.rgb = PALETTE.biteFlash;
    playRecipe(player.fx, FX_RECIPES.biteJaw, atOf(player, SPOT));
    if (victim >= 0) {
        const toward = Math.atan2(SPOT.y - agents.y[victim], SPOT.x - agents.x[victim]);
        SPOT.size = agents.size[victim];
        SPOT.angle = toward;
        SPOT.x = agents.x[victim] + Math.cos(toward) * SPOT.size * 0.75;
        SPOT.y = agents.y[victim] + Math.sin(toward) * SPOT.size * 0.75;
        playRecipe(player.fx, FX_RECIPES.biteMark, atOf(player, SPOT));
        dentVictim(player, { agents, victim, toward });
        playDrain(player, { toward, gap: Math.hypot(jawX - SPOT.x, jawY - SPOT.y) });
    }
    tweenAt(player, agents, biter, TWEEN.LUNGE);
    tweenAt(player, agents, victim, TWEEN.FLINCH);
}

/**
 * Starts the dying body of a death record: the pool body of the dead genome, its membrane tearing from the killer's
 * bearing when it was eaten.
 * @param {import('./effects-player.js').EffectsPlayer} player the player, `player.effect` holding the record
 * @param {import('../interpolate.js').Interpolated} agents the blended agents
 * @param {{cause: number, name: string}} death the cause number and name
 * @returns {number} the body's pool index, -1 when there is none
 */
function startBody(player, agents, { cause, name }) {
    const d = player.dying;
    if (d === null || d === undefined) {
        return -1;
    }
    const e = player.effect;
    const killer = name === 'EATEN' ? indexOfGenome(agents, e.b) : -1;
    const bearing = killer >= 0 ? Math.atan2(agents.y[killer] - e.y, agents.x[killer] - e.x) : undefined;
    beginDeath(d, { genome: e.a, cause, nowMs: player.momentCtx.nowMs, bearing });
    return deathBody(d, e.a);
}

/**
 * Puts the scratch spot where a death's effects play: on the dying body as drawn, at its size; at the record's position
 * and the birth size when no body is drawn.
 * @param {import('./effects-player.js').EffectsPlayer} player the player, `player.effect` holding the record
 * @param {number} k the dying body's pool index, -1 when none
 * @returns {void}
 */
function placeOnBody(player, k) {
    const e = player.effect;
    SPOT.x = e.x;
    SPOT.y = e.y;
    SPOT.angle = 0;
    SPOT.size = BIRTH_SIZE;
    const d = player.dying;
    if (k >= 0 && d !== null && d !== undefined) {
        const at = positionOf(d, k, player.momentCtx.nowMs);
        SPOT.x = at.x;
        SPOT.y = at.y;
        SPOT.size = d.pose[3][k];
    }
}

/**
 * A death: the recipe for its cause in the family colour at the body's drawn position and size, on the wall clock so
 * its particles end with the body's clip at any sim speed, the pack kill's double ring, and the kill clamp on the
 * killer of a body eaten.
 * @param {import('./effects-player.js').EffectsPlayer} player the player, `player.effect` holding the record
 * @param {import('../interpolate.js').Interpolated} agents the blended agents
 * @returns {void}
 */
export function playDeath(player, agents) {
    const e = player.effect;
    const cause = (e.c >>> CAUSE_SHIFT) & CAUSE_MASK;
    const name = player.causeNames[cause];
    player.at.rgb = familyColor(player.slots, e.d, 0.6, player.rgb);
    placeOnBody(player, startBody(player, agents, { cause, name }));
    const r = DEATH_RECIPES[/** @type {keyof typeof DEATH_RECIPES} */ (name)] ?? FX_RECIPES.died;
    playRecipe(player.fx, r, atOf(player, SPOT, true));
    if ((e.c & PACK_BIT) !== 0) {
        playRecipe(player.fx, FX_RECIPES.packKill, atOf(player, SPOT, true));
    }
    if (name === 'EATEN') {
        tweenAt(player, agents, indexOfGenome(agents, e.b), TWEEN.KILL);
    }
}
