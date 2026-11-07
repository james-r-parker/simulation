// The world effects of Phase 3 (the worker's kinds 12 to 16): a herd animal's death thuds into a dust ring, a calf pops
// in, dung plops and sprouts in the seedling's hue, a dying patch drops leaves in its hue, and a hunter's first kill
// rises in gold sparkles.

import { familyColor } from './colors.js';
import { atEffect } from './effects-combat.js';
import { floraColor } from './flora-colors.js';
import { FX_RECIPES, playRecipe } from './fx-recipes.js';

const HUE_MAX = 4095;

/**
 * @param {import('./effects-player.js').EffectsPlayer} player the player, `player.effect` holding the record
 * @returns {import('./fx-recipes.js').FxRecipe | null} the recipe for the record's kind, with `player.at.rgb` set; null
 *   for a kind that is not a world effect
 */
function worldRecipe(player) {
    const { kinds, effect: e, at } = player;
    switch (e.kind) {
        case kinds.HERD_DIED:
            return FX_RECIPES.herdDied;
        case kinds.CALF_BORN:
            return FX_RECIPES.calfBorn;
        case kinds.DUNG_DROPPED:
            at.rgb = floraColor((e.c / HUE_MAX) * 2 - 1, player.rgb);
            return FX_RECIPES.dungDropped;
        case kinds.PATCH_WILTED:
            at.rgb = floraColor((e.b / HUE_MAX) * 2 - 1, player.rgb);
            return FX_RECIPES.patchWilted;
        case kinds.FIRST_KILL:
            at.rgb = familyColor(player.slots, e.c, 1, player.rgb);
            return FX_RECIPES.firstKill;
        default:
            return null;
    }
}

/**
 * Plays a world effect at its position.
 * @param {import('./effects-player.js').EffectsPlayer} player the player, `player.effect` holding the record
 * @returns {boolean} whether the record was a world effect
 */
export function playWorldEffect(player) {
    const r = worldRecipe(player);
    if (r === null) {
        return false;
    }
    playRecipe(player.fx, r, atEffect(player));
    return true;
}
