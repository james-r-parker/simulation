// Preferences kept in `localStorage`: the lenses, the HUD, the director, audio, volume and the wake lock. Over an
// injected storage with every access in `try`/`catch`: a missing, unparsable or out-of-range value falls back to its
// default and nothing depends on it.

/** The storage key. */
export const PREFS_KEY = 'blobEvolution.prefs.v1';

/** The number of lenses: temperature, scent trails, family territories, vision and calls. */
export const LENS_COUNT = 4;

/**
 * @typedef {object} Prefs
 * @property {boolean[]} lenses which of the four lenses are on
 * @property {boolean} hud whether the HUD shows
 * @property {boolean} director whether the auto-director runs
 * @property {boolean} audio whether sound is on
 * @property {number} volume 0 to 1
 * @property {boolean} wakeLock whether the screen wake lock is requested
 * @property {string | number} uiScale `auto`, 1, 1.25, 1.5 or 2
 * @property {string} palette the family palette: `default`, `cvd-safe` or `high-contrast`
 * @property {boolean} seen whether the title card has been shown
 */

/** The `uiScale` values. */
const UI_SCALES = ['auto', 1, 1.25, 1.5, 2];
/** The `palette` values. */
export const PALETTE_NAMES = Object.freeze(['default', 'cvd-safe', 'high-contrast']);

/** @returns {Prefs} the defaults: no lens, HUD shown, director, audio and wake lock off */
export function defaultPrefs() {
    return {
        lenses: new Array(LENS_COUNT).fill(false),
        hud: true,
        director: false,
        audio: false,
        volume: 0.5,
        wakeLock: false,
        uiScale: 'auto',
        palette: 'default',
        seen: false,
    };
}

/**
 * @param {unknown} value a stored value
 * @param {boolean} fallback the default
 * @returns {boolean} the value when it is a boolean, else the default
 */
function boolOf(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
}

/**
 * @param {unknown} stored a parsed JSON value
 * @returns {Prefs} the preferences it holds, each bad field replaced by its default
 */
export function sanitizePrefs(stored) {
    const base = defaultPrefs();
    if (typeof stored !== 'object' || stored === null) {
        return base;
    }
    const s = /** @type {Record<string, unknown>} */ (stored);
    const lenses = Array.isArray(s.lenses) && s.lenses.length === LENS_COUNT ? s.lenses : base.lenses;
    const volume = typeof s.volume === 'number' && s.volume >= 0 && s.volume <= 1 ? s.volume : base.volume;
    return {
        lenses: lenses.map((on) => on === true),
        hud: boolOf(s.hud, base.hud),
        director: boolOf(s.director, base.director),
        audio: boolOf(s.audio, base.audio),
        volume,
        wakeLock: boolOf(s.wakeLock, base.wakeLock),
        uiScale: UI_SCALES.includes(/** @type {any} */ (s.uiScale)) ? /** @type {any} */ (s.uiScale) : base.uiScale,
        palette: PALETTE_NAMES.includes(/** @type {any} */ (s.palette)) ? /** @type {any} */ (s.palette) : base.palette,
        seen: boolOf(s.seen, base.seen),
    };
}

/**
 * @param {{getItem: (key: string) => string | null} | null} storage the storage, null where there is none
 * @returns {Prefs} the stored preferences, the defaults when there are none or reading throws
 */
export function loadPrefs(storage) {
    try {
        const text = storage?.getItem(PREFS_KEY) ?? null;
        return sanitizePrefs(text === null ? null : JSON.parse(text));
    } catch {
        return defaultPrefs();
    }
}

/**
 * @param {{setItem: (key: string, value: string) => void} | null} storage the storage, null where there is none
 * @param {Prefs} prefs what to keep
 * @returns {boolean} whether it was written; a refusing storage returns false
 */
export function savePrefs(storage, prefs) {
    try {
        storage?.setItem(PREFS_KEY, JSON.stringify(prefs));
        return storage !== null;
    } catch {
        return false;
    }
}
