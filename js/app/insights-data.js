// What the insights drawer reads from the worker's stats messages: the numbers of the World tab (the readings, the
// population by specialisation, and the births and deaths by cause over the last four seasons). Reads posted stats and
// nothing else; the drawer computes nothing in the sim. The per-season flows are summed here from each message's
// "since the last message" counts, in one bucket per season.

import { calendarOf } from './ui/status-line.js';
import { temperatureBand } from './ui/inspector-data.js';

/** The seasons the flow tables cover: the current one and the three before it. */
export const FLOW_SEASONS = 4;
/** The column headings of a flow table. */
export const FLOW_HEADINGS = Object.freeze(['now', '-1', '-2', '-3']);
/** Ticks a second at speed x1. */
const BASE_TICKS_PER_SECOND = 60;

/**
 * @typedef {object} InsightsData
 * @property {Record<string, any> | null} ready the `ready` message, null before one
 * @property {Record<string, any> | null} stats the newest stats message, null before one
 * @property {{name: string, index: number}[]} born the birth causes, `INITIAL` left out
 * @property {{name: string, index: number}[]} died the death causes
 * @property {Float64Array} births `FLOW_SEASONS` buckets per birth cause, by season index modulo the window
 * @property {Float64Array} deaths the same for deaths
 * @property {number} season the newest season index counted into
 */

/**
 * @param {Record<string, number>} causes cause names by index, as `ready.layout` gives them
 * @param {boolean} skipFirst whether index 0 is left out (`INITIAL`, the starting population, is not a birth)
 * @returns {{name: string, index: number}[]} the causes in index order with readable names
 */
function causeRows(causes, skipFirst) {
    return Object.entries(causes)
        .map(([name, index]) => ({ name: name.toLowerCase().replace(/_/g, ' '), index }))
        .filter((c) => !skipFirst || c.index > 0)
        .sort((a, b) => a.index - b.index);
}

/** @returns {InsightsData} data with nothing in it, until `readyInsights` */
export function createInsightsData() {
    return {
        ready: null,
        stats: null,
        born: [],
        died: [],
        births: new Float64Array(0),
        deaths: new Float64Array(0),
        season: 0,
    };
}

/**
 * Starts the data for a new world.
 * @param {InsightsData} data the data
 * @param {Record<string, any>} ready the `ready` message
 * @returns {void}
 */
export function readyInsights(data, ready) {
    data.ready = ready;
    data.stats = null;
    data.born = causeRows(ready.layout?.bornCauses ?? {}, true);
    data.died = causeRows(ready.layout?.deathCauses ?? {}, false);
    data.births = new Float64Array(data.born.length * FLOW_SEASONS);
    data.deaths = new Float64Array(data.died.length * FLOW_SEASONS);
    data.season = 0;
}

/**
 * @param {Float64Array} buckets the buckets
 * @param {number} causes the causes in them
 * @param {number} bucket the bucket to empty
 * @returns {void}
 */
function clearBucket(buckets, causes, bucket) {
    for (let c = 0; c < causes; c++) {
        buckets[c * FLOW_SEASONS + bucket] = 0;
    }
}

/**
 * Adds one stats message: keeps it as the newest and sums its births and deaths into the season's bucket.
 * @param {InsightsData} data the data
 * @param {Record<string, any>} stats a stats message
 * @returns {void}
 */
export function noteInsightStats(data, stats) {
    data.stats = stats;
    const length = Math.max(data.ready?.info?.seasonLength ?? 1, 1);
    const season = Math.floor(stats.tick / length);
    const steps = Math.min(season - data.season, FLOW_SEASONS);
    for (let s = 1; s <= steps; s++) {
        clearBucket(data.births, data.born.length, (data.season + s) % FLOW_SEASONS);
        clearBucket(data.deaths, data.died.length, (data.season + s) % FLOW_SEASONS);
    }
    data.season = Math.max(season, data.season);
    const bucket = data.season % FLOW_SEASONS;
    data.born.forEach((c, i) => {
        data.births[i * FLOW_SEASONS + bucket] += stats.birthsByCause?.[c.index] ?? 0;
    });
    data.died.forEach((c, i) => {
        data.deaths[i * FLOW_SEASONS + bucket] += stats.deathsByCause?.[c.index] ?? 0;
    });
}

/**
 * @param {number} n a count
 * @returns {string} the count with thousands separators
 */
export function grouped(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * @param {Float64Array} buckets the buckets
 * @param {{name: string}[]} causes the causes in them
 * @param {number} season the newest season index
 * @returns {{cells: string[]}[]} a row per cause: its name, then its count in the current season and the three before
 */
function flowRows(buckets, causes, season) {
    return causes.map((c, i) => ({
        cells: [
            c.name,
            ...FLOW_HEADINGS.map((_, back) => {
                const at = season - back;
                return at < 0 ? '-' : grouped(buckets[i * FLOW_SEASONS + (at % FLOW_SEASONS)]);
            }),
        ],
    }));
}

/**
 * @param {Record<string, any>} stats the newest stats message
 * @param {string} name a field of it
 * @returns {number} the field, 0 when the message does not carry it
 */
const field = (stats, name) => stats[name] ?? 0;

/**
 * @param {Record<string, any>} stats the newest stats message
 * @param {Record<string, any>} info `ready.info`
 * @returns {string} the mean body temperature with the band it is in, when the world gives its thresholds
 */
function temperatureText(stats, info) {
    const temperature = field(stats, 'meanTemperature');
    const band = info.temperatureOptimalMin === undefined ? '' : ` (${temperatureBand(temperature, info)})`;
    return `${temperature.toFixed(2)}${band}`;
}

/**
 * @param {InsightsData} data the data
 * @returns {[string, string][]} the readings: the season, temperature, food energy, hunters alive, population, speed
 *   and ticks a second
 */
function readings({ stats, ready }) {
    const info = ready?.info ?? {};
    if (stats === null) {
        return [];
    }
    const calendar = calendarOf(stats, {
        seasonNames: info.seasonNames ?? [],
        seasonLength: info.seasonLength ?? 1,
        seed: 0,
    });
    return [
        ['season', `${calendar.season}, year ${calendar.year} (${Math.round(field(stats, 'seasonProgress') * 100)}%)`],
        ['mean body temperature', temperatureText(stats, info)],
        ['food energy', grouped(field(stats, 'foodEnergy'))],
        ['hunters alive', grouped(field(stats, 'predators'))],
        ['population', grouped(field(stats, 'population'))],
        ['tick', grouped(stats.tick)],
        ['sim speed', `x${field(stats, 'requestedTicksPerSecond') / BASE_TICKS_PER_SECOND}`],
        ['ticks per second', String(Math.round(stats.ticksPerSecond))],
    ];
}

/**
 * @param {InsightsData} data the data
 * @returns {{readings: [string, string][], population: {cells: string[]}[], births: {cells: string[]}[],
 *   deaths: {cells: string[]}[]}} the World tab: the readings, the population by specialisation, and the births and
 *   deaths by cause in the last four seasons
 */
export function worldView(data) {
    const specs = data.ready?.info?.specs ?? [];
    const by = data.stats?.bySpec ?? [];
    return {
        readings: readings(data),
        population: specs.map((/** @type {{index: number, name: string}} */ s) => ({
            cells: [s.name, grouped(by[s.index] ?? 0)],
        })),
        births: flowRows(data.births, data.born, data.season),
        deaths: flowRows(data.deaths, data.died, data.season),
    };
}
