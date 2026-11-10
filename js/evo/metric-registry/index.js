// The metric registry: one entry per eval metric, merged from the family files (docs/designs/metric-trust.md).

import { CORE } from './core.js';
import { CORE_2 } from './core-2.js';
import { HUNTERS } from './hunters.js';
import { HUNTERS_2 } from './hunters-2.js';
import { HUNTERS_3 } from './hunters-3.js';
import { INTENT } from './intent.js';
import { SCENES_ECOLOGY } from './scenes-ecology.js';
import { SCENES_ECOLOGY_2 } from './scenes-ecology-2.js';
import { SCENES_ECOLOGY_3 } from './scenes-ecology-3.js';
import { SCENES_SOCIAL } from './scenes-social.js';
import { BRAIN } from './brain.js';
import { WORLD } from './world.js';
import { WORLD_2 } from './world-2.js';
import { LIVENESS } from './liveness.js';
import { POWER } from './power.js';
import { minSeedsFromPower } from './status.js';

/**
 * @template {Record<string, import('./entry.js').MetricEntry>} T
 * @param {T} entries one metric family
 * @param {Readonly<Record<string, import('./entry.js').Liveness>>} [readings] generated readings
 * @returns {T} the family with generated liveness reads applied
 */
export function withLiveness(entries, readings = LIVENESS) {
    /** @type {Record<string, import('./entry.js').MetricEntry>} */
    const merged = /** @type {Record<string, import('./entry.js').MetricEntry>} */ (
        /** @type {unknown} */ ({ ...entries })
    );
    for (const [name, entry] of Object.entries(merged)) {
        if (Object.hasOwn(readings, name)) {
            merged[name] = Object.freeze({ ...entry, liveness: readings[name] });
        }
    }
    return /** @type {T} */ (/** @type {unknown} */ (Object.freeze(merged)));
}

/**
 * @template {Record<string, import('./entry.js').MetricEntry>} T
 * @param {T} entries one metric family
 * @param {Readonly<Record<string, import('./entry.js').Power>>} readings generated power reads
 * @returns {T} the family with generated power reads and seed minima applied
 */
export function withPower(entries, readings = POWER) {
    /** @type {Record<string, import('./entry.js').MetricEntry>} */
    const merged = /** @type {Record<string, import('./entry.js').MetricEntry>} */ (
        /** @type {unknown} */ ({ ...entries })
    );
    for (const [name, entry] of Object.entries(merged)) {
        if (Object.hasOwn(readings, name)) {
            const power = readings[name];
            merged[name] = Object.freeze({ ...entry, power, minSeeds: minSeedsFromPower({ unit: entry.unit, power }) });
        }
    }
    return /** @type {T} */ (/** @type {unknown} */ (Object.freeze(merged)));
}

/** Every eval metric by full name; each key is a literal in a family file, so `MetricName` is a union. */
export const METRICS = Object.freeze({
    ...withPower(withLiveness(CORE)),
    ...withPower(withLiveness(CORE_2)),
    ...withPower(withLiveness(HUNTERS)),
    ...withPower(withLiveness(HUNTERS_2)),
    ...withPower(withLiveness(HUNTERS_3)),
    ...withPower(withLiveness(INTENT)),
    ...withPower(withLiveness(SCENES_ECOLOGY)),
    ...withPower(withLiveness(SCENES_ECOLOGY_2)),
    ...withPower(withLiveness(SCENES_ECOLOGY_3)),
    ...withPower(withLiveness(SCENES_SOCIAL)),
    ...withPower(withLiveness(BRAIN)),
    ...withPower(withLiveness(WORLD)),
    ...withPower(withLiveness(WORLD_2)),
});

/** @typedef {keyof typeof METRICS} MetricName a registered metric name */

/**
 * @param {string} base a registered metric name without its suffix
 * @param {string} suffix the suffix of a parameterised metric (a specialisation, a source, an age band)
 * @returns {MetricName} `${base}.${suffix}`
 * @throws {Error} `unknown metric <name>` when the registry has no entry for the joined name
 */
export function metricName(base, suffix) {
    const name = `${base}.${suffix}`;
    if (!Object.hasOwn(METRICS, name)) {
        throw new Error(`unknown metric ${name}`);
    }
    return /** @type {MetricName} */ (name);
}

/** The seed minimum for a metric whose entry has no `minSeeds`. */
export const DEFAULT_MIN_SEEDS = 16;

/**
 * Metrics whose per-seed values were too noisy for 16 seeds before any power was measured: counts of rare episodes,
 * lineage counts and a coefficient of variation. Each needs 32 seeds until its entry carries a measured `minSeeds`.
 */
const LEGACY_MIN_SEEDS = Object.freeze({
    'eval.floor_episodes': 32,
    'eval.lineages_alive': 32,
    'eval.lineage_turnover': 32,
    'eval.predator_share_cv': 32,
});

/**
 * @param {string} metric a metric name
 * @returns {number} the fewest seeds a verdict on it needs: its entry's `minSeeds`, else the legacy 32 of the four noisy
 *   metrics, else `DEFAULT_MIN_SEEDS` (also for a name with no entry)
 */
export function minSeedsFor(metric) {
    if (Object.hasOwn(METRICS, metric)) {
        const measured = METRICS[/** @type {MetricName} */ (metric)].minSeeds;
        if (measured !== null) {
            return measured;
        }
    }
    return Object.hasOwn(LEGACY_MIN_SEEDS, metric)
        ? LEGACY_MIN_SEEDS[/** @type {keyof typeof LEGACY_MIN_SEEDS} */ (metric)]
        : DEFAULT_MIN_SEEDS;
}
