// The control arms of a drill (training-stages.md, Scene drills): `pack-converge` plays a trio against the same prey as a
// lone hunter (`solo`) and as a trio that cannot sense each other (`kin-blind`). The gain is the trio's share minus the
// solo share; its low bound compares the trio's Wilson low bound with the arm's Wilson high bound, so a gain above 0 is
// one the trials can tell from luck. A detector, never fitness. Pure.

import { wilsonInterval } from './binomial.js';

/**
 * @typedef {object} ArmScore
 * @property {number} wins trials won
 * @property {number} trials trials played
 */

/**
 * @typedef {object} ArmReading
 * @property {number} soloShare the lone hunter's win share
 * @property {number} blindShare the kin-blind trio's win share
 * @property {number} gain the trio's win share minus the solo share
 * @property {number} gainLow the trio's Wilson low bound minus the solo arm's Wilson high bound
 * @property {number} blindGapLow the trio's Wilson low bound minus the kin-blind arm's Wilson high bound: above 0 when the
 *   trio does better than three hunters side by side
 */

/** The arm names `armReading` reads. */
export const ARM_NAMES = Object.freeze({ SOLO: 'solo', BLIND: 'kin-blind' });

/**
 * @param {ArmScore} trio the trio's score (the drill's own trials)
 * @param {Record<string, ArmScore>} arms the arms' scores by name
 * @returns {ArmReading | null} the gain and the bounds; null when an arm is missing or has no trials
 */
export function armReading(trio, arms) {
    const solo = arms[ARM_NAMES.SOLO];
    const blind = arms[ARM_NAMES.BLIND];
    if (solo === undefined || blind === undefined || trio.trials === 0 || solo.trials === 0 || blind.trials === 0) {
        return null;
    }
    const { low } = wilsonInterval(trio.wins, trio.trials);
    return {
        soloShare: solo.wins / solo.trials,
        blindShare: blind.wins / blind.trials,
        gain: trio.wins / trio.trials - solo.wins / solo.trials,
        gainLow: low - wilsonInterval(solo.wins, solo.trials).high,
        blindGapLow: low - wilsonInterval(blind.wins, blind.trials).high,
    };
}

/**
 * @param {readonly {trio: ArmScore, arms: Record<string, ArmScore>}[]} cells the cells of the champions a drill applied to
 * @returns {ArmReading | null} the reading over the trials pooled across the champions; null without cells
 */
export function pooledArmReading(cells) {
    if (cells.length === 0) {
        return null;
    }
    const sum = (/** @type {(c: any) => ArmScore} */ pick) => ({
        wins: cells.reduce((total, c) => total + pick(c).wins, 0),
        trials: cells.reduce((total, c) => total + pick(c).trials, 0),
    });
    return armReading(
        sum((c) => c.trio),
        {
            [ARM_NAMES.SOLO]: sum((c) => c.arms[ARM_NAMES.SOLO] ?? { wins: 0, trials: 0 }),
            [ARM_NAMES.BLIND]: sum((c) => c.arms[ARM_NAMES.BLIND] ?? { wins: 0, trials: 0 }),
        },
    );
}
