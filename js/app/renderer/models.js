// The model catalogue: one vector model per rendered item, each a list of SDF parts (`sdf.js`). Agents face +x and their
// model unit is the body radius. A part may sit at an offset (`at`), turn about a pivot with a rig channel (`bind`),
// take a palette role or an instance input as its colour, draw only while an input is set (`gate`) and bind a
// parameter to an instance input (`{in, mul}`). Pure data plus the bounds and validation helpers.

import { FX_SHAPES } from './fx-curves.js';
import { NEON } from './palette.js';
import {
    FOOD_MODELS,
    HERD_MODEL,
    DEPTH_MODEL,
    MARK_MODELS,
    MOTE_MODELS,
    PATCH_MODEL,
    REFUGE_MODEL,
    ROCK_MODEL,
    ZONE_MODELS,
} from './models-world.js';
import { PARTICLE_MODELS } from './models-particles.js';

/** The most parts a model may have. */
export const MAX_PARTS = 16;
/** The most polygon vertices. */
export const MAX_POINTS = 10;
/** The primitives a part may use. */
export const SHAPES = Object.freeze([
    'circle',
    'ring',
    'box',
    'poly',
    'segment',
    'arc',
    'dots',
    'blob',
    'membrane',
    'wave',
]);
/** The rig channels a part may bind to. */
export const BINDS = Object.freeze(['jawUp', 'jawDown', 'eye', 'ring', 'limbA', 'limbB', 'head']);
/** How a part is painted: rim and flat fill, a solid fill in the full colour, or the rim alone. */
export const STYLES = Object.freeze(['shape', 'solid', 'outline']);
/** The largest scale any clip gives a body, and a call ring. */
export const MAX_BODY_SCALE = 1.5;
export const MAX_RING_SCALE = 1.7;
/** The widest a jaw opens, radians. */
export const JAW_OPEN = 0.6;

const WAVE = { in: 'wave' };

/**
 * @param {Record<string, number>} shape the membrane's half axes, ripple share and lobes
 * @returns {object} the cell membrane, rippling with the agent's wave phase
 */
const membrane = (shape) => ({ name: 'membrane', shape: 'membrane', phase: WAVE, ...shape });

/**
 * @param {number} x where the nucleus sits on the heading axis
 * @param {number} r its radius
 * @returns {object} the nucleus: the organelle the `eye` channel swells and shrinks (juvenile, resting, fleeing)
 */
const nucleus = (x, r) => ({ name: 'nucleus', shape: 'circle', r, at: [x, 0], pivot: [x, 0], bind: 'eye' });

/** Parts every agent model carries, each gated by its state, all thin marks rather than blobs. */
export const SHARED_PARTS = Object.freeze([
    {
        name: 'gestation',
        shape: 'arc',
        r: 0.42,
        width: 0.04,
        start: Math.PI / 2,
        sweep: { in: 'gestation', mul: 2 * Math.PI },
        gate: 'pregnant',
        color: 'court',
        style: 'solid',
    },
    { name: 'sick', shape: 'ring', r: 0.62, width: 0.03, dashes: 6, gate: 'sick', color: 'toxic', style: 'solid' },
    {
        name: 'infected',
        shape: 'ring',
        r: 0.74,
        width: 0.025,
        dashes: 12,
        gate: 'infected',
        color: 'infected',
        style: 'solid',
    },
    {
        name: 'pollen',
        shape: 'dots',
        r: 0.05,
        count: 3,
        ring: 0.16,
        at: [-1.2, 0],
        gate: 'pollen',
        color: { in: 'pollenColor' },
        style: 'solid',
    },
    {
        name: 'callRing',
        shape: 'ring',
        r: 1.4,
        width: 0.035,
        bind: 'ring',
        gate: 'calling',
        color: { in: 'callColor' },
        style: 'solid',
    },
    {
        name: 'callRipple',
        shape: 'ring',
        r: 1.75,
        width: 0.025,
        bind: 'ring',
        gate: 'calling',
        color: { in: 'callColor' },
        style: 'solid',
    },
    { name: 'cover', shape: 'ring', r: 1.3, width: 0.035, dashes: 8, gate: 'inCover', color: 'rock', style: 'solid' },
]);

