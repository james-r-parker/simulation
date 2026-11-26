// The headline metrics of the registry (docs/designs/metric-noise.md, Phase 5): the one metric a decision reads for
// each scene of docs/principles.md, and the four world metrics beside them. The scene pick is a pure function of the
// registry; `withHeadlines` applies it, and a test recomputes it so a committed flag cannot drift from the rule.

import { MAX_ABSOLUTE_MDE, isFlat, mdeAgainstBar, metricStatus } from './status.js';

/** A scene detector null on this share of seeds or more is not live (the scorecard's `NULL_LIMIT`). */
export const HEADLINE_MAX_NULL_SHARE = 0.5;
/** The largest detectable change, as a multiple of the metric's own value: a detector that cannot see its own mean halve is no headline. */
export const HEADLINE_MAX_RELATIVE_MDE = 1;

/**
 * The world headlines (kind `world`): the three the plan names, then the keep rule's guard metric. `GUARD_METRICS` of
 * `js/evo/keep-rule.js` cannot be imported here (it reads the registry); a test holds the two lists together.
 */
export const WORLD_HEADLINES = Object.freeze([
    'eval.food_energy_per_1k',
    'eval.births_per_1k',
    'eval.fed_median_lifespan',
    'eval.hunter_catches_per_1k_settled',
]);

/**
 * @typedef {object} Candidate a metric that may be a scene's headline
 * @property {string} name the metric
 * @property {number} barUse the detectable change at 64 seeds over the bar for its unit (`mdeAgainstBar`), so a
 *   relative and an absolute change compare the way `meetsPowerBar` reads them; for a `signed` metric read against the
 *   absolute bar, over the narrower of the bar and its seed spread (`scaleOf`); smaller is better
 * @property {number} relative the detectable change as a fraction of the reference mean (the tie-break; a `share`'s change is absolute, so it is divided by the mean)
 */

/**
 * @param {import('./entry.js').MetricEntry} entry a registry entry
 * @param {string} scene a scene name
 * @returns {boolean} whether it is tagged with the scene, `verified`, not flat and null on under half the seeds
 */
function isLiveDetector(entry, scene) {
    const live = entry.liveness !== null && entry.liveness.nullShare < HEADLINE_MAX_NULL_SHARE;
    return entry.scenes?.includes(scene) === true && metricStatus(entry) === 'verified' && !isFlat(entry) && live;
}

/**
 * @param {import('./entry.js').MetricEntry} entry a registry entry
 * @param {number} bar the bar `mdeAgainstBar` read for it
 * @returns {number} what the detectable change is divided by: the bar, or for a `signed` metric on the absolute bar
 *   its seed spread when that is narrower (metric-noise T31)
 */
function scaleOf(entry, bar) {
    const spread = entry.liveness?.spread;
    const spreadApplies = entry.signed === true && bar === MAX_ABSOLUTE_MDE && spread !== undefined && spread > 0;
    return spreadApplies ? Math.min(bar, spread) : bar;
}

/**
 * @param {string} name the metric
 * @param {import('./entry.js').MetricEntry} entry its registry entry
 * @param {string} scene a scene name
 * @returns {Candidate | null} the candidate, or `null` when the entry does not qualify (`isLiveDetector`, a measured
 *   `mde64`, a detectable change no larger than the metric's own value)
 */
function candidateOf(name, entry, scene) {
    const mde = entry.power?.mde64 ?? null;
    const mean = entry.power?.referenceMean ?? 0;
    if (!isLiveDetector(entry, scene) || mde === null || mean === 0) {
        return null;
    }
    const { change, bar } = mdeAgainstBar(entry.unit, mde, mean, entry.signed);
    const relative = entry.unit === 'share' ? mde / Math.abs(mean) : mde;
    return relative <= HEADLINE_MAX_RELATIVE_MDE ? { name, barUse: change / scaleOf(entry, bar), relative } : null;
}

/**
 * The rule, ordered by `barUse`, then `relative`, then name. `barUse` is the share of the unit's bar the detectable
 * change uses, so a relative and an absolute change compare. For a `signed` metric that reads against the absolute 0.10
 * (its mean sits near 0) the share of that bar alone is no fair score: a difference whose whole spread over the
 * baseline seeds is 0.002 uses 1% of 0.10 with a change of 0.001, yet 0.001 is half of everything the metric does.
 * Such a metric is scored by its detectable change over its seed spread (`Liveness.spread`, a standard deviation) when
 * that is narrower than the bar, so it cannot win on the width of the bar alone and a change a quarter of its spread
 * is told from one the size of its spread. A metric on a relative or `share` bar, or with no spread read, keeps the
 * share of its bar.
 *
 * @param {Readonly<Record<string, import('./entry.js').MetricEntry>>} entries the registry
 * @param {string} scene a scene name
 * @returns {Candidate[]} the qualifying detectors of the scene, best first
 */
export function headlineCandidates(entries, scene) {
    const found = Object.entries(entries).map(([name, entry]) => candidateOf(name, entry, scene));
    return /** @type {Candidate[]} */ (found.filter((c) => c !== null)).sort(
        (a, b) => a.barUse - b.barUse || a.relative - b.relative || (a.name < b.name ? -1 : 1),
    );
}

/**
 * @param {Readonly<Record<string, import('./entry.js').MetricEntry>>} entries the registry
 * @param {readonly string[]} scenes the scenes to pick for
 * @returns {Record<string, string>} each scene that has a candidate to its best candidate
 */
export function pickHeadlines(entries, scenes) {
    /** @type {Record<string, string>} */
    const picked = {};
    for (const scene of scenes) {
        const [best] = headlineCandidates(entries, scene);
        if (best !== undefined) {
            picked[scene] = best.name;
        }
    }
    return picked;
}

/**
 * @param {Readonly<Record<string, import('./entry.js').MetricEntry>>} entries the registry
 * @param {readonly string[]} scenes the scenes
 * @returns {string[]} the scenes with no qualifying detector, in the given order
 */
export function scenesWithoutHeadline(entries, scenes) {
    const picked = pickHeadlines(entries, scenes);
    return scenes.filter((scene) => !Object.hasOwn(picked, scene));
}

/**
 * @template {Record<string, import('./entry.js').MetricEntry>} T
 * @param {T} entries the registry before the flags
 * @param {readonly string[]} scenes the scenes to pick for
 * @returns {T} the registry with `headline` set to `scene` (and `headlineScenes`, the scenes it is picked for) on each
 *   scene's pick and `world` on each world headline
 * @throws {Error} `world headline names an unknown metric <name>` for a name that has no entry
 */
export function withHeadlines(entries, scenes) {
    /** @type {Record<string, import('./entry.js').MetricEntry>} */
    const merged = { ...entries };
    /** @type {Map<string, string[]>} */
    const served = new Map();
    for (const [scene, name] of Object.entries(pickHeadlines(entries, scenes))) {
        served.set(name, [...(served.get(name) ?? []), scene]);
    }
    for (const [name, mine] of served) {
        merged[name] = Object.freeze({ ...merged[name], headline: 'scene', headlineScenes: Object.freeze(mine) });
    }
    for (const name of WORLD_HEADLINES) {
        if (!Object.hasOwn(merged, name)) {
            throw new Error(`world headline names an unknown metric ${name}`);
        }
        merged[name] = Object.freeze({ ...merged[name], headline: 'world' });
    }
    return /** @type {T} */ (/** @type {unknown} */ (Object.freeze(merged)));
}
