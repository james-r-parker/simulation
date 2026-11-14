// Turns one catalogue model (`models.js`) into one TSL node material. The vertex node places a unit quad at the
// instance's centre, turned to its heading and sized to cover the model under every clip. The fragment node undoes the
// body rig, evaluates every part's signed distance under its bound channel, and paints flat fills and rims back to
// front with one-pixel analytic coverage, so edges are crisp at any zoom and nothing is blurred.

import { MeshBasicNodeMaterial } from 'three/webgpu';
import { cos, float, fwidth, max, min, mix, positionGeometry, sin, varying, vec2, vec3 } from 'three/tsl';
import { JAW_OPEN, modelBounds } from './models.js';
import { NEON } from './palette.js';
import { coverage, rimCoverage, sdArc, sdBlob, sdBox, sdCircle, sdDots, sdPoly, sdRing, sdSegment } from './sdf.js';

/**
 * The instance inputs a material reads, as TSL nodes (attributes, uniforms or constants).
 * @typedef {object} ModelInputs
 * @property {any} center vec2 world position
 * @property {any} angle float heading, radians
 * @property {any} radius float world radius (one model unit)
 * @property {any} color vec3 display colour of `body` parts
 * @property {any} [fill] float fill share of `shape` parts (the look's `FILL_SHARE` when absent)
 * @property {any[] | null} [rig] three vec4: `tx ty rot sx`, `sy open eye flash`, `ring ringAlpha limb head`
 * @property {Record<string, any>} [values] float inputs named by gates and bound parameters
 * @property {Record<string, any>} [colors] vec3 inputs named by `{in}` colours
 * @property {{amp: any, phase: any}} [blob] vec3 harmonics for a `blob` part
 * @property {any} [dim] float the final colour is multiplied by (a lens dims the layer)
 * @property {any} [ringFloor] float the least opacity of a `ring`-bound part (the calls lens raises it)
 */

/**
 * @typedef {object} Rig
 * @property {any} tx
 * @property {any} ty
 * @property {any} rot
 * @property {any} sx
 * @property {any} sy
 * @property {any} open
 * @property {any} eye
 * @property {any} flash
 * @property {any} ring
 * @property {any} ringAlpha
 * @property {any} limb
 * @property {any} head
 */

/** @param {any[] | null | undefined} rig the rig vec4 nodes @returns {Rig} each channel as a float node */
function rigChannels(rig) {
    if (!rig) {
        const [zero, one] = [float(0), float(1)];
        return {
            tx: zero,
            ty: zero,
            rot: zero,
            sx: one,
            sy: one,
            open: zero,
            eye: one,
            flash: zero,
            ring: one,
            ringAlpha: one,
            limb: zero,
            head: zero,
        };
    }
    const [a, b, c] = rig.map((r) => varying(r));
    return {
        tx: a.x,
        ty: a.y,
        rot: a.z,
        sx: a.w,
        sy: b.x,
        open: b.y,
        eye: b.z,
        flash: b.w,
        ring: c.x,
        ringAlpha: c.y,
        limb: c.z,
        head: c.w,
    };
}

/** @param {any} p vec2 @param {any} angle float @returns {any} p turned by angle */
function turn(p, angle) {
    const c = cos(angle);
    const s = sin(angle);
    return vec2(p.x.mul(c).sub(p.y.mul(s)), p.x.mul(s).add(p.y.mul(c)));
}

/** @param {any} value a number, a node or `{in, mul}` @param {ModelInputs} inputs the inputs @returns {any} a float node */
function param(value, inputs) {
    if (value !== null && typeof value === 'object' && 'in' in value) {
        const node = inputs.values?.[value.in];
        if (node === undefined) {
            throw new Error(`modelMaterial: no input named ${value.in}`);
        }
        return node.mul(value.mul ?? 1);
    }
    return value;
}

