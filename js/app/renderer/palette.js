// The crisp neon palette: every colour role as a display RGB value (0 to 1, written straight to the canvas with no
// colour management), and `toDisplay`, which turns the linear, over-1 colours of the kept colour modules into the same
// neon lightness at their own hue. Pure.

/** HSL lightness every converted colour is lifted to, and the saturation it is capped at (vivid, not candy). */
export const NEON_LIGHTNESS = 0.62;
export const MAX_SATURATION = 0.72;
/** Rim width in device pixels, by palette. */
export const RIM_PX = Object.freeze({ default: 1.5, 'cvd-safe': 1.5, 'high-contrast': 2.5 });
/** The share of the rim colour a part's flat fill takes, by palette. */
export const FILL_SHARE = Object.freeze({ default: 0.18, 'cvd-safe': 0.18, 'high-contrast': 0.3 });
/** The fill share of an agent at zero energy; full energy fills at `FILL_SHARE`. */
export const FILL_FLOOR = 0.1;

/**
 * @param {number} hex a 24-bit colour
 * @returns {readonly number[]} its display RGB in 0 to 1
 */
function rgb(hex) {
    return Object.freeze([((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]);
}

/** Every fixed role as display RGB. */
export const NEON = Object.freeze({
    background: rgb(0x000000),
    hunter: rgb(0xff3b5c),
    forager: rgb(0x39ff9c),
    reproducer: rgb(0xff5cf0),
    scout: rgb(0x3bd5ff),
    defender: rgb(0xffb43b),
    meat: rgb(0xff4d3b),
    rot: rgb(0x7a5a3b),
    toxic: rgb(0xd4ff3b),
    fungus: rgb(0xc89bff),
    rock: rgb(0x5a6b80),
    frost: rgb(0xbfe8ff),
    heat: rgb(0xff8a3b),
    leaf: rgb(0xffb03b),
    alarm: rgb(0xffe23b),
    huntCall: rgb(0xff9a3b),
    court: rgb(0xff7ad9),
    infected: rgb(0x9bffe0),
    dust: rgb(0xa08a6a),
    select: rgb(0xffffff),
    bite: rgb(0xff2a2a),
    birth: rgb(0xfff2a8),
    pollen: rgb(0xfff07a),
    bone: rgb(0xe8e0d0),
});

/** The rim role of each specialisation name; an unknown name takes `forager`. */
export const SPEC_ROLE = Object.freeze({
    predator: 'hunter',
    forager: 'forager',
    reproducer: 'reproducer',
    scout: 'scout',
    defender: 'defender',
});

/**
 * @param {keyof typeof NEON} role a palette role
 * @param {number[] | Float32Array} [out] receives the display RGB
 * @returns {number[] | Float32Array} `out`
 * @throws {Error} on an unknown role, so a typo fails loudly
 */
export function roleColor(role, out = [0, 0, 0]) {
    const c = NEON[role];
    if (c === undefined) {
        throw new Error(`roleColor: unknown role ${String(role)}`);
    }
    out[0] = c[0];
    out[1] = c[1];
    out[2] = c[2];
    return out;
}

/**
 * @param {number} v a linear channel in 0 to 1
 * @returns {number} its sRGB encoding
 */
function encode(v) {
    return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

/**
 * @param {number} p HSL helper term
 * @param {number} q HSL helper term
 * @param {number} t hue term
 * @returns {number} one channel
 */
function hueChannel(p, q, t) {
    const h = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (h < 1 / 6) {
        return p + (q - p) * 6 * h;
    }
    if (h < 1 / 2) {
        return q;
    }
    return h < 2 / 3 ? p + (q - p) * (2 / 3 - h) * 6 : p;
}

const HSL = [0, 0, 0];

/**
 * @param {number[] | Float32Array} c display RGB in 0 to 1
 * @returns {number[]} the shared HSL scratch: hue 0 to 1, saturation, lightness
 */
function toHsl(c) {
    const max = Math.max(c[0], c[1], c[2]);
    const min = Math.min(c[0], c[1], c[2]);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) {
        HSL[0] = 0;
        HSL[1] = 0;
        HSL[2] = l;
        return HSL;
    }
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h =
        max === c[0]
            ? (c[1] - c[2]) / d + (c[1] < c[2] ? 6 : 0)
            : max === c[1]
              ? (c[2] - c[0]) / d + 2
              : (c[0] - c[1]) / d + 4;
    h /= 6;
    HSL[0] = h;
    HSL[1] = s;
    HSL[2] = l;
    return HSL;
}

/**
 * Turns a linear colour of any scale (the kept modules return values over 1, meant for the deleted bloom) into a
 * display value at `NEON_LIGHTNESS`: normalised to its largest channel, sRGB-encoded, then lifted to the neon lightness
 * at the same hue and saturation. Black stays black.
 * @param {ArrayLike<number>} linear a linear RGB triple, any non-negative scale
 * @param {number[] | Float32Array} [out] receives the display RGB in 0 to 1; may be `linear` itself
 * @param {number} [lightness] the HSL lightness to lift to
 * @returns {number[] | Float32Array} `out`
 */
export function toDisplay(linear, out = [0, 0, 0], lightness = NEON_LIGHTNESS) {
    const max = Math.max(linear[0], linear[1], linear[2]);
    if (!(max > 0)) {
        out[0] = 0;
        out[1] = 0;
        out[2] = 0;
        return out;
    }
    out[0] = encode(linear[0] / max);
    out[1] = encode(linear[1] / max);
    out[2] = encode(linear[2] / max);
    toHsl(out);
    const h = HSL[0];
    const s = Math.min(HSL[1], MAX_SATURATION);
    const q = lightness < 0.5 ? lightness * (1 + s) : lightness + s - lightness * s;
    const p = 2 * lightness - q;
    out[0] = hueChannel(p, q, h + 1 / 3);
    out[1] = hueChannel(p, q, h);
    out[2] = hueChannel(p, q, h - 1 / 3);
    return out;
}
