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
export const MAX_BODY_SCALE = 1.35;
export const MAX_RING_SCALE = 1.7;
/** The widest a jaw opens, radians. */
export const JAW_OPEN = 0.6;

const eye = (/** @type {number} */ x, /** @type {number} */ r = 0.12) => ({
    name: 'eye',
    shape: 'circle',
    r,
    at: [x, 0],
    pivot: [x, 0],
    bind: 'eye',
    style: 'solid',
});

/** Parts every agent model carries, each gated by its state. */
export const SHARED_PARTS = Object.freeze([
    { name: 'belly', shape: 'circle', r: 0.26, at: [-0.15, 0], gate: 'pregnant', color: 'court', style: 'solid' },
    {
        name: 'gestation',
        shape: 'arc',
        r: 0.42,
        width: 0.07,
        start: Math.PI / 2,
        sweep: { in: 'gestation', mul: 2 * Math.PI },
        gate: 'pregnant',
        color: 'court',
        style: 'solid',
    },
    {
        name: 'sickSpots',
        shape: 'dots',
        r: 0.09,
        count: 3,
        ring: 0.45,
        phase: 0.5,
        gate: 'sick',
        color: 'toxic',
        style: 'solid',
    },
    {
        name: 'infectSpots',
        shape: 'dots',
        r: 0.08,
        count: 3,
        ring: 0.5,
        phase: 1.55,
        gate: 'infected',
        color: 'infected',
        style: 'solid',
    },
    {
        name: 'pollen',
        shape: 'dots',
        r: 0.08,
        count: 3,
        ring: 0.22,
        at: [-1.3, 0],
        gate: 'pollen',
        color: { in: 'pollenColor' },
        style: 'solid',
    },
    {
        name: 'callRing',
        shape: 'ring',
        r: 1.45,
        width: 0.06,
        bind: 'ring',
        gate: 'calling',
        color: { in: 'callColor' },
        style: 'solid',
    },
    { name: 'cover', shape: 'ring', r: 1.3, width: 0.07, dashes: 8, gate: 'inCover', color: 'rock', style: 'solid' },
]);

/**
 * @param {string} name the model name
 * @param {object[]} own the model's own parts
 * @returns {Readonly<{name: string, parts: readonly object[]}>} the agent model: its parts, then the shared parts
 */
function agent(name, own) {
    return Object.freeze({ name, parts: Object.freeze([...own, ...SHARED_PARTS]) });
}

/** The five agent models by specialisation name. */
export const AGENT_MODELS = Object.freeze({
    predator: agent('predator', [
        {
            name: 'body',
            shape: 'poly',
            points: [
                [0.6, 0.42],
                [-0.3, 0.62],
                [-0.85, 1.0],
                [-0.62, 0.3],
                [-1.0, 0],
                [-0.62, -0.3],
                [-0.85, -1.0],
                [-0.3, -0.62],
                [0.6, -0.42],
            ],
        },
        {
            name: 'jawUp',
            shape: 'poly',
            points: [
                [0.5, 0.02],
                [1.32, 0.07],
                [0.5, 0.44],
            ],
            pivot: [0.5, 0.02],
            bind: 'jawUp',
        },
        {
            name: 'jawDown',
            shape: 'poly',
            points: [
                [0.5, -0.02],
                [0.5, -0.44],
                [1.32, -0.07],
            ],
            pivot: [0.5, -0.02],
            bind: 'jawDown',
        },
        eye(0.2, 0.13),
    ]),
    forager: agent('forager', [
        {
            name: 'body',
            shape: 'poly',
            points: [
                [1.1, 0],
                [0, 0.75],
                [-1.0, 0],
                [0, -0.75],
            ],
        },
        {
            name: 'eyeUp',
            shape: 'segment',
            a: [0.5, 0],
            b: [0.2, 0.22],
            width: 0.09,
            pivot: [0.5, 0],
            bind: 'eye',
            style: 'solid',
        },
        {
            name: 'eyeDown',
            shape: 'segment',
            a: [0.5, 0],
            b: [0.2, -0.22],
            width: 0.09,
            pivot: [0.5, 0],
            bind: 'eye',
            style: 'solid',
        },
    ]),
    reproducer: agent('reproducer', [
        {
            name: 'body',
            shape: 'poly',
            points: [0, 1, 2, 3, 4, 5].map((k) => [Math.cos((k * Math.PI) / 3), Math.sin((k * Math.PI) / 3)]),
        },
        { name: 'inner', shape: 'ring', r: 0.62, width: 0.06, style: 'solid' },
        eye(0.6, 0.1),
    ]),
    scout: agent('scout', [
        {
            name: 'antennaUp',
            shape: 'segment',
            a: [0.7, 0.1],
            b: [1.7, 0.75],
            width: 0.07,
            pivot: [0.7, 0.1],
            bind: 'limbA',
            style: 'solid',
        },
        {
            name: 'antennaDown',
            shape: 'segment',
            a: [0.7, -0.1],
            b: [1.7, -0.75],
            width: 0.07,
            pivot: [0.7, -0.1],
            bind: 'limbB',
            style: 'solid',
        },
        {
            name: 'body',
            shape: 'poly',
            points: [
                [1.2, 0],
                [-0.6, 0.58],
                [-0.3, 0],
                [-0.6, -0.58],
            ],
        },
        eye(0.45, 0.1),
    ]),
    defender: agent('defender', [
        { name: 'body', shape: 'box', hx: 0.9, hy: 0.85, corner: 0.35 },
        { name: 'studs', shape: 'dots', r: 0.12, count: 4, ring: 0.6, phase: Math.PI / 4, style: 'solid' },
        eye(0.5, 0.11),
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
