// Why a chase lapsed (training-stages.md, Detectors). A lapse is the `GAVE_UP` end class of the shared chase record
// (`chase-outcome.js`); this module splits it with two flags on that record, not a tally of its own:
//
// - lost (`LAPSE_LOST`): the prey is off the hunter's rays when the lapse is called;
// - outrun (`LAPSE_OUTRUN`): the prey is on the rays and its proximity has fallen since the hunter last closed;
// - quit: the prey is on the rays and the range did not grow, so the hunter stopped closing (neither flag).
//
// It also keeps a histogram of chase length (the opening to the resolution, any end class) for `eval.chase_ticks_p50`
// and `_p90`. Per slot state only; nothing is allocated per tick.

import { CHASE_FLAG, CHASE_OUTCOME, chasesEnded, chasesFlagged } from './chase-outcome.js';
import { none, ok } from './metrics-stats.js';

/** The fall in the prey's ray proximity, since the hunter last closed, that counts as the range growing. */
export const RANGE_GROWS = 0.02;

/** Chase lengths from this many ticks on share the last histogram bin. */
export const CHASE_TICKS_CAP = 2048;

const NO_CHASES = 'no chase resolved after burn-in';
const NO_LENGTHS = 'no chase length recorded after burn-in';

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {{closeProx: Float64Array, lengths: Uint32Array, counted: number}} an empty lapse scene: the prey's proximity
 *   at each hunter's last closing tick and the histogram of chase lengths
 */
export function createLapseScene(config) {
    return {
        closeProx: new Float64Array(config.maxAgents),
        lengths: new Uint32Array(CHASE_TICKS_CAP + 1),
        counted: 0,
    };
}

/**
 * Notes the prey's proximity on a tick the hunter closes.
 * @param {Record<string, any>} scene the lapse scene
 * @param {Record<string, any>} prey the intent state's prey target view
 * @param {number} slot the hunter
 * @returns {void}
 */
export function noteClosingProximity(scene, prey, slot) {
    scene.closeProx[slot] = prey.prox[slot];
}

/**
 * @param {Record<string, any>} scene the lapse scene
 * @param {Record<string, any>} prey the intent state's prey target view
 * @param {{slot: number, tick: number}} lapse the hunter and the tick its approach lapses
 * @returns {number} the `CHASE_FLAG` bits that say why: `LAPSE_LOST`, `LAPSE_OUTRUN` or 0 (quit)
 */
export function lapseFlags(scene, prey, { slot, tick }) {
    if (prey.seen[slot] !== tick) {
        return CHASE_FLAG.LAPSE_LOST;
    }
    return prey.prox[slot] < scene.closeProx[slot] - RANGE_GROWS ? CHASE_FLAG.LAPSE_OUTRUN : 0;
}

/**
 * Adds a counted chase's length (opening to resolution) to the histogram.
 * @param {Record<string, any>} scene the lapse scene
 * @param {number} ticks the chase length in ticks
 * @returns {void}
 */
export function noteChaseLength(scene, ticks) {
    scene.lengths[Math.min(Math.max(ticks, 0), CHASE_TICKS_CAP)] += 1;
    scene.counted += 1;
}

/**
 * @param {Uint32Array} lengths the histogram
 * @param {number} counted the chases in it
 * @param {number} p the quantile, 0..1
 * @returns {number} the smallest length with at least `p` of the chases at or below it (nearest rank)
 */
function lengthQuantile(lengths, counted, p) {
    const rank = Math.max(1, Math.ceil(p * counted));
    let seen = 0;
    for (let ticks = 0; ticks < lengths.length; ticks++) {
        seen += lengths[ticks];
        if (seen >= rank) {
            return ticks;
        }
    }
    return lengths.length - 1;
}

/**
 * @param {Record<string, any>} scene the lapse scene
 * @param {import('./chase-outcome.js').ChaseTally} tally the approach scene's tally of chase records
 * @returns {import('./metrics-stats.js').MetricRecord} the lapse shares, the shaken share and the chase-length quantiles
 */
export function lapseMetrics(scene, tally) {
    const n = tally.total;
    const gaveUp = [CHASE_OUTCOME.GAVE_UP];
    const lost = chasesFlagged(tally, CHASE_FLAG.LAPSE_LOST, gaveUp);
    const outrun = chasesFlagged(tally, CHASE_FLAG.LAPSE_OUTRUN, gaveUp);
    const quit = chasesEnded(tally, CHASE_OUTCOME.GAVE_UP) - lost - outrun;
    const of = (/** @type {number} */ count) => (n > 0 ? ok(count / n) : none(NO_CHASES));
    const length = (/** @type {number} */ p) =>
        scene.counted > 0 ? ok(lengthQuantile(scene.lengths, scene.counted, p)) : none(NO_LENGTHS);
    return {
        'eval.chase_quit_share': of(quit),
        'eval.chase_lost_share': of(lost),
        'eval.chase_outrun_share': of(outrun),
        'eval.chase_shaken_share': of(lost + outrun + chasesEnded(tally, CHASE_OUTCOME.ESCAPED)),
        'eval.chase_ticks_p50': length(0.5),
        'eval.chase_ticks_p90': length(0.9),
    };
}
