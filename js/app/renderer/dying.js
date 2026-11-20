// Dying bodies. The snapshot drops an agent the moment it dies and the `DIED` record carries only its genome, lineage,
// cause and killer, so the renderer keeps what it needs: a last-seen cache by slot (`trackBodies`, every frame, after the
// blend) and a pool of dying bodies. An agent that vanishes from its slot becomes a pending body that carries on at its
// last velocity, slowing to rest (the failing beat of docs/designs/ambient-display.md, "A death that reads"); `beginDeath`
// (the `DIED` record) gives it its cause and starts its clock; `stepDying` retires it. The clock is wall time, so a death
// lasts as long at speed x8 and while paused. A body whose `DIED` plays while the agent is still in the frame is started
// from the cache and hidden from the live rows (`isHidden`). Pure and allocation-free.

import { plainLane } from '../lanes.js';
import { animFor, FAIL_MS } from './death-anim.js';

/** The most bodies dying at once; a new one overwrites the oldest. */
export const MAX_DYING = 64;
/** More bodies than this vanishing in one frame is a reset or a hidden tab, not deaths: none spawn. */
export const MASS_LOSS = 32;
/** A pending body whose `DIED` has not played by now starts as a starvation, ms: the failing beat's length, which it
 * has then run, so its clip starts at the breaking beat. */
export const PENDING_MAX_MS = FAIL_MS;
/** The ticks per second the drift scale assumes, the share of its last speed a body keeps drifting at and the time
 * constant its speed decays to rest over, ms (about three of them is the failing beat). */
export const DRIFT = Object.freeze({ ticksPerSec: 60, share: 0.5, decayMs: 150 });

const PENDING = 1;
const PLAYING = 2;

/**
 * @typedef {object} Dying
 * @property {Float32Array[]} seen the last-seen cache by slot: x, y, angle, size, energy, speed, temperature
 * @property {Uint32Array} seenState the state word last seen in each slot
 * @property {Uint32Array} seenFlags the flags word last seen in each slot
 * @property {Uint32Array} seenGenome the genome last seen in each slot, 0 when none
 * @property {Uint32Array} seenSpec its specialisation
 * @property {Uint32Array} seenLineage its lineage
 * @property {Uint32Array} seenFrame the frame it was last seen in
 * @property {Uint8Array} hidden 1 while the slot's live row is replaced by a dying body
 * @property {Int32Array} head `[frame, next]`: the frame counter and the pool slot the next body takes (the oldest is
 *   overwritten); an array, so the pool can sit in shared memory
 * @property {Uint8Array} state each pool body's state: 0 free, pending or playing
 * @property {Uint32Array} word the body's state word as last seen
 * @property {Uint32Array} flags its flags word as last seen
 * @property {Uint32Array} genome the body's genome
 * @property {Uint32Array} spec its specialisation
 * @property {Uint32Array} lineage its lineage
 * @property {Float32Array[]} pose x, y, angle, size, energy, then the velocity in world units per ms (vx, vy) and the
 *   temperature
 * @property {Float32Array} bearing where the membrane tears from, radians in the world frame
 * @property {Float64Array} since the wall time the body became pending
 * @property {Float64Array} start the wall time its death began
 * @property {Uint8Array} cause its death cause number (`ready.layout.deathCauses`)
 */

/** Words of `head`. */
const HEAD = Object.freeze({ FRAME: 0, NEXT: 1 });
const SEEN_FIELDS = 7;
const POSE_FIELDS = 8;

/**
 * @param {number} capacity the most slots (`maxAgents`)
 * @param {import('../lanes.js').LaneAllocator} [alloc] makes each lane (shared memory for the pack worker)
 * @returns {Dying} an empty state
 */
export function createDying(capacity, alloc = plainLane) {
    return {
        seen: Array.from({ length: SEEN_FIELDS }, () => alloc(Float32Array, capacity)),
        seenState: alloc(Uint32Array, capacity),
        seenFlags: alloc(Uint32Array, capacity),
        seenGenome: alloc(Uint32Array, capacity),
        seenSpec: alloc(Uint32Array, capacity),
        seenLineage: alloc(Uint32Array, capacity),
        seenFrame: alloc(Uint32Array, capacity),
        hidden: alloc(Uint8Array, capacity),
        head: alloc(Int32Array, 2),
        state: alloc(Uint8Array, MAX_DYING),
        word: alloc(Uint32Array, MAX_DYING),
        flags: alloc(Uint32Array, MAX_DYING),
        bearing: alloc(Float32Array, MAX_DYING),
        genome: alloc(Uint32Array, MAX_DYING),
        spec: alloc(Uint32Array, MAX_DYING),
        lineage: alloc(Uint32Array, MAX_DYING),
        pose: Array.from({ length: POSE_FIELDS }, () => alloc(Float32Array, MAX_DYING)),
        since: alloc(Float64Array, MAX_DYING),
        start: alloc(Float64Array, MAX_DYING),
        cause: alloc(Uint8Array, MAX_DYING),
    };
}

