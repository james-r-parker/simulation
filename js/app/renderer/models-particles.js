// One vector model per effect particle shape (`FX_SHAPES` in fx-curves.js), in that order, in the part format of
// `models.js`. The colour comes from the effect, so parts take the body colour unless a role is named. Pure data.

const seg = (/** @type {number[]} */ a, /** @type {number[]} */ b, width = 0.14) => ({ a, b, width });

const one = (/** @type {string} */ name, /** @type {Record<string, any>} */ part) => ({
    name,
    parts: [{ name: 'p', ...part }],
});

/** One model per `FX_SHAPES` name, in that order; colour comes from the effect. */
export const PARTICLE_MODELS = Object.freeze([
    one('RING', { shape: 'ring', r: 0.92, width: 0.08, style: 'solid' }),
    one('STREAK', { shape: 'segment', ...seg([-1, 0], [1, 0], 0.35), style: 'solid' }),
    one('CRESCENT', { shape: 'arc', r: 0.8, width: 0.22, start: -1.1, sweep: 2.2, style: 'solid' }),
    one('SHARD', {
        shape: 'poly',
        points: [
            [1, 0],
            [-0.7, 0.5],
            [-0.4, -0.6],
        ],
        style: 'solid',
    }),
    one('MOTE', { shape: 'circle', r: 0.8, style: 'solid' }),
    one('DROP', {
        shape: 'poly',
        points: [
            [0, 1],
            [0.6, -0.2],
            [0, -0.8],
            [-0.6, -0.2],
        ],
        style: 'outline',
    }),
    one('PUFF', { shape: 'dots', r: 0.45, count: 3, ring: 0.4, style: 'outline' }),
    one('CHEVRON', { shape: 'ring', r: 0.9, width: 0.16, dashes: 12, style: 'solid' }),
    one('ARC', { shape: 'arc', r: 0.9, width: 0.1, start: -0.785, sweep: 1.57, style: 'solid' }),
    {
        name: 'ORBIT',
        parts: [
            { name: 'head', shape: 'circle', r: 0.5, style: 'solid' },
            { name: 'tail', shape: 'segment', ...seg([0, 0], [-1, 0], 0.2), style: 'solid' },
        ],
    },
    {
        name: 'SPORE',
        parts: [
            { name: 'shell', shape: 'ring', r: 0.7, width: 0.12, style: 'solid' },
            { name: 'core', shape: 'circle', r: 0.2, style: 'solid' },
        ],
    },
    one('SPARKLE', {
        shape: 'poly',
        points: [
            [1, 0],
            [0.18, 0.18],
            [0, 1],
            [-0.18, 0.18],
            [-1, 0],
            [-0.18, -0.18],
            [0, -1],
            [0.18, -0.18],
        ],
        style: 'solid',
    }),
    one('CRUMB', { shape: 'box', hx: 0.6, hy: 0.6, corner: 0.1, style: 'solid' }),
    {
        name: 'SPROUT',
        parts: [
            { name: 'stem', shape: 'segment', ...seg([0, -1], [0, 0.4], 0.14), color: 'forager', style: 'solid' },
            { name: 'leafL', shape: 'circle', r: 0.28, at: [-0.3, 0.45], color: 'forager', style: 'solid' },
            { name: 'leafR', shape: 'circle', r: 0.28, at: [0.3, 0.6], color: 'forager', style: 'solid' },
        ],
    },
    {
        name: 'FISSION',
        parts: [
            { name: 'a', shape: 'ring', r: 0.5, width: 0.1, at: [-0.4, 0], bind: 'ring', style: 'solid' },
            { name: 'b', shape: 'ring', r: 0.5, width: 0.1, at: [0.4, 0], bind: 'ring', style: 'solid' },
        ],
    },
    one('GHOST', { shape: 'ring', r: 0.95, width: 0.1, style: 'solid' }),
]);
