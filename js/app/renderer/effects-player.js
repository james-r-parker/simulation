// Plays the worker's effect records: each queued effect pops once, when the playhead reaches its tick, into the ring and
// spark pools and an optional sink (audio). Effects further behind the playhead than `STALE_TICKS` (a hidden tab) are
// dropped unplayed.

import { lineageColor, PALETTE } from './colors.js';
import { BIRTH_TICKS, RING_COLORS, spawnRing } from './rings.js';
import { spawnBurst } from './sparks.js';

/** An effect this many ticks behind the playhead is stale and skipped. */
export const STALE_TICKS = 180;
/** How far from a newborn its birth ring spreads, in world units. */
export const BIRTH_RING_RADIUS = 70;
/** A newborn's burst scale, in world units. */
export const BIRTH_SIZE = 24;
/** Where on the biter a bite flash starts, in biter radii ahead of its centre. */
export const JAW_REACH = 0.9;

const CAUSE_MASK = 255;
const CAUSE_SHIFT = 8;

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
 * @property {Record<string, number>} kinds `ready.layout.effectKinds`
 * @property {number} eatenCause `ready.layout.deathCauses.EATEN`
 * @property {{callRadius: number, callTicks: number}} info the call ranges
 * @property {((effect: Effect) => void) | null} sink told of every effect that plays (the audio cues)
 * @property {Effect} effect the record being played, reused
 * @property {number[]} rgb scratch colour
 */

/**
 * @param {{rings: import('./rings.js').RingPool, sparks: import('./sparks.js').SparkPool, layout: Record<string, any>,
 *   info: Record<string, any>, sink?: ((effect: Effect) => void) | null}} options the pools to play into, `ready.layout`
 *   and `ready.info`
 * @returns {EffectsPlayer} a player
 */
export function createEffectsPlayer({ rings, sparks, layout, info, sink = null }) {
    return {
        rings,
        sparks,
        kinds: layout.effectKinds,
        eatenCause: layout.deathCauses.EATEN,
        info: { callRadius: info.callRadius, callTicks: info.callTicks },
        sink,
        effect: { kind: 0, tick: 0, x: 0, y: 0, a: 0, b: 0, c: 0, d: 0 },
        rgb: [0, 0, 0],
    };
}

/**
 * @param {import('../interpolate.js').Interpolated} agents the blended agents
 * @param {number} genomeId the agent to find
 * @returns {number} its index, -1 when it is not alive
 */
function indexOfGenome(agents, genomeId) {
    for (let i = 0; i < agents.count; i++) {
        if (agents.genomeId[i] === genomeId) {
            return i;
        }
    }
    return -1;
}

/**
 * @param {EffectsPlayer} player the player
 * @param {import('../interpolate.js').Interpolated} agents the blended agents
 * @returns {void}
 */
function playBite(player, agents) {
    const e = player.effect;
    const biter = indexOfGenome(agents, e.a);
    let x = e.x;
    let y = e.y;
    let size = BIRTH_SIZE;
    if (biter >= 0) {
        size = agents.size[biter];
        x = agents.x[biter] + Math.cos(agents.angle[biter]) * size * JAW_REACH;
        y = agents.y[biter] + Math.sin(agents.angle[biter]) * size * JAW_REACH;
    }
    spawnBurst(player.sparks, { kind: 'bite', x, y, tick: e.tick, size, rgb: PALETTE.biteFlash });
}

/**
 * @param {EffectsPlayer} player the player
 * @returns {void}
 */
function playBirth(player) {
    const e = player.effect;
    const rgb = lineageColor(e.b, 0.8, player.rgb);
    spawnRing(player.rings, {
        kind: 'birth',
        x: e.x,
        y: e.y,
        tick: e.tick,
        radius: BIRTH_RING_RADIUS,
        life: BIRTH_TICKS,
        rgb,
    });
    spawnBurst(player.sparks, { kind: 'born', x: e.x, y: e.y, tick: e.tick, size: BIRTH_SIZE, rgb });
}

/**
 * @param {EffectsPlayer} player the player
 * @returns {void}
 */
function playDeath(player) {
    const e = player.effect;
    const rgb = lineageColor(e.d, 0.6, player.rgb);
    const eaten = ((e.c >>> CAUSE_SHIFT) & CAUSE_MASK) === player.eatenCause;
    spawnBurst(player.sparks, { kind: 'died', x: e.x, y: e.y, tick: e.tick, size: BIRTH_SIZE, rgb, eaten });
}

/**
 * @param {EffectsPlayer} player the player
 * @param {'alarm' | 'hunt'} kind which call
 * @returns {void}
 */
function playCall(player, kind) {
    const e = player.effect;
    const { callRadius, callTicks } = player.info;
    spawnRing(player.rings, {
        kind,
        x: e.x,
        y: e.y,
        tick: e.tick,
        radius: callRadius,
        life: callTicks,
        rgb: RING_COLORS[kind],
    });
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
        playDeath(player);
    } else if (e.kind === kinds.ALARM) {
        playCall(player, 'alarm');
    } else if (e.kind === kinds.PACK_CALL) {
        playCall(player, 'hunt');
    }
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
        dispatch(player, agents);
        player.sink?.(e);
    }
    return played;
}
