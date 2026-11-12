// One arm's row for the no-verdict rankers (scripts/capacity-rank.mjs, scripts/heat-rank.mjs): its seed count, the
// seeds it holds and keeps hunters alive on, its per-seed held flags and the means of the metrics a ranker shows.
import { aliveFlags, heldFlags } from '../../js/evo/keep-rule.js';

/**
 * @param {readonly number[] | null} flags per-seed 0/1 flags
 * @returns {number} how many seeds are 1 (-1 when the report cannot say)
 */
const count = (flags) => (flags === null ? -1 : flags.reduce((a, b) => a + b, 0));

/**
 * @param {string} name the arm
 * @param {Record<string, any>} report its eval report
 * @param {readonly string[]} metrics the metrics whose means the row carries
 * @returns {{ name: string, seeds: number, held: number, alive: number, flags: number[] | null,
 *   means: Record<string, number | null> }} its row
 */
export function armRow(name, report, metrics) {
    /** @type {Record<string, number | null>} */
    const means = {};
    for (const metric of metrics) {
        means[metric] = report.metrics[metric]?.mean ?? null;
    }
    const flags = heldFlags(report);
    return { name, seeds: report.seeds.length, held: count(flags), alive: count(aliveFlags(report)), flags, means };
}
