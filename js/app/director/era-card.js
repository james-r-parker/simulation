// The era card: every ten minutes of simulated time, outside a close shot, TV mode shows a ten second card read from the
// chart history - who leads and for how long, the catch share now against the ten minutes before, and the deepest
// generation. `createEraSchedule` says when it is due; `eraCardFor` writes it. Both are pure.

import { columns } from '../history.js';

/** Simulated minutes between cards. */
export const ERA_MINUTES = 10;
/** How long a card stays up, in ms of wall time. */
export const ERA_SHOW_MS = 10000;

/** The shot states in which a card may appear: a close shot is not interrupted. */
const OPEN_SHOTS = new Set(['wide', 'pullback']);

/**
 * @param {number} ticksPerSecond the ticks in a simulated second
 * @returns {{due: (tick: number, shotState: string | null) => boolean}} the schedule: `due` is true once for each ten
 *   minute mark passed, at the first moment outside a close shot; a first call only sets the next mark
 */
export function createEraSchedule(ticksPerSecond) {
    const period = ERA_MINUTES * 60 * ticksPerSecond;
    let next = -1;
    return {
        due(tick, shotState) {
            if (next < 0) {
                next = (Math.floor(tick / period) + 1) * period;
            }
            if (tick < next || shotState === null || !OPEN_SHOTS.has(shotState)) {
                return false;
            }
            next = (Math.floor(tick / period) + 1) * period;
            return true;
        },
    };
}

/**
 * @param {Float64Array} flow a flow column (a count over each sample's interval)
 * @param {Float64Array} t the tick of each sample
 * @param {{from: number, to: number}} window ticks, `from` excluded and `to` included
 * @returns {number} the sum of the samples inside the window
 */
function sumIn(flow, t, { from, to }) {
    let total = 0;
    for (let i = 0; i < t.length; i++) {
        if (t[i] > from && t[i] <= to) {
            total += flow[i];
        }
    }
    return total;
}

/**
 * @param {Record<string, Float64Array>} cols the history columns
 * @param {{from: number, to: number}} window ticks
 * @returns {number | null} caught / (caught + escaped) in the window, null when there were none
 */
function catchShare(cols, window) {
    const caught = sumIn(cols.caught, cols.t, window);
    const total = caught + sumIn(cols.escaped, cols.t, window);
    return total === 0 ? null : caught / total;
}

/**
 * @param {Record<string, Float64Array>} cols the history columns
 * @param {number} ticksPerSecond the ticks in a simulated second
 * @returns {number} minutes the newest leader has led, to the oldest sample when it always has (0 with fewer than 2)
 */
function leadMinutes(cols, ticksPerSecond) {
    const ids = cols['river.id0'];
    const n = ids.length;
    let i = n - 1;
    while (i > 0 && ids[i - 1] === ids[n - 1]) {
        i -= 1;
    }
    return n < 2 ? 0 : (cols.t[n - 1] - cols.t[i]) / ticksPerSecond / 60;
}

/**
 * @param {number} share a share, 0 to 1
 * @returns {string} it as a whole percentage, `42%`
 */
function percent(share) {
    return `${Math.round(share * 100)}%`;
}

/**
 * @param {import('../history.js').History} history the chart history of the world
 * @param {{tick: number, ticksPerSecond: number, nameOf: (lineageId: number) => string}} world the tick, the tick rate
 *   and the family name of a lineage
 * @returns {string[] | null} the card's lines, or null while the history is too short to say anything
 */
export function eraCardFor(history, { tick, ticksPerSecond, nameOf }) {
    const cols = columns(history);
    if (cols.t.length < 2) {
        return null;
    }
    const span = ERA_MINUTES * 60 * ticksPerSecond;
    const leader = cols['river.id0'][cols.t.length - 1];
    const lines = [];
    if (leader >= 0) {
        lines.push(`${nameOf(leader)} has led for ${Math.max(1, Math.round(leadMinutes(cols, ticksPerSecond)))} min`);
    }
    const now = catchShare(cols, { from: tick - span, to: tick });
    const before = catchShare(cols, { from: tick - 2 * span, to: tick - span });
    if (now !== null) {
        lines.push(
            before === null
                ? `Catch share ${percent(now)}`
                : `Catch share ${percent(now)}, was ${percent(before)} ten minutes ago`,
        );
    }
    const generation = cols.generation?.[cols.t.length - 1] ?? 0;
    if (generation > 0) {
        lines.push(`Generation ${Math.round(generation)}`);
    }
    return lines.length === 0 ? null : lines;
}
