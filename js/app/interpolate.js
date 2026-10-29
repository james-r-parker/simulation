// Blends the two newest snapshots into the agents to draw, and keeps the playhead: the render tick that gives the blend
// factor. Nothing here allocates per frame.

/** Words in a snapshot's header and per agent (`js/sim/snapshot.js`; a test keeps the two in step). */
export const HEADER_WORDS = 6;
export const AGENT_STRIDE = 12;

/** Offsets of an agent's fields within its record. */
export const AGENT_FIELD = Object.freeze({
    X: 0,
    Y: 1,
    ANGLE: 2,
    SIZE: 3,
    ENERGY: 4,
    SPEC: 5,
    LINEAGE: 6,
    GENOME: 7,
    SLOT: 8,
    TEMPERATURE: 9,
    SPEED: 10,
    FLAGS: 11,
});

/** Snapshot arrivals the tick-rate estimate looks at. */
const ARRIVALS = 8;
/** After this long without a new snapshot the sim is taken to be paused. */
const PAUSED_AFTER_MS = 250;
/** The share of the playhead's error pulled in each frame. */
const PULL = 0.1;
/** The longest frame time the playhead advances by, so a stalled tab does not jump it. */
const MAX_FRAME_MS = 100;

/**
 * @typedef {object} Interpolated
 * @property {number} count agents written
 * @property {Float32Array} x
 * @property {Float32Array} y
 * @property {Float32Array} angle
 * @property {Float32Array} size
 * @property {Float32Array} energy
 * @property {Float32Array} temperature
 * @property {Float32Array} speed
 * @property {Uint32Array} spec
 * @property {Uint32Array} lineageId
 * @property {Uint32Array} genomeId
 * @property {Uint32Array} slot
 * @property {Uint32Array} flags
 * @property {Int32Array} previous scratch: the previous snapshot's index plus 1, by slot (all 0 between calls)
 */

/**
 * @param {number} capacity the most agents (`ready.info.maxAgents`)
 * @returns {Interpolated} the arrays `interpolateInto` fills
 */
export function createInterpolated(capacity) {
    return {
        count: 0,
        x: new Float32Array(capacity),
        y: new Float32Array(capacity),
        angle: new Float32Array(capacity),
        size: new Float32Array(capacity),
        energy: new Float32Array(capacity),
        temperature: new Float32Array(capacity),
        speed: new Float32Array(capacity),
        turn: new Float32Array(capacity),
        spec: new Uint32Array(capacity),
        lineageId: new Uint32Array(capacity),
        genomeId: new Uint32Array(capacity),
        slot: new Uint32Array(capacity),
        flags: new Uint32Array(capacity),
        previous: new Int32Array(capacity),
    };
}

/**
 * @param {number} from an angle in radians
 * @param {number} to an angle in radians
 * @returns {number} the shortest arc difference in [-PI, PI]
 */
export function shortestArc(from, to) {
    let delta = (to - from) % (2 * Math.PI);
    if (delta > Math.PI) {
        delta -= 2 * Math.PI;
    } else if (delta < -Math.PI) {
        delta += 2 * Math.PI;
    }
    return delta;
}

/**
 * @param {number} from an angle in radians
 * @param {number} to an angle in radians
 * @param {number} alpha 0 to 1
 * @returns {number} the angle `alpha` of the way from `from` to `to` by the shorter arc
 */
export function lerpAngle(from, to, alpha) {
    return from + shortestArc(from, to) * alpha;
}

/**
 * Blends the agents of two snapshots. Agents are matched by slot and `genomeId`; one with no match (born since, or
 * its slot reused) is placed at its newest position. Everything but position, size, energy, temperature and angle comes
 * from `next`.
 * @param {{u32: Uint32Array, f32: Float32Array} | null} prev the older snapshot, null when there is only one
 * @param {{u32: Uint32Array, f32: Float32Array}} next the newer snapshot
 * @param {number} alpha 0 for `prev`, 1 for `next`
 * @param {Interpolated} out the arrays to fill
 * @returns {number} the agent count
 */
