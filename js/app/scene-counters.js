// How often each scene of docs/principles.md showed on screen lately, for the insights drawer's Scenes tab. A scene
// with an on-screen signature is counted from the effects the player plays (calls, pack calls and kills, carcasses,
// strains, wilted patches, births) or from the frame (`scene-frame.js`: chases, aborts, refuges, wall crossings); a
// scene with none reads `no live signal`. The count is over the last four seasons, kept in one bucket per season, and a
// scene also remembers its newest participant so a click can follow a live instance. Detectors are read, never
// rewarded: nothing here reaches the sim. Typed arrays throughout; noting an effect allocates nothing.

import { createFrameSignals, noteBite, noteSceneFrame, resetFrameSignals } from './scene-frame.js';

/** The seasons a count covers: the current one and the three before it. */
export const SEASON_WINDOW = 4;
/** Effect kinds have codes below this; the lookup table is this long. */
const KIND_CODES = 64;
/** The flag on a `DIED` record's word `c` for a pack kill (`js/worker/effects.js`). */
const PACK_FLAG = 65536;
const CAUSE_SHIFT = 8;
const CAUSE_MASK = 0xff;

/**
 * Every scene of `docs/principles.md`, in its order. `signal` says what is counted, null for a scene with no on-screen
 * signature (`no live signal`).
 * @type {readonly {id: string, name: string, signal: string | null}[]}
 */
export const SCENES = Object.freeze([
    { id: 'patch', name: 'Leave a dying patch', signal: null },
    { id: 'chase', name: 'A real chase', signal: 'pursuits begun' },
    { id: 'abort', name: 'Abort', signal: 'pursuits dropped without a bite' },
    { id: 'call', name: "Call, or don't", signal: 'alarm calls' },
    { id: 'pack', name: 'Pack, or loner', signal: 'pack calls and pack kills' },
    { id: 'refuge', name: 'Refuge', signal: 'prey stacking into a refuge' },
    { id: 'scavenge', name: 'Scavenge', signal: 'herd carcasses' },
    { id: 'condition', name: 'Condition changes the walk', signal: null },
    { id: 'season', name: 'Season changes the map', signal: null },
    { id: 'cross', name: 'Cross or stay', signal: 'wall crossings' },
    { id: 'parent', name: 'Parent spends', signal: 'births from a mother' },
    { id: 'custom', name: 'Same spec, different custom', signal: null },
    { id: 'boom', name: 'Boom and bust', signal: 'wilted patches and strains' },
    { id: 'climate', name: 'Other blobs are the climate', signal: null },
    { id: 'unnamed', name: 'Something unnamed', signal: null },
]);

/** @type {Readonly<Record<string, number>>} each scene's index in `SCENES` by id */
export const SCENE_AT = Object.freeze(Object.fromEntries(SCENES.map((s, i) => [s.id, i])));

/**
 * @typedef {object} SceneCounters
 * @property {Float64Array} counts `SEASON_WINDOW` buckets per scene, by season index modulo the window
 * @property {number} season the newest season index counted into
 * @property {number} seasonLength ticks in a season
 * @property {number} tick the newest tick seen
 * @property {Uint32Array} genome each scene's newest participant, 0 when it has none
 * @property {Float32Array} x where each scene's newest instance was
 * @property {Float32Array} y where each scene's newest instance was
 * @property {Int32Array} lastTick the tick of each scene's newest instance, -1 for none
 * @property {Int8Array} sceneOfKind the scene an effect kind counts for, -1 for none
 * @property {{bite: number, born: number, died: number, mate: number, split: number, eaten: number}} codes the layout
 *   codes the effect rules read
 * @property {import('./scene-frame.js').FrameSignals} frame the frame signals' scratch
 * @property {import('./scene-frame.js').Emit} emit counts a frame signal; made once
 */