/**
 * @param {string} name the model name
 * @param {object[]} own the model's own parts
 * @returns {Readonly<{name: string, parts: readonly object[]}>} the agent model: its parts, then the shared parts
 */
function agent(name, own) {
    return Object.freeze({ name, parts: Object.freeze([...own, ...SHARED_PARTS]) });
}

/** The five agent models by specialisation name: cells told apart by their organelles and how they swim. */
export const AGENT_MODELS = Object.freeze({
    predator: agent('predator', [
        membrane({ rx: 0.95, ry: 0.58, amp: 0.035, lobes: 7 }),
        {
            name: 'lipUp',
            shape: 'arc',
            r: 0.38,
            width: 0.06,
            start: 0.15,
            sweep: 1.1,
            at: [0.62, 0],
            pivot: [0.62, 0],
            bind: 'jawUp',
            style: 'solid',
        },
        {
            name: 'lipDown',
            shape: 'arc',
            r: 0.38,
            width: 0.06,
            start: -1.25,
            sweep: 1.1,
            at: [0.62, 0],
            pivot: [0.62, 0],
            bind: 'jawDown',
            style: 'solid',
        },
        nucleus(-0.25, 0.14),
    ]),
    forager: agent('forager', [membrane({ rx: 0.9, ry: 0.78, amp: 0.045, lobes: 5 }), nucleus(0.28, 0.2)]),
    reproducer: agent('reproducer', [
        membrane({ rx: 0.95, ry: 0.95, amp: 0.04, lobes: 4 }),
        { name: 'nuclei', shape: 'dots', r: 0.17, count: 2, ring: { in: 'gestation', mul: 0.32 }, phase: Math.PI / 2 },
    ]),
    scout: agent('scout', [
        {
            name: 'flagellum',
            shape: 'wave',
            from: -0.7,
            to: -1.9,
            amp: 0.28,
            freq: 7,
            phase: WAVE,
            width: 0.05,
            style: 'solid',
        },
        {
            name: 'ciliumUp',
            shape: 'segment',
            a: [0.65, 0.08],
            b: [1.25, 0.42],
            width: 0.035,
            pivot: [0.65, 0.08],
            bind: 'limbA',
            style: 'solid',
        },
        {
            name: 'ciliumDown',
            shape: 'segment',
            a: [0.65, -0.08],
            b: [1.25, -0.42],
            width: 0.035,
            pivot: [0.65, -0.08],
            bind: 'limbB',
            style: 'solid',
        },
        membrane({ rx: 0.75, ry: 0.42, amp: 0.03, lobes: 6 }),
        nucleus(0.15, 0.1),
    ]),
    defender: agent('defender', [
        { name: 'spines', shape: 'ring', r: 1.07, width: 0.16, dashes: 16, style: 'solid' },
        membrane({ rx: 0.92, ry: 0.92, amp: 0.02, lobes: 9 }),
        { name: 'wall', shape: 'ring', r: 0.74, width: 0.03, style: 'solid' },
        nucleus(0, 0.16),
    ]),
});

/** Every model by name. */
export const MODELS = Object.freeze(
    Object.fromEntries(
        [
            ...Object.values(AGENT_MODELS),
            HERD_MODEL,
            ...FOOD_MODELS,
            ROCK_MODEL,
            REFUGE_MODEL,
            PATCH_MODEL,
            ...ZONE_MODELS,
            ...MARK_MODELS,
            DEPTH_MODEL,
            ...MOTE_MODELS,
            ...PARTICLE_MODELS,
        ].map((m) => [m.name, m]),
    ),
);

/**
 * @param {string} spec a specialisation name
 * @param {(name: string) => void} [onMissing] told once per call when the name has no model
 * @returns {{name: string, parts: readonly object[]}} its agent model, the forager's for an unknown name
 */
export function modelFor(spec, onMissing) {
    const model = /** @type {Record<string, any>} */ (AGENT_MODELS)[spec];
    if (model !== undefined) {
        return model;
    }
    onMissing?.(spec);
    return AGENT_MODELS.forager;
}

/**
 * @param {number | {in: string, mul?: number}} value a part dimension, or one bound to an instance input in 0 to 1
 * @returns {number} the largest it can be
 */
function most(value) {
    return typeof value === 'number' ? value : (value.mul ?? 1);
}