/**
 * Claims the pool slot of a new pending body from the slot's cache entry.
 * @param {Dying} d the state
 * @param {number} slot the cache slot the body was last seen in
 * @param {number} nowMs wall time
 * @returns {number} the pool index
 */
function spawnPending(d, slot, nowMs) {
    const k = d.head[HEAD.NEXT];
    d.head[HEAD.NEXT] = (k + 1) % MAX_DYING;
    d.state[k] = PENDING;
    d.genome[k] = d.seenGenome[slot];
    d.spec[k] = d.seenSpec[slot];
    d.lineage[k] = d.seenLineage[slot];
    for (let f = 0; f < 5; f++) {
        d.pose[f][k] = d.seen[f][slot];
    }
    d.pose[7][k] = d.seen[6][slot];
    d.word[k] = d.seenState[slot];
    d.flags[k] = d.seenFlags[slot];
    const angle = d.seen[2][slot];
    d.bearing[k] = angle;
    const perMs = (d.seen[5][slot] * DRIFT.ticksPerSec) / 1000;
    d.pose[5][k] = Math.cos(angle) * perMs;
    d.pose[6][k] = Math.sin(angle) * perMs;
    d.since[k] = nowMs;
    d.start[k] = 0;
    d.cause[k] = 0;
    return k;
}

/**
 * @param {Dying} d the state
 * @param {import('../interpolate.js').Interpolated} agents the frame's agents
 * @param {number} i the agent's index
 * @returns {void}
 */
function remember(d, agents, i) {
    const slot = agents.slot[i];
    d.seenGenome[slot] = agents.genomeId[i];
    d.seenSpec[slot] = agents.spec[i];
    d.seenLineage[slot] = agents.lineageId[i];
    d.seenFrame[slot] = d.head[HEAD.FRAME];
    d.seen[0][slot] = agents.x[i];
    d.seen[1][slot] = agents.y[i];
    d.seen[2][slot] = agents.angle[i];
    d.seen[3][slot] = agents.size[i];
    d.seen[4][slot] = agents.energy[i];
    d.seen[5][slot] = agents.speed[i];
    d.seen[6][slot] = agents.temperature[i];
    d.seenState[slot] = agents.state[i];
    d.seenFlags[slot] = agents.flags[i];
}

/**
 * Counts the cached bodies that were not seen this frame.
 * @param {Dying} d the state
 * @returns {number} how many
 */
function countGone(d) {
    let gone = 0;
    for (let slot = 0; slot < d.seenGenome.length; slot++) {
        if (d.seenGenome[slot] !== 0 && d.seenFrame[slot] !== d.head[HEAD.FRAME]) {
            gone += 1;
        }
    }
    return gone;
}

/**
 * Turns a body that left its slot into a pending one, unless its death already runs (its live row was hidden).
 * @param {Dying} d the state
 * @param {number} slot the slot
 * @param {number} nowMs wall time
 * @returns {number} 1 when a pending body was made, else 0
 */
function release(d, slot, nowMs) {
    const spawn = d.hidden[slot] === 0;
    if (spawn) {
        spawnPending(d, slot, nowMs);
    }
    d.hidden[slot] = 0;
    return spawn ? 1 : 0;
}

/**
 * Notes this frame's agents and turns every body that vanished since the last frame into a pending dying body. A slot
 * reused by a new genome counts as the old body vanishing.
 * @param {Dying} d the state
 * @param {import('../interpolate.js').Interpolated} agents the frame's agents
 * @param {number} nowMs wall time
 * @returns {number} bodies that became pending
 */
export function trackBodies(d, agents, nowMs) {
    d.head[HEAD.FRAME] += 1;
    let spawned = 0;
    const capacity = d.seenGenome.length;
    for (let i = 0; i < agents.count; i++) {
        const slot = agents.slot[i];
        if (slot < capacity) {
            const reused = d.seenGenome[slot] !== 0 && d.seenGenome[slot] !== agents.genomeId[i];
            spawned += reused ? release(d, slot, nowMs) : 0;
            remember(d, agents, i);
        }
    }
    const mass = countGone(d) > MASS_LOSS;
    for (let slot = 0; slot < capacity; slot++) {
        if (d.seenGenome[slot] !== 0 && d.seenFrame[slot] !== d.head[HEAD.FRAME]) {
            spawned += mass ? 0 : release(d, slot, nowMs);
            d.hidden[slot] = 0;
            d.seenGenome[slot] = 0;
        }
    }
    return spawned;
}

/**
 * @param {Dying} d the state
 * @param {number} slot a slot
 * @param {number} genome the live agent's genome
 * @returns {boolean} whether the slot's live row is replaced by a dying body
 */
export function isHidden(d, slot, genome) {
    return slot < d.hidden.length && d.hidden[slot] === 1 && d.seenGenome[slot] === genome;
}

