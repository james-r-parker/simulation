// The vector models of everything but the agents: megafauna, the six food species and the carcass, rocks, refuges,
// patches, zones, ground marks, smoke clouds, the season motes and one model per effect particle shape. Pure data in
// the part format of `models.js`; model units are the item's radius.

const seg = (/** @type {number[]} */ a, /** @type {number[]} */ b, width = 0.14) => ({ a, b, width });

/** Megafauna, nose along +x: a capsule, fine legs and a small wedge head. */
export const HERD_MODEL = Object.freeze({
    name: 'herd',
    parts: [
        {
            name: 'legFL',
            shape: 'segment',
            ...seg([0.45, 0.42], [0.52, 0.78], 0.09),
            pivot: [0.45, 0.42],
            bind: 'limbA',
            style: 'solid',
        },
        {
            name: 'legBR',
            shape: 'segment',
            ...seg([-0.5, -0.42], [-0.57, -0.78], 0.09),
            pivot: [-0.5, -0.42],
            bind: 'limbA',
            style: 'solid',
        },
        {
            name: 'legFR',
            shape: 'segment',
            ...seg([0.45, -0.42], [0.52, -0.78], 0.09),
            pivot: [0.45, -0.42],
            bind: 'limbB',
            style: 'solid',
        },
        {
            name: 'legBL',
            shape: 'segment',
            ...seg([-0.5, 0.42], [-0.57, 0.78], 0.09),
            pivot: [-0.5, 0.42],
            bind: 'limbB',
            style: 'solid',
        },
        { name: 'body', shape: 'box', hx: 0.95, hy: 0.52, corner: 0.48 },
        { name: 'spine', shape: 'segment', ...seg([-0.6, 0], [0.4, 0], 0.04), style: 'solid' },
        {
            name: 'head',
            shape: 'poly',
            points: [
                [1.3, 0],
                [0.9, 0.2],
                [0.9, -0.2],
            ],
            bind: 'head',
        },
    ],
});

/** Food models by species (`FLORA_NAMES` order), then the carcass: small geometric glyphs. */
export const FOOD_MODELS = Object.freeze([
    { name: 'grass', parts: [{ name: 'blade', shape: 'segment', ...seg([0, -0.8], [0, 0.8], 0.22), style: 'solid' }] },
    { name: 'berry', parts: [{ name: 'fruit', shape: 'circle', r: 0.55 }] },
    {
        name: 'nut',
        parts: [
            {
                name: 'shell',
                shape: 'poly',
                points: [
                    [0, 0.85],
                    [0.55, 0],
                    [0, -0.85],
                    [-0.55, 0],
                ],
            },
        ],
    },
    {
        name: 'flower',
        parts: [{ name: 'petals', shape: 'dots', r: 0.16, count: 5, ring: 0.5, phase: Math.PI / 2, style: 'solid' }],
    },
    {
        name: 'fungus',
        parts: [
            {
                name: 'caps',
                shape: 'dots',
                r: 0.2,
                count: 3,
                ring: 0.38,
                phase: Math.PI / 2,
                color: 'fungus',
                style: 'solid',
            },
        ],
    },
    {
        name: 'toxiccap',
        parts: [
            {
                name: 'warning',
                shape: 'poly',
                points: [
                    [0, 0.85],
                    [0.8, -0.6],
                    [-0.8, -0.6],
                ],
                color: 'toxic',
            },
        ],
    },
    {
        name: 'carcass',
        parts: [
            {
                name: 'chunk',
                shape: 'poly',
                points: [
                    [-0.9, -0.3],
                    [-0.5, 0.7],
                    [0.4, 0.85],
                    [0.95, 0.1],
                    [0.6, -0.7],
                    [-0.3, -0.8],
                ],
            },
        ],
    },
]);

/** Rocks, the wall and refuge rings: the `rockShape` harmonics come from the instance. */
export const ROCK_MODEL = Object.freeze({ name: 'rock', parts: [{ name: 'stone', shape: 'blob', color: 'rock' }] });

