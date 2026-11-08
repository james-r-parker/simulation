// The shape of one metric registry entry and the helper the family files build entries with.

/**
 * @typedef {object} Liveness a metric's behaviour on the defaults runs (docs/designs/metric-trust.md, task T22)
 * @property {number} nullShare the share of seeds on which the metric is `null`
 * @property {number} distinct the number of distinct values it takes over the seeds
 * @property {string} report the repo path of the report the read came from
 */

/**
 * @typedef {object} Power a metric's measured power from split resampling of a 128-seed run (task T27)
 * @property {number | null} fpr16 false-positive rate at 16 seeds per arm
 * @property {number | null} fpr32 false-positive rate at 32 seeds per arm
 * @property {number | null} mde16 smallest detected change at 16 seeds, as a fraction of `referenceMean` (`null`: none up to 100%)
 * @property {number | null} mde32 smallest detected change at 32 seeds, as a fraction of `referenceMean`
 * @property {number} referenceMean the mean of the metric in the reference run, which turns a fraction into an absolute change
 * @property {string} report the repo path of the report the read came from
 */

/**
 * @typedef {object} MetricEntry one eval metric
 * @property {string} family the family file's name (`core`, `hunters`, ...)
 * @property {string} module the repo path of the module that computes it
 * @property {string} meaning one sentence: what a higher value means in the world
 * @property {string} counts what is counted, from which events or world fields, over which ticks
 * @property {string} unit `share`, `count`, `ticks`, `correlation`, `trend`, ...
 * @property {'higher' | 'lower' | 'watch'} direction what `eval:compare` scores as better
 * @property {'higher' | 'lower'} [intended] for a `watch` metric, the direction `eval:power --include-watch` plants
 * @property {readonly string[]} nullWhen each `none` reason the module can give
 * @property {string | null} expectedFlat why the metric is `null` or constant on the defaults, or `null`
 * @property {readonly string[]} renamedFrom old names; `eval:compare` reads an old report through them
 * @property {string | null} deprecated why the metric is kept unverified until its deletion task, or `null`
 * @property {{arithmetic: string, source: string}} tests repo paths of the tests that pin it; each names the metric
 * @property {Liveness | null} liveness from the T22 runs
 * @property {Power | null} power from the T27 read
 * @property {16 | 32 | 64 | null} minSeeds the fewest seeds a verdict needs; `null` when no seed count meets the power bar
 */

/**
 * Builds a frozen entry with the unmeasured fields at their empty values.
 * @param {string} family the family file's name
 * @param {Pick<MetricEntry, 'module' | 'meaning' | 'counts' | 'unit' | 'direction' | 'nullWhen'> & {intended?: 'higher' | 'lower', arithmetic?: string, source?: string, deprecated?: string}} fields what the author wrote
 * @returns {Readonly<MetricEntry>} the entry
 */
export function entry(family, fields) {
    const familySource = family === 'scenes-ecology' ? 'test/evo/metric-source-ecology.test.js' : '';
    const { arithmetic = '', source = familySource, ...rest } = fields;
    return Object.freeze({
        family,
        expectedFlat: null,
        renamedFrom: [],
        deprecated: null,
        tests: { arithmetic, source },
        liveness: null,
        power: null,
        minSeeds: null,
        ...rest,
    });
}
