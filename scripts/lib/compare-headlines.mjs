// The headline split of `eval:compare` (docs/designs/metric-noise.md, Phase 5, T17): which rows a decision reads.
import { METRICS } from '../../js/evo/metric-registry/index.js';

/**
 * @param {readonly {metric: string}[]} rows the comparison rows
 * @param {readonly string[]} targets the plan's Target metric names
 * @param {readonly string[]} [names] the headline metric names (default: every registry entry with `headline`)
 * @returns {{head: any[], rest: any[]}} the rows of a headline (a checkpoint row `<name>@<tick>` counts; no headline
 *   is parameterised) or a Target, then the others, each in report order
 */
export function splitHeadlines(rows, targets, names = headlineNames()) {
    /** @type {any[]} */
    const head = [];
    /** @type {any[]} */
    const rest = [];
    for (const row of rows) {
        const base = row.metric.replace(/@.*$/, '');
        const headline = names.includes(base);
        (headline || targets.includes(row.metric) ? head : rest).push(row);
    }
    return { head, rest };
}

/** @returns {string[]} the registry's headline metric names */
export function headlineNames() {
    return Object.entries(METRICS)
        .filter(([, entry]) => entry.headline !== undefined)
        .map(([name]) => name);
}
