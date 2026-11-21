// The night dim: a brightness scalar by wall clock for a screen left on in a dark room (docs/designs/ambient-display.md,
// "A look that holds from across a room"). `auto` is 1 by day and eases to `NIGHT_LEVEL` between 22:00 and 07:00 local
// (an hour of ease at each end) and applies in TV mode, the unattended state; a fixed level (`?dim=<0.3 to 1>` or the
// `dim` preference, `DIM_MIN` to 1) applies always. Pure over an injected clock and a level sink, so it tests without a browser.

/** The brightness `auto` holds at night. */
export const NIGHT_LEVEL = 0.55;
/** The local hours the night runs between, and how long each end eases. */
export const NIGHT_FROM_HOUR = 22;
export const NIGHT_TO_HOUR = 7;
export const NIGHT_EASE_HOURS = 1;
/** How often the clock is read, ms: the brightness moves over an hour, so a frame never needs it. */
export const DIM_READ_MS = 10000;
/** A change in level smaller than this is not applied. */
const DIM_STEP = 0.002;

/**
 * @param {number} t a share 0 to 1
 * @returns {number} the smoothstep of it
 */
function ease(t) {
    return t * t * (3 - 2 * t);
}

/**
 * @param {number} hours the local time of day as hours from 0 to below 24, fractions included
 * @returns {number} the `auto` brightness: 1 by day, `NIGHT_LEVEL` through the night, eased over the first hour after
 *   22:00 and the last hour before 07:00
 */
export function autoDimAt(hours) {
    const intoNight = hours >= NIGHT_FROM_HOUR ? hours - NIGHT_FROM_HOUR : hours + 24 - NIGHT_FROM_HOUR;
    const length = NIGHT_TO_HOUR + 24 - NIGHT_FROM_HOUR;
    if (intoNight > length) {
        return 1;
    }
    const share = Math.min(intoNight / NIGHT_EASE_HOURS, (length - intoNight) / NIGHT_EASE_HOURS, 1);
    return 1 - (1 - NIGHT_LEVEL) * ease(share);
}

/**
 * @param {{mode: 'auto' | number, hours: number, tv: boolean}} at the setting, the local time of day and TV mode
 * @returns {number} the brightness now: a fixed level as it is, `auto` by the clock in TV mode and 1 outside it
 */
export function dimLevel({ mode, hours, tv }) {
    if (mode !== 'auto') {
        return mode;
    }
    return tv ? autoDimAt(hours) : 1;
}

/**
 * @typedef {object} NightDimDeps
 * @property {() => number} now wall time in ms since the epoch (`Date.now`)
 * @property {() => 'auto' | number} getMode the setting: the URL's, else the preference
 * @property {() => boolean} isTv whether TV mode is on
 * @property {(level: number) => void} apply sets the brightness, 0.3 to 1
 */

/**
 * @param {NightDimDeps} deps the injected parts
 * @returns {{tick: () => void, level: () => number}} `tick` reads the clock at most every `DIM_READ_MS` (at once when
 *   the setting or TV mode changed) and applies a level that moved; nothing is allocated unless it reads the clock
 */
export function createNightDim({ now, getMode, isTv, apply }) {
    const last = { at: -Infinity, mode: /** @type {'auto' | number | null} */ (null), tv: false, level: 1 };
    return {
        level: () => last.level,
        tick() {
            const mode = getMode();
            const tv = isTv();
            const wall = now();
            if (mode === last.mode && tv === last.tv && Math.abs(wall - last.at) < DIM_READ_MS) {
                return;
            }
            last.at = wall;
            last.mode = mode;
            last.tv = tv;
            const date = new Date(wall);
            const level = dimLevel({ mode, hours: date.getHours() + date.getMinutes() / 60, tv });
            if (Math.abs(level - last.level) >= DIM_STEP || (level === 1 && last.level !== 1)) {
                last.level = level;
                apply(level);
            }
        },
    };
}
