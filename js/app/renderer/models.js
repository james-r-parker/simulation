// The model catalogue: one vector model per rendered item, each a list of SDF parts (`sdf.js`). Agents face +x and their
// model unit is the body radius. A part may sit at an offset (`at`), turn about a pivot with a rig channel (`bind`),
// take a palette role or an instance input as its colour, draw only while an input is set (`gate`) and bind a
// parameter to an instance input (`{in, mul}`). Pure data plus the bounds and validation helpers.

import { FX_SHAPES } from './fx-curves.js';
import { NEON } from './palette.js';
import {
    FOOD_MODELS,
    HERD_MODEL,
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
export const SHAPES = Object.freeze(['circle', 'ring', 'box', 'poly', 'segment', 'arc', 'dots', 'blob']);
/** The rig channels a part may bind to. */
export const BINDS = Object.freeze(['jawUp', 'jawDown', 'eye', 'ring', 'limbA', 'limbB', 'head']);
/** How a part is painted: rim and flat fill, a solid fill in the full colour, or the rim alone. */
export const STYLES = Object.freeze(['shape', 'solid', 'outline']);
/** The largest scale any clip gives a body, and a call ring. */
export const MAX_BODY_SCALE = 1.5;
export const MAX_RING_SCALE = 1.7;
/** The widest a jaw opens, radians. */
export const JAW_OPEN = 0.6;

/**
 * @param {number} from where the line starts, behind the nose
 * @param {number} to where it ends
 * @returns {object} the spine: a hairline along the heading that the `eye` channel lengthens and shortens (juvenile,
 *   resting and fleeing read from it), in place of a face
 */
const spine = (from, to) => ({
    name: 'spine',
    shape: 'segment',
    a: [from, 0],
    b: [to, 0],
    width: 0.05,
    pivot: [from, 0],
    bind: 'eye',
    style: 'solid',
});

/** Parts every agent model carries, each gated by its state, all thin marks rather than blobs. */
export const SHARED_PARTS = Object.freeze([
    {
        name: 'gestation',
        shape: 'arc',
        r: 0.42,
        width: 0.05,
        start: Math.PI / 2,
        sweep: { in: 'gestation', mul: 2 * Math.PI },
        gate: 'pregnant',
        color: 'court',
        style: 'solid',
    },
    { name: 'sick', shape: 'ring', r: 0.62, width: 0.035, dashes: 6, gate: 'sick', color: 'toxic', style: 'solid' },
    {
        name: 'infected',
        shape: 'ring',
        r: 0.74,
        width: 0.03,
        dashes: 12,
        gate: 'infected',
        color: 'infected',
        style: 'solid',
    },
    {
        name: 'pollen',
        shape: 'dots',
        r: 0.055,
        count: 3,
        ring: 0.18,
        at: [-1.25, 0],
        gate: 'pollen',
        color: { in: 'pollenColor' },
        style: 'solid',
    },
    {
        name: 'callRing',
        shape: 'ring',
        r: 1.45,
        width: 0.04,
        bind: 'ring',
        gate: 'calling',
        color: { in: 'callColor' },
        style: 'solid',
    },
    { name: 'cover', shape: 'ring', r: 1.3, width: 0.04, dashes: 8, gate: 'inCover', color: 'rock', style: 'solid' },
]);

/**
 * @param {string} name the model name
 * @param {object[]} own the model's own parts
 * @returns {Readonly<{name: string, parts: readonly object[]}>} the agent model: its parts, then the shared parts
 */
function agent(name, own) {
    return Object.freeze({ name, parts: Object.freeze([...own, ...SHARED_PARTS]) });
}

const SHIELD = [
    [0.85, 0],
    [0.35, 0.78],
    [-0.8, 0.62],
    [-0.8, -0.62],
    [0.35, -0.78],
];

/** The five agent models by specialisation name. */
export const AGENT_MODELS = Object.freeze({
    predator: agent('predator', [
        {
            name: 'body',
            shape: 'poly',
            points: [
                [0.55, 0.3],
                [-0.35, 0.42],
                [-0.82, 0.68],
                [-0.62, 0.2],
                [-0.95, 0],
                [-0.62, -0.2],
                [-0.82, -0.68],
                [-0.35, -0.42],
                [0.55, -0.3],
            ],
        },
        {
            name: 'jawUp',
            shape: 'poly',
            points: [
                [0.5, 0.02],
                [1.25, 0.05],
                [0.5, 0.32],
            ],
            pivot: [0.5, 0.02],
            bind: 'jawUp',
        },
        {
            name: 'jawDown',
            shape: 'poly',
            points: [
                [0.5, -0.02],
                [0.5, -0.32],
                [1.25, -0.05],
            ],
            pivot: [0.5, -0.02],
            bind: 'jawDown',
        },
        spine(-0.55, 0.3),
    ]),
    forager: agent('forager', [
        {
            name: 'body',
            shape: 'poly',
            points: [
                [1.05, 0],
                [0, 0.62],
                [-0.95, 0],
                [0, -0.62],
            ],
        },
        spine(-0.5, 0.55),
    ]),
    reproducer: agent('reproducer', [
        {
            name: 'body',
            shape: 'poly',
            points: [0, 1, 2, 3, 4, 5].map((k) => [Math.cos((k * Math.PI) / 3), Math.sin((k * Math.PI) / 3)]),
        },
        { name: 'inner', shape: 'ring', r: 0.55, width: 0.035, style: 'solid' },
        spine(0.2, 0.75),
    ]),
    scout: agent('scout', [
        {
            name: 'antennaUp',
            shape: 'segment',
            a: [0.7, 0.08],
            b: [1.6, 0.62],
            width: 0.045,
            pivot: [0.7, 0.08],
            bind: 'limbA',
            style: 'solid',
        },
        {
            name: 'antennaDown',
            shape: 'segment',
            a: [0.7, -0.08],
            b: [1.6, -0.62],
            width: 0.045,
            pivot: [0.7, -0.08],
            bind: 'limbB',
            style: 'solid',
        },
        {
            name: 'body',
            shape: 'poly',
            points: [
                [1.15, 0],
                [-0.6, 0.5],
                [-0.3, 0],
                [-0.6, -0.5],
            ],
        },
        spine(-0.2, 0.7),
    ]),
    defender: agent('defender', [
        { name: 'body', shape: 'poly', points: SHIELD },
        { name: 'inner', shape: 'poly', points: SHIELD.map(([x, y]) => [x * 0.6, y * 0.6]), style: 'outline' },
        spine(-0.45, 0.5),
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
 * @param {Record<string, any>} part a part
 * @returns {number} the farthest the part's shape reaches from its own origin, in model units
 */
function shapeExtent(part) {
    switch (part.shape) {
        case 'circle':
            return part.r;
        case 'ring':
        case 'arc':
            return part.r + part.width / 2;
        case 'box':
            return Math.hypot(part.hx, part.hy);
        case 'poly':
            return Math.max(...part.points.map((/** @type {number[]} */ p) => Math.hypot(p[0], p[1])));
        case 'segment':
            return Math.max(Math.hypot(part.a[0], part.a[1]), Math.hypot(part.b[0], part.b[1])) + part.width / 2;
        case 'dots':
            return part.ring + part.r;
        default:
            return 1;
    }
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
