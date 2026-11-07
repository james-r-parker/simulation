// Plays the worker's effect records: each queued effect pops once, when the playhead reaches its tick, into the ring and
// spark pools and an optional sink (audio). Effects further behind the playhead than `STALE_TICKS` (a hidden tab) are
// dropped unplayed.

import { createFamilySlots } from '../family-slots.js';
import { floraColor } from './flora-colors.js';
import { familyColor, PALETTE, SCENERY_MAX_LUMINANCE } from './colors.js';
import { spawnMateThread } from './mate-threads.js';
import { BIRTH_TICKS, RING_COLORS, spawnRing } from './rings.js';
import { spawnBurst, spawnStampedeDust } from './sparks.js';
import { viewBounds } from '../camera.js';
import { createBodyTweens } from './body-tweens.js';
import { BIRTH_SIZE, playBite, playDeath } from './effects-combat.js';
import { beginFxFrame, logFxBudget } from './fx-budget.js';
import { createFxPool } from './fx-pool.js';
import { createFxPlayer } from './fx-recipes.js';

/** An effect this many ticks behind the playhead is stale and skipped. */
export const STALE_TICKS = 180;
/** How far from a newborn its birth ring spreads, in world units. */
export const BIRTH_RING_RADIUS = 70;
export { BIRTH_SIZE, JAW_REACH } from './effects-combat.js';
/** Scratch records handed to `spawnBurst` and `spawnRing`, which copy them out. */
const BURST = {
    kind: /** @type {'bite' | 'born' | 'died'} */ ('bite'),
    x: 0,
    y: 0,
    tick: 0,
    size: 0,
    rgb: /** @type {ArrayLike<number>} */ (PALETTE.biteFlash),
    eaten: false,
};
const RING = {
    kind: /** @type {'alarm' | 'hunt' | 'birth' | 'pollen'} */ ('birth'),
    x: 0,
    y: 0,
    tick: 0,
    radius: 0,
    life: 0,
    rgb: /** @type {ArrayLike<number>} */ (PALETTE.biteFlash),
};

/**
 * @typedef {object} Effect
 * @property {number} kind
 * @property {number} tick
 * @property {number} x
 * @property {number} y
 * @property {number} a
 * @property {number} b
 * @property {number} c
 * @property {number} d
 */

/**
 * @typedef {object} EffectsPlayer
 * @property {import('./rings.js').RingPool} rings
 * @property {import('./sparks.js').SparkPool} sparks
 * @property {import('./mate-threads.js').MateThreadPool} [threads]
 * @property {Record<string, number>} kinds `ready.layout.effectKinds`
 * @property {number} eatenCause `ready.layout.deathCauses.EATEN`
 * @property {{callRadius: number, callTicks: number}} info the call ranges
 * @property {import('../family-slots.js').FamilySlots} slots the family colour slots
 * @property {((effect: Effect) => void) | null} sink told of every effect that plays (the audio cues)
 * @property {Effect} effect the record being played, reused
 * @property {boolean} floraEnabled whether flora effects draw
 * @property {number[]} rgb scratch colour
 * @property {import('./fx-recipes.js').FxPlayer} fx the effect pool's recipe player
 * @property {import('./body-tweens.js').BodyTweens} tweens the agents' body tweens
 * @property {import('./fx-recipes.js').FxAt} at scratch for a recipe's position
 * @property {{slot: number, genome: number}} who scratch for a tween's agent
 * @property {string[]} causeNames death cause names by number (`ready.layout.deathCauses`)
 */

/**
 * @param {Record<string, number>} causes `ready.layout.deathCauses`
 * @returns {string[]} the names by number
 */
function causeNamesOf(causes) {
    /** @type {string[]} */
    const names = [];
    for (const [name, n] of Object.entries(causes)) {
        names[n] = name;
    }
    return names;
}

