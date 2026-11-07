// Plays the worker's effect records: each queued effect pops once, when the playhead reaches its tick, into the ring and
// spark pools and an optional sink (audio). Effects further behind the playhead than `STALE_TICKS` (a hidden tab) are
// dropped unplayed.

import { createFamilySlots } from '../family-slots.js';
import { PALETTE } from './colors.js';
import { spawnMateThread } from './mate-threads.js';
import { viewBounds } from '../camera.js';
import { createBodyTweens } from './body-tweens.js';
import { playBite, playDeath } from './effects-combat.js';
import { createEdgeState } from './effects-edges.js';
import { createFlee } from './effects-flee.js';
import { bornNamesOf, playBirth, playMate } from './effects-life.js';
import { playAtEffect, playCall, playPollinated, playSmoke } from './effects-signals.js';
export { playEdges } from './effects-edges.js';
import { beginFxFrame, logFxBudget } from './fx-budget.js';
import { createFxPool } from './fx-pool.js';
import { createFxPlayer } from './fx-recipes.js';

/** An effect this many ticks behind the playhead is stale and skipped. */
export const STALE_TICKS = 180;
export { BIRTH_SIZE, JAW_REACH } from './effects-combat.js';

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
 * @property {import('./mate-threads.js').MateThreadPool} [threads]
 * @property {Record<string, number>} kinds `ready.layout.effectKinds`
 * @property {number} eatenCause `ready.layout.deathCauses.EATEN`
 * @property {{callRadius: number, callTicks: number, cold01: number}} info the call ranges and the cold-stress
 *   temperature over `temperatureMax` (`-Infinity` when unknown)
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
 * @property {string[]} bornNames birth cause names by number (`ready.layout.bornCauses`)
 * @property {import('./effects-edges.js').EdgeState} edges the flag-edge state and the food grids
 * @property {Record<string, number>} bits `ready.layout.flags`
 * @property {import('./effects-flee.js').FleeState} flee the pursuit pairs and who flees this frame
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
 * @param {{threads?: import('./mate-threads.js').MateThreadPool, layout: Record<string, any>,
 *   info: Record<string, any>, slots?: import('../family-slots.js').FamilySlots,
 *   sink?: ((effect: Effect) => void) | null, fx?: import('./fx-recipes.js').FxPlayer,
 *   tweens?: import('./body-tweens.js').BodyTweens}} options the pools to play into, `ready.layout` and
 *   `ready.info`, the family colour slots (all neutral when absent), the effect pool's player and the body tweens
 *   (fresh ones when absent)
 * @returns {EffectsPlayer} a player
 */
export function createEffectsPlayer({
    threads,
    layout,
    info,
    slots = createFamilySlots(),
    sink = null,
    fx = createFxPlayer(createFxPool()),
    tweens = createBodyTweens(info.maxAgents ?? 1024),
}) {
    /** @type {EffectsPlayer} */
    const player = {
        fx,
        tweens,
        edges: /** @type {any} */ (null),
        flee: /** @type {any} */ (null),
        bits: layout.flags ?? {},
        at: { x: 0, y: 0, angle: 0, size: 0, tick: 0, rgb: PALETTE.biteFlash, reach: 0 },
        who: { slot: 0, genome: 0 },
        causeNames: causeNamesOf(layout.deathCauses),
        bornNames: bornNamesOf(layout.bornCauses),
        threads,
        kinds: layout.effectKinds,
        floraEnabled: true,
        eatenCause: layout.deathCauses.EATEN,
        info: {
            callRadius: info.callRadius,
            callTicks: info.callTicks,
            cold01: info.temperatureMax > 0 ? info.temperatureColdStress / info.temperatureMax : -Infinity,
        },
        slots,
        sink,
        effect: { kind: 0, tick: 0, x: 0, y: 0, a: 0, b: 0, c: 0, d: 0 },
        rgb: [0, 0, 0],
    };
    player.edges = createEdgeState(player, info);
    player.flee = createFlee(info);
    return player;
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
        playBirth(player, agents);
    } else if (e.kind === kinds.DIED) {
        playDeath(player, agents);
    } else if (e.kind === kinds.MATED) {
        if (player.threads) {
            spawnMateThread(player.threads, e);
        }
        playMate(player, agents);
    } else {
        dispatchSignal(player, agents);
    }
}

/**
 * @param {EffectsPlayer} player the player, `player.effect` holding a call, smoke, pollination, stampede or strain
 * @param {import('../interpolate.js').Interpolated} agents the blended agents
 * @returns {void}
 */
function dispatchSignal(player, agents) {
    const { kinds, effect: e } = player;
    if (e.kind === kinds.ALARM || e.kind === kinds.PACK_CALL) {
        playCall(player, agents, e.kind === kinds.PACK_CALL);
    } else if (e.kind === kinds.SMOKE) {
        playSmoke(player, agents);
    } else if (e.kind === kinds.POLLINATED && player.floraEnabled) {
        playPollinated(player);
    } else if (e.kind === kinds.STAMPEDE) {
        playAtEffect(player, 'stampede');
    } else if (e.kind === kinds.STRAIN_EMERGED) {
        playAtEffect(player, 'strain');
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
        dispatch(player, agents);
        player.sink?.(e);
    }
    return played;
}