/** Each primitive's distance: `(point, part, param)`, where `param` resolves a number, node or `{in, mul}`. */
const DISTANCES = Object.freeze({
    circle: (/** @type {any} */ p, /** @type {any} */ part, /** @type {any} */ v) => sdCircle(p, v(part.r)),
    ring: (/** @type {any} */ p, /** @type {any} */ part, /** @type {any} */ v) =>
        sdRing(p, { radius: v(part.r), width: v(part.width), dashes: part.dashes ?? 0 }),
    box: (/** @type {any} */ p, /** @type {any} */ part, /** @type {any} */ v) =>
        sdBox(p, { hx: v(part.hx), hy: v(part.hy), corner: v(part.corner ?? 0) }),
    poly: (/** @type {any} */ p, /** @type {any} */ part) => sdPoly(p, part.points),
    segment: (/** @type {any} */ p, /** @type {any} */ part, /** @type {any} */ v) =>
        sdSegment(p, { a: part.a, b: part.b, width: v(part.width) }),
    arc: (/** @type {any} */ p, /** @type {any} */ part, /** @type {any} */ v) =>
        sdArc(p, { radius: v(part.r), width: v(part.width), start: v(part.start), sweep: v(part.sweep) }),
    dots: (/** @type {any} */ p, /** @type {any} */ part, /** @type {any} */ v) =>
        sdDots(p, { radius: v(part.r), count: part.count, ring: v(part.ring), phase: part.phase ?? 0 }),
});

/** @param {any} p local point @param {Record<string, any>} part the part @param {ModelInputs} inputs @returns {any} distance */
function partDistance(p, part, inputs) {
    if (part.shape === 'blob') {
        if (inputs.blob === undefined) {
            throw new Error('modelMaterial: a blob part needs inputs.blob');
        }
        return sdBlob(p, inputs.blob);
    }
    const distance = /** @type {Record<string, (p: any, part: any, v: (x: any) => any) => any>} */ (DISTANCES)[
        part.shape
    ];
    return distance(p, part, (x) => param(x, inputs));
}

/** Each bind's move of the point `q` about the part's `pivot`, as `{p, scale}`. */
const BIND_MOVES = Object.freeze({
    jawUp: (/** @type {any} */ q, /** @type {any} */ pivot, /** @type {Rig} */ rig) =>
        turn(q.sub(pivot), rig.open.mul(-JAW_OPEN)).add(pivot),
    jawDown: (/** @type {any} */ q, /** @type {any} */ pivot, /** @type {Rig} */ rig) =>
        turn(q.sub(pivot), rig.open.mul(JAW_OPEN)).add(pivot),
    limbA: (/** @type {any} */ q, /** @type {any} */ pivot, /** @type {Rig} */ rig) =>
        turn(q.sub(pivot), rig.limb.negate()).add(pivot),
    limbB: (/** @type {any} */ q, /** @type {any} */ pivot, /** @type {Rig} */ rig) =>
        turn(q.sub(pivot), rig.limb).add(pivot),
    eye: (/** @type {any} */ q, /** @type {any} */ pivot, /** @type {Rig} */ rig) =>
        q.sub(pivot).div(rig.eye).add(pivot),
    ring: (/** @type {any} */ q, /** @type {any} */ pivot, /** @type {Rig} */ rig) => q.div(rig.ring),
    head: (/** @type {any} */ q, /** @type {any} */ pivot, /** @type {Rig} */ rig) => q.sub(vec2(rig.head, 0)),
});

/**
 * Moves the point into the part's own frame under its bound channel.
 * @param {any} p point in the model frame
 * @param {Record<string, any>} part the part
 * @param {Rig} rig the rig channels
 * @returns {{p: any, scale: any}} the local point and the scale distances are multiplied by
 */
function bindPoint(p, part, rig) {
    const at = part.at ?? [0, 0];
    const q = part.at === undefined ? p : p.sub(vec2(at[0], at[1]));
    if (part.bind === undefined) {
        return { p: q, scale: float(1) };
    }
    const pivot = part.pivot === undefined ? vec2(0, 0) : vec2(part.pivot[0] - at[0], part.pivot[1] - at[1]);
    const move = /** @type {Record<string, (q: any, pivot: any, rig: Rig) => any>} */ (BIND_MOVES)[part.bind];
    const scale = part.bind === 'eye' ? rig.eye : part.bind === 'ring' ? rig.ring : float(1);
    return { p: move(q, pivot, rig), scale };
}

