// Edges in the snapshot flags: the frame an agent becomes sick, infected or pregnant, recovers, or eats. (A call that
// is still sounding throbs in the agent shader from the flag itself.)
// Keeps each slot's previous flags and genome; a slot whose genome changed holds a fresh body and reports nothing.
// Preallocated per slot, so diffing allocates nothing.

/** The edges reported, by id. */
export const EDGE = Object.freeze({
    SICK_ON: 0,
    SICK_OFF: 1,
    INFECTED_ON: 2,
    INFECTED_OFF: 3,
    PREGNANT_ON: 4,
    ATE: 5,
});

/**
 * @typedef {object} FlagEdges
 * @property {Uint32Array} flags each slot's flags last frame
 * @property {Uint32Array} genome each slot's genome last frame, 0 before one was seen
 * @property {Uint8Array} ate each slot's ate timer last frame
 * @property {{bits: Record<string, number>, emit: (edge: number, index: number) => void, index: number}} ctx scratch
 *   for the current call, so diffing makes no closures
 */

/**
 * @param {number} capacity the most slots (`maxAgents`)
 * @returns {FlagEdges} empty edge state
 */
export function createFlagEdges(capacity) {
    return {
        flags: new Uint32Array(capacity),
        genome: new Uint32Array(capacity),
        ate: new Uint8Array(capacity),
        ctx: { bits: {}, emit: /** @type {any} */ (null), index: 0 },
    };
}

/**
 * @param {number} before the flags last frame
 * @param {number} now the flags this frame
 * @param {number} bit the flag bit
 * @returns {number} 1 rising, -1 falling, 0 unchanged
 */
function edgeOf(before, now, bit) {
    const was = (before & bit) !== 0;
    const is = (now & bit) !== 0;
    return was === is ? 0 : is ? 1 : -1;
}

/**
 * @param {number} before the flags last frame
 * @param {number} now this frame
 * @param {FlagEdges['ctx']} ctx the bits, the emitter and the agent's index
 * @returns {void}
 */
function emitStateEdges(before, now, { bits, emit, index }) {
    const sick = edgeOf(before, now, bits.SICK);
    if (sick !== 0) {
        emit(sick > 0 ? EDGE.SICK_ON : EDGE.SICK_OFF, index);
    }
    const infected = edgeOf(before, now, bits.INFECTED);
    if (infected !== 0) {
        emit(infected > 0 ? EDGE.INFECTED_ON : EDGE.INFECTED_OFF, index);
    }
    if (edgeOf(before, now, bits.PREGNANT) > 0) {
        emit(EDGE.PREGNANT_ON, index);
    }
}

/**
 * Reports every edge since the previous call, then remembers this frame. An eat is the ate timer falling below its
 * value last frame (it restarts at 1 on the tick of a meal and climbs to its cap).
 * @param {FlagEdges} edges the state
 * @param {import('../interpolate.js').Interpolated} agents the blended agents
 * @param {Record<string, number>} bits `ready.layout.flags`
 * @param {(edge: number, index: number) => void} emit told of each edge with the agent's index in `agents`
 * @returns {void}
 */
export function diffFlags(edges, agents, bits, emit) {
    const { ctx } = edges;
    ctx.bits = bits;
    ctx.emit = emit;
    for (let i = 0; i < agents.count; i++) {
        const slot = agents.slot[i];
        const now = agents.flags[i];
        const ate = (now >> bits.ATE_SHIFT) & bits.TIMER_MASK;
        if (edges.genome[slot] === agents.genomeId[i]) {
            const before = edges.flags[slot];
            if (before !== now) {
                ctx.index = i;
                emitStateEdges(before, now, ctx);
            }
            if (ate < edges.ate[slot]) {
                emit(EDGE.ATE, i);
            }
        }
        edges.genome[slot] = agents.genomeId[i];
        edges.flags[slot] = now;
        edges.ate[slot] = ate;
    }
}
