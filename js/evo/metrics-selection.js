// The selection metrics (world-balance.md, Selection metrics): do in-world births or the archive select? They read
// the death log (children, generation depth, fitness at death, archive lineage) and the checkpoint series. All are
// `watch`; each is `null` with a reason when it has nothing to measure.

import { BURN_IN_TICKS } from './observer-events.js';
import { mean, none, ok, quantile, spearman } from './metrics-stats.js';

/** Fewest mature deaths the fitness-to-children correlation is computed from. */
export const MIN_CORRELATION_DEATHS = 30;

/**
 * @param {Record<string, any>} observer the observer
 * @param {boolean} matureOnly whether to keep only deaths at or past `maturityTicks`
 * @returns {number[]} the death-log rows of the completed lives that ended at or after `BURN_IN_TICKS`
 */
function rowsAfterBurnIn(observer, matureOnly) {
    const { deaths, deathCount, config } = observer;
    /** @type {number[]} */
    const rows = [];
    for (let i = 0; i < deathCount; i++) {
        const ended = deaths.birthTick[i] + deaths.ageTicks[i];
        if (ended >= BURN_IN_TICKS && (!matureOnly || deaths.ageTicks[i] >= config.maturityTicks)) {
            rows.push(i);
        }
    }
    return rows;
}

/**
 * @param {Record<string, any>} observer the observer
 * @param {string} name a death-log column
 * @param {number[]} rows death-log rows
 * @returns {number[]} the column's values at the rows
 */
function column(observer, name, rows) {
    return rows.map((i) => observer.deaths[name][i]);
}

/**
 * @param {number[]} children children per completed life
 * @returns {import('./metrics-stats.js').MetricResult} variance over squared mean
 */
function opportunity(children) {
    const m = mean(children);
    if (m === 0) {
        return none('no children');
    }
    const variance = mean(children.map((c) => (c - m) * (c - m)));
    return ok(variance / (m * m));
}

/**
 * @param {Record<string, any>} observer the observer
 * @returns {import('./metrics-stats.js').MetricResult} Spearman correlation of fitness at death and children
 */
function fitnessCorrelation(observer) {
    const rows = rowsAfterBurnIn(observer, true).filter((i) => !Number.isNaN(observer.deaths.fitness[i]));
    if (rows.length < MIN_CORRELATION_DEATHS) {
        return none(`fewer than ${MIN_CORRELATION_DEATHS} mature deaths with a fitness`);
    }
    const r = spearman(column(observer, 'fitness', rows), column(observer, 'children', rows));
    return Number.isNaN(r) ? none('fitness or children is constant') : ok(r);
}

/**
 * @param {Record<string, any>} observer the observer
 * @returns {import('./metrics-stats.js').MetricResult} the share of agent-ticks at checkpoints after burn-in spent by
 *   agents in an archive lineage
 */
function archiveShare(observer) {
    if (observer.archiveDraw === undefined) {
        return none('no archive');
    }
    const { series, checkpointCount } = observer;
    let agents = 0;
    let total = 0;
    for (let i = 0; i < checkpointCount; i++) {
        if (series.tick[i] >= BURN_IN_TICKS) {
            agents += series.archiveAgents[i];
            total += series.population[i];
        }
    }
    return total > 0 ? ok(agents / total) : none('no checkpoint after burn-in');
}

/**
 * @param {Record<string, any>} observer the observer, fed every tick and checkpointed
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} results keyed by metric name
 */
export function selectionMetrics(observer) {
    const rows = rowsAfterBurnIn(observer, false);
    const children = column(observer, 'children', rows);
    const none0 = none('no completed life after burn-in');
    const alarms = observer.intent.run.alarms;
    return {
        'eval.offspring_per_life': rows.length > 0 ? ok(mean(children)) : none0,
        'eval.generation_depth_p90': rows.length > 0 ? ok(quantile(column(observer, 'generation', rows), 0.9)) : none0,
        'eval.opportunity_for_selection': rows.length > 0 ? opportunity(children) : none0,
        'eval.fitness_lrs_corr': fitnessCorrelation(observer),
        'eval.archive_lineage_share': archiveShare(observer),
        'eval.kin_within_call_radius': alarms > 0 ? ok(observer.intent.run.kinNearSum / alarms) : none('no alarm call'),
    };
}
