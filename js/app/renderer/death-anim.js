// The death animation of each cause: which clip the dying body plays, how long it lasts in wall time, how it fades, and
// whether it ends as the carcass the kill leaves. Pure data and the clock maths; `dying.js` holds the bodies.

import { TWEEN } from './body-tweens.js';

/**
 * @typedef {object} DeathAnim
 * @property {string} clip a `CLIPS` name, played over the death's progress 0 to 1
 * @property {number} kind the `TWEEN` kind that plays it on a dying row
 * @property {number} ms how long the death lasts, wall time
 * @property {number} fadeFrom the progress at which the body starts to fade out
 * @property {boolean} carcass whether the body ends as the carcass the kill leaves: its clip ends at `CARCASS_SCALE`
 */

/** The carcass model's size as a share of the body: an eaten body's clip ends at it. */
export const CARCASS_SCALE = 0.7;
/** The shortest and the longest a death may last, ms. */
export const DEATH_MS = Object.freeze({ min: 600, max: 2000 });

/** The animation of each `DEATH_CAUSE` name. */
export const DEATH_ANIMS = Object.freeze({
    EATEN: { clip: 'rupture', kind: TWEEN.RUPTURE, ms: 1000, fadeFrom: 0.45, carcass: true },
    STARVED: { clip: 'deflate', kind: TWEEN.DEFLATE, ms: 1600, fadeFrom: 0.4, carcass: false },
    OLD_AGE: { clip: 'wither', kind: TWEEN.WITHER, ms: 2000, fadeFrom: 0.3, carcass: false },
    POISONED: { clip: 'convulse', kind: TWEEN.CONVULSE, ms: 1200, fadeFrom: 0.5, carcass: false },
    COLLISION: { clip: 'crumple', kind: TWEEN.CRUMPLE, ms: 800, fadeFrom: 0.35, carcass: false },
    TRAMPLED: { clip: 'flatten', kind: TWEEN.FLATTEN, ms: 1000, fadeFrom: 0.4, carcass: false },
    DISEASE: { clip: 'deflate', kind: TWEEN.DEFLATE, ms: 1600, fadeFrom: 0.4, carcass: false },
});

/** What a cause name the table does not know plays, and a body whose cause never arrived. */
export const DEFAULT_DEATH = 'STARVED';

/**
 * @param {string | undefined} cause a death cause name (`ready.layout.deathCauses`)
 * @returns {DeathAnim} its animation, the starvation one for an unknown name
 */
export function animFor(cause) {
    return /** @type {Record<string, DeathAnim>} */ (DEATH_ANIMS)[cause ?? DEFAULT_DEATH] ?? DEATH_ANIMS[DEFAULT_DEATH];
}

/**
 * @param {DeathAnim} anim the animation
 * @param {number} elapsedMs wall time since the death began
 * @returns {number} the progress, 0 to 1
 */
export function progressOf(anim, elapsedMs) {
    return Math.min(Math.max(elapsedMs / anim.ms, 0), 1);
}

/**
 * @param {DeathAnim} anim the animation
 * @param {number} progress 0 to 1
 * @returns {number} how far the body has faded out: 0 until `fadeFrom`, then a smooth rise to 1 at the end
 */
export function fadeOf(anim, progress) {
    const u = Math.min(Math.max((progress - anim.fadeFrom) / (1 - anim.fadeFrom), 0), 1);
    return u * u * (3 - 2 * u);
}
