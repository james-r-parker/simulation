// The headline metrics of the registry (docs/designs/metric-noise.md, Phase 5): the one metric a decision reads for
// each scene of docs/principles.md, and the four world metrics beside them. The scene pick is a pure function of the
// registry; `withHeadlines` applies it, and a test recomputes it so a committed flag cannot drift from the rule.

import { isFlat, mdeAgainstBar, metricStatus } from './status.js';

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
 *   relative and an absolute change compare the way `meetsPowerBar` reads them; smaller is better
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
    const { change, bar } = mdeAgainstBar(entry.unit, mde, mean);
    const relative = entry.unit === 'share' ? mde / Math.abs(mean) : mde;
    return relative <= HEADLINE_MAX_RELATIVE_MDE ? { name, barUse: change / bar, relative } : null;
}

/**
 * The rule, ordered by `barUse`, then `relative`, then name.
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
 * @returns {T} the registry with `headline` set to `scene` on each scene's pick and `world` on each world headline
 * @throws {Error} `world headline names an unknown metric <name>` for a name that has no entry
 */
export function withHeadlines(entries, scenes) {
    /** @type {Record<string, import('./entry.js').MetricEntry>} */
    const merged = { ...entries };
    for (const name of Object.values(pickHeadlines(entries, scenes))) {
        merged[name] = Object.freeze({ ...merged[name], headline: 'scene' });
    }
    for (const name of WORLD_HEADLINES) {
        if (!Object.hasOwn(merged, name)) {
            throw new Error(`world headline names an unknown metric ${name}`);
        }
        merged[name] = Object.freeze({ ...merged[name], headline: 'world' });
    }
    return /** @type {T} */ (/** @type {unknown} */ (Object.freeze(merged)));
}
