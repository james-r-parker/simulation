// The quality levels and the rule that moves between them. Pure: the caller feeds it a frame report about once a
// second and applies the level it returns.
//
// The report should come from a window of recent frames that the caller starts afresh whenever the level changes
// (`stepQuality` sets `changed`), so frames drawn at the old level do not decide the new one.

/**
 * What each level draws.
 * @type {readonly {bloom: boolean, bloomScale: number, motes: number}[]}
 */
export const QUALITY_LEVELS = Object.freeze([
    Object.freeze({ bloom: true, bloomScale: 1, motes: 1 }),
    Object.freeze({ bloom: true, bloomScale: 0.5, motes: 0.5 }),
    Object.freeze({ bloom: false, bloomScale: 0, motes: 0 }),
]);

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
 * @param {{pinned?: number | null, floatTargets?: boolean}} [options] `pinned` holds a level; `floatTargets` false
 *   (no float render targets for bloom) holds level 2
 * @returns {Quality} the quality state, at level 0 unless pinned or limited
 */
export function createQuality({ pinned = null, floatTargets = true } = {}) {
    const floor = floatTargets ? 0 : 2;
    const level = pinned === null ? floor : Math.max(floor, Math.min(2, pinned));
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
