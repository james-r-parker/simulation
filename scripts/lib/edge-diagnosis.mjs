// The readings of the low-density-edge diagnosis (docs/designs/low-density-edge.md, Phase 2, T10) from one eval report:
// the edge deficit and the share each rate swap closes, the edge ratio, and the prey traces (time under 100 prey, the
// intervals by band and season, the falls into the edge). Pure functions over the report; `scripts/edge-diagnosis.mjs`
// prints them.
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';

/** A prey count under this is the edge (`EDGE_PREY` in `js/evo/scene-edge.js`). */
export const EDGE = 100;
/** The top of the reference band. */
export const BAND_TOP = 400;
/** The seasons in a year, in the order `seasonAt` numbers them. */
export const SEASON_NAMES = ['spring', 'summer', 'autumn', 'winter'];

/**
 * @param {readonly number[]} values numbers
 * @returns {number} their median (NaN when empty)
 */
export function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length === 0 ? NaN : sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** @param {Record<string, any>} report an eval report @param {string} name a metric @returns {(number | null)[]} its values */
const valuesOf = (report, name) => report.metrics[name].values;

const KINDS = ['mate', 'split', 'starve', 'eaten'];

/**
 * @param {Record<string, any>} report an eval report with the edge detectors
 * @returns {Record<string, (number | null)[]>} the edge and reference rates, per seed
 */
function rateColumns(report) {
    const pick = (/** @type {string} */ name) => valuesOf(report, `eval.edge_${name}`);
    return {
        deaths: pick('deaths_per_prey'),
        mateE: pick('mate_births_per_prey'),
        splitE: pick('split_births_per_prey'),
        starveE: pick('starve_per_prey'),
        eatenE: pick('eaten_per_prey'),
        mateR: pick('ref_mate_births_per_prey'),
        splitR: pick('ref_split_births_per_prey'),
        starveR: pick('ref_starve_per_prey'),
        eatenR: pick('ref_eaten_per_prey'),
    };
}

/**
 * Each swap's share of the edge deficit, per seed with an edge and a reference span. The deficit is the edge's prey death
 * rate minus its mate and split birth rates. A swap replaces one edge rate by the same seed's reference-span rate, and
 * closes the rate's gap: a birth rate rises to the reference, a death rate falls to it.
 * @param {Record<string, any>} report an eval report with the edge detectors
 * @returns {{seeds: number, positive: number, medianDeficit: number, median: Record<string, number>,
 *   pooled: Record<string, number>}} the seeds with every rate, those with a positive deficit, and over those the median
 *   deficit, each swap's median share and its pooled share (summed gaps over summed deficits)
 */
export function swapShares(report) {
    const cols = rateColumns(report);
    const names = Object.keys(cols);
    /** @type {{deficit: number, gaps: Record<string, number>}[]} */
    const rows = [];
    let seeds = 0;
    for (let i = 0; i < report.seeds.length; i++) {
        const v = /** @type {Record<string, number>} */ (Object.fromEntries(names.map((n) => [n, cols[n][i]])));
        if (names.some((n) => v[n] === null)) {
            continue;
        }
        seeds += 1;
        const deficit = v.deaths - v.mateE - v.splitE;
        if (deficit > 0) {
            const gaps = {
                mate: v.mateR - v.mateE,
                split: v.splitR - v.splitE,
                starve: v.starveE - v.starveR,
                eaten: v.eatenE - v.eatenR,
            };
            rows.push({ deficit, gaps });
        }
    }
    const total = rows.reduce((a, r) => a + r.deficit, 0);
    return {
        seeds,
        positive: rows.length,
        medianDeficit: median(rows.map((r) => r.deficit)),
        median: Object.fromEntries(KINDS.map((k) => [k, median(rows.map((r) => r.gaps[k] / r.deficit))])),
        pooled: Object.fromEntries(KINDS.map((k) => [k, rows.reduce((a, r) => a + r.gaps[k], 0) / total])),
    };
}

/**
 * @param {Record<string, any>} report an eval report with the edge detectors
 * @param {number} bar the ratio the prediction compares with
 * @returns {{seeds: number, nulls: number, median: number, mean: number, under: number, over: number}} the seeds with an
 *   edge ratio, the median and mean ratio, and how many seeds read under and at or over the bar
 */
export function ratioReading(report, bar) {
    const all = valuesOf(report, 'eval.edge_birth_death_ratio');
    const present = /** @type {number[]} */ (all.filter((v) => v !== null));
    return {
        seeds: present.length,
        nulls: all.length - present.length,
        median: median(present),
        mean: present.reduce((a, b) => a + b, 0) / present.length,
        under: present.filter((v) => v < bar).length,
        over: present.filter((v) => v >= bar).length,
    };
}

