// The signed distance primitives every model part is built from, in plain JS: the reference the TSL versions in `sdf.js`
// mirror, and what tests and picking use. Distances are in model units (body radius 1), negative inside. Pure.

const TAU = Math.PI * 2;

/** @param {number} x @param {number} y @param {number} r radius @returns {number} distance to a disc */
export function sdCircle(x, y, r) {
    return Math.hypot(x, y) - r;
}

/**
 * @param {number} x
 * @param {number} y
 * @param {{radius: number, width: number, dashes?: number}} ring a ring of `width` centred on `radius`; `dashes` > 0
 *   cuts it into that many dashes with equal gaps
 * @returns {number} distance to the ring
 */
export function sdRing(x, y, { radius, width, dashes = 0 }) {
    const band = Math.abs(Math.hypot(x, y) - radius) - width / 2;
    if (dashes <= 0) {
        return band;
    }
    const cell = ((((Math.atan2(y, x) / TAU) * dashes) % 1) + 1) % 1;
    const along = (Math.abs(cell - 0.5) - 0.25) * ((TAU * radius) / dashes);
    return Math.max(band, along);
}

/**
 * @param {number} x
 * @param {number} y
 * @param {{hx: number, hy: number, corner?: number}} box half sizes and corner radius
 * @returns {number} distance to a rounded box
 */
export function sdBox(x, y, { hx, hy, corner = 0 }) {
    const qx = Math.abs(x) - (hx - corner);
    const qy = Math.abs(y) - (hy - corner);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - corner;
}

/**
 * @param {number} x
 * @param {number} y
 * @param {{a: readonly number[], b: readonly number[], width: number}} seg the end points and the stroke width
 * @returns {number} distance to a capsule stroke
 */
export function sdSegment(x, y, { a, b, width }) {
    const pax = x - a[0];
    const pay = y - a[1];
    const bax = b[0] - a[0];
    const bay = b[1] - a[1];
    const len2 = bax * bax + bay * bay;
    const h = len2 > 0 ? Math.min(Math.max((pax * bax + pay * bay) / len2, 0), 1) : 0;
    return Math.hypot(pax - bax * h, pay - bay * h) - width / 2;
}

/**
 * @param {number} x
 * @param {number} y
 * @param {readonly (readonly number[])[]} points the polygon's vertices in order (3 to 8)
 * @returns {number} distance to the polygon (any simple polygon, convex or not)
 */
export function sdPoly(x, y, points) {
    const n = points.length;
    let d = Infinity;
    let s = 1;
    for (let i = 0, j = n - 1; i < n; j = i, i++) {
        const [ix, iy] = points[i];
        const [jx, jy] = points[j];
        const ex = jx - ix;
        const ey = jy - iy;
        const wx = x - ix;
        const wy = y - iy;
        const h = Math.min(Math.max((wx * ex + wy * ey) / (ex * ex + ey * ey), 0), 1);
        d = Math.min(d, Math.hypot(wx - ex * h, wy - ey * h));
        const c1 = y >= iy;
        const c2 = y < jy;
        const c3 = ex * wy > ey * wx;
        if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) {
            s = -s;
        }
    }
    return s * d;
}

/**
 * @param {number} x
 * @param {number} y
 * @param {{radius: number, width: number, start: number, sweep: number}} arc a ring stroke from angle `start`
 *   (radians, 0 along +x, counter-clockwise) through `sweep`, with round caps
 * @returns {number} distance to the arc; a sweep of 0 or less draws nothing (+Infinity)
 */
export function sdArc(x, y, { radius, width, start, sweep }) {
    if (sweep <= 0) {
        return Infinity;
    }
    const half = Math.min(sweep, TAU) / 2;
    const mid = start + half;
    // rotate so the arc's middle points along +y
    const c = Math.cos(Math.PI / 2 - mid);
    const s = Math.sin(Math.PI / 2 - mid);
    const px = Math.abs(x * c - y * s);
    const py = x * s + y * c;
    const sx = Math.sin(half);
    const sy = Math.cos(half);
    const inside = sy * px > sx * py;
    const d = inside ? Math.hypot(px - sx * radius, py - sy * radius) : Math.abs(Math.hypot(px, py) - radius);
    return d - width / 2;
}

