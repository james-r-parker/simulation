// The effect budget: what may spawn this frame. Four limits, each counted by family when it refuses: the look item
// (a family switched off spawns nothing), off-view culling, a per-frame instance cap shared by priority, and a token
// bucket per family per second. It also gives the zoom band that sets how many instances a recipe spawns, and the
// wall-time floor on an effect's life at high speed. Everything is preallocated; nothing here allocates per frame.

import { appLog } from '../app-log.js';
import { LOOK_OFF } from './quality.js';

/** The effect families, each tied to the look item of the same name. */
export const FX_FAMILIES = Object.freeze([
    'combat',
    'feeding',
    'courtship',
    'calls',
    'sickness',
    'weather',
    'herds',
    'flora',
]);
/** Family index by name. */
export const FAMILY = Object.freeze(Object.fromEntries(FX_FAMILIES.map((name, i) => [name, i])));
/** Instances per second each family may spawn (the bucket also holds one second's worth). */
export const FAMILY_RATE = Object.freeze([60, 40, 30, 30, 30, 20, 20, 20]);
/** Instances per frame at quality levels 0, 1 and 2. */
export const FRAME_CAP = Object.freeze([96, 48, 12]);
/** Recipe priority ranks: a lower rank may spend more of the frame cap. */
export const RANK = Object.freeze({
    kill: 0,
    birth: 1,
    firstKill: 2,
    bite: 3,
    call: 4,
    sickness: 5,
    mate: 6,
    eat: 7,
    weather: 8,
});
const RANKS = 10;
/** The least an effect lasts in wall time, whatever the speed. */
export const FX_MIN_MS = 250;
/** World units beyond the view an effect still spawns in. */
export const VIEW_MARGIN = 200;
/** A typical agent radius in world units, for the zoom band. */
export const TYPICAL_RADIUS = 10;
/** Zoom bands: an agent under 6 device px across radius is far, under 20 mid, else close. */
export const BAND = Object.freeze({ FAR: 0, MID: 1, CLOSE: 2 });
/** How often the budget logs drops and pool overwrites, in ms. */
export const LOG_EVERY_MS = 10000;

/**
 * @typedef {object} FxBudget
 * @property {number} level the quality level
 * @property {number} spent instances admitted this frame
 * @property {Float32Array} tokens per family
 * @property {Int8Array} tier per family: its look item's tier, `LOOK_OFF` when off
 * @property {Float64Array} spawned per family, since creation
 * @property {Float64Array} dropped per family, refused by the cap or the bucket
 * @property {Float64Array} culled per family, off view
 * @property {{left: number, right: number, top: number, bottom: number}} view the world rectangle in view
 * @property {number} band a `BAND` value
 * @property {number} ticksPerMs the playhead's smoothed rate
 * @property {number} lastTick the previous frame's playhead tick, NaN before one
 * @property {number} lastLogMs when drops were last logged
 * @property {number} loggedDrops total drops at that log
 * @property {number} loggedOverwrites the pool's overwrite count at that log
 */

/**
 * @returns {FxBudget} a budget at level 0 with every family on and full buckets
 */
export function createFxBudget() {
    const n = FX_FAMILIES.length;
    return {
        level: 0,
        spent: 0,
        tokens: Float32Array.from(FAMILY_RATE),
        tier: new Int8Array(n),
        spawned: new Float64Array(n),
        dropped: new Float64Array(n),
        culled: new Float64Array(n),
        view: { left: -Infinity, right: Infinity, top: Infinity, bottom: -Infinity },
        band: BAND.CLOSE,
        ticksPerMs: 0,
        lastTick: Number.NaN,
        lastLogMs: 0,
        loggedDrops: 0,
        loggedOverwrites: 0,
    };
}

/**
 * @param {number} pxPerUnit device pixels per world unit
 * @param {number} [radius] the agent radius to judge by, world units
 * @returns {number} `BAND.FAR` under 6 px, `BAND.MID` under 20 px, else `BAND.CLOSE`
 */
export function zoomBand(pxPerUnit, radius = TYPICAL_RADIUS) {
    const px = pxPerUnit * radius;
    return px < 6 ? BAND.FAR : px < 20 ? BAND.MID : BAND.CLOSE;
}

/**
 * @param {FxBudget} budget the budget
 * @param {Record<string, number>} look each look item's tier (`lookFor`)
 * @returns {void}
 */
export function setFxLook(budget, look) {
    FX_FAMILIES.forEach((name, i) => {
        budget.tier[i] = look[name] ?? LOOK_OFF;
    });
}

/**
 * @param {FxBudget} budget the budget
 * @param {number} level the quality level, 0 to 2
 * @returns {void}
 */
export function setFxQuality(budget, level) {
    budget.level = Math.max(0, Math.min(FRAME_CAP.length - 1, level));
}

/**
 * Refills the buckets, resets the frame cap, and takes the view, the zoom band and the playhead's rate.
 * @param {FxBudget} budget the budget
 * @param {{tick: number, dtMs: number, zoom: number, view: {left: number, right: number, top: number, bottom: number}}} at
 *   the frame
 * @returns {void}
 */