/** @typedef {{tick: number, prey: number, pop: number}} Sample */

/**
 * @param {Record<string, any>} trace one seed's trace
 * @returns {Sample[]} the samples at or after burn-in
 */
function samplesOf(trace) {
    return trace.prey
        .map((/** @type {number} */ prey, /** @type {number} */ j) => ({
            tick: (j + 1) * trace.interval,
            prey,
            pop: trace.pop[j],
        }))
        .filter((/** @type {Sample} */ s) => s.tick >= BURN_IN_TICKS);
}

/**
 * @param {number} tick a tick
 * @param {number} seasonTicks `eraSeasonTicks`, the length of a season
 * @returns {number} the season index at the tick (0 spring, 1 summer, 2 autumn, 3 winter)
 */
export const seasonOf = (tick, seasonTicks) => Math.floor(((tick % (4 * seasonTicks)) / (4 * seasonTicks)) * 4);

/**
 * @param {number} prey a prey count
 * @returns {'edge' | 'band' | 'high'} the band: under 100, 100 to 400, over 400
 */
const bandOf = (prey) => (prey < EDGE ? 'edge' : prey <= BAND_TOP ? 'band' : 'high');

/**
 * Walks back from an entry into the edge to the peak the fall began at.
 * @param {Sample[]} samples a seed's samples
 * @param {number} entry the index of the first sample under 100
 * @returns {{start: number, bandSamples: number}} the index of the peak and the descent's samples that lay in the band
 */
function descent(samples, entry) {
    let start = entry;
    let bandSamples = 0;
    while (start > 0 && samples[start - 1].prey >= samples[start].prey) {
        start -= 1;
        bandSamples += bandOf(samples[start].prey) === 'band' ? 1 : 0;
    }
    return { start, bandSamples };
}

/**
 * @typedef {object} Episode
 * @property {number} length samples in the run
 * @property {boolean} censored whether the run lasts to the end of the window
 * @property {number} minPop the lowest total population in the run
 * @property {number} peak the prey count the fall began at
 * @property {number} descentSamples samples from that peak to the entry
 * @property {number} bandSamples samples of the descent that lay at 100 to 400 prey
 * @property {number} enterSeason the season of the entry
 * @property {number} peakSeason the season of the peak
 */

/**
 * The runs of consecutive samples under 100 prey, with how each began.
 * @param {Sample[]} samples a seed's samples
 * @param {number} seasonTicks the length of a season
 * @returns {Episode[]} one record per run
 */
export function episodes(samples, seasonTicks) {
    /** @type {Episode[]} */
    const out = [];
    for (let i = 0; i < samples.length; i++) {
        if (samples[i].prey >= EDGE || (i > 0 && samples[i - 1].prey < EDGE)) {
            continue;
        }
        let end = i;
        while (end + 1 < samples.length && samples[end + 1].prey < EDGE) {
            end += 1;
        }
        const { start, bandSamples } = descent(samples, i);
        out.push({
            length: end - i + 1,
            censored: end === samples.length - 1,
            minPop: Math.min(...samples.slice(i, end + 1).map((s) => s.pop)),
            peak: samples[start].prey,
            descentSamples: i - start,
            bandSamples,
            enterSeason: seasonOf(samples[i].tick, seasonTicks),
            peakSeason: seasonOf(samples[start].tick, seasonTicks),
        });
    }
    return out;
}

/**
 * The intervals between consecutive samples, grouped by the band the interval starts in and the season it starts in.
 * @param {Sample[][]} seeds every seed's samples
 * @param {number} seasonTicks the length of a season
 * @returns {Record<string, {n: number, fall: number, meanChange: number}>} per `band/season` key (and `band/all`): the
 *   intervals, those that lost prey, and the mean change in prey over the start count
 */
export function intervalTable(seeds, seasonTicks) {
    /** @type {Record<string, {n: number, fall: number, change: number}>} */
    const cells = {};
    for (const samples of seeds) {
        for (let i = 0; i + 1 < samples.length; i++) {
            const delta = samples[i + 1].prey - samples[i].prey;
            const band = bandOf(samples[i].prey);
            for (const key of [`${band}/all`, `${band}/${SEASON_NAMES[seasonOf(samples[i].tick, seasonTicks)]}`]) {
                const cell = (cells[key] ??= { n: 0, fall: 0, change: 0 });
                cell.n += 1;
                cell.fall += delta < 0 ? 1 : 0;
                cell.change += samples[i].prey === 0 ? 0 : delta / samples[i].prey;
            }
        }
    }
    return Object.fromEntries(
        Object.entries(cells).map(([k, c]) => [k, { n: c.n, fall: c.fall, meanChange: c.change / c.n }]),
    );
}