export function interpolateInto(prev, next, alpha, out) {
    const { previous } = out;
    const older = prev ?? next;
    const prevCount = prev === null ? 0 : prev.u32[1];
    for (let i = 0; i < prevCount; i++) {
        previous[older.u32[HEADER_WORDS + i * AGENT_STRIDE + AGENT_FIELD.SLOT]] = i + 1;
    }
    const count = Math.min(next.u32[1], out.x.length);
    const tickDelta = prev !== null && next.u32[0] > prev.u32[0] ? next.u32[0] - prev.u32[0] : 1;
    for (let i = 0; i < count; i++) {
        const n = HEADER_WORDS + i * AGENT_STRIDE;
        const index = previous[next.u32[n + AGENT_FIELD.SLOT]];
        const p = HEADER_WORDS + (index - 1) * AGENT_STRIDE;
        const matched = index > 0 && older.u32[p + AGENT_FIELD.GENOME] === next.u32[n + AGENT_FIELD.GENOME];
        writeNewest(out, i, next, n);
        if (matched) {
            blendAt.p = p;
            blendAt.alpha = alpha;
            blendAt.tickDelta = tickDelta;
            blendAt.nextAngle = next.f32[n + AGENT_FIELD.ANGLE];
            blend(out, i, older.f32, blendAt);
        }
    }
    for (let i = 0; i < prevCount; i++) {
        previous[older.u32[HEADER_WORDS + i * AGENT_STRIDE + AGENT_FIELD.SLOT]] = 0;
    }
    out.count = count;
    return count;
}

/** Scratch for `blend`, so the per-agent call passes no object: the word offset in the older snapshot and alpha. */
const blendAt = { p: 0, alpha: 0, tickDelta: 1, nextAngle: 0 };

/**
 * Moves the agent at output index `i` from its `prev` values towards the ones already written there.
 * @param {Interpolated} out the arrays, holding the newest values
 * @param {number} i the output index
 * @param {Float32Array} g the older snapshot's floats
 * @param {{p: number, alpha: number, tickDelta: number, nextAngle: number}} at word offset, blend factor, tickDelta, nextAngle
 * @returns {void}
 */
function blend(out, i, g, at) {
    const { p, alpha, tickDelta, nextAngle } = at;
    out.x[i] = g[p + AGENT_FIELD.X] + (out.x[i] - g[p + AGENT_FIELD.X]) * alpha;
    out.y[i] = g[p + AGENT_FIELD.Y] + (out.y[i] - g[p + AGENT_FIELD.Y]) * alpha;
    out.size[i] = g[p + AGENT_FIELD.SIZE] + (out.size[i] - g[p + AGENT_FIELD.SIZE]) * alpha;
    out.energy[i] = g[p + AGENT_FIELD.ENERGY] + (out.energy[i] - g[p + AGENT_FIELD.ENERGY]) * alpha;
    out.temperature[i] = g[p + AGENT_FIELD.TEMPERATURE] + (out.temperature[i] - g[p + AGENT_FIELD.TEMPERATURE]) * alpha;
    out.angle[i] = lerpAngle(g[p + AGENT_FIELD.ANGLE], out.angle[i], alpha);
    out.turn[i] = shortestArc(g[p + AGENT_FIELD.ANGLE], nextAngle) / tickDelta;
}

/**
 * Writes the newest values of the agent at word offset `n` of `next` to output index `i`.
 * @param {Interpolated} out the arrays to fill
 * @param {number} i the output index
 * @param {{u32: Uint32Array, f32: Float32Array}} next the newer snapshot
 * @param {number} n the agent's word offset in it
 * @returns {void}
 */
function writeNewest(out, i, next, n) {
    const f = next.f32;
    const u = next.u32;
    out.angle[i] = f[n + AGENT_FIELD.ANGLE];
    out.turn[i] = 0;
    out.x[i] = f[n + AGENT_FIELD.X];
    out.y[i] = f[n + AGENT_FIELD.Y];
    out.size[i] = f[n + AGENT_FIELD.SIZE];
    out.energy[i] = f[n + AGENT_FIELD.ENERGY];
    out.temperature[i] = f[n + AGENT_FIELD.TEMPERATURE];
    out.speed[i] = f[n + AGENT_FIELD.SPEED];
    out.spec[i] = u[n + AGENT_FIELD.SPEC];
    out.lineageId[i] = u[n + AGENT_FIELD.LINEAGE];
    out.genomeId[i] = u[n + AGENT_FIELD.GENOME];
    out.slot[i] = u[n + AGENT_FIELD.SLOT];
    out.flags[i] = u[n + AGENT_FIELD.FLAGS];
}

