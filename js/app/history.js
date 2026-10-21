// Bounded time series with halving decimation, for the charts. A series is a `level` (the newest value when a sample is
// taken) or a `flow` (a count that sums over the sample's interval). A sample is taken every `sampleMs`; when the
// history is full it keeps every second sample - flows are summed in pairs - and doubles `sampleMs`, so the charts
// span the whole run at falling resolution in constant memory.

/** Samples a series holds. */
export const HISTORY_SIZE = 1024;
/** The first sampling interval, in ms of wall time. */
export const INITIAL_SAMPLE_MS = 5000;

/**
 * @typedef {object} History
 * @property {string[]} names the series names
 * @property {('level' | 'flow')[]} kinds how each series combines values
 * @property {number} capacity samples held
 * @property {number} count samples held now
 * @property {number} sampleMs the current sampling interval
 * @property {number} lastMs the wall time of the last sample, -Infinity before one
 * @property {Float64Array} t the x value (the sim tick) of each sample
 * @property {Float64Array[]} data one array per series
 * @property {Float64Array} latest the newest level of each series
 * @property {Float64Array} pending the flow counts since the last sample
 */

/**
 * @param {{names: string[], kinds: ('level' | 'flow')[], capacity?: number, sampleMs?: number}} options the series and,
 *   for tests, a smaller capacity or another interval
 * @returns {History} an empty history
 * @throws {Error} when `names` and `kinds` differ in length or the capacity is odd
 */
export function createHistory({ names, kinds, capacity = HISTORY_SIZE, sampleMs = INITIAL_SAMPLE_MS }) {
    if (names.length !== kinds.length) {
        throw new Error(`createHistory: ${names.length} names but ${kinds.length} kinds`);
    }
    if (capacity < 2 || capacity % 2 !== 0) {
        throw new Error(`createHistory: capacity must be an even number of at least 2, got ${capacity}`);
    }
    return {
        names: [...names],
        kinds: [...kinds],
        capacity,
        count: 0,
        sampleMs,
        lastMs: -Infinity,
        t: new Float64Array(capacity),
        data: names.map(() => new Float64Array(capacity)),
        latest: new Float64Array(names.length),
        pending: new Float64Array(names.length),
    };
}

/**
 * Halves a full history: each pair of samples becomes one.
 * @param {History} h the history
 * @returns {void}
 */
function decimate(h) {
    const half = h.count / 2;
    for (let i = 0; i < half; i++) {
        h.t[i] = h.t[2 * i + 1];
        for (let s = 0; s < h.data.length; s++) {
            const d = h.data[s];
            d[i] = h.kinds[s] === 'flow' ? d[2 * i] + d[2 * i + 1] : d[2 * i + 1];
        }
    }
    h.count = half;
    h.sampleMs *= 2;
}

/**
 * Takes in one stats message's values and, when `sampleMs` of wall time have passed since the last sample, stores a
 * sample.
 * @param {History} h the history
 * @param {{nowMs: number, tick: number, values: ArrayLike<number>}} stats the wall time, the sim tick and one value per
 *   series (levels replace the newest value, flows add to the pending count)
 * @returns {boolean} whether a sample was stored
 */
export function pushSample(h, { nowMs, tick, values }) {
    for (let s = 0; s < h.data.length; s++) {
        if (h.kinds[s] === 'flow') {
            h.pending[s] += values[s];
        } else {
            h.latest[s] = values[s];
        }
    }
    if (nowMs - h.lastMs < h.sampleMs) {
        return false;
    }
    if (h.count === h.capacity) {
        decimate(h);
    }
    h.t[h.count] = tick;
    for (let s = 0; s < h.data.length; s++) {
        const flow = h.kinds[s] === 'flow';
        h.data[s][h.count] = flow ? h.pending[s] : h.latest[s];
        h.pending[s] = 0;
    }
    h.count += 1;
    h.lastMs = nowMs;
    return true;
}

/**
 * @param {History} h the history
 * @returns {Record<string, Float64Array>} each series by name, plus `t`, as views of the samples held (no copy)
 */
export function columns(h) {
    /** @type {Record<string, Float64Array>} */
    const out = { t: h.t.subarray(0, h.count) };
    h.names.forEach((name, s) => {
        out[name] = h.data[s].subarray(0, h.count);
    });
    return out;
}

/**
 * Empties the history for a new world; the interval returns to its start.
 * @param {History} h the history
 * @returns {void}
 */
export function clearHistory(h) {
    h.count = 0;
    h.sampleMs = INITIAL_SAMPLE_MS;
    h.lastMs = -Infinity;
    h.latest.fill(0);
    h.pending.fill(0);
}

/**
 * @param {History} h the history
 * @param {{series: string, agoMs: number}} look which series and how far back, in ms of wall time
 * @returns {number | null} the value of the series about `agoMs` before the newest sample (to the nearest sample at the
 *   current interval), null when the history does not reach back that far or the series does not exist
 */
export function lookback(h, { series, agoMs }) {
    const at = h.names.indexOf(series);
    const index = h.count - 1 - Math.round(agoMs / h.sampleMs);
    return at < 0 || index < 0 ? null : h.data[at][index];
}