/**
 * @param {Record<string, any>} report an eval report with traces
 * @returns {{seeds: number, everUnder: number, endUnder: number, median: number, atLeastHalf: number,
 *   medianEpisodes: number, lowestPop: number, floorSeeds: number, episodes: Episode[],
 *   intervals: ReturnType<typeof intervalTable>}} the time the seeds spend under 100 prey after burn-in, their episodes
 *   and the interval table
 */
export function traceReading(report) {
    const seasonTicks = report.config.eraSeasonTicks;
    /** @type {Sample[][]} */
    const per = report.traces.map(samplesOf);
    const shares = per.map((s) => s.filter((x) => x.prey < EDGE).length / s.length);
    const all = per.map((s) => episodes(s, seasonTicks));
    const lows = per.map((s) => Math.min(...s.map((x) => x.pop)));
    return {
        seeds: per.length,
        everUnder: shares.filter((s) => s > 0).length,
        endUnder: per.filter((s) => (s.at(-1)?.prey ?? EDGE) < EDGE).length,
        median: median(shares),
        atLeastHalf: shares.filter((s) => s >= 0.5).length,
        medianEpisodes: median(all.map((e) => e.length)),
        lowestPop: median(lows),
        floorSeeds: lows.filter((l) => l <= report.config.floorTrigger).length,
        episodes: all.flat(),
        intervals: intervalTable(per, seasonTicks),
    };
}

/**
 * @param {Record<string, number>} cell a cell's running sums
 * @param {Record<string, number[]>} rows a probe's checkpoint rows
 * @param {number} k the row that ends the interval
 * @returns {void}
 */
function addInterval(cell, rows, k) {
    cell.n = (cell.n ?? 0) + 1;
    cell.prey = (cell.prey ?? 0) + (rows.prey[k - 1] + rows.prey[k]) / 2;
    for (const name of ['mate', 'split', 'deaths', 'starved', 'eaten']) {
        cell[name] = (cell[name] ?? 0) + rows[name][k] - rows[name][k - 1];
    }
}

/**
 * Births and deaths per prey by the band and season an interval starts in, pooled over probe seeds (`scripts/edge-probe.mjs`).
 * @param {{rows: Record<string, number[]>}[]} probes the probes; row `j` is the checkpoint at `BURN_IN_TICKS + 1000 * j`
 * @param {number} seasonTicks the length of a season
 * @returns {Record<string, {n: number, prey: number, mate: number, split: number, deaths: number, starved: number,
 *   eaten: number}>} per `band/season` key (and `band/all`): the intervals, their summed mean prey, and per prey per 1000
 *   ticks the mate and split births and the deaths by every cause, starvation and a hunter
 */
export function flowTable(probes, seasonTicks) {
    /** @type {Record<string, Record<string, number>>} */
    const sums = {};
    for (const { rows } of probes) {
        for (let k = 1; k < rows.prey.length; k++) {
            const season = SEASON_NAMES[seasonOf(BURN_IN_TICKS + (k - 1) * 1000, seasonTicks)];
            const band = bandOf(rows.prey[k - 1]);
            for (const key of [`${band}/all`, `${band}/${season}`]) {
                addInterval((sums[key] ??= {}), rows, k);
            }
        }
    }
    return Object.fromEntries(
        Object.entries(sums).map(([key, c]) => [
            key,
            {
                n: c.n,
                prey: c.prey / c.n,
                mate: c.mate / c.prey,
                split: c.split / c.prey,
                deaths: c.deaths / c.prey,
                starved: c.starved / c.prey,
                eaten: c.eaten / c.prey,
            },
        ]),
    );
}

/**
 * @param {import('./edge-funnel.mjs').Funnel[]} funnels the funnels of the probes
 * @returns {import('./edge-funnel.mjs').Funnel} the funnels summed
 */
export function sumFunnels(funnels) {
    /** @type {import('./edge-funnel.mjs').Funnel} */
    const out = { prey: 0, samples: 0, seen: {}, unseen: {}, seasons: [{}, {}, {}, {}] };
    const add = (/** @type {Record<string, number>} */ into, /** @type {Record<string, number>} */ from) => {
        for (const [cls, n] of Object.entries(from)) {
            into[cls] = (into[cls] ?? 0) + n;
        }
    };
    for (const funnel of funnels) {
        out.samples += funnel.samples;
        out.prey += funnel.prey;
        add(out.seen, funnel.seen);
        add(out.unseen, funnel.unseen);
        funnel.seasons.forEach((counts, i) => add(out.seasons[i], counts));
    }
    return out;
}
