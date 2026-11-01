// The quality levels, what each level and the `?look=` mask draw, and the rule that moves between levels. Pure: the
// caller feeds it a frame report about once a second and applies the level it returns.
//
// The report should come from a window of recent frames that the caller starts afresh whenever the level changes
// (`stepQuality` sets `changed`), so frames drawn at the old level do not decide the new one.

/** The Phase 6 look items, in the order of their bits in a look mask. */
export const LOOK_ITEMS = Object.freeze(['rocks', 'aurora', 'terrain', 'motion', 'threads', 'decay', 'finish']);

/** The mask with every look item on (`?look=all`, the default). */
export const LOOK_ALL = (1 << LOOK_ITEMS.length) - 1;

/** The tier of an item that does not draw. */
export const LOOK_OFF = -1;

/**
 * Which column of the Phase 6 quality-tier table an item draws with: 0 full, 1 reduced, 2 the level-2 form,
 * `LOOK_OFF` not drawn.
 * @typedef {{rocks?: number, aurora?: number, terrain?: number, motion?: number, threads?: number, decay?: number,
 *   finish?: number, flora?: number}} Look
 */

/**
 * @param {number} tier the tier of every item but those in `off`
 * @param {readonly string[]} [off] the items the level does not draw
 * @returns {Readonly<Look>} the level's look entry
 */
function lookLevel(tier, off = []) {
    /** @type {Record<string, number>} */
    const look = {};
    for (const item of LOOK_ITEMS) {
        look[item] = off.includes(item) ? LOOK_OFF : tier;
    }
    return Object.freeze(/** @type {Look} */ (look));
}

/**
 * What each level draws.
 * @type {readonly {bloom: boolean, bloomScale: number, motes: number, look: Readonly<Look>}[]}
 */
export const QUALITY_LEVELS = Object.freeze([
    Object.freeze({ bloom: true, bloomScale: 1, motes: 1, look: lookLevel(0) }),
    Object.freeze({ bloom: true, bloomScale: 0.5, motes: 0.5, look: lookLevel(1) }),
    Object.freeze({
        bloom: false,
        bloomScale: 0,
        motes: 0,
        look: lookLevel(2, ['aurora', 'terrain', 'motion', 'threads', 'finish']),
    }),
]);

/**
 * What draws at a level under a `?look=` mask. The mask only removes items; it never adds one the level leaves off.
 * @param {number} level the quality level, 0 to 2
 * @param {number} mask the look mask, a bit per `LOOK_ITEMS` entry
 * @returns {Look} a fresh look: each item's tier, `LOOK_OFF` where the level or the mask leaves it off
 */
export function lookFor(level, mask) {
    const base = QUALITY_LEVELS[level].look;
    const look = { ...base };
    LOOK_ITEMS.forEach((item, bit) => {
        if ((mask & (1 << bit)) === 0) {
            look[/** @type {keyof Look} */ (item)] = LOOK_OFF;
        }
    });
    return look;
}

/**
 * @param {Look} look a look
 * @returns {string[]} the names of the items that draw, in `LOOK_ITEMS` order
 */
export function lookItems(look) {
    return LOOK_ITEMS.filter((item) => look[/** @type {keyof Look} */ (item)] !== LOOK_OFF);
}

/**
 * Parses a `?look=` value: a comma list of `LOOK_ITEMS` names, `all` or `none`.
 * @param {string} text the value
 * @returns {number | null} the mask, or null when any name is unknown or the list is empty
 */
export function parseLook(text) {
    if (text === 'all') {
        return LOOK_ALL;
    }
    if (text === 'none') {
        return 0;
    }
    const names = text.split(',');
    let mask = 0;
    for (const name of names) {
        const bit = LOOK_ITEMS.indexOf(name.trim());
        if (bit < 0) {
            return null;
        }
        mask |= 1 << bit;
    }
    return mask;
}

/** Step down after this long with p95 above `SLOW_FACTOR` x the budget. */
export const DOWN_AFTER_MS = 5000;
/** Step up after this long with p95 below `FAST_FACTOR` x the budget (doubling after reversals). */
export const UP_AFTER_MS = 30000;
/** The longest wait before stepping up. */
export const MAX_UP_WAIT_MS = 600000;
/** Two reversals closer than this make the wait before stepping up double. */
export const REVERSAL_WINDOW_MS = 600000;
const SLOW_FACTOR = 1.5;
const FAST_FACTOR = 0.6;
/** Fewest frames a report needs to count. */
const MIN_FRAMES = 60;

