// The lineage metrics (fitness-and-selection.md, New metrics): do children reach maturity, and how long do families
// last? Both read the run length (`createObserver`'s `runTicks`), so both are `null` without it. `noteLineages` runs
// on every tick's events; it allocates only when a lineage is first seen (a Map entry and, when the log is full, a
// doubling). The sums live in `observer.lineage`, outside `observer.series` and the death log, which the worker
// drains, so draining changes nothing here.
//
// A "child" is a birth with cause `mate` or `split`; initial, floor and immigrant entrants are founders, not children.

import { BORN_CAUSE, EVENT_STRIDE, EVENT_TYPE } from '../sim/events.js';
import { createLog, ensureRoom } from './growable-log.js';
import { none, ok, quantile } from './metrics-stats.js';

const NO_RUN = 'no run length (createObserver runTicks)';
const NOT_FINISHED = 'the run has not reached its length';
const NO_CHILDREN = 'no child born after burn-in with time to mature';
const NO_LINEAGES = 'no lineage founded after burn-in';

/**
 * @param {{burnIn: number, runTicks: number, maturityTicks: number}} options the end of burn-in, the run length in
 *   ticks (0 when unknown) and `config.maturityTicks`
 * @returns {Record<string, any>} empty lineage pools: the last birth tick that leaves a child time to mature, the
 *   children counted and how many of them died before maturity, and a lineage table (`rows` maps a lineage id to its
 *   row in `log`: first birth tick, last death tick, agents alive)
 */
export function createLineagePools({ burnIn, runTicks, maturityTicks }) {
    return {
        burnIn,
        runTicks,
        maturityTicks,
        lastEligibleBirth: runTicks - maturityTicks,
        children: 0,
        failed: 0,
        rows: new Map(),
        log: createLog(['first', 'last', 'alive']),
    };
}

/**
 * @param {Record<string, any>} pools the lineage pools
 * @param {Float64Array} d the event data
 * @param {number} o the record offset of an `AgentBorn`
 * @returns {boolean} whether the birth is a child (mate or split) at or after burn-in and at least `maturityTicks`
 *   before the run end, so the run end decides whether it matured
 */
export function isEligibleChild(pools, d, o) {
    const cause = d[o + 8];
    const tick = d[o + 1];
    const child = cause === BORN_CAUSE.MATE || cause === BORN_CAUSE.SPLIT;
    return child && tick >= pools.burnIn && tick <= pools.lastEligibleBirth;
}

/**
 * Counts an eligible child, and counts it failed at once when it died the tick it was born (age 0, never tracked).
 * @param {Record<string, any>} pools the lineage pools
 * @param {boolean} diedAtBirth whether the child's death was in the same tick
 * @returns {void}
 */
export function noteChild(pools, diedAtBirth) {
    pools.children += 1;
    pools.failed += diedAtBirth && pools.maturityTicks > 0 ? 1 : 0;
}

/**
 * Counts a tracked eligible child's death as failed when it died before `maturityTicks`.
 * @param {Record<string, any>} pools the lineage pools
 * @param {number} ageTicks the age at death
 * @returns {void}
 */
export function noteChildDeath(pools, ageTicks) {
    pools.failed += ageTicks < pools.maturityTicks ? 1 : 0;
}

/**
 * Records a tick's births then deaths into the lineage table. Births go first so an agent born and dead in one tick
 * still opens its lineage. A death in a lineage not in the table (an observer fed from mid-run) is ignored.
 * @param {Record<string, any>} pools the lineage pools
 * @param {Float64Array} d the event data
 * @param {number} count the number of records
 * @returns {void}
 */
export function noteLineages(pools, d, count) {
    const { rows, log } = pools;
    for (let i = 0; i < count; i++) {
        const o = i * EVENT_STRIDE;
        if (d[o] !== EVENT_TYPE.AGENT_BORN) {
            continue;
        }
        let row = rows.get(d[o + 4]);
        if (row === undefined) {
            row = rows.size;
            ensureRoom(log, row);
            rows.set(d[o + 4], row);
            log.first[row] = d[o + 1];
            log.last[row] = d[o + 1];
        }
        log.alive[row] += 1;
    }
    for (let i = 0; i < count; i++) {
        const o = i * EVENT_STRIDE;
        const row = d[o] === EVENT_TYPE.AGENT_DIED ? rows.get(d[o + 7]) : undefined;
        if (row !== undefined) {
            log.alive[row] -= 1;
            log.last[row] = d[o + 1];
        }
    }
}

/**
 * @param {Record<string, any>} observer the observer
 * @returns {string | null} why the run end is unknown, or `null` when the run reached its length
 */
function runProblem(observer) {
    const { runTicks, burnIn } = observer.lineage;
    if (!(runTicks > burnIn)) {
        return NO_RUN;
    }
    return observer.ticks >= runTicks ? null : NOT_FINISHED;
}

/**
 * @param {Record<string, any>} observer the observer
 * @returns {import('./metrics-stats.js').MetricResult} the share of eligible children that reached maturity
 */
function childSurvival(observer) {
    const problem = runProblem(observer);
    if (problem !== null) {
        return none(problem);
    }
    const { children, failed } = observer.lineage;
    return children === 0 ? none(NO_CHILDREN) : ok((children - failed) / children);
}

/**
 * @param {Record<string, any>} observer the observer
 * @returns {import('./metrics-stats.js').MetricResult} the median lifespan in ticks of the lineages founded at or after
 *   burn-in; a lineage with an agent alive at the run end counts to `runTicks`
 */
function lineageLifespan(observer) {
    const problem = runProblem(observer);
    if (problem !== null) {
        return none(problem);
    }
    const { rows, log, burnIn, runTicks } = observer.lineage;
    /** @type {number[]} */
    const spans = [];
    for (const row of rows.values()) {
        if (log.first[row] >= burnIn) {
            spans.push((log.alive[row] > 0 ? runTicks : log.last[row]) - log.first[row]);
        }
    }
    return spans.length === 0 ? none(NO_LINEAGES) : ok(quantile(spans, 0.5));
}

/**
 * @param {Record<string, any>} observer the observer
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the two lineage metrics, keyed by name
 */
export function lineageMetrics(observer) {
    return {
        'eval.child_survival': childSurvival(observer),
        'eval.lineage_lifespan_p50': lineageLifespan(observer),
    };
}
