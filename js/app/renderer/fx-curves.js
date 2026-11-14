// The keyframe tables of the effect pool: each curve names a shape, a motion, an ease and four scale and four alpha keys.
// `packFx` in fx-pack.js evaluates the table per live instance; `curveAt` is the same evaluation, used by the demo.

/** The particle shapes (one model each in models-particles.js), by index. */
export const FX_SHAPES = Object.freeze([
    'RING',
    'STREAK',
    'CRESCENT',
    'SHARD',
    'MOTE',
    'DROP',
    'PUFF',
    'CHEVRON',
    'ARC',
    'ORBIT',
    'SPORE',
    'SPARKLE',
    'CRUMB',
    'SPROUT',
    'FISSION',
    'GHOST',
]);

/** How an instance moves over its life, by index. */
export const FX_MOTIONS = Object.freeze(['fixed', 'out', 'in', 'rise', 'fall', 'orbit']);

/** The easing applied to age before the keys are sampled, by index. */
export const FX_EASE = Object.freeze(['linear', 'quadIn', 'quadOut', 'sineInOut', 'expoIn', 'backOut', 'elasticOut']);

/** A curve flag: the calls lens multiplies its alpha. */
export const FLAG_CALL = 1;

/**
 * @typedef {object} FxCurve
 * @property {string} name
 * @property {string} shape an `FX_SHAPES` name
 * @property {string} motion an `FX_MOTIONS` name
 * @property {string} ease an `FX_EASE` name
 * @property {readonly number[]} scale four keys at ages 0, 1/3, 2/3 and 1 (after easing)
 * @property {readonly number[]} alpha four keys; above 1 lifts the colour over the bloom threshold
 * @property {number} flags `FLAG_CALL` or 0
 */

/**
 * @param {string} name the curve name
 * @param {[string, string, string, number?]} how shape, motion, ease and optional curve flags
 * @param {readonly number[]} scale four scale keys
 * @param {readonly number[]} alpha four alpha keys
 * @returns {Readonly<FxCurve>} the curve
 */
function curve(name, [shape, motion, ease, flags = 0], scale, alpha) {
    return Object.freeze({
        name,
        shape,
        motion,
        ease,
        scale: Object.freeze(scale),
        alpha: Object.freeze(alpha),
        flags,
    });
}