/**
 * @typedef {object} Quality
 * @property {number} level 0 (everything on) to 2 (bloom and motes off)
 * @property {number | null} pinned a level held by `?quality=`, null when free
 * @property {number} floor the lowest-numbered level allowed: 2 when float render targets are missing, else 0
 * @property {number | null} slowSince when p95 first went over the slow line, null when it is not over it
 * @property {number | null} fastSince when p95 first went under the fast line
 * @property {number} upWait ms below the fast line before stepping up
 * @property {number} direction the last move: -1 down in quality (level up), +1 up in quality, 0 none
 * @property {number} lastReversal when the last reversal happened, -Infinity before one
 * @property {boolean} changed whether the last `stepQuality` changed the level
 */

/**
 * @param {{pinned?: number | null, floatTargets?: boolean, software?: boolean}} [options] `pinned` holds a level;
 *   `floatTargets` false (no float render targets for bloom) holds level 2; `software` (a CPU rasteriser) starts at
 *   level 2 but leaves the rule free to move it
 * @returns {Quality} the quality state, at level 0 unless pinned, limited or software
 */
export function createQuality({ pinned = null, floatTargets = true, software = false } = {}) {
    const floor = floatTargets ? 0 : 2;
    const start = software ? 2 : floor;
    const level = pinned === null ? start : Math.max(floor, Math.min(2, pinned));
    return {
        level,
        pinned,
        floor,
        slowSince: null,
        fastSince: null,
        upWait: UP_AFTER_MS,
        direction: 0,
        lastReversal: -Infinity,
        changed: false,
    };
}

/**
 * @param {Quality} q the state
 * @param {number} direction +1 for better quality (lower level), -1 for worse
 * @param {number} nowMs the time
 * @returns {void}
 */
function move(q, direction, nowMs) {
    q.level -= direction;
    q.changed = true;
    q.slowSince = null;
    q.fastSince = null;
    if (q.direction !== 0 && q.direction !== direction) {
        q.upWait = nowMs - q.lastReversal <= REVERSAL_WINDOW_MS ? Math.min(q.upWait * 2, MAX_UP_WAIT_MS) : UP_AFTER_MS;
        q.lastReversal = nowMs;
    }
    q.direction = direction;
}

/**
 * Restarts or continues the two timers from a report.
 * @param {Quality} q the state
 * @param {{frameMs: {p95: number}, refreshMs: number}} report the report
 * @param {number} nowMs the time
 * @returns {void}
 */
function track(q, report, nowMs) {
    const p95 = report.frameMs.p95;
    q.slowSince = p95 > SLOW_FACTOR * report.refreshMs ? (q.slowSince ?? nowMs) : null;
    q.fastSince = p95 < FAST_FACTOR * report.refreshMs ? (q.fastSince ?? nowMs) : null;
}

/**
 * @param {Quality} q the state, its timers updated
 * @param {number} nowMs the time
 * @returns {number} -1 to step down in quality, +1 to step up, 0 to stay
 */
function decide(q, nowMs) {
    if (q.slowSince !== null && nowMs - q.slowSince >= DOWN_AFTER_MS && q.level < QUALITY_LEVELS.length - 1) {
        return -1;
    }
    if (q.fastSince !== null && nowMs - q.fastSince >= q.upWait && q.level > q.floor) {
        return 1;
    }
    return 0;
}

/**
 * Decides the level from the latest frame report. After 5 s with p95 above 1.5 x the budget it moves one level down;
 * after `upWait` (30 s, doubling after repeated reversals within 10 minutes, to at most 10 minutes) below 0.6 x the
 * budget it moves one level up. A report with too few frames, or a hidden tab, restarts both timers. A pinned level
 * never moves.
 * @param {Quality} q the state
 * @param {{frames: number, frameMs: {p95: number}, refreshMs: number}} report from `frameReport`; the budget is the
 *   measured refresh interval
 * @param {number} nowMs the time
 * @param {boolean} [visible] whether the tab is visible
 * @returns {number} the level
 */
export function stepQuality(q, report, nowMs, visible = true) {
    q.changed = false;
    if (q.pinned !== null) {
        return q.level;
    }
    if (!visible || report.frames < MIN_FRAMES || report.refreshMs <= 0) {
        q.slowSince = null;
        q.fastSince = null;
        return q.level;
    }
    track(q, report, nowMs);
    const direction = decide(q, nowMs);
    if (direction !== 0) {
        move(q, direction, nowMs);
    }
    return q.level;
}

/**
 * Bloom needs a float (or half-float) render target; without one the renderer holds level 2.
 * @param {{has: (name: string) => boolean}} extensions `renderer.extensions`
 * @returns {boolean} whether the context can render to a float texture
 */
export function supportsFloatTargets(extensions) {
    return extensions.has('EXT_color_buffer_float') || extensions.has('EXT_color_buffer_half_float');
}
