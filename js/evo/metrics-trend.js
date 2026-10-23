// The trend metrics (fitness-and-selection.md, New metrics): each deliberate-behaviour share over the last 2 of 8
// equal windows after burn-in minus the same over the first 2. The share formulas are those of `metrics-intent.js`,
// applied to window differences.

import { evasionShare, foodShare, killShare } from './metrics-intent.js';
import { mean, none, ok } from './metrics-stats.js';
import { WINDOW_COUNT, windowDelta, windowsComplete } from './observer-windows.js';

/** Windows averaged at each end. */
const END_WINDOWS = 2;

/**
 * @typedef {object} Trend a trend: its metric name, its share over two window deltas, the `WINDOW_FIELDS` columns
 *   those are, and the `null` reason when a compared window lacks the denominator
 * @property {string} name the metric
 * @property {(a: number, b: number) => import('./metrics-stats.js').MetricResult} share the whole-run share formula
 * @property {[number, number]} columns the two `WINDOW_FIELDS` columns
 * @property {string} empty the reason
 */

/** @type {readonly Trend[]} */
const TRENDS = [
    {
        name: 'eval.deliberate_food_trend',
        share: foodShare,
        columns: [0, 1],
        empty: 'a compared span has no food',
    },
    {
        name: 'eval.pursuit_trend',
        share: killShare,
        columns: [2, 3],
        empty: 'fewer than 4 compared windows have a hunter kill',
    },
    {
        name: 'eval.evasion_trend',
        share: evasionShare,
        columns: [4, 5],
        empty: 'fewer than 4 compared windows have an escaped bite episode',
    },
];

/**
 * @param {Record<string, any>} windows the window state
 * @param {Trend} trend the trend
 * @param {number} k the window
 * @returns {number | null} the window's share, `null` without its denominator
 */
function windowShare(windows, trend, k) {
    const [a, b] = trend.columns;
    return trend.share(windowDelta(windows, k, a), windowDelta(windows, k, b)).value;
}

/**
 * @param {Record<string, any>} windows the window state
 * @param {Trend} trend the trend
 * @returns {import('./metrics-stats.js').MetricResult} the last 2 windows' mean share minus the first 2's; `null`
 *   when any of those 4 windows has no denominator
 */
function trendOf(windows, trend) {
    const early = [];
    const late = [];
    for (let i = 0; i < END_WINDOWS; i++) {
        early.push(windowShare(windows, trend, i));
        late.push(windowShare(windows, trend, WINDOW_COUNT - END_WINDOWS + i));
    }
    if (early.includes(null) || late.includes(null)) {
        return none(trend.empty);
    }
    return ok(mean(/** @type {number[]} */ (late)) - mean(/** @type {number[]} */ (early)));
}

/**
 * @param {Record<string, any>} observer the observer, fed every tick
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the four trend metrics, keyed by name
 */
export function trendMetrics(observer) {
    const { windows } = observer;
    /** @type {Record<string, import('./metrics-stats.js').MetricResult>} */
    const out = {};
    if (!windowsComplete(windows)) {
        const reason =
            windows.boundaries.length === 0
                ? 'run length unknown or within burn-in'
                : 'run ended before the final boundary';
        for (const { name } of TRENDS) {
            out[name] = none(reason);
        }
        out['eval.skill_trend'] = none(reason);
        return out;
    }
    const values = [];
    for (const trend of TRENDS) {
        out[trend.name] = trendOf(windows, trend);
        if (out[trend.name].value !== null) {
            values.push(/** @type {number} */ (out[trend.name].value));
        }
    }
    out['eval.skill_trend'] = values.length > 0 ? ok(mean(values)) : none('every trend is null');
    return out;
}