/** Every curve; an instance names one by index. */
export const FX_CURVES = Object.freeze([
    curve('streak', ['STREAK', 'out', 'quadOut'], [1, 0.8, 0.5, 0.2], [1.8, 1.2, 0.6, 0]),
    curve('crescent', ['CRESCENT', 'fixed', 'quadIn'], [1, 1, 0.95, 0.9], [2, 1.2, 0.6, 0]),
    curve('shard', ['SHARD', 'out', 'quadOut'], [1, 0.8, 0.6, 0.3], [1.6, 1, 0.5, 0]),
    curve('flash', ['MOTE', 'fixed', 'linear'], [0.6, 0.75, 0.9, 1], [1.4, 0.9, 0.4, 0]),
    curve('ghost', ['GHOST', 'fixed', 'expoIn'], [1, 0.8, 0.5, 0], [0.9, 0.7, 0.4, 0]),
    curve('ghostSink', ['GHOST', 'fall', 'sineInOut'], [1, 0.85, 0.7, 0.6], [0.7, 0.5, 0.25, 0]),
    curve('ghostRise', ['GHOST', 'rise', 'sineInOut'], [1, 0.9, 0.8, 0.7], [0.8, 0.6, 0.3, 0]),
    curve('ghostFlat', ['GHOST', 'fixed', 'quadOut'], [1, 0.9, 0.8, 0.7], [0.9, 0.6, 0.3, 0]),
    curve('moteOut', ['MOTE', 'out', 'quadOut'], [1, 0.9, 0.7, 0.4], [1.2, 0.9, 0.5, 0]),
    curve('moteFall', ['MOTE', 'fall', 'linear'], [1, 0.9, 0.7, 0.5], [0.9, 0.7, 0.4, 0]),
    curve('moteRise', ['MOTE', 'rise', 'sineInOut'], [0.6, 1, 0.9, 0.6], [0.4, 0.9, 0.6, 0]),
    curve('drop', ['DROP', 'rise', 'quadOut'], [0.6, 1, 1.1, 1.3], [1.3, 1, 0.7, 0]),
    curve('spore', ['SPORE', 'out', 'sineInOut'], [0.8, 1, 1, 0.9], [1, 0.8, 0.5, 0]),
    curve('puffRing', ['PUFF', 'fixed', 'quadOut'], [0.4, 0.9, 1.1, 1.2], [1, 0.7, 0.4, 0]),
    curve('puffOut', ['PUFF', 'out', 'quadOut'], [0.5, 0.9, 1.1, 1.2], [0.9, 0.6, 0.3, 0]),
    curve('ring', ['RING', 'fixed', 'quadOut'], [0.05, 0.6, 0.85, 1], [1.4, 0.8, 0.35, 0]),
    curve('ringSlow', ['RING', 'fixed', 'sineInOut'], [0.1, 0.55, 0.85, 1], [1, 0.7, 0.4, 0]),
    curve('callRing', ['RING', 'fixed', 'quadOut', FLAG_CALL], [0.05, 0.6, 0.85, 1], [0.35, 0.2, 0.08, 0]),
    curve('chevron', ['CHEVRON', 'fixed', 'quadOut', FLAG_CALL], [0.05, 0.55, 0.85, 1], [0.6, 0.4, 0.15, 0]),
    curve('arc', ['ARC', 'out', 'quadOut', FLAG_CALL], [0.3, 0.6, 0.8, 1], [0.7, 0.5, 0.2, 0]),
    curve('huntPulse', ['RING', 'fixed', 'linear', FLAG_CALL], [0.25, 0.6, 0.25, 0.6], [0.35, 0.25, 0.2, 0]),
    curve('crumbIn', ['CRUMB', 'in', 'quadOut'], [1, 0.9, 0.7, 0.4], [1.2, 1, 0.7, 0]),
    curve('crumbStay', ['CRUMB', 'fixed', 'linear'], [1, 1, 0.9, 0.8], [0.8, 0.6, 0.4, 0]),
    curve('pip', ['SPARKLE', 'fixed', 'linear'], [0.8, 1.1, 0.8, 1.1], [1.4, 0.2, 1.4, 0]),
    curve('orbit', ['ORBIT', 'orbit', 'sineInOut'], [0.8, 1, 1, 0.6], [1.2, 1, 0.6, 0]),
    curve('sparkle', ['SPARKLE', 'rise', 'quadOut'], [0.4, 1, 0.8, 0.3], [1.6, 1.2, 0.6, 0]),
    curve('fission', ['FISSION', 'fixed', 'quadOut'], [1, 1, 1, 0.9], [1.2, 1, 0.6, 0]),
    curve('arrive', ['MOTE', 'in', 'quadIn'], [0.8, 0.9, 1, 0.6], [0.8, 1, 1, 0]),
    curve('sprout', ['SPROUT', 'fixed', 'backOut'], [0.2, 0.8, 1, 1], [0.8, 1, 0.8, 0]),
    curve('dust', ['PUFF', 'out', 'quadOut'], [0.5, 0.9, 1.1, 1.2], [0.7, 0.5, 0.3, 0]),
    curve('flake', ['SPARKLE', 'fall', 'linear'], [1, 1, 1, 1], [0, 0.6, 0.6, 0]),
]);

/** Curve index by name. */
export const CURVE = Object.freeze(Object.fromEntries(FX_CURVES.map((c, i) => [c.name, i])));

const BACK = 1.70158;

/**
 * @param {number} t age, 0 to 1
 * @param {number} id an `FX_EASE` index
 * @returns {number} the eased age
 */
export function easeAt(t, id) {
    switch (id) {
        case 1:
            return t * t;
        case 2:
            return 1 - (1 - t) * (1 - t);
        case 3:
            return 0.5 - 0.5 * Math.cos(Math.PI * t);
        case 4:
            return t <= 0 ? 0 : Math.pow(2, 10 * t - 10);
        case 5:
            return 1 + (BACK + 1) * Math.pow(t - 1, 3) + BACK * Math.pow(t - 1, 2);
        case 6:
            return t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
        default:
            return t;
    }
}

/**
 * @param {readonly number[]} keys four keys at 0, 1/3, 2/3 and 1
 * @param {number} t the eased age
 * @returns {number} the keyed value, linear between keys
 */
export function keysAt(keys, t) {
    const s = Math.min(Math.max(t, 0), 1) * 3;
    const k = Math.min(Math.floor(s), 2);
    return keys[k] + (keys[k + 1] - keys[k]) * (s - k);
}

/**
 * @param {Readonly<FxCurve>} c a curve
 * @param {number} age 0 to 1
 * @param {{scale: number, alpha: number, t: number}} out receives the eased age and the keyed scale and alpha
 * @returns {{scale: number, alpha: number, t: number}} `out`
 */
export function curveAt(c, age, out) {
    out.t = easeAt(age, FX_EASE.indexOf(c.ease));
    out.scale = keysAt(c.scale, out.t);
    out.alpha = keysAt(c.alpha, out.t);
    return out;
}
