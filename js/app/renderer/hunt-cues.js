// The small pure rules behind the hunter's look: the jaw follows the BITE output, the flagella lash with thrust and a
// body stretches as it sprints. Each is a drawing cue read from the blended agents, never a sim fact.

/** How fast the jaw eases open and shut, per second. */
export const JAW_RATE = 28;
/** The share of top speed above which a body is drawn stretched (a sprint). */
export const SPRINT_FROM = 0.6;
/** The `thrust` input of a still body, and its gain with speed: the flagella never rest fully. */
export const THRUST_REST = 0.3;

/**
 * @param {number} flags an agent's snapshot flags
 * @param {Record<string, number>} bits `ready.layout.flags`
 * @returns {number} 1 while the agent's BITE output holds its jaw open (`JAW_OPEN`), else 0
 */
export function jawTarget(flags, bits) {
    return (flags & bits.JAW_OPEN) !== 0 ? 1 : 0;
}

/**
 * @param {number} current the jaw's openness now, 0 to 1
 * @param {{target: number, dtMs: number}} step the target and the frame time
 * @returns {number} the openness after the frame: an exponential approach, so the speed does not depend on the frame
 *   rate
 */
export function easeJaw(current, { target, dtMs }) {
    return current + (target - current) * (1 - Math.exp((-JAW_RATE * dtMs) / 1000));
}

/**
 * @param {number} speed01 the agent's speed share of the top speed
 * @returns {number} the flagella's thrust, `THRUST_REST` at rest to 1 at top speed
 */
export function thrustOf(speed01) {
    return THRUST_REST + (1 - THRUST_REST) * Math.min(Math.max(speed01, 0), 1);
}

/**
 * @param {number} speed01 the agent's speed share of the top speed
 * @returns {number} the sprint amplitude: 0 up to `SPRINT_FROM`, rising to 1 at top speed
 */
export function sprintAmp(speed01) {
    return Math.min(Math.max((speed01 - SPRINT_FROM) / (1 - SPRINT_FROM), 0), 1);
}
