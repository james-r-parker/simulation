// Style evidence (training-stages.md, Export by style and Opponents and exported populations): the two style bands of an
// export generate candidates, not proof of two strategies. A band counts only when it holds a champion that passes the
// drill, the two bands behave differently on the same staged trials, and each band's descendants recruit. A short chase
// with no catch is not an ambush, so a band whose champion does not beat the random brains claims nothing. A detector:
// nothing here reaches fitness, merit, mate rank, archive rank or an offer filter. Pure.

import { DRILLS } from './drill-scenarios.js';
import { drillSubject } from './drill.js';

/** The drill whose matched trials separate the bands: the one real chase with a trace. */
export const STYLE_DRILL = 'prey-ahead';
/** The trace field whose paired difference separates the bands: ticks with `BITE` above 0 (the chase's length). */
export const SEPARATION_MEASURE = 'biteTicks';
/** Fewest matched trials a separation is read on. */
export const MIN_PAIRS = 16;
/** The normal quantile of a 95% interval. */
const Z = 1.96;

/**
 * @typedef {object} BandTrials
 * @property {number} wins trials won
 * @property {number} trials trials played
 * @property {Record<string, any>[]} records one `DrillTrial` field set per trial, in trial order
 */

/**
 * Plays `STYLE_DRILL` for each band's champion on the same seed, so trial `i` stages the same bearings for both: the
 * drill draws its stream from the seed and the drill's name only.
 * @param {{low: import('./memory-probe-run.js').Subject | null, high: import('./memory-probe-run.js').Subject | null}} bands
 *   the champion of each band; null for a band with none
 * @param {{seed: number, trials: number, config?: Record<string, any>}} options the base seed, the trial count and the
 *   config overrides
 * @returns {{low: BandTrials | null, high: BandTrials | null}} each band's trials; null for an empty band
 */
export function matchedTrials(bands, { seed, trials, config = {} }) {
    const drill = /** @type {import('./drill-staging.js').Drill} */ (DRILLS.find((d) => d.name === STYLE_DRILL));
    const play = (/** @type {import('./memory-probe-run.js').Subject | null} */ subject) => {
        if (subject === null) {
            return null;
        }
        /** @type {Record<string, any>[]} */
        const records = [];
        const log = {
            log: (/** @type {string} */ _l, /** @type {string} */ _e, /** @type {any} */ f) => records.push(f),
        };
        const score = drillSubject(drill, subject, { seed, trials, config, log: /** @type {any} */ (log) });
        return { wins: score.wins, trials: score.trials, records };
    };
    return { low: play(bands.low), high: play(bands.high) };
}

/**
 * @typedef {object} Separation
 * @property {number} pairs matched trials with the measure on both sides
 * @property {number | null} meanDifference the mean of (high band minus low band) over the pairs; null without pairs
 * @property {number | null} low95 the lower end of the 95% interval of that mean (normal approximation); null under 2 pairs
 * @property {number | null} high95 the upper end; null under 2 pairs
 * @property {boolean} separated whether there are `MIN_PAIRS` pairs and the interval excludes 0
 */

/**
 * @param {BandTrials | null} low the low band's trials
 * @param {BandTrials | null} high the high band's trials
 * @param {string} measure the trace field
 * @returns {number[]} high minus low on each matched trial that has the measure on both sides
 */
function differencesOf(low, high, measure) {
    const differences = [];
    const n = Math.min(low?.records.length ?? 0, high?.records.length ?? 0);
    for (let i = 0; i < n; i++) {
        const a = /** @type {BandTrials} */ (low).records[i][measure];
        const b = /** @type {BandTrials} */ (high).records[i][measure];
        if (typeof a === 'number' && typeof b === 'number') {
            differences.push(b - a);
        }
    }
    return differences;
}

/**
 * The paired difference of a trace measure between the two bands on matched trials.
 * @param {BandTrials | null} low the low band's trials
 * @param {BandTrials | null} high the high band's trials
 * @param {string} [measure] the trace field (default `SEPARATION_MEASURE`)
 * @returns {Separation} the pairs, the mean difference, its interval and whether it excludes 0
 */
export function pairedSeparation(low, high, measure = SEPARATION_MEASURE) {
    const differences = differencesOf(low, high, measure);
    const pairs = differences.length;
    const mean = pairs === 0 ? null : differences.reduce((sum, d) => sum + d, 0) / pairs;
    if (mean === null || pairs < 2) {
        return { pairs, meanDifference: mean, low95: null, high95: null, separated: false };
    }
    const variance = differences.reduce((sum, d) => sum + (d - mean) * (d - mean), 0) / (pairs - 1);
    const half = (Z * Math.sqrt(variance)) / Math.sqrt(pairs);
    const [low95, high95] = [mean - half, mean + half];
    return { pairs, meanDifference: mean, low95, high95, separated: pairs >= MIN_PAIRS && (low95 > 0 || high95 < 0) };
}

/**
 * @typedef {object} BandReading what a band's champion read on the drill table
 * @property {number | null} edgeLow `edgeLow` of the drills a gate of a passed stage names, the least of them (null: none read)
 * @property {number | null} winShareLow the Wilson low bound of the band's win share on the style drill
 */

/**
 * @typedef {object} StyleVerdict
 * @property {boolean} viable whether both bands are filled, pass the drill, separate and recruit
 * @property {{low: string, high: string}} bands each band's status: `ok`, `empty` (no champion) or `failed` (no edge)
 * @property {string[]} reasons why not viable, one line each; empty when viable
 */

/**
 * @param {BandReading | null | undefined} band a band's reading; null when the band has no champion
 * @returns {'ok' | 'empty' | 'failed'} the band's status: a band that does not beat the random brains (an `edgeLow` that is
 *   not above 0, or none read) has no strategy to claim
 */
function statusOf(band) {
    if (band === null || band === undefined) {
        return 'empty';
    }
    return band.edgeLow !== null && band.edgeLow > 0 && (band.winShareLow ?? 0) > 0 ? 'ok' : 'failed';
}

/**
 * Whether the two style bands may claim viable diversity. Every part is required: an empty band, a band that fails its
 * drill, a pair that does not separate on matched trials, and descendants that do not recruit in either band (the
 * recruitment readings come from the lineage diagnostics of honest-budgets Phase 6; an absent reading is `null` and fails).
 * @param {{bands: {low: BandReading | null, high: BandReading | null}, separation: Separation | null,
 *   recruitment: {low: boolean | null, high: boolean | null}}} evidence what was read
 * @returns {StyleVerdict} the verdict and the reasons it is not viable
 */
export function styleVerdict({ bands, separation, recruitment }) {
    const status = { low: statusOf(bands.low), high: statusOf(bands.high) };
    const reasons = [];
    for (const name of /** @type {const} */ (['low', 'high'])) {
        if (status[name] !== 'ok') {
            reasons.push(
                `${name} band ${status[name] === 'empty' ? 'is empty' : 'has no edge over the random brains'}`,
            );
        }
        if (recruitment[name] !== true) {
            reasons.push(`${name} band: descendant recruitment ${recruitment[name] === false ? 'failed' : 'not read'}`);
        }
    }
    if (separation === null || !separation.separated) {
        reasons.push('the bands do not separate on matched trials');
    }
    return { viable: reasons.length === 0, bands: status, reasons };
}
