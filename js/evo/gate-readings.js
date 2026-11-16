// Gate readings from a drill table (docs/designs/training-stages.md, Gates): the keys a gate reads, `drill.<name>.edgeLow`
// and its siblings, pooled over the champions each drill applies to. A detector only: nothing here reaches fitness, merit,
// mate rank or archive rank. Pure.

import { wilsonInterval } from './binomial.js';

/**
 * @typedef {object} ReadingCell
 * @property {number} winShare the champion's win share
 * @property {number} wins trials won
 * @property {number} trials trials played
 * @property {number} randomWins wins of the random brains, pooled
 * @property {number} randomTrials trials of the random brains, pooled
 * @property {Record<string, number>} [lossReasons] counts by first-match lost-trial reason
 */

/**
 * @typedef {object} DrillReading
 * @property {number | null} winShareLow the Wilson low bound of the pooled win share
 * @property {number | null} edgeLow `winShareLow` minus the Wilson high bound of the random brains' pooled share
 * @property {number | null} winShareOverReference `winShareLow` over the reference's win share (null: no reference or 0)
 * @property {Record<string, number>} lossShare each lost-trial reason's share of the lost trials
 */

/** The first-match lost-trial reasons of a drill (`LostReason` in `js/evo/drill-trace.js`, and `bit-kin`, the `kin-spared` loss of a subject that wished to bite its sibling); a reason that did not occur reads 0. */
export const LOST_REASONS = Object.freeze([
    'never-bit',
    'never-in-jaws',
    'bit-prey-lived',
    'subject-starved-or-recoiled-first',
    'prey-died-unkilled',
    'bit-kin',
]);

/**
 * @param {readonly ReadingCell[]} cells the cells of the champions a drill applied to
 * @param {ReadingCell | null} reference the reference's cell
 * @returns {DrillReading} the drill's readings, null where no champion was drilled
 */
function drillReading(cells, reference) {
    if (cells.length === 0) {
        return { winShareLow: null, edgeLow: null, winShareOverReference: null, lossShare: {} };
    }
    const wins = cells.reduce((sum, c) => sum + c.wins, 0);
    const trials = cells.reduce((sum, c) => sum + c.trials, 0);
    const winShareLow = wilsonInterval(wins, trials).low;
    const random = wilsonInterval(cells[0].randomWins, cells[0].randomTrials);
    const lost = trials - wins;
    /** @type {Record<string, number>} */
    const lossShare = Object.fromEntries(LOST_REASONS.map((reason) => [reason, 0]));
    for (const cell of cells) {
        for (const [reason, n] of Object.entries(cell.lossReasons ?? {})) {
            lossShare[reason] = (lossShare[reason] ?? 0) + n / lost;
        }
    }
    const over = reference !== null && reference.winShare > 0 ? winShareLow / reference.winShare : null;
    return { winShareLow, edgeLow: winShareLow - random.high, winShareOverReference: over, lossShare };
}

/**
 * Pools a drill table's champions into the gate's drill readings. `edgeLow` is the pooled win share's Wilson low bound
 * minus the high bound of the random brains' pooled share, so it is an edge the trials can tell from luck.
 * @param {readonly {cells: Record<string, ReadingCell | null>}[]} rows the drill table: a row per champion, then the
 *   `memoryless` reference
 * @param {number} genomeCount how many leading rows are champions
 * @param {readonly string[]} drills the drill names to read
 * @returns {Record<string, DrillReading>} each drill's readings (null readings where no champion ran it)
 */
export function drillReadings(rows, genomeCount, drills) {
    const reference = rows[genomeCount] ?? null;
    return Object.fromEntries(
        drills.map((name) => {
            const cells = rows.slice(0, genomeCount).flatMap((row) => (row.cells[name] ? [row.cells[name]] : []));
            return [name, drillReading(cells, reference?.cells[name] ?? null)];
        }),
    );
}