/**
 * @param {Dying} d the state
 * @param {number} genome a genome
 * @returns {number} the pool index of its pending body, -1 when none
 */
function findPending(d, genome) {
    for (let k = 0; k < MAX_DYING; k++) {
        if (d.state[k] === PENDING && d.genome[k] === genome) {
            return k;
        }
    }
    return -1;
}

/**
 * Starts a pending body from the cache entry of an agent still in the frame, and hides its live row.
 * @param {Dying} d the state
 * @param {number} genome a genome
 * @param {number} nowMs wall time
 * @returns {number} the pool index, -1 when the genome is not in the frame
 */
function fromLive(d, genome, nowMs) {
    for (let slot = 0; slot < d.seenGenome.length; slot++) {
        if (d.seenGenome[slot] === genome && d.seenFrame[slot] === d.head[HEAD.FRAME] && d.hidden[slot] === 0) {
            d.hidden[slot] = 1;
            return spawnPending(d, slot, nowMs);
        }
    }
    return -1;
}

/**
 * Gives a dying body its cause and starts its clock: the pending body of that genome, or, when the agent is still in
 * the frame, a body started from the cache whose live row is then hidden.
 * @param {Dying} d the state
 * @param {{genome: number, cause: number, nowMs: number, bearing?: number}} death the dead genome, its cause number, wall
 *   time and, when known, the world bearing the membrane tears from (a body eaten: towards its killer)
 * @returns {boolean} whether a body was found
 */
export function beginDeath(d, { genome, cause, nowMs, bearing }) {
    let k = findPending(d, genome);
    if (k < 0) {
        k = fromLive(d, genome, nowMs);
    }
    if (k < 0) {
        return false;
    }
    d.state[k] = PLAYING;
    d.cause[k] = cause;
    d.start[k] = nowMs;
    if (bearing !== undefined) {
        d.bearing[k] = bearing;
    }
    return true;
}

/**
 * @param {Dying} d the state
 * @param {number} genome a genome
 * @returns {number} the pool index of the playing body of that genome (the newest one), -1 when none
 */
export function deathBody(d, genome) {
    let found = -1;
    for (let k = 0; k < MAX_DYING; k++) {
        if (d.state[k] === PLAYING && d.genome[k] === genome && (found < 0 || d.start[k] >= d.start[found])) {
            found = k;
        }
    }
    return found;
}

/**
 * Starts the pending bodies that waited too long and frees the finished ones.
 * @param {Dying} d the state
 * @param {{nowMs: number, causeNames: readonly string[]}} at wall time and the cause names by number
 * @returns {number} bodies still dying
 */
export function stepDying(d, { nowMs, causeNames }) {
    let live = 0;
    for (let k = 0; k < MAX_DYING; k++) {
        if (d.state[k] === PENDING && nowMs - d.since[k] > PENDING_MAX_MS) {
            d.state[k] = PLAYING;
            d.start[k] = nowMs - FAIL_MS;
        }
        if (d.state[k] === PLAYING && nowMs - d.start[k] >= animFor(causeNames[d.cause[k]]).ms) {
            d.state[k] = 0;
        }
        live += d.state[k] === 0 ? 0 : 1;
    }
    return live;
}

/**
 * @param {Dying} d the state
 * @param {number} k a pool index
 * @param {number} nowMs wall time
 * @returns {{x: number, y: number}} where the body is: carried on at its last velocity, slowing to rest over
 *   `DRIFT.decayMs` from the moment it vanished, so the failing beat never glides frozen. One shared scratch
 */
export function positionOf(d, k, nowMs) {
    const travel = driftOf(nowMs - d.since[k]) * DRIFT.share;
    AT.x = d.pose[0][k] + d.pose[5][k] * travel;
    AT.y = d.pose[1][k] + d.pose[6][k] * travel;
    return AT;
}

/**
 * @param {number} sinceMs wall time since the body vanished
 * @returns {number} the time it has travelled at its last speed, ms: its speed decays as `exp(-t / decayMs)`
 */
export function driftOf(sinceMs) {
    return DRIFT.decayMs * (1 - Math.exp(-Math.max(sinceMs, 0) / DRIFT.decayMs));
}

/**
 * @param {number} sinceMs wall time since the body vanished
 * @returns {number} the share of its last speed the body still has, 1 to 0
 */
export function speedShare(sinceMs) {
    return Math.exp(-Math.max(sinceMs, 0) / DRIFT.decayMs);
}

const AT = { x: 0, y: 0 };

/**
 * @param {Dying} d the state
 * @param {number} k a pool index
 * @returns {boolean} whether the body's death is playing (not still pending)
 */
export function isPlaying(d, k) {
    return d.state[k] === PLAYING;
}

/**
 * @param {Dying} d the state
 * @param {number} k a pool index
 * @returns {boolean} whether the pool slot holds a body
 */
export function isUsed(d, k) {
    return d.state[k] !== 0;
}