/**
 * @typedef {object} Playhead
 * @property {number} tick the render tick, fractional
 * @property {number} alpha the blend factor between the two held snapshots, 0 to 1
 * @property {Float64Array} arrivalMs wall time of the last `ARRIVALS` snapshot arrivals (a ring)
 * @property {Float64Array} arrivalTick the ticks they showed
 * @property {number} arrivals arrivals recorded, up to `ARRIVALS`
 * @property {number} head the ring index of the next arrival
 * @property {number} seenTick the newest snapshot tick noticed
 * @property {number} lastArrivalMs wall time of the newest arrival
 * @property {number} lastNowMs wall time of the previous step
 */

/**
 * @returns {Playhead} a playhead that has seen nothing
 */
export function createPlayhead() {
    return {
        tick: 0,
        alpha: 1,
        arrivalMs: new Float64Array(ARRIVALS),
        arrivalTick: new Float64Array(ARRIVALS),
        arrivals: 0,
        head: 0,
        seenTick: -1,
        lastArrivalMs: 0,
        lastNowMs: 0,
    };
}

/**
 * @param {Playhead} playhead the playhead
 * @param {number} tick the tick of a snapshot that just arrived
 * @param {number} nowMs wall time
 * @returns {void}
 */
function noteArrival(playhead, tick, nowMs) {
    if (tick < playhead.seenTick) {
        playhead.arrivals = 0;
        playhead.head = 0;
    }
    playhead.arrivalMs[playhead.head] = nowMs;
    playhead.arrivalTick[playhead.head] = tick;
    playhead.head = (playhead.head + 1) % ARRIVALS;
    playhead.arrivals = Math.min(playhead.arrivals + 1, ARRIVALS);
    playhead.seenTick = tick;
    playhead.lastArrivalMs = nowMs;
}

/**
 * Advances the playhead by one frame. It advances by the frame time at the tick rate estimated from the last eight
 * arrivals, and is pulled by 10% of the error towards the ideal: one mean snapshot interval behind the newest tick,
 * plus the time since that snapshot arrived at the estimated rate. (Without the second term the pull would hold it
 * back, and each new snapshot would push it forward by a jump.) It stays between the two held snapshots. With one snapshot, or none for 250 ms (paused), it sits on the newest tick.
 * @param {Playhead} playhead the playhead
 * @param {{prev: {tick: number} | null, latest: {tick: number} | null}} snapshots the client's held snapshots
 * @param {number} nowMs wall time, as `requestAnimationFrame` gives it
 * @returns {number} the blend factor, also in `playhead.alpha`
 */
export function stepPlayhead(playhead, snapshots, nowMs) {
    const { prev, latest } = snapshots;
    const frameMs = Math.min(Math.max(nowMs - playhead.lastNowMs, 0), MAX_FRAME_MS);
    playhead.lastNowMs = nowMs;
    if (latest === null) {
        playhead.tick = 0;
        playhead.alpha = 1;
        return 1;
    }
    if (latest.tick !== playhead.seenTick) {
        noteArrival(playhead, latest.tick, nowMs);
    }
    if (prev === null || playhead.arrivals < 2 || nowMs - playhead.lastArrivalMs > PAUSED_AFTER_MS) {
        playhead.tick = latest.tick;
        playhead.alpha = 1;
        return 1;
    }
    const oldest = (playhead.head - playhead.arrivals + ARRIVALS) % ARRIVALS;
    const newest = (playhead.head - 1 + ARRIVALS) % ARRIVALS;
    const span = playhead.arrivals - 1;
    const wall = playhead.arrivalMs[newest] - playhead.arrivalMs[oldest];
    const ticks = playhead.arrivalTick[newest] - playhead.arrivalTick[oldest];
    const rate = wall > 0 ? ticks / wall : 0;
    let tick = playhead.tick + frameMs * rate;
    const ideal = latest.tick - ticks / span + rate * (nowMs - playhead.lastArrivalMs);
    tick += PULL * (ideal - tick);
    tick = Math.min(Math.max(tick, prev.tick), latest.tick);
    playhead.tick = tick;
    playhead.alpha = latest.tick > prev.tick ? (tick - prev.tick) / (latest.tick - prev.tick) : 1;
    return playhead.alpha;
}

/**
 * @param {Playhead} playhead the playhead
 * @returns {number} the tick that effects, rings and sparks are timed by
 */
export function simTickAt(playhead) {
    return playhead.tick;
}