/**
 * @param {{rings: import('./rings.js').RingPool, sparks: import('./sparks.js').SparkPool,
 *   threads?: import('./mate-threads.js').MateThreadPool, layout: Record<string, any>,
 *   info: Record<string, any>, slots?: import('../family-slots.js').FamilySlots,
 *   sink?: ((effect: Effect) => void) | null, fx?: import('./fx-recipes.js').FxPlayer,
 *   tweens?: import('./body-tweens.js').BodyTweens}} options the pools to play into, `ready.layout` and
 *   `ready.info`, the family colour slots (all neutral when absent), the effect pool's player and the body tweens
 *   (fresh ones when absent)
 * @returns {EffectsPlayer} a player
 */
export function createEffectsPlayer({
    rings,
    sparks,
    threads,
    layout,
    info,
    slots = createFamilySlots(),
    sink = null,
    fx = createFxPlayer(createFxPool()),
    tweens = createBodyTweens(info.maxAgents ?? 1024),
}) {
    return {
        fx,
        tweens,
        at: { x: 0, y: 0, angle: 0, size: 0, tick: 0, rgb: PALETTE.biteFlash },
        who: { slot: 0, genome: 0 },
        causeNames: causeNamesOf(layout.deathCauses),
        rings,
        sparks,
        threads,
        kinds: layout.effectKinds,
        floraEnabled: true,
        eatenCause: layout.deathCauses.EATEN,
        info: { callRadius: info.callRadius, callTicks: info.callTicks },
        slots,
        sink,
        effect: { kind: 0, tick: 0, x: 0, y: 0, a: 0, b: 0, c: 0, d: 0 },
        rgb: [0, 0, 0],
    };
}

/**
 * @param {EffectsPlayer} player effect player
 * @returns {void}
 */
function playPollinated(player) {
    const e = player.effect;
    floraColor((e.a / 4095) * 2 - 1, player.rgb);
    const y = 0.2126729 * player.rgb[0] + 0.7151522 * player.rgb[1] + 0.072175 * player.rgb[2];
    const scale = SCENERY_MAX_LUMINANCE / y;
    player.rgb[0] *= scale;
    player.rgb[1] *= scale;
    player.rgb[2] *= scale;
    setRing('pollen', e, 70, BIRTH_TICKS);
    RING.rgb = player.rgb;
    spawnRing(player.rings, RING);
}

/**
 * Fills the shared burst scratch with a birth-sized burst at the effect.
 * @param {'born' | 'died'} kind which burst
 * @param {Effect} e the effect
 * @param {ArrayLike<number>} rgb the lineage colour
 * @returns {void}
 */
function setBurst(kind, e, rgb) {
    BURST.kind = kind;
    BURST.x = e.x;
    BURST.y = e.y;
    BURST.tick = e.tick;
    BURST.size = BIRTH_SIZE;
    BURST.rgb = rgb;
    BURST.eaten = false;
}

/**
 * Fills the shared ring scratch at the effect, leaving the colour to the caller.
 * @param {'birth' | 'alarm' | 'hunt' | 'pollen'} kind which ring
 * @param {Effect} e the effect
 * @param {number} radius its radius
 * @param {number} life its length in ticks
 * @returns {void}
 */
function setRing(kind, e, radius, life) {
    RING.kind = kind;
    RING.x = e.x;
    RING.y = e.y;
    RING.tick = e.tick;
    RING.radius = radius;
    RING.life = life;
}

/**
 * @param {EffectsPlayer} player the player
 * @returns {void}
 */
function playBirth(player) {
    const e = player.effect;
    const rgb = familyColor(player.slots, e.b, 0.8, player.rgb);
    setRing('birth', e, BIRTH_RING_RADIUS, BIRTH_TICKS);
    RING.rgb = rgb;
    spawnRing(player.rings, RING);
    setBurst('born', e, rgb);
    spawnBurst(player.sparks, BURST);
}

/**
 * @param {EffectsPlayer} player the player
 * @param {'alarm' | 'hunt'} kind which call
 * @returns {void}
 */
function playCall(player, kind) {
    const e = player.effect;
    const { callRadius, callTicks } = player.info;
    setRing(kind, e, callRadius, callTicks);
    RING.rgb = RING_COLORS[kind];
    spawnRing(player.rings, RING);
}

