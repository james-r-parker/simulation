// The observer's alarm follow-up. On an `AlarmCalled` event it records the speed of every alive agent without
// `canHunt` as a hearer (alarm loudness above 0 in `heard`) or a control (outside `callRadius` of the caller), with
// its distance band to the nearest `canHunt` agent. `ALARM_RESPONSE_TICKS` later the speed changes of the agents
// still alive are read. Every call of one tick shares a snapshot (genome, band and speed per slot; none of them depend
// on the caller), so a call adds only its role row. Records and snapshots are pooled, so a steady run allocates
// nothing; a pool grows when it runs dry.

import { HEARD_STRIDE } from '../sim/world.js';
import { buildHunterIndex, createHunterIndex, nearestHunterSquared } from './nearest-hunter.js';

/** Ticks between a call and the second speed reading. */
export const ALARM_RESPONSE_TICKS = 10;

/** Width, in px, of the distance bands that match a hearer to its controls. */
export const BAND_PX = 100;

const BANDS = 256;
const HEARER = 1;
const CONTROL = 2;

/**
 * @param {number} dx an x difference
 * @param {number} dy a y difference
 * @returns {number} the vector's length (`Math.hypot` is not bit-exact across engines)
 */
function length(dx, dy) {
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * @param {number} slots slots per record
 * @returns {Record<string, any>} an empty call record
 */
function createRecord(slots) {
    return { tick: 0, role: new Uint8Array(slots), snap: null };
}

/**
 * @param {number} slots slots per snapshot
 * @returns {Record<string, any>} an empty snapshot: `eligible` marks the slots a call may record
 */
function createSnap(slots) {
    return {
        tick: -1,
        refs: 0,
        eligible: new Uint8Array(slots),
        band: new Uint8Array(slots),
        genome: new Uint32Array(slots),
        speed: new Float32Array(slots),
    };
}

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @param {Uint8Array} hunterSpec 1 at each specialisation index that has `canHunt`
 * @returns {Record<string, any>} an empty alarm follow-up
 */
export function createAlarmFollow(config, hunterSpec) {
    const n = config.maxAgents;
    return {
        hunterSpec,
        slots: n,
        free: [],
        freeSnaps: [],
        snap: null,
        nowSpeed: new Float64Array(n),
        queue: [],
        head: 0,
        hunterDist: new Float64Array(n),
        hunterIndex: createHunterIndex(n),
        distTick: -1,
        bandHear: new Float64Array(BANDS),
        bandHearN: new Float64Array(BANDS),
        bandCtl: new Float64Array(BANDS),
        bandCtlN: new Float64Array(BANDS),
        calls: 0,
        matchedCalls: 0,
        sum: 0,
    };
}

/**
 * Fills `hunterDist` with every alive agent's distance to the nearest alive `canHunt` agent (Infinity when none); a
 * hunter's entry is its distance to the nearest other hunter. The nearest is found on squared distances and rooted
 * once: the root is monotone, so the result is the same as rooting each.
 * @param {Record<string, any>} follow the follow-up
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function nearestHunterDistances(follow, world) {
    const { hunterDist: dist, hunterIndex: index, hunterSpec } = follow;
    buildHunterIndex(index, world, hunterSpec);
    for (let s = 0; s < world.alive.length; s++) {
        dist[s] = world.alive[s] === 1 ? Math.sqrt(nearestHunterSquared(index, world, s, hunterSpec)) : Infinity;
    }
}

/**
 * @param {Record<string, any>} follow the follow-up
 * @returns {Record<string, any>} a record from the pool, or a new one
 */
function acquire(follow) {
    return follow.free.pop() ?? createRecord(follow.slots);
}

/**
 * The snapshot of this tick's non-hunters: the first call of a tick fills it, later calls of the tick share it.
 * @param {Record<string, any>} follow the follow-up
 * @param {Record<string, any>} world the world after the step
 * @returns {Record<string, any>} the snapshot, with one reference taken for the caller's record
 */
function snapshotOf(follow, world) {
    let snap = follow.snap;
    if (snap === null || snap.tick !== world.tick) {
        if (snap !== null && snap.refs === 0) {
            follow.freeSnaps.push(snap);
        }
        snap = follow.freeSnaps.pop() ?? createSnap(follow.slots);
        snap.tick = world.tick;
        snap.refs = 0;
        follow.snap = snap;
        nearestHunterDistances(follow, world);
        fillSnapshot(follow, world, snap);
    }
    snap.refs += 1;
    return snap;
}

/**
 * @param {Record<string, any>} follow the follow-up, whose `hunterDist` is current
 * @param {Record<string, any>} world the world after the step
 * @param {Record<string, any>} snap the snapshot to fill
 * @returns {void}
 */
function fillSnapshot(follow, world, snap) {
    const { alive, spec, vx, vy } = world;
    for (let s = 0; s < alive.length; s++) {
        const dist = follow.hunterDist[s];
        const eligible = alive[s] === 1 && dist !== Infinity && follow.hunterSpec[spec[s]] !== 1;
        snap.eligible[s] = eligible ? 1 : 0;
        if (eligible) {
            snap.band[s] = Math.min(BANDS - 1, Math.floor(dist / BAND_PX));
            snap.genome[s] = world.genomeId[s];
            snap.speed[s] = length(vx[s], vy[s]);
        }
    }
}

/**
 * Records an `AlarmCalled` event: each alive non-hunter's role at this tick (its band, genome id and speed are in the
 * tick's snapshot).
 * @param {Record<string, any>} follow the follow-up
 * @param {Record<string, any>} world the world after the step
 * @param {number} caller the caller's slot
 * @returns {void}
 */
export function noteAlarm(follow, world, caller) {
    follow.calls += 1;
    const snap = snapshotOf(follow, world);
    const record = acquire(follow);
    record.tick = world.tick;
    record.snap = snap;
    const { role } = record;
    role.fill(0);
    const { x, y, heard } = world;
    const { callRadius } = world.config;
    for (let s = 0; s < role.length; s++) {
        if (snap.eligible[s] === 0 || s === caller) {
            continue;
        }
        const outside = length(x[s] - x[caller], y[s] - y[caller]) > callRadius;
        role[s] = roleOf(heard[s * HEARD_STRIDE] > 0, outside);
    }
    follow.queue.push(record);
}

/**
 * @param {boolean} heard whether the agent hears an alarm
 * @param {boolean} outside whether it is outside the caller's `callRadius`
 * @returns {number} `HEARER`, `CONTROL`, or 0 for an agent that is neither
 */
function roleOf(heard, outside) {
    if (heard) {
        return HEARER;
    }
    return outside ? CONTROL : 0;
}

/**
 * Adds the speed changes of the agents of `record` that are alive now into the per-band sums.
 * @param {Record<string, any>} follow the follow-up, whose `nowSpeed` holds this tick's speeds
 * @param {Record<string, any>} world the world
 * @param {Record<string, any>} record the call record
 * @returns {void}
 */
function accumulate(follow, world, record) {
    follow.bandHear.fill(0);
    follow.bandHearN.fill(0);
    follow.bandCtl.fill(0);
    follow.bandCtlN.fill(0);
    const { snap, role } = record;
    for (let s = 0; s < role.length; s++) {
        if (role[s] === 0 || world.alive[s] !== 1 || world.genomeId[s] !== snap.genome[s]) {
            continue;
        }
        const change = follow.nowSpeed[s] - snap.speed[s];
        const band = snap.band[s];
        if (role[s] === HEARER) {
            follow.bandHear[band] += change;
            follow.bandHearN[band] += 1;
        } else {
            follow.bandCtl[band] += change;
            follow.bandCtlN[band] += 1;
        }
    }
}

/**
 * Scores one due call: each hearer's change minus the mean change of the controls in its band, averaged over the
 * hearers that have a control, over `maxVelocity`. A call with no such hearer adds nothing.
 * @param {Record<string, any>} follow the follow-up
 * @param {Record<string, any>} world the world
 * @param {Record<string, any>} record the call record
 * @returns {void}
 */
function scoreCall(follow, world, record) {
    accumulate(follow, world, record);
    let excess = 0;
    let matched = 0;
    for (let band = 0; band < BANDS; band++) {
        if (follow.bandHearN[band] > 0 && follow.bandCtlN[band] > 0) {
            const control = follow.bandCtl[band] / follow.bandCtlN[band];
            excess += follow.bandHear[band] - follow.bandHearN[band] * control;
            matched += follow.bandHearN[band];
        }
    }
    if (matched > 0) {
        follow.sum += excess / matched / world.config.maxVelocity;
        follow.matchedCalls += 1;
    }
}

/**
 * Scores the queued calls that are `ALARM_RESPONSE_TICKS` old and recycles their records.
 * @param {Record<string, any>} follow the follow-up
 * @param {Record<string, any>} world the world after the step
 * @returns {void}
 */
export function resolveAlarms(follow, world) {
    const { queue } = follow;
    if (follow.head < queue.length && queue[follow.head].tick + ALARM_RESPONSE_TICKS <= world.tick) {
        fillNowSpeed(follow, world);
    }
    while (follow.head < queue.length && queue[follow.head].tick + ALARM_RESPONSE_TICKS <= world.tick) {
        const record = queue[follow.head];
        scoreCall(follow, world, record);
        release(follow, record);
        follow.head += 1;
    }
    if (follow.head === queue.length) {
        queue.length = 0;
        follow.head = 0;
    }
}

/**
 * @param {Record<string, any>} follow the follow-up
 * @param {Record<string, any>} record a scored record: back to the pool, and its snapshot too once no record uses it
 * @returns {void}
 */
function release(follow, record) {
    follow.free.push(record);
    const { snap } = record;
    snap.refs -= 1;
    if (snap.refs === 0 && snap !== follow.snap) {
        follow.freeSnaps.push(snap);
    }
    record.snap = null;
}

/**
 * Computes every alive agent's speed once for the calls scored this tick.
 * @param {Record<string, any>} follow the follow-up
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
function fillNowSpeed(follow, world) {
    const { alive, vx, vy } = world;
    for (let s = 0; s < alive.length; s++) {
        if (alive[s] === 1) {
            follow.nowSpeed[s] = length(vx[s], vy[s]);
        }
    }
}