export function beginFxFrame(budget, { tick, dtMs, zoom, view }) {
    budget.spent = 0;
    for (let i = 0; i < FAMILY_RATE.length; i++) {
        budget.tokens[i] = Math.min(FAMILY_RATE[i], budget.tokens[i] + (FAMILY_RATE[i] * dtMs) / 1000);
    }
    const v = budget.view;
    v.left = view.left - VIEW_MARGIN;
    v.right = view.right + VIEW_MARGIN;
    v.top = view.top + VIEW_MARGIN;
    v.bottom = view.bottom - VIEW_MARGIN;
    budget.band = zoomBand(zoom);
    if (dtMs > 0 && !Number.isNaN(budget.lastTick)) {
        const rate = Math.max(tick - budget.lastTick, 0) / dtMs;
        budget.ticksPerMs += (rate - budget.ticksPerMs) * 0.1;
    }
    budget.lastTick = tick;
}

/**
 * @param {FxBudget} budget the budget
 * @param {number} x world x
 * @param {number} y world y
 * @returns {boolean} whether the point lies in the view plus the margin
 */
export function inFxView(budget, x, y) {
    const v = budget.view;
    return x >= v.left && x <= v.right && y >= v.bottom && y <= v.top;
}

/**
 * Admits up to `want` instances of a family at a point.
 * @param {FxBudget} budget the budget
 * @param {{family: number, rank: number}} who the family and the recipe's `RANK`
 * @param {number} want instances asked for
 * @param {{x: number, y: number}} at where
 * @returns {number} instances granted, 0 to `want`
 */
export function admitFx(budget, { family, rank }, want, at) {
    if (want <= 0 || budget.tier[family] === LOOK_OFF) {
        return 0;
    }
    if (!inFxView(budget, at.x, at.y)) {
        budget.culled[family] += want;
        return 0;
    }
    const allowance = Math.floor(FRAME_CAP[budget.level] * (1 - rank / RANKS)) - budget.spent;
    const granted = Math.max(0, Math.min(want, allowance, Math.floor(budget.tokens[family])));
    budget.spent += granted;
    budget.tokens[family] -= granted;
    budget.spawned[family] += granted;
    budget.dropped[family] += want - granted;
    return granted;
}

/**
 * @param {FxBudget} budget the budget
 * @param {number} family the family index
 * @param {number} full the recipe's count at the close band and tier 0
 * @returns {number} the count at the current band and the family's tier: one lead instance far or at tier 2, half at
 *   mid or tier 1 (rounded up), full otherwise
 */
export function countFor(budget, family, full) {
    const tier = budget.tier[family];
    if (budget.band === BAND.FAR || tier >= 2) {
        return Math.min(full, 1);
    }
    const halves = (budget.band === BAND.MID ? 1 : 0) + (tier === 1 ? 1 : 0);
    return Math.max(1, Math.ceil(full / (1 << halves)));
}

/**
 * @param {FxBudget} budget the budget
 * @param {number} lifeTicks the recipe's life
 * @returns {number} the life, raised so it lasts at least `FX_MIN_MS` at the playhead's rate
 */
export function lifeFor(budget, lifeTicks) {
    return Math.max(lifeTicks, FX_MIN_MS * budget.ticksPerMs);
}

/**
 * @param {FxBudget} budget the budget
 * @returns {number} drops over every family since creation
 */
function totalDropped(budget) {
    let n = 0;
    for (let i = 0; i < budget.dropped.length; i++) {
        n += budget.dropped[i];
    }
    return n;
}

/**
 * Logs `FxBudgetDropped` at most once per `LOG_EVERY_MS` while drops happen, and `FxPoolSaturated` when the pool
 * overwrote live instances since the last log.
 * @param {FxBudget} budget the budget
 * @param {{nowMs: number, overwrote: number, capacity: number}} at the time, the pool's overwrite count since creation
 *   and its active capacity
 * @param {(level: 'info', event: string, fields: Record<string, any>) => void} [log] the logger
 * @returns {boolean} whether it logged
 */
export function logFxBudget(budget, { nowMs, overwrote, capacity }, log = appLog) {
    if (nowMs - budget.lastLogMs < LOG_EVERY_MS) {
        return false;
    }
    const total = totalDropped(budget);
    const fresh = total - budget.loggedDrops;
    const over = overwrote - budget.loggedOverwrites;
    budget.lastLogMs = nowMs;
    budget.loggedDrops = total;
    budget.loggedOverwrites = overwrote;
    if (fresh > 0) {
        log('info', 'FxBudgetDropped', { level: budget.level, dropped: fresh, windowMs: LOG_EVERY_MS });
    }
    if (over > 0) {
        log('info', 'FxPoolSaturated', { capacity, level: budget.level, overwrote: over });
    }
    return fresh > 0 || over > 0;
}

/**
 * @param {FxBudget} budget the budget
 * @returns {Record<string, {spawned: number, dropped: number, culled: number}>} counts by family name, for `__perf`
 */
export function fxStats(budget) {
    return Object.fromEntries(
        FX_FAMILIES.map((name, i) => [
            name,
            { spawned: budget.spawned[i], dropped: budget.dropped[i], culled: budget.culled[i] },
        ]),
    );
}