/** The ring that marks a strain's first host: wide and slow, in `PALETTE.infected`. */
const STRAIN_RING_RADIUS = 140;
const STRAIN_RING_TICKS = 90;

/** @param {EffectsPlayer} player the player @returns {void} */
function playStrain(player) {
    setRing('birth', player.effect, STRAIN_RING_RADIUS, STRAIN_RING_TICKS);
    RING.rgb = PALETTE.infected;
    spawnRing(player.rings, RING);
}

/** @param {EffectsPlayer} player the player @returns {void} */
function playStampede(player) {
    const e = player.effect;
    spawnStampedeDust(player.sparks, { x: e.x, y: e.y, tick: e.tick, group: e.a, animals: e.b });
}

/**
 * @param {EffectsPlayer} player the player, `player.effect` holding the record
 * @param {import('../interpolate.js').Interpolated} agents the blended agents
 * @returns {void}
 */
function dispatch(player, agents) {
    const { kinds, effect: e } = player;
    if (e.kind === kinds.BITE) {
        playBite(player, agents);
    } else if (e.kind === kinds.BORN) {
        playBirth(player);
    } else if (e.kind === kinds.DIED) {
        playDeath(player, agents);
    } else if (e.kind === kinds.ALARM) {
        playCall(player, 'alarm');
    } else if (e.kind === kinds.PACK_CALL) {
        playCall(player, 'hunt');
    } else if (e.kind === kinds.POLLINATED && player.floraEnabled) {
        playPollinated(player);
    } else if (e.kind === kinds.MATED && player.threads) {
        spawnMateThread(player.threads, e);
    }
}

const VIEW = { left: 0, right: 0, top: 0, bottom: 0 };
const FRAME = { tick: 0, dtMs: 0, zoom: 1, view: VIEW };

/**
 * Starts a frame of effects: refills the budget and takes the view, the zoom band and the playhead's rate, and logs
 * drops and pool overwrites at most once per 10 s.
 * @param {EffectsPlayer} player the player
 * @param {{tick: number, dtMs: number, nowMs: number, camera: import('../camera.js').CameraController}} at the frame
 * @returns {void}
 */
export function beginEffects(player, { tick, dtMs, nowMs, camera }) {
    FRAME.tick = tick;
    FRAME.dtMs = dtMs;
    FRAME.zoom = camera.zoom;
    viewBounds(camera, VIEW);
    beginFxFrame(player.fx.budget, FRAME);
    const { pool } = player.fx;
    logFxBudget(player.fx.budget, { nowMs, overwrote: pool.overwrote, capacity: pool.limit });
}

/**
 * Plays every queued effect whose tick the playhead has reached, oldest first, each once.
 * @param {EffectsPlayer} player the player
 * @param {{u32: Uint32Array, f32: Float32Array, words: number, start: number, count: number}} queue the client's queue
 * @param {import('../interpolate.js').Interpolated} agents the blended agents (a bite starts at the biter's jaw)
 * @param {number} tick the playhead's tick (`simTickAt`)
 * @returns {number} effects played, not counting stale ones
 */
export function playEffects(player, queue, agents, tick) {
    const e = player.effect;
    const capacity = queue.u32.length / queue.words;
    let played = 0;
    while (queue.count > 0) {
        const at = queue.start * queue.words;
        if (queue.u32[at + 1] > tick) {
            break;
        }
        e.kind = queue.u32[at];
        e.tick = queue.u32[at + 1];
        e.x = queue.f32[at + 2];
        e.y = queue.f32[at + 3];
        e.a = queue.u32[at + 4];
        e.b = queue.u32[at + 5];
        e.c = queue.u32[at + 6];
        e.d = queue.u32[at + 7];
        queue.start = (queue.start + 1) % capacity;
        queue.count -= 1;
        if (tick - e.tick > STALE_TICKS) {
            continue;
        }
        played += 1;
        if (e.kind === player.kinds.STAMPEDE) {
            playStampede(player);
        } else if (e.kind === player.kinds.STRAIN_EMERGED) {
            playStrain(player);
        } else {
            dispatch(player, agents);
        }
        player.sink?.(e);
    }
    return played;
}
