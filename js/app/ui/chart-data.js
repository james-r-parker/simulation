// What the charts plot: which series the history holds, how a stats message becomes one row of them, and the two
// transforms the stacked charts need (`riverSeries` for the family river, `stackLayers` for stacked bars). Pure.

/** The lineages a stats message lists, and so the river's rank slots. */
export const RIVER_SLOTS = 8;
/** The bands drawn in the family river besides "others". */
export const RIVER_BANDS = 8;

/**
 * @param {string} name a constant such as `OLD_AGE`
 * @returns {string} `old age`
 */
function words(name) {
    return name.toLowerCase().replace(/_/g, ' ');
}

/**
 * @param {Record<string, number>} causes cause names by index, as `ready.layout` gives them
 * @returns {{name: string, index: number}[]} the causes in index order with readable names; index 0 (`INITIAL`, the
 *   starting population) is left out of births
 */
function causeList(causes) {
    return Object.entries(causes)
        .map(([name, index]) => ({ name: words(name), index }))
        .sort((a, b) => a.index - b.index);
}

/**
 * @typedef {object} Sampler
 * @property {string[]} names the history's series names
 * @property {('level' | 'flow')[]} kinds how each series combines values
 * @property {{births: string[], deaths: string[], specs: string[]}} groups the names in each chart group
 * @property {(stats: Record<string, any>, out: Float64Array) => void} fill writes one stats message's row into `out`
 * @property {() => void} reset forgets the running totals, for a new world
 */

/**
 * @typedef {{name: string, kind: 'level' | 'flow', read: (stats: Record<string, any>) => number}} SeriesDef
 */

/**
 * @param {string} name the series name
 * @param {(stats: Record<string, any>) => number} read reads its value from a stats message
 * @returns {SeriesDef} a level series
 */
const level = (name, read) => ({ name, kind: 'level', read });

/**
 * @param {string} name the series name
 * @param {(stats: Record<string, any>) => number} read reads its value from a stats message
 * @returns {SeriesDef} a flow series
 */
const flow = (name, read) => ({ name, kind: 'flow', read });

/**
 * @param {{specs: {index: number, name: string}[], births: {name: string, index: number}[],
 *   deaths: {name: string, index: number}[]}} world the specialisations and the causes
 * @returns {SeriesDef[]} every series but the caught share, in history order
 */
function seriesFor({ specs, births, deaths }) {
    const slots = Array.from({ length: RIVER_SLOTS }, (_, i) => i);
    return [
        ...specs.map((s) => level(`pop.${s.name}`, (st) => st.bySpec?.[s.index] ?? 0)),
        ...slots.map((i) => level(`river.id${i}`, (st) => st.lineages?.top?.[i]?.id ?? -1)),
        ...slots.map((i) => level(`river.share${i}`, (st) => st.lineages?.top?.[i]?.share ?? 0)),
        ...births.map((c) => flow(`born.${c.name}`, (st) => st.birthsByCause?.[c.index] ?? 0)),
        ...deaths.map((c) => flow(`died.${c.name}`, (st) => st.deathsByCause?.[c.index] ?? 0)),
        flow('caught', (st) => st.combat?.caught ?? 0),
        flow('escaped', (st) => st.combat?.escaped ?? 0),
        level('coverage', (st) => st.archive?.coverage ?? 0),
        ...specs.map((s) => level(`occupied.${s.name}`, (st) => st.archive?.occupiedCount?.[s.index] ?? 0)),
    ];
}

/**
 * @param {{specs: {index: number, name: string}[], bornCauses: Record<string, number>,
 *   deathCauses: Record<string, number>}} world `ready.info.specs` and `ready.layout`'s cause tables
 * @returns {Sampler} the series and the row builder for this world
 */
export function createSampler({ specs, bornCauses, deathCauses }) {
    const births = causeList(bornCauses).filter((c) => c.index > 0);
    const deaths = causeList(deathCauses);
    const series = seriesFor({ specs, births, deaths });
    const caughtAt = series.findIndex((s) => s.name === 'caught');
    const run = { caught: 0, escaped: 0 };
    return {
        names: [...series.map((s) => s.name), 'caughtShare'],
        kinds: [...series.map((s) => s.kind), 'level'],
        groups: {
            births: births.map((c) => `born.${c.name}`),
            deaths: deaths.map((c) => `died.${c.name}`),
            specs: specs.map((s) => s.name),
        },
        fill(stats, out) {
            series.forEach((s, i) => {
                out[i] = s.read(stats);
            });
            run.caught += out[caughtAt];
            run.escaped += out[caughtAt + 1];
            const total = run.caught + run.escaped;
            out[series.length] = total === 0 ? 0 : run.caught / total;
        },
        reset() {
            run.caught = 0;
            run.escaped = 0;
        },
    };
}

/**
 * Stacks series on one another.
 * @param {Float64Array[]} bands the bands from the bottom up; all one length
 * @param {number} [sign] 1 stacks upward, -1 downward (the values are negated)
 * @returns {Float64Array[]} the cumulative tops in drawing order: the highest first, so each later one paints over
 *   the part of the one before it that it does not add to
 */
export function stackLayers(bands, sign = 1) {
    /** @type {Float64Array[]} */
    const tops = [];
    let below = null;
    for (const band of bands) {
        const top = new Float64Array(band.length);
        for (let i = 0; i < band.length; i++) {
            top[i] = (below === null ? 0 : below[i]) + sign * band[i];
        }
        tops.push(top);
        below = top;
    }
    return tops.reverse();
}

/**
 * @param {Record<string, Float64Array>} cols the history columns
 * @param {number} maxBands the lineages to keep
 * @returns {number[]} the ids of the lineages with the largest peak share, ascending
 */
function keptLineages(cols, maxBands) {
    const n = cols.t.length;
    /** @type {Map<number, number>} */
    const peak = new Map();
    for (let slot = 0; slot < RIVER_SLOTS; slot++) {
        const ids = cols[`river.id${slot}`];
        const shares = cols[`river.share${slot}`];
        for (let i = 0; i < n; i++) {
            peak.set(ids[i], Math.max(peak.get(ids[i]) ?? 0, shares[i]));
        }
    }
    peak.delete(-1);
    return [...peak]
        .sort((a, b) => b[1] - a[1] || a[0] - b[0])
        .slice(0, maxBands)
        .map(([id]) => id)
        .sort((a, b) => a - b);
}

/**
 * Aligns the lineages of each sample's top list into stable bands.
 * @param {Record<string, Float64Array>} cols the history columns (`river.id0..` and `river.share0..`)
 * @param {number} [maxBands] the lineages kept, by their largest share
 * @returns {{layers: {id: number | null, top: Float64Array}[]}} the stacked bands in drawing order: the cumulative
 *   share up to the top of each, highest first; `id` is the lineage, `null` for the "others" band, which makes the
 *   stack reach 1
 */
export function riverSeries(cols, maxBands = RIVER_BANDS) {
    const n = cols.t.length;
    const kept = keptLineages(cols, maxBands);
    const bands = kept.map(() => new Float64Array(n));
    const others = new Float64Array(n).fill(1);
    for (let slot = 0; slot < RIVER_SLOTS; slot++) {
        for (let i = 0; i < n; i++) {
            const at = kept.indexOf(cols[`river.id${slot}`][i]);
            if (at >= 0) {
                bands[at][i] = cols[`river.share${slot}`][i];
                others[i] = Math.max(others[i] - bands[at][i], 0);
            }
        }
    }
    const tops = stackLayers([...bands, others]);
    return { layers: tops.map((top, k) => ({ id: k === 0 ? null : kept[kept.length - k], top })) };
}