/** Each primitive's reach from its own origin, in model units, from the part's (largest) dimensions. */
const EXTENTS = Object.freeze({
    membrane: (/** @type {any} */ p) => Math.max(p.rx, p.ry) * (1 + p.amp),
    wave: (/** @type {any} */ p) => Math.max(Math.abs(p.from), Math.abs(p.to)) + p.amp + p.width / 2,
    circle: (/** @type {any} */ p) => most(p.r),
    ring: (/** @type {any} */ p) => most(p.r) + most(p.width) / 2,
    arc: (/** @type {any} */ p) => most(p.r) + most(p.width) / 2,
    box: (/** @type {any} */ p) => Math.hypot(p.hx, p.hy),
    poly: (/** @type {any} */ p) => Math.max(...p.points.map((/** @type {number[]} */ q) => Math.hypot(q[0], q[1]))),
    segment: (/** @type {any} */ p) =>
        Math.max(Math.hypot(p.a[0], p.a[1]), Math.hypot(p.b[0], p.b[1])) + most(p.width) / 2,
    dots: (/** @type {any} */ p) => most(p.ring) + most(p.r),
});

/**
 * @param {Record<string, any>} part a part
 * @returns {number} the farthest the part's shape reaches from its own origin, in model units (1 for a `blob`)
 */
function shapeExtent(part) {
    const extent = /** @type {Record<string, (p: any) => number>} */ (EXTENTS)[part.shape];
    return extent === undefined ? 1 : extent(part);
}

/**
 * @param {Record<string, any>} part a part
 * @returns {number} the farthest the part reaches from the model origin under any clip: offset, a turn about its pivot
 *   (which can carry a point at most twice the pivot distance further) and the ring scale
 */
export function partExtent(part) {
    const at = part.at === undefined ? 0 : Math.hypot(part.at[0], part.at[1]);
    const pivot = part.pivot === undefined ? 0 : Math.hypot(part.pivot[0], part.pivot[1]);
    const reach = at + shapeExtent(part) + 2 * pivot;
    return part.bind === 'ring' ? reach * MAX_RING_SCALE : reach;
}

/**
 * @param {{parts: readonly Record<string, any>[]}} model a model
 * @returns {number} the half size of the quad that covers the model under every clip, in model units
 */
export function modelBounds(model) {
    let reach = 0;
    for (const part of model.parts) {
        reach = Math.max(reach, partExtent(part));
    }
    return reach * MAX_BODY_SCALE + 0.05;
}

/** Checks on one part: each returns the problem, or null. */
const PART_CHECKS = Object.freeze([
    (/** @type {Record<string, any>} */ p) => (SHAPES.includes(p.shape) ? null : `unknown shape ${p.shape}`),
    (/** @type {Record<string, any>} */ p) =>
        p.bind === undefined || BINDS.includes(p.bind) ? null : `unknown bind ${p.bind}`,
    (/** @type {Record<string, any>} */ p) =>
        p.style === undefined || STYLES.includes(p.style) ? null : `unknown style ${p.style}`,
    (/** @type {Record<string, any>} */ p) =>
        typeof p.color !== 'string' || p.color === 'body' || p.color in NEON ? null : `unknown role ${p.color}`,
    (/** @type {Record<string, any>} */ p) =>
        p.shape !== 'poly' || (p.points.length >= 3 && p.points.length <= MAX_POINTS)
            ? null
            : `${p.points.length} points`,
]);

/**
 * @param {{name: string, parts: readonly Record<string, any>[]}} model a model
 * @returns {string[]} what is wrong with it, empty when it is well formed
 */
export function validateModel(model) {
    const problems = [];
    if (model.parts.length === 0 || model.parts.length > MAX_PARTS) {
        problems.push(`${model.name}: ${model.parts.length} parts (1 to ${MAX_PARTS})`);
    }
    for (const part of model.parts) {
        for (const check of PART_CHECKS) {
            const problem = check(part);
            if (problem !== null) {
                problems.push(`${model.name}.${part.name}: ${problem}`);
            }
        }
    }
    return problems;
}

/** The particle model of each `FX_SHAPES` index. */
export const PARTICLE_BY_SHAPE = Object.freeze(FX_SHAPES.map((name) => MODELS[name]));
