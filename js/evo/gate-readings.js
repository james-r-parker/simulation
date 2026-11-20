// Gate readings from a drill table (docs/designs/training-stages.md, Gates): the keys a gate reads, `drill.<name>.edgeLow`
// and its siblings, pooled over the champions each drill applies to. A detector only: nothing here reaches fitness, merit,
// mate rank or archive rank. Pure.

import { wilsonInterval } from './binomial.js';
import { pooledArmReading } from './drill-arms.js';
import { quantile } from './metrics-stats.js';

/**
 * @typedef {object} ReadingCell
 * @property {number} winShare the champion's win share
 * @property {number} wins trials won
 * @property {number} trials trials played
 * @property {number} randomWins wins of the random brains, pooled
 * @property {number} randomTrials trials of the random brains, pooled
 * @property {Record<string, number>} [lossReasons] counts by first-match lost-trial reason
 * @property {Record<string, {wins: number, trials: number}>} [arms] the control arms' scores (`pack-converge`)
 * @property {number} [jawTrials] trials with the prey in the jaws at some tick (a drill with a prey trace)
 * @property {number[]} [closestList] each trial's closest approach, in summed radii (null approaches left out)
 */

/**
 * @typedef {object} DrillReading
 * @property {number | null} winShareLow the Wilson low bound of the pooled win share
 * @property {number | null} edgeLow `winShareLow` minus the Wilson high bound of the random brains' pooled share
 * @property {number | null} winShareOverReference `winShareLow` over the reference's win share (null: no reference or 0)
 * @property {Record<string, number>} lossShare each lost-trial reason's share of the lost trials
 * @property {number | null} jawShareLow the Wilson low bound of the share of trials with the prey in the jaws (null: no prey trace)
 * @property {number | null} closestMedian the median closest approach (null: none recorded)
 * @property {number | null} [gainLow] `pack-converge` only: the trio's win share low bound minus the solo arm's high bound
 *   (`js/evo/drill-arms.js`), pooled over the champions
 * @property {number | null} [blindGapLow] `pack-converge` only: the same against the kin-blind arm
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
 * @returns {{gainLow: number | null, blindGapLow: number | null} | {}} the pooled arm readings of a drill with control arms
 *   (null where an arm was not played), nothing for a drill without
 */
function armReadings(cells) {
    if (!cells.some((cell) => cell.arms !== undefined)) {
        return {};
    }
    const pooled = pooledArmReading(
        cells.map((cell) => ({ trio: { wins: cell.wins, trials: cell.trials }, arms: cell.arms ?? {} })),
    );
    return pooled === null
        ? { gainLow: null, blindGapLow: null }
        : { gainLow: pooled.gainLow, blindGapLow: pooled.blindGapLow };
}

/**
 * @param {readonly ReadingCell[]} cells the cells of the champions a drill applied to
 * @returns {{jawShareLow: number | null, closestMedian: number | null}} the graded readings of a drill with a prey trace,
 *   null where its cells carry none
 */
function traceReadings(cells) {
    const traced = cells.filter((cell) => cell.jawTrials !== undefined);
    const closest = cells.flatMap((cell) => cell.closestList ?? []);
    const trials = traced.reduce((sum, cell) => sum + cell.trials, 0);
    const jaws = traced.reduce((sum, cell) => sum + /** @type {number} */ (cell.jawTrials), 0);
    return {
        jawShareLow: trials === 0 ? null : wilsonInterval(jaws, trials).low,
        closestMedian: closest.length === 0 ? null : quantile(closest, 0.5),
    };
}

/**
 * @param {readonly ReadingCell[]} cells the cells of the champions a drill applied to
 * @param {ReadingCell | null} reference the reference's cell
 * @returns {DrillReading} the drill's readings, null where no champion was drilled
 */
function drillReading(cells, reference) {
    if (cells.length === 0) {
        return {
            winShareLow: null,
            edgeLow: null,
            winShareOverReference: null,
            lossShare: {},
            jawShareLow: null,
            closestMedian: null,
        };
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
    return {
        winShareLow,
        edgeLow: winShareLow - random.high,
        winShareOverReference: over,
        lossShare,
        ...traceReadings(cells),
        ...armReadings(cells),
    };
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
