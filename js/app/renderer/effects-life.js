// Courtship and births through the effect pool: motes that spiral between two mates as they bounce toward each other,
// a ring when a pregnancy begins, and a birth told by its cause (mating: a ring, motes and sparkles; a split: two discs
// pulling apart; a floor entrant or an immigrant: motes descending onto the spot), with a pop on the newborn.

import { familyColor, PALETTE } from './colors.js';
import { TWEEN } from './body-tweens.js';
import { BIRTH_SIZE, indexOfGenome, tweenAt } from './effects-combat.js';
import { FX_RECIPES, playRecipe } from './fx-recipes.js';

/** The orbit radius of a mating whose partners are gone, world units. */
const LONE_MATE_REACH = 40;

/**
 * @param {Record<string, number>} causes `ready.layout.bornCauses`
 * @returns {string[]} the names by number
 */
export function bornNamesOf(causes) {
    /** @type {string[]} */
    const names = [];
    for (const [name, n] of Object.entries(causes ?? {})) {
        names[n] = name;
    }
    return names;
}

/**
 * Mating: courtship motes spiral in to the midpoint of the pair, both partners bounce.
 * @param {import('./effects-player.js').EffectsPlayer} player the player, `player.effect` holding the record
 * @param {import('../interpolate.js').Interpolated} agents the blended agents
 * @returns {void}
 */
export function playMate(player, agents) {
    const e = player.effect;
    const mother = indexOfGenome(agents, e.a);
    const father = indexOfGenome(agents, e.b);
    const at = player.at;
    at.x = e.x;
    at.y = e.y;
    at.reach = LONE_MATE_REACH;
    at.size = BIRTH_SIZE;
    if (mother >= 0 && father >= 0) {
        at.x = (agents.x[mother] + agents.x[father]) / 2;
        at.y = (agents.y[mother] + agents.y[father]) / 2;
        at.reach = Math.max(Math.hypot(agents.x[mother] - at.x, agents.y[mother] - at.y), agents.size[mother]);
        at.size = agents.size[mother];
    }
    at.angle = 0;
    at.tick = e.tick;
    at.rgb = PALETTE.courtship;
    playRecipe(player.fx, FX_RECIPES.mateOrbit, at);
    tweenAt(player, agents, mother, TWEEN.COURT);
    tweenAt(player, agents, father, TWEEN.COURT);
}

/**
 * A pregnancy begins: a soft courtship ring round the mother.
 * @param {import('./effects-player.js').EffectsPlayer} player the player
 * @param {import('../interpolate.js').Interpolated} agents the blended agents
 * @param {number} i the mother's index
 * @returns {void}
 */
export function playPregnant(player, agents, i) {
    const at = player.at;
    at.x = agents.x[i];
    at.y = agents.y[i];
    at.size = agents.size[i];
    at.angle = 0;
    at.tick = player.edges.tick;
    at.rgb = PALETTE.courtship;
    playRecipe(player.fx, FX_RECIPES.pregnant, at);
}

/**
 * A birth, told by its cause; the founding population (`INITIAL`) plays nothing.
 * @param {import('./effects-player.js').EffectsPlayer} player the player, `player.effect` holding the record
 * @param {import('../interpolate.js').Interpolated} agents the blended agents
 * @returns {void}
 */
export function playBirth(player, agents) {
    const e = player.effect;
    const cause = player.bornNames[e.d];
    if (cause === 'INITIAL') {
        return;
    }
    const at = player.at;
    at.x = e.x;
    at.y = e.y;
    at.size = BIRTH_SIZE;
    at.tick = e.tick;
    at.rgb = familyColor(player.slots, e.b, 0.8, player.rgb);
    at.angle = cause === 'SPLIT' ? (e.a * 2.399963229728653) % (2 * Math.PI) : Math.PI / 2;
    const r =
        cause === 'SPLIT'
            ? FX_RECIPES.birthSplit
            : cause === 'FLOOR' || cause === 'IMMIGRANT'
              ? FX_RECIPES.birthArrival
              : FX_RECIPES.birthMate;
    playRecipe(player.fx, r, at);
    tweenAt(player, agents, indexOfGenome(agents, e.a), TWEEN.BIRTH_POP);
}
