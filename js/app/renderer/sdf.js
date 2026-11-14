// The signed distance primitives of `sdf-math.js` as TSL nodes, for the model materials. Each takes the point as a
// `vec2` node and its parameters as numbers or float nodes, so a part can bind a parameter to an instance value. The
// polygon is unrolled at build time because its vertices are constant per part.

import { abs, atan, clamp, cos, dot, float, fract, length, max, min, select, sin, smoothstep, vec2 } from 'three/tsl';

const TAU = Math.PI * 2;

/** @param {any} p point @param {any} r radius @returns {any} distance to a disc */
export function sdCircle(p, r) {
    return length(p).sub(r);
}

/** @param {any} p point @param {{radius: any, width: any, dashes?: number}} ring the ring @returns {any} distance */
export function sdRing(p, { radius, width, dashes = 0 }) {
    const band = abs(length(p).sub(radius)).sub(float(width).mul(0.5));
    if (dashes <= 0) {
        return band;
    }
    const cell = fract(atan(p.y, p.x).div(TAU).mul(dashes));
    const along = abs(cell.sub(0.5))
        .sub(0.25)
        .mul(float(radius).mul(TAU / dashes));
    return max(band, along);
}

/** @param {any} p point @param {{hx: any, hy: any, corner?: any}} box the box @returns {any} distance */
export function sdBox(p, { hx, hy, corner = 0 }) {
    const q = abs(p).sub(vec2(float(hx).sub(corner), float(hy).sub(corner)));
    return length(max(q, 0))
        .add(min(max(q.x, q.y), 0))
        .sub(corner);
}

/** @param {any} p point @param {{a: readonly number[] | any, b: readonly number[] | any, width: any}} seg the stroke @returns {any} distance */
export function sdSegment(p, { a, b, width }) {
    const av = Array.isArray(a) ? vec2(a[0], a[1]) : a;
    const bv = Array.isArray(b) ? vec2(b[0], b[1]) : b;
    const pa = p.sub(av);
    const ba = bv.sub(av);
    const h = clamp(dot(pa, ba).div(max(dot(ba, ba), 1e-8)), 0, 1);
    return length(pa.sub(ba.mul(h))).sub(float(width).mul(0.5));
}

/** @param {any} p point @param {readonly (readonly number[])[]} points the vertices (3 to 8) @returns {any} distance */
export function sdPoly(p, points) {
    const n = points.length;
    let d = /** @type {any} */ (null);
    let s = /** @type {any} */ (float(1));
    for (let i = 0, j = n - 1; i < n; j = i, i++) {
        const vi = vec2(points[i][0], points[i][1]);
        const e = vec2(points[j][0] - points[i][0], points[j][1] - points[i][1]);
        const w = p.sub(vi);
        const h = clamp(dot(w, e).div(dot(e, e)), 0, 1);
        const dist = length(w.sub(e.mul(h)));
        d = d === null ? dist : min(d, dist);
        const c1 = p.y.greaterThanEqual(points[i][1]);
        const c2 = p.y.lessThan(points[j][1]);
        const c3 = e.x.mul(w.y).greaterThan(e.y.mul(w.x));
        const flip = c1.and(c2).and(c3).or(c1.not().and(c2.not()).and(c3.not()));
        s = select(flip, s.negate(), s);
    }
    return s.mul(d);
}

/** @param {any} p point @param {{radius: any, width: any, start: any, sweep: any}} arc the arc @returns {any} distance */
export function sdArc(p, { radius, width, start, sweep }) {
    const half = min(float(sweep), TAU).mul(0.5);
    const turn = float(Math.PI / 2).sub(float(start).add(half));
    const c = cos(turn);
    const s = sin(turn);
    const px = abs(p.x.mul(c).sub(p.y.mul(s)));
    const py = p.x.mul(s).add(p.y.mul(c));
    const sx = sin(half);
    const sy = cos(half);
    const capped = length(vec2(px.sub(sx.mul(radius)), py.sub(sy.mul(radius))));
    const band = abs(length(vec2(px, py)).sub(radius));
    const d = select(sy.mul(px).greaterThan(sx.mul(py)), capped, band).sub(float(width).mul(0.5));
    return select(float(sweep).greaterThan(0), d, float(1e4));
}

/** @param {any} p point @param {{radius: any, count: number, ring: any, phase?: any}} dots the dots @returns {any} distance */
export function sdDots(p, { radius, count, ring, phase = 0 }) {
    const sector = TAU / count;
    const a = atan(p.y, p.x)
        .sub(phase)
        .add(sector / 2);
    const local = a.sub(a.div(sector).floor().mul(sector)).sub(sector / 2);
    const r = length(p);
    return length(vec2(r.mul(cos(local)).sub(ring), r.mul(sin(local)))).sub(radius);
}

/** @param {any} d distance @param {any} px one pixel in the same units @returns {any} the share of the pixel inside */
export function coverage(d, px) {
    return smoothstep(float(px).mul(-0.5), float(px).mul(0.5), d).oneMinus();
}

/** @param {any} d distance @param {any} rimPx rim width in px @param {any} px one pixel @returns {any} rim coverage */
export function rimCoverage(d, rimPx, px) {
    return coverage(abs(d).sub(float(rimPx).mul(px).mul(0.5)), px);
}

/**
 * @param {any} p point
 * @param {{amp: any, phase: any}} shape the rock's harmonic amplitudes (vec3 node) and phases (vec3 node)
 * @returns {any} the approximate distance to the rock outline (`sdBlob` in sdf-math.js)
 */
export function sdBlob(p, { amp, phase }) {
    const a = atan(p.y, p.x);
    const h = amp.x
        .mul(sin(a.mul(2).add(phase.x)))
        .add(amp.y.mul(sin(a.mul(3).add(phase.y))))
        .add(amp.z.mul(sin(a.mul(5).add(phase.z))));
    return length(p)
        .sub(float(1).sub(h.mul(0.5).add(0.5).mul(0.12)))
        .mul(0.9);
}