/**
 * @param {number} x
 * @param {number} y
 * @param {{radius: number, count: number, ring: number, phase?: number}} dots `count` discs of `radius` evenly round a
 *   circle of radius `ring`, the first at angle `phase`
 * @returns {number} distance to the nearest disc
 */
export function sdDots(x, y, { radius, count, ring, phase = 0 }) {
    const sector = TAU / count;
    const a = Math.atan2(y, x) - phase;
    const local = ((((a + sector / 2) % sector) + sector) % sector) - sector / 2;
    const r = Math.hypot(x, y);
    return Math.hypot(r * Math.cos(local) - ring, r * Math.sin(local)) - radius;
}

/**
 * @param {number} d a signed distance
 * @param {number} px the size of one device pixel in the same units
 * @returns {number} the share of the pixel inside the shape: 0.5 on the edge, 0 and 1 a pixel away
 */
export function coverage(d, px) {
    const t = Math.min(Math.max((px / 2 - d) / px, 0), 1);
    return t * t * (3 - 2 * t);
}

/**
 * @param {number} d a signed distance
 * @param {number} rimPx the rim width in device pixels
 * @param {number} px the size of one device pixel in the same units
 * @returns {number} the share of the pixel the rim covers; the rim is centred on the edge
 */
export function rimCoverage(d, rimPx, px) {
    return coverage(Math.abs(d) - (rimPx * px) / 2, px);
}

/**
 * @param {number} x
 * @param {number} y
 * @param {ArrayLike<number>} shape a `rockShape` (amplitudes 0 to 2, phases 3 to 5)
 * @returns {number} the approximate distance to the rock outline of `rockOutline` at radius 1 (exact on the outline,
 *   scaled by 0.9 elsewhere so the harmonics never overshoot)
 */
export function sdBlob(x, y, shape) {
    const a = Math.atan2(y, x);
    const h =
        shape[0] * Math.sin(2 * a + shape[3]) +
        shape[1] * Math.sin(3 * a + shape[4]) +
        shape[2] * Math.sin(5 * a + shape[5]);
    return (Math.hypot(x, y) - (1 - 0.12 * (0.5 + 0.5 * h))) * 0.9;
}

/**
 * @param {number} x
 * @param {number} y
 * @param {{rx: number, ry: number, amp: number, lobes: number, phase: number}} cell a cell membrane: an ellipse of half
 *   axes `rx`, `ry` whose outline ripples by `amp` (a share of the radius) in `lobes` waves, turned by `phase`
 * @returns {number} the approximate distance to the membrane (exact on a still circle, scaled by 0.9 elsewhere)
 */
export function sdMembrane(x, y, { rx, ry, amp, lobes, phase }) {
    const qx = x / rx;
    const qy = y / ry;
    const ripple = amp * Math.sin(lobes * Math.atan2(qy, qx) + phase);
    return (Math.hypot(qx, qy) - 1 - ripple) * Math.min(rx, ry) * 0.9;
}

/**
 * @param {number} x
 * @param {number} y
 * @param {{from: number, to: number, amp: number, freq: number, phase: number, width: number}} whip a flagellum along
 *   the x axis from `from` (the root) to `to` (the tip): a sine of `freq` radians per unit, swinging up to `amp` at the
 *   tip and 0 at the root, moved along by `phase`
 * @returns {number} the approximate distance to the stroke
 */
export function sdWave(x, y, { from, to, amp, freq, phase, width }) {
    const t = Math.min(Math.max((x - from) / (to - from), 0), 1);
    const ax = from + (to - from) * t;
    const ay = amp * t * Math.sin(freq * Math.abs(ax - from) - phase);
    return Math.hypot(x - ax, y - ay) * 0.8 - width / 2;
}
