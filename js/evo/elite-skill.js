// The elite-skill read (docs/designs/training-stages.md, Phase 8): how much of an archive's skill sits in the elites
// the gate does not read. A detector, never fitness. Pure: no files.

import { spearman } from './metrics-stats.js';

/** The `edgeLow` an elite must reach on a drill to count as skilled (the nursery gate's bar). */
export const ELITE_BAR = 0.3;

/**
 * @typedef {object} EliteSkillDrill
 * @property {number} drilled elites that ran the drill
 * @property {number} clearing those whose `edgeLow` is at or above the bar
 * @property {number | null} clearShare `clearing / drilled`; null when none was drilled
 * @property {boolean | null} topClears whether the drilled elite of the highest lower bound clears the bar (the first
 *   in order on a tie); null when none was drilled
 * @property {number | null} spearman rank correlation of lower bound against win share over the drilled elites; null
 *   when it is undefined (fewer than 2 elites, or a constant lower bound or win share)
 */

/**
 * @param {readonly {bound: number, win: number, low: number}[]} seen the drilled elites
 * @param {number} bar the bar
 * @returns {EliteSkillDrill} their read
 */
function readOf(seen, bar) {
    const clearing = seen.filter((s) => s.low >= bar).length;
    const top = seen.reduce((best, s) => (best === null || s.bound > best.bound ? s : best), /** @type {any} */ (null));
    const rho =
        seen.length < 2
            ? NaN
            : spearman(
                  seen.map((s) => s.bound),
                  seen.map((s) => s.win),
              );
    return {
        drilled: seen.length,
        clearing,
        clearShare: seen.length === 0 ? null : clearing / seen.length,
        topClears: top === null ? null : top.low >= bar,
        spearman: Number.isNaN(rho) ? null : rho,
    };
}

/**
 * @param {readonly {cells: Record<string, {winShare: number, edgeLow?: number} | null>}[]} rows the drill rows, one per
 *   subject in order (a trailing row, such as the reference, is ignored)
 * @param {readonly {lowerBound?: number}[]} subjects the drilled elites, with their lower bounds
 * @param {{bar?: number, drills?: readonly string[]}} [options] the bar (`ELITE_BAR`) and the drills to read (default
 *   the drills of the first row)
 * @returns {Record<string, EliteSkillDrill>} the read of each drill
 */
export function eliteSkill(rows, subjects, { bar = ELITE_BAR, drills = Object.keys(rows[0]?.cells ?? {}) } = {}) {
    return Object.fromEntries(
        drills.map((drill) => {
            const seen = subjects.flatMap((subject, i) => {
                const cell = rows[i]?.cells[drill] ?? null;
                return cell === null
                    ? []
                    : [{ bound: subject.lowerBound ?? 0, win: cell.winShare, low: cell.edgeLow ?? -Infinity }];
            });
            return [drill, readOf(seen, bar)];
        }),
    );
}