/** A refuge: a dashed ring on its rocks and an occupancy arc that sweeps with the occupancy level. */
export const REFUGE_MODEL = Object.freeze({
    name: 'refuge',
    parts: [
        { name: 'bound', shape: 'ring', r: 1, width: 0.03, dashes: 24, color: 'rock', style: 'solid' },
        {
            name: 'occupancy',
            shape: 'arc',
            r: 0.86,
            width: 0.05,
            start: Math.PI / 2,
            sweep: { in: 'level', mul: 2 * Math.PI },
            color: 'forager',
            style: 'solid',
        },
    ],
});

/** A flora patch in its hue: dashed bound, fill arc, fruit glints when nearly full. */
export const PATCH_MODEL = Object.freeze({
    name: 'patch',
    parts: [
        { name: 'bound', shape: 'ring', r: 1, width: 0.02, dashes: 36, style: 'solid' },
        {
            name: 'fill',
            shape: 'arc',
            r: 0.94,
            width: 0.025,
            start: Math.PI / 2,
            sweep: { in: 'fill', mul: 2 * Math.PI },
            style: 'solid',
        },
        {
            name: 'fruit',
            shape: 'dots',
            r: 0.035,
            count: 4,
            ring: 0.7,
            phase: 0.4,
            bind: 'head',
            gate: 'ripe',
            color: 'pollen',
            style: 'solid',
        },
    ],
});

/** Fertile zones and dung zones. */
export const ZONE_MODELS = Object.freeze([
    {
        name: 'fertile',
        parts: [
            { name: 'bound', shape: 'ring', r: 1, width: 0.03, dashes: 16, color: 'forager', style: 'solid' },
            { name: 'seeds', shape: 'dots', r: 0.06, count: 3, ring: 0.35, color: 'forager', style: 'solid' },
        ],
    },
    {
        name: 'dung',
        parts: [
            { name: 'bound', shape: 'ring', r: 1, width: 0.03, dashes: 16, color: 'dust', style: 'solid' },
            { name: 'hatchA', shape: 'segment', ...seg([-0.5, -0.3], [0.1, 0.4], 0.06), color: 'dust', style: 'solid' },
            {
                name: 'hatchB',
                shape: 'segment',
                ...seg([-0.1, -0.45], [0.5, 0.25], 0.06),
                color: 'dust',
                style: 'solid',
            },
        ],
    },
]);

/** Ground marks: a frost tick, a drought crack and a smoke cloud. */
export const MARK_MODELS = Object.freeze([
    {
        name: 'frostTick',
        parts: [{ name: 'tick', shape: 'segment', ...seg([-1, 0], [1, 0], 0.18), color: 'frost', style: 'solid' }],
    },
    {
        name: 'crack',
        parts: [
            { name: 'a', shape: 'segment', ...seg([-1, 0], [-0.3, 0.35], 0.1), color: 'dust', style: 'solid' },
            { name: 'b', shape: 'segment', ...seg([-0.3, 0.35], [0.3, -0.35], 0.1), color: 'dust', style: 'solid' },
            { name: 'c', shape: 'segment', ...seg([0.3, -0.35], [1, 0], 0.1), color: 'dust', style: 'solid' },
        ],
    },
    {
        name: 'cloud',
        parts: [{ name: 'puffs', shape: 'dots', r: 0.5, count: 4, ring: 0.45, style: 'outline' }],
    },
]);

/** Season motes by season (spring, summer, autumn, winter). */
export const MOTE_MODELS = Object.freeze([
    { name: 'pollenMote', parts: [{ name: 'dot', shape: 'circle', r: 0.6, color: 'pollen', style: 'solid' }] },
    {
        name: 'heatMote',
        parts: [{ name: 'dash', shape: 'segment', ...seg([0, -1], [0, 1], 0.3), color: 'heat', style: 'solid' }],
    },
    {
        name: 'leafMote',
        parts: [
            {
                name: 'leaf',
                shape: 'poly',
                points: [
                    [-1, 0],
                    [-0.2, 0.55],
                    [1, 0],
                    [-0.2, -0.55],
                ],
                color: 'leaf',
            },
        ],
    },
    {
        name: 'frostMote',
        parts: [
            { name: 'a', shape: 'segment', ...seg([-1, 0], [1, 0], 0.22), color: 'frost', style: 'solid' },
            { name: 'b', shape: 'segment', ...seg([0, -1], [0, 1], 0.22), color: 'frost', style: 'solid' },
        ],
    },
]);
