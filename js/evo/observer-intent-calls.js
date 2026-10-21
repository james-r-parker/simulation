// The pending hunt calls, for `eval.hunt_call_answer`. A `PackCalled` event is queued with its lineage; on the next
// tick the hunters of that lineage that hear it are noted; a deliberate bite by one of them within `packWindow`
// ticks answers it. A call is resolved once `packWindow` ticks old. The queue is a ring over typed arrays that doubles
// when full, so a steady run allocates nothing.

import { HEARD_STRIDE } from '../sim/world.js';

const START_CAPACITY = 16;

/** Offset of the hunt loudness in a `heard` row. */
const HUNT_LOUDNESS = 3;

/**
 * @returns {Record<string, any>} an empty hunt-call queue; calls are numbered from 0 in order
 */
export function createHuntCalls() {
    return {
        tick: new Float64Array(START_CAPACITY),
        lineage: new Uint32Array(START_CAPACITY),
        answered: new Uint8Array(START_CAPACITY),
        head: 0,
        size: 0,
        first: 0,
        sampled: 0,
        resolved: 0,
        answeredCalls: 0,
    };
}

/**
 * Doubles the ring, unrolling it so the head is at index 0.
 * @param {Record<string, any>} calls the queue
 * @returns {void}
 */
function grow(calls) {
    const capacity = calls.tick.length;
    for (const name of ['tick', 'lineage', 'answered']) {
        const old = calls[name];
        const next = new old.constructor(capacity * 2);
        for (let i = 0; i < calls.size; i++) {
            next[i] = old[(calls.head + i) % capacity];
        }
        calls[name] = next;
    }
    calls.head = 0;
}

/**
 * Queues a hunt call.
 * @param {Record<string, any>} calls the queue
 * @param {number} tick the call's tick
 * @param {number} lineage the caller's lineage id
 * @returns {void}
 */
export function pushHuntCall(calls, tick, lineage) {
    if (calls.size === calls.tick.length) {
        grow(calls);
    }
    const at = (calls.head + calls.size) % calls.tick.length;
    calls.tick[at] = tick;
    calls.lineage[at] = lineage;
    calls.answered[at] = 0;
    calls.size += 1;
}

/**
 * Gives call number `number` to the alive `canHunt` agents of `lineage` that hear a hunt call now.
 * @param {Record<string, any>} intent the intent state
 * @param {Record<string, any>} world the world
 * @param {number} lineage the caller's lineage id
 * @param {number} number the call's number
 * @returns {void}
 */
function noteHearers(intent, world, lineage, number) {
    const { alive, spec, lineageId, heard } = world;
    for (let s = 0; s < alive.length; s++) {
        const hears = heard[s * HEARD_STRIDE + HUNT_LOUDNESS] > 0;
        if (alive[s] === 1 && hears && intent.hunterSpec[spec[s]] === 1 && lineageId[s] === lineage) {
            intent.heardCall[s] = number + 1;
        }
    }
}

/**
 * Notes, for each call made before this tick that has not been sampled, the hunters of the caller's lineage that
 * hear a hunt call now (the tick after the call): their `heardCall` becomes the call's number plus 1.
 * @param {Record<string, any>} intent the intent state
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleHearers(intent, world) {
    const calls = intent.calls;
    while (calls.sampled < calls.first + calls.size) {
        const at = (calls.head + calls.sampled - calls.first) % calls.tick.length;
        if (calls.tick[at] >= world.tick) {
            return;
        }
        noteHearers(intent, world, calls.lineage[at], calls.sampled);
        calls.sampled += 1;
    }
}

/**
 * Marks call number `number` answered when it is still queued and at most `span` ticks old.
 * @param {Record<string, any>} calls the queue
 * @param {number} number the call's number
 * @param {number} tick the bite's tick
 * @param {number} span `packWindow`
 * @returns {void}
 */
export function answerHuntCall(calls, number, tick, span) {
    if (number < calls.first || number >= calls.first + calls.size) {
        return;
    }
    const at = (calls.head + number - calls.first) % calls.tick.length;
    if (tick - calls.tick[at] <= span && calls.answered[at] === 0) {
        calls.answered[at] = 1;
    }
}

/**
 * Resolves the calls that are `span` ticks old.
 * @param {Record<string, any>} calls the queue
 * @param {number} tick the observed tick
 * @param {number} span `packWindow`
 * @returns {void}
 */
export function resolveHuntCalls(calls, tick, span) {
    while (calls.size > 0 && calls.tick[calls.head] + span <= tick) {
        calls.resolved += 1;
        calls.answeredCalls += calls.answered[calls.head];
        calls.head = (calls.head + 1) % calls.tick.length;
        calls.size -= 1;
        calls.first += 1;
        calls.sampled = Math.max(calls.sampled, calls.first);
    }
}