/** The effect kinds that count for a scene on their own, and the scene. */
const KIND_SCENES = Object.freeze([
    ['ALARM', 'call'],
    ['PACK_CALL', 'pack'],
    ['HERD_DIED', 'scavenge'],
    ['STRAIN_EMERGED', 'boom'],
    ['PATCH_WILTED', 'boom'],
]);

/**
 * @param {Record<string, number> | undefined} table a layout table of codes by name
 * @param {string} name a name in it
 * @returns {number} its code, -1 when the layout lacks it
 */
const code = (table, name) => table?.[name] ?? -1;

/** The scene each frame signal counts for, by `FRAME_EVENT` (chase, abort, refuge, cross). */
const FRAME_SCENE = Object.freeze([SCENE_AT.chase, SCENE_AT.abort, SCENE_AT.refuge, SCENE_AT.cross]);

/** @returns {SceneCounters} empty counters, set up by `resetSceneCounters` when a world is ready */
export function createSceneCounters() {
    const n = SCENES.length;
    /** @type {SceneCounters} */
    const c = {
        counts: new Float64Array(n * SEASON_WINDOW),
        season: 0,
        seasonLength: 1,
        tick: 0,
        genome: new Uint32Array(n),
        x: new Float32Array(n),
        y: new Float32Array(n),
        lastTick: new Int32Array(n).fill(-1),
        sceneOfKind: new Int8Array(KIND_CODES).fill(-1),
        codes: { bite: -1, born: -1, died: -1, mate: -1, split: -1, eaten: -1 },
        frame: createFrameSignals(),
        emit: (event, genome, x, y) => bumpScene(c, FRAME_SCENE[event], { tick: c.tick, genome, x, y }),
    };
    return c;
}

/**
 * @param {Record<string, any> | undefined} layout `ready.layout`
 * @returns {SceneCounters['codes']} the codes the effect rules read, -1 for one the layout lacks
 */
function layoutCodes(layout) {
    return {
        bite: code(layout?.effectKinds, 'BITE'),
        born: code(layout?.effectKinds, 'BORN'),
        died: code(layout?.effectKinds, 'DIED'),
        mate: code(layout?.bornCauses, 'MATE'),
        split: code(layout?.bornCauses, 'SPLIT'),
        eaten: code(layout?.deathCauses, 'EATEN'),
    };
}

/**
 * Empties the counters for a new world and reads its layout.
 * @param {SceneCounters} c the counters
 * @param {Record<string, any>} ready the `ready` message
 * @returns {void}
 */
export function resetSceneCounters(c, ready) {
    const kinds = ready.layout?.effectKinds;
    c.counts.fill(0);
    c.genome.fill(0);
    c.lastTick.fill(-1);
    c.season = 0;
    c.tick = 0;
    c.seasonLength = Math.max(ready.info?.seasonLength ?? 1, 1);
    c.sceneOfKind.fill(-1);
    for (const [kind, scene] of KIND_SCENES) {
        const at = code(kinds, kind);
        if (at >= 0 && at < KIND_CODES) {
            c.sceneOfKind[at] = SCENE_AT[scene];
        }
    }
    c.codes = layoutCodes(ready.layout);
    resetFrameSignals(c.frame, ready.info ?? {});
}

/**
 * Moves the window to a tick, emptying the buckets of seasons that have passed.
 * @param {SceneCounters} c the counters
 * @param {number} tick the tick now
 * @returns {void}
 */
export function advanceSeason(c, tick) {
    c.tick = Math.max(c.tick, tick);
    const season = Math.floor(tick / c.seasonLength);
    const steps = Math.min(season - c.season, SEASON_WINDOW);
    for (let s = 1; s <= steps; s++) {
        const bucket = (c.season + s) % SEASON_WINDOW;
        for (let scene = 0; scene < SCENES.length; scene++) {
            c.counts[scene * SEASON_WINDOW + bucket] = 0;
        }
    }
    c.season = Math.max(season, c.season);
}

