// The watch metrics (fitness-and-selection.md, New metrics): do agents move between food patches, do predators stay
// alive, and does catching skill lead evasion skill. All three read pools in `observer.watch`, outside
// `observer.series` and the death log, which the worker drains, so draining changes nothing here.
//
// The patch-visit state is in `watch-visits.js`; this module adds the checkpoint presence sample and the metrics.

import { catchShare } from './metrics-combat.js';
import { evasionShare } from './metrics-intent.js';
import { none, ok } from './metrics-stats.js';
import { createVisitPools } from './watch-visits.js';
import { WINDOW_COUNT, windowDelta, windowsComplete } from './observer-windows.js';

/** Fewest usable window pairs for the lag correlation. */
export const MIN_LAG_PAIRS = 5;

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} empty watch pools: the visit pools and the checkpoints after burn-in, with and
 *   without a hunter alive
 */
export function createWatchPools(config) {
    return { ...createVisitPools(config), checkpoints: 0, withHunter: 0, hunterBirths: 0 };
}

/** The `WINDOW_FIELDS` columns: hunter kills, hunter agent-ticks, escaped responded, escaped episodes. */
const KILLS = 3;
const HUNTER_TICKS = 6;
const RESPONDED = 4;
const ESCAPED = 5;

/**
 * Adds one checkpoint at or after burn-in: whether any alive agent's specialisation has `canHunt`.
 * @param {Record<string, any>} pools the watch pools
 * @param {Record<string, any>} world the world
 * @param {Uint8Array} hunterSpec 1 at each specialisation index with `canHunt`
 * @returns {void}
 */
export function samplePresence(pools, world, hunterSpec) {
    pools.checkpoints += 1;
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1 && hunterSpec[world.spec[slot]] === 1) {
            pools.withHunter += 1;
            return;
        }
    }
}

/**
 * @param {ArrayLike<number>} a the first series
 * @param {ArrayLike<number>} b the second series, as long as the first
 * @param {number} n the pairs to use
 * @returns {number | null} the Pearson correlation of the first `n` pairs, `null` when either has no spread
 */
export function pearson(a, b, n) {
    let ma = 0;
    let mb = 0;
    for (let i = 0; i < n; i++) {
        ma += a[i];
        mb += b[i];
    }
    ma /= n;
    mb /= n;
    let sab = 0;
    let saa = 0;
    let sbb = 0;
    for (let i = 0; i < n; i++) {
        sab += (a[i] - ma) * (b[i] - mb);
        saa += (a[i] - ma) * (a[i] - ma);
        sbb += (b[i] - mb) * (b[i] - mb);
    }
    return saa === 0 || sbb === 0 ? null : sab / Math.sqrt(saa * sbb);
}

/**
 * @param {Record<string, any>} windows the window state
 * @returns {import('./metrics-stats.js').MetricResult} the correlation between window k's catch rate and window
 *   k + 1's evasion skill over the pairs where both exist
 */
function lagCorr(windows) {
    if (!windowsComplete(windows)) {
        return none(windows.boundaries.length === 0 ? 'run length unknown or within burn-in' : 'run ended early');
    }
    const catches = [];
    const evasions = [];
    for (let k = 0; k + 1 < WINDOW_COUNT; k++) {
        const c = catchShare(windowDelta(windows, k, KILLS), windowDelta(windows, k, HUNTER_TICKS)).value;
        const e = evasionShare(windowDelta(windows, k + 1, RESPONDED), windowDelta(windows, k + 1, ESCAPED)).value;
        if (c !== null && e !== null) {
            catches.push(c);
            evasions.push(e);
        }
    }
    if (catches.length < MIN_LAG_PAIRS) {
        return none(`fewer than ${MIN_LAG_PAIRS} usable pairs of a catch rate and the next evasion skill`);
    }
    const r = pearson(catches, evasions, catches.length);
    return r === null ? none('catch rate or evasion skill does not vary across the windows') : ok(r);
}

/**
 * @param {Record<string, any>} observer the observer, fed every tick and checkpointed
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the four watch metrics, keyed by name
 */
export function watchMetrics(observer) {
    const p = observer.watch;
    let migration = none('no mature death after burn-in');
    if (p.patchCount === 0) {
        migration = none('foodPatchCount is 0');
    } else if (p.deaths > 0) {
        migration = ok(p.visitSum / p.deaths / p.patchCount);
    }
    return {
        'eval.migration_index': migration,
        'eval.predator_presence':
            p.checkpoints === 0 ? none('no checkpoint after burn-in') : ok(p.withHunter / p.checkpoints),
        'eval.predator_births': ok(p.hunterBirths),
        'eval.pred_prey_lag_corr': lagCorr(observer.windows),
    };
}