/** @param {Record<string, any>} part the part @param {ModelInputs} inputs @returns {any} its vec3 colour */
function partColor(part, inputs) {
    if (part.color === undefined || part.color === 'body') {
        return inputs.color;
    }
    if (typeof part.color === 'object') {
        const node = inputs.colors?.[part.color.in];
        if (node === undefined) {
            throw new Error(`modelMaterial: no colour input named ${part.color.in}`);
        }
        return node;
    }
    const c = /** @type {Record<string, readonly number[]>} */ (NEON)[part.color];
    return vec3(c[0], c[1], c[2]);
}

/**
 * Paints one layer over the accumulated colour: `rgb` mixes towards the layer's colour by its alpha, `a` gathers.
 * @param {{rgb: any, a: any}} acc the accumulated colour
 * @param {any} color vec3
 * @param {any} alpha float
 * @returns {{rgb: any, a: any}} the new accumulation
 */
function over(acc, color, alpha) {
    return { rgb: mix(acc.rgb, color, alpha), a: acc.a.add(alpha.mul(acc.a.oneMinus())) };
}

/**
 * @param {{rgb: any, a: any}} acc the accumulated colour
 * @param {Record<string, any>} part the part
 * @param {{p: any, px: any, rig: Rig, inputs: ModelInputs, look: {rimPx: number, fillShare: number}}} at the model point, the pixel size, the rig, the inputs and the look
 * @returns {{rgb: any, a: any}} the accumulation with the part painted
 */
function paintPart(acc, part, { p, px, rig, inputs, look }) {
    const bound = bindPoint(p, part, rig);
    const d = partDistance(bound.p, part, inputs).mul(bound.scale);
    let gate = part.gate === undefined ? float(1) : inputs.values?.[part.gate];
    if (gate === undefined) {
        throw new Error(`modelMaterial: no gate input named ${part.gate}`);
    }
    if (part.bind === 'ring') {
        gate = gate.mul(inputs.ringFloor === undefined ? rig.ringAlpha : max(rig.ringAlpha, inputs.ringFloor));
    }
    const color = partColor(part, inputs);
    const style = part.style ?? 'shape';
    let out = acc;
    if (style === 'solid') {
        return over(out, color, coverage(d, px).mul(gate));
    }
    if (style === 'shape') {
        out = over(out, color.mul(inputs.fill ?? look.fillShare), coverage(d, px).mul(gate));
    }
    return over(out, color, rimCoverage(d, look.rimPx, px).mul(gate));
}

/**
 * @param {{name: string, parts: readonly Record<string, any>[]}} model a catalogue model
 * @param {{inputs: ModelInputs, look: {rimPx: number, fillShare: number}, flash?: number}} options the instance inputs,
 *   the rim width in px and fill share, and how far the `flash` channel lifts the body towards white (default 0.6)
 * @returns {any} a transparent `MeshBasicNodeMaterial` with depth test and write off
 * @throws {Error} when a part names an input the options do not give
 */
export function modelMaterial(model, { inputs, look, flash = 0.6 }) {
    const bound = modelBounds(model);
    const corner = positionGeometry.xy;
    const rig = rigChannels(inputs.rig);
    const material = new MeshBasicNodeMaterial();
    material.transparent = true;
    material.depthTest = false;
    material.depthWrite = false;
    material.positionNode = vec3(turn(corner.mul(inputs.radius.mul(bound)), inputs.angle).add(inputs.center), 0);
    const raw = varying(corner.mul(bound));
    const spread = max(fwidth(raw.x), fwidth(raw.y));
    const local = turn(raw.sub(vec2(rig.tx, rig.ty)), rig.rot.negate()).div(vec2(rig.sx, rig.sy));
    const px = spread.div(min(rig.sx, rig.sy));
    let acc = { rgb: vec3(0, 0, 0), a: float(0) };
    for (const part of model.parts) {
        acc = paintPart(acc, part, { p: local, px, rig, inputs, look });
    }
    const lit = mix(acc.rgb, vec3(1, 1, 1), min(rig.flash.mul(flash), 1));
    material.colorNode = inputs.dim === undefined ? lit : lit.mul(inputs.dim);
    material.opacityNode = acc.a;
    material.alphaTest = 0.002;
    material.premultipliedAlpha = true;
    return material;
}
