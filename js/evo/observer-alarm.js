// The observer's alarm follow-up. On an `AlarmCalled` event it records the speed of every alive agent without
// `canHunt` as a hearer (alarm loudness above 0 in `heard`) or a control (outside `callRadius` of the caller), with
// its distance band to the nearest `canHunt` agent. `ALARM_RESPONSE_TICKS` later the speed changes of the agents
// still alive are read. Call records are pooled, so a steady run allocates nothing; the pool grows when it runs dry.

import { HEARD_STRIDE } from '../sim/world.js';

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
    return {
        tick: 0,
        role: new Uint8Array(slots),
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
        queue: [],
        head: 0,
        hunterDist: new Float64Array(n),
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
 * Fills `hunterDist` with every alive agent's distance to the nearest alive `canHunt` agent (Infinity when none).
 * @param {Record<string, any>} follow the follow-up
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
function nearestHunterDistances(follow, world) {
    const { alive, spec, x, y } = world;
    const dist = follow.hunterDist;
    dist.fill(Infinity);
    for (let h = 0; h < alive.length; h++) {
        if (alive[h] !== 1 || follow.hunterSpec[spec[h]] !== 1) {
            continue;
        }
        for (let s = 0; s < alive.length; s++) {
            if (alive[s] === 1 && s !== h) {
                dist[s] = Math.min(dist[s], length(x[s] - x[h], y[s] - y[h]));
            }
        }
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
 * Records an `AlarmCalled` event: each alive non-hunter's role, band, genome id and speed at this tick.
 * @param {Record<string, any>} follow the follow-up
 * @param {Record<string, any>} world the world after the step
 * @param {number} caller the caller's slot
 * @returns {void}
 */
export function noteAlarm(follow, world, caller) {
    follow.calls += 1;
    if (follow.distTick !== world.tick) {
        nearestHunterDistances(follow, world);
        follow.distTick = world.tick;
    }
    const record = acquire(follow);
    record.tick = world.tick;
    record.role.fill(0);
    const { alive, spec, x, y, vx, vy } = world;
    for (let s = 0; s < alive.length; s++) {
        const dist = follow.hunterDist[s];
        if (alive[s] !== 1 || s === caller || dist === Infinity || follow.hunterSpec[spec[s]] === 1) {
            continue;
        }
        const outside = length(x[s] - x[caller], y[s] - y[caller]) > world.config.callRadius;
        record.role[s] = roleOf(world.heard[s * HEARD_STRIDE] > 0, outside);
        record.band[s] = Math.min(BANDS - 1, Math.floor(dist / BAND_PX));
        record.genome[s] = world.genomeId[s];
        record.speed[s] = length(vx[s], vy[s]);
    }
    follow.queue.push(record);
}

/**
 * Adds the speed changes of the agents of `record` that are alive now into the per-band sums.
 * @param {Record<string, any>} follow the follow-up
 * @param {Record<string, any>} world the world
 * @param {Record<string, any>} record the call record
 * @returns {void}
 */
function accumulate(follow, world, record) {
    follow.bandHear.fill(0);
    follow.bandHearN.fill(0);
    follow.bandCtl.fill(0);
    follow.bandCtlN.fill(0);
    for (let s = 0; s < record.role.length; s++) {
        const role = record.role[s];
        if (role === 0 || world.alive[s] !== 1 || world.genomeId[s] !== record.genome[s]) {
            continue;
        }
        const change = length(world.vx[s], world.vy[s]) - record.speed[s];
        const band = record.band[s];
        if (role === HEARER) {
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
    while (follow.head < queue.length && queue[follow.head].tick + ALARM_RESPONSE_TICKS <= world.tick) {
        const record = queue[follow.head];
        scoreCall(follow, world, record);
        follow.free.push(record);
        follow.head += 1;
    }
    if (follow.head === queue.length) {
        queue.length = 0;
        follow.head = 0;
    }
}
