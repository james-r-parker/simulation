// Validity of a role drill (docs/designs/training-loop.md, T34; the gate validity of training-stages.md read for a drill whose
// bar is a budget row): the drill is valid when its row is passable, the scripted reference wins every trial the row says it
// can, and the random brains do not. A row the budget calls impossible has no passable bar: the reading says so, and that the
// reference agrees with the row by winning nothing. A detector: it reads drills and the budget, never fitness, merit, mate
// rank or archive rank.

import { createConfig } from '../sim/config.js';
import { layerArena } from './drill-body-rules.js';
import { barOf } from './drill-role-row.js';
import { drillSubject, randomBrains, winBounds } from './drill.js';

/**
 * @typedef {object} RoleValidity
 * @property {string} drill the drill's name
 * @property {import('./drill-role-row.js').RowBar} bar the bar its budget row sets
 * @property {{wins: number, trials: number, winShare: number, winShareLow: number}} reference the scripted reference's score
 * @property {{wins: number, trials: number, winShare: number, edgeLow: number}} random the random brains' pooled score, and the
 *   reference's low bound over their high bound
 * @property {boolean} referencePasses whether the bar is passable and the reference won every trial
 * @property {boolean} randomFails whether the reference's low bound clears the random brains' high bound (`edgeLow` above 0)
 * @property {boolean} agreesWithRow whether the reference does what the row says: wins every trial on a passable row, none on
 *   an impossible one
 * @property {boolean} valid whether the drill has a passable bar the reference passes and the random brains fail
 * @property {string} reason one line: what the reading found
 */

/**
 * @param {boolean} passable whether the row is
 * @param {{wins: number, trials: number}} reference the reference's score
 * @param {{valid: boolean, binding: string}} found whether the drill is valid and the row's binding step
 * @returns {string} the reason
 */
function reasonOf(passable, reference, { valid, binding }) {
    const score = `the reference wins ${reference.wins} of ${reference.trials}`;
    if (!passable) {
        const base = `the row is impossible at "${binding}": no passable bar; ${score}`;
        return reference.wins > 0 ? `${base}, so the scene is easier than the row says` : base;
    }
    return valid ? `valid: ${score} and the random brains do not` : `invalid: ${score}`;
}

/**
 * Plays the drill's reference and the random brains and reads the drill against its budget row.
 * @param {import('./drill-staging.js').RoleDrill} drill a role drill
 * @param {{seed?: number, trials?: number, config?: Record<string, any>}} [options] the seed (1), the trials (32) and the config
 *   overrides the trials run under (none: the defaults)
 * @returns {RoleValidity} the reading
 */
export function roleDrillValidity(drill, { seed = 1, trials = 32, config } = {}) {
    const run = { seed, trials, config };
    const bar = barOf(drill.row, createConfig(layerArena(config, drill.arena)), drill.goals);
    const reference = drillSubject(drill, drill.reference(), run);
    const randoms = randomBrains(drill, run).map((brain) => drillSubject(drill, brain, run));
    const { winShareLow, edgeLow } = winBounds(reference, randoms);
    const wins = randoms.reduce((sum, s) => sum + s.wins, 0);
    const total = randoms.reduce((sum, s) => sum + s.trials, 0);
    const referencePasses = bar.passable && reference.wins === reference.trials;
    const randomFails = edgeLow > 0;
    const valid = referencePasses && randomFails;
    return {
        drill: drill.name,
        bar,
        reference: { wins: reference.wins, trials: reference.trials, winShare: reference.winShare, winShareLow },
        random: { wins, trials: total, winShare: wins / total, edgeLow },
        referencePasses,
        randomFails,
        agreesWithRow: bar.passable ? reference.wins === reference.trials : reference.wins === 0,
        valid,
        reason: reasonOf(bar.passable, reference, { valid, binding: String(bar.binding) }),
    };
}
