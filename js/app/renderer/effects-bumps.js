// Plays the bumps `findBumps` reads from the frame: a brief membrane squash and rebound along the heading (the `bump`
// and `bumpHard` tween clips) and a faint ripple (a small dent at the nose). No flash and no particles for an ordinary
// bump. The bump tween has the lowest rank and the dent yields to a stronger running one, so a bite on the same body
// always wins.

import { startTween, TWEEN } from './body-tweens.js';
import { BUMP, findBumps } from './bumps.js';
import { startDent } from './dents.js';

/** How deep the ripple of a soft and of a hard bump is, as a share of the body's radius. */
export const BUMP_DENT = Object.freeze({ soft: 0.05, hard: 0.12 });

const WHO = { slot: 0, genome: 0 };
const DENT = { angle: 0, depth: 0, tick: 0 };

/**
 * @param {import('./effects-player.js').EffectsPlayer} player the player (its tweens, dents, bump state and speed scale)
 * @param {import('../interpolate.js').Interpolated} agents the blended agents
 * @param {number} tick the playhead tick
 * @returns {number} bumps played
 */
export function playBumps(player, agents, tick) {
    const { bumps } = player;
    const found = findBumps(agents, player.flee.rules.maxVelocity, bumps);
    for (let k = 0; k < found; k++) {
        const i = bumps.index[k];
        const hard = bumps.kind[k] === BUMP.HARD;
        WHO.slot = agents.slot[i];
        WHO.genome = agents.genomeId[i];
        if (WHO.slot < player.tweens.kind.length) {
            startTween(player.tweens, WHO, hard ? TWEEN.BUMP_HARD : TWEEN.BUMP, tick);
        }
        if (player.dents !== null) {
            DENT.angle = agents.angle[i];
            DENT.depth = hard ? BUMP_DENT.hard : BUMP_DENT.soft;
            DENT.tick = tick;
            startDent(player.dents, WHO, DENT);
        }
    }
    return found;
}
