// The vector models of everything but the agents: megafauna, the six food species and the carcass, rocks, refuges,
// patches, zones, ground marks, smoke clouds, the season motes and one model per effect particle shape. Pure data in
// the part format of `models.js`; model units are the item's radius.

const seg = (/** @type {number[]} */ a, /** @type {number[]} */ b, width = 0.14) => ({ a, b, width });

/** Megafauna as a colony organism: a gel envelope, a ring of member cells that turns as it swims, an inner ring that
 * turns the other way and a core that drifts forward as it grazes. */
export const HERD_MODEL = Object.freeze({
    name: 'herd',
    parts: [
        { name: 'envelope', shape: 'ring', r: 1.02, width: 0.025, style: 'solid' },
        { name: 'members', shape: 'dots', r: 0.2, count: 8, ring: 0.76, pivot: [0, 0], bind: 'limbA' },
        { name: 'inner', shape: 'dots', r: 0.09, count: 5, ring: 0.36, pivot: [0, 0], bind: 'limbB', style: 'solid' },
        { name: 'core', shape: 'circle', r: 0.16, bind: 'head' },
    ],
});

/** Food models by species (`FLORA_NAMES` order), then the carcass: plankton and diatom shells. */
export const FOOD_MODELS = Object.freeze([
    { name: 'grass', parts: [{ name: 'rod', shape: 'segment', ...seg([-0.55, 0], [0.55, 0], 0.42) }] },
    {
        name: 'berry',
        parts: [
            { name: 'shell', shape: 'circle', r: 0.52 },
            { name: 'core', shape: 'circle', r: 0.14, style: 'solid' },
        ],
    },
    {
        name: 'nut',
        parts: [
            {
                name: 'valve',
                shape: 'poly',
                points: [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [
                    0.85 * Math.cos((k * Math.PI) / 4),
                    0.36 * Math.sin((k * Math.PI) / 4),
                ]),
            },
            { name: 'raphe', shape: 'segment', ...seg([-0.6, 0], [0.6, 0], 0.05), style: 'solid' },
        ],
    },
    {
        name: 'flower',
        parts: [
            { name: 'valve', shape: 'ring', r: 0.75, width: 0.06, style: 'solid' },
            { name: 'areolae', shape: 'dots', r: 0.1, count: 6, ring: 0.42, style: 'solid' },
            { name: 'centre', shape: 'circle', r: 0.12, style: 'solid' },
        ],
    },
    {
        name: 'fungus',
        parts: [{ name: 'spores', shape: 'dots', r: 0.2, count: 3, ring: 0.38, phase: Math.PI / 2, color: 'fungus' }],
    },
    {
        name: 'toxiccap',
        parts: [
            {
                name: 'valve',
                shape: 'poly',
                points: [
                    [0, 0.85],
                    [0.8, -0.6],
                    [-0.8, -0.6],
                ],
                color: 'toxic',
            },
            {
                name: 'pores',
                shape: 'dots',
                r: 0.08,
                count: 3,
                ring: 0.3,
                phase: Math.PI / 2,
                color: 'toxic',
                style: 'solid',
            },
        ],
    },
    {
        name: 'carcass',
        parts: [
            { name: 'shredA', shape: 'arc', r: 0.7, width: 0.12, start: 0.3, sweep: 2.2 },
            { name: 'shredB', shape: 'arc', r: 0.55, width: 0.1, start: 3.4, sweep: 1.8 },
            { name: 'debris', shape: 'dots', r: 0.07, count: 4, ring: 0.3, style: 'solid' },
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
        { name: 'lattice', shape: 'ring', r: 0.93, width: 0.02, dashes: 36, color: 'rock', style: 'solid' },
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

/** A depth point: one of the sparse, still specks of the void behind everything. */
export const DEPTH_MODEL = Object.freeze({
    name: 'depthPoint',
    parts: [{ name: 'speck', shape: 'circle', r: 1, style: 'solid' }],
});

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
                name: 'shard',
                shape: 'poly',
                points: [
                    [-0.8, -0.5],
                    [1, 0],
                    [-0.6, 0.6],
                ],
                color: 'leaf',
                style: 'outline',
            },
        ],
    },
    {
        name: 'frostMote',
        parts: [
            { name: 'a', shape: 'segment', ...seg([-1, 0], [1, 0], 0.16), color: 'frost', style: 'solid' },
            { name: 'b', shape: 'segment', ...seg([-0.5, -0.87], [0.5, 0.87], 0.16), color: 'frost', style: 'solid' },
            { name: 'c', shape: 'segment', ...seg([-0.5, 0.87], [0.5, -0.87], 0.16), color: 'frost', style: 'solid' },
        ],
    },
]);