/**
 * Counts one instance of a scene.
 * @param {SceneCounters} c the counters
 * @param {number} scene the scene's index in `SCENES`
 * @param {{tick: number, genome: number, x: number, y: number}} at when, who and where
 * @returns {void}
 */
export function bumpScene(c, scene, { tick, genome, x, y }) {
    advanceSeason(c, tick);
    const season = Math.floor(tick / c.seasonLength);
    if (c.season - season < SEASON_WINDOW) {
        c.counts[scene * SEASON_WINDOW + (season % SEASON_WINDOW)] += 1;
    }
    if (tick >= c.lastTick[scene]) {
        c.genome[scene] = genome;
        c.x[scene] = x;
        c.y[scene] = y;
        c.lastTick[scene] = tick;
    }
}

/**
 * @param {SceneCounters} c the counters
 * @param {{b: number, c: number}} effect a `DIED` record
 * @returns {boolean} whether it was an eaten death by a pack
 */
function isPackKill(c, effect) {
    return (
        effect.b !== 0 && (effect.c & PACK_FLAG) !== 0 && ((effect.c >>> CAUSE_SHIFT) & CAUSE_MASK) === c.codes.eaten
    );
}

/**
 * @param {SceneCounters} c the counters
 * @param {{kind: number, tick: number, x: number, y: number, a: number, b: number, c: number, d: number}} effect a
 *   `BORN` record
 * @returns {void} counts a birth from a mother (a mating or a split) for the mother
 */
function noteBirth(c, effect) {
    if (effect.c !== 0 && (effect.d === c.codes.mate || effect.d === c.codes.split)) {
        bumpScene(c, SCENE_AT.parent, { tick: effect.tick, genome: effect.c, x: effect.x, y: effect.y });
    }
}

/**
 * Counts the scene a played effect shows, if any.
 * @param {SceneCounters} c the counters
 * @param {{kind: number, tick: number, x: number, y: number, a: number, b: number, c: number, d: number}} effect the
 *   effect record
 * @returns {void}
 */
export function noteSceneEffect(c, effect) {
    const scene = effect.kind >= 0 && effect.kind < KIND_CODES ? c.sceneOfKind[effect.kind] : -1;
    if (scene >= 0) {
        bumpScene(c, scene, { tick: effect.tick, genome: effect.a, x: effect.x, y: effect.y });
    } else if (effect.kind === c.codes.born) {
        noteBirth(c, effect);
    } else if (effect.kind === c.codes.died && isPackKill(c, effect)) {
        bumpScene(c, SCENE_AT.pack, { tick: effect.tick, genome: effect.b, x: effect.x, y: effect.y });
    } else if (effect.kind === c.codes.bite) {
        noteBite(c.frame, effect.a);
    }
}

/**
 * @param {SceneCounters} c the counters
 * @param {number} tick the tick now
 * @returns {{id: string, name: string, signal: string | null, count: number | null, genomeId: number, x: number,
 *   y: number, seen: boolean}[]} one row per scene: its count over the last four seasons (null for a scene with no
 *   signal), and where its newest instance was (`seen` false before one)
 */
export function sceneRows(c, tick) {
    advanceSeason(c, tick);
    return SCENES.map((scene, i) => {
        let count = 0;
        for (let b = 0; b < SEASON_WINDOW; b++) {
            count += c.counts[i * SEASON_WINDOW + b];
        }
        return {
            ...scene,
            count: scene.signal === null ? null : count,
            genomeId: c.genome[i],
            x: c.x[i],
            y: c.y[i],
            seen: c.lastTick[i] >= 0,
        };
    });
}

/**
 * Counts what one frame shows.
 * @param {SceneCounters} c the counters
 * @param {Parameters<typeof noteSceneFrame>[1]} frame the frame's agents, the pursuit table and the clock
 * @returns {void}
 */
export function noteFrame(c, frame) {
    noteSceneFrame(c.frame, frame, c.emit);
}
