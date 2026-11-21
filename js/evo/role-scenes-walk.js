// The defender's walking release in the real sim (docs/designs/role-budget.md, "Cross-check against the sim"): it hears the
// alarm, walks onto the smoke spot, stops there facing the caller and holds `SMOKE` once it is still. The decisions are those of
// `walkOut` of role-budget-walk.js, read off the world, so a difference from the formula is the physics (damping, caps, turn
// rate, bumps), not the plan.

import { HEARD_STRIDE } from '../sim/agent-arrays.js';
import { detCos, detSin } from '../sim/det-math.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../sim/brain-layout.js';
import { released, walkOut } from './role-budget-walk.js';

/**
 * @param {Record<string, any>} world the world
 * @param {{slot: number, p: import('./role-budget-params.js').RoleParams}} body the body's slot and numbers
 * @returns {import('./role-budget-walk.js').Walker} the body as the walk reads it
 */
function walkerOf(world, { slot, p }) {
    const angle = world.angle[slot];
    return {
        p,
        x: world.x[slot],
        y: world.y[slot],
        vx: world.vx[slot],
        vy: world.vy[slot],
        size: world.size[slot],
        ch: detCos(angle),
        sh: detSin(angle),
        angle,
    };
}

/**
 * Notes the tick the defender first hears the alarm louder than `threshold`, and the tick it acts (`reaction` ticks later).
 * @param {Record<string, any>} world the world
 * @param {{heardTick: number, startTick: number}} state the readings, updated in place
 * @param {{defender: number, reaction: number, threshold: number}} slots the defender, the reaction ticks and the loudness
 * @returns {void}
 */
export function noteHearing(world, state, { defender, reaction, threshold }) {
    if (state.heardTick < 0 && world.heard[defender * HEARD_STRIDE] > threshold) {
        state.heardTick = world.tick;
        state.startTick = world.tick + reaction;
    }
}

/**
 * Clears the defender's outputs, notes its hearing and says whether it acts this tick: from `startTick` until it has released.
 * @param {Record<string, any>} world the world
 * @param {{heardTick: number, startTick: number, releaseTick: number}} state the readings, updated in place
 * @param {{defender: number, reaction: number, threshold: number}} slots the defender, the reaction ticks and the loudness
 * @returns {number} the first index of the defender's output row when it acts, -1 when it stands
 */
export function actingRow(world, state, slots) {
    const row = slots.defender * OUTPUT_COUNT;
    world.outputs.fill(0, row, row + OUTPUT_COUNT);
    noteHearing(world, state, slots);
    return state.startTick < 0 || world.tick < state.startTick || state.releaseTick >= 0 ? -1 : row;
}

/**
 * @param {{defender: number, to: {x: number, y: number}, p: import('./role-budget-params.js').RoleParams, reaction: number,
 *   threshold: number}} slots the defender, the spot (in world coordinates), its numbers, the reaction ticks and the loudness
 *   it acts on
 * @returns {((world: Record<string, any>) => void) & {state: {heardTick: number, startTick: number, releaseTick: number}}}
 *   a `brain` phase body and its readings
 */
export function walkerBrain({ defender, to, p, reaction, threshold }) {
    const state = { heardTick: -1, startTick: -1, releaseTick: -1 };
    let cut = false;
    const brain = (/** @type {Record<string, any>} */ world) => {
        const row = actingRow(world, state, { defender, reaction, threshold });
        if (row < 0) {
            return;
        }
        const body = walkerOf(world, { slot: defender, p });
        if (cut && released(body)) {
            state.releaseTick = world.tick;
            world.outputs[row + OUTPUT_INDEX.SMOKE] = 1;
            return;
        }
        const held = walkOut(body, { to, cut });
        cut = held.cut;
        world.outputs[row + OUTPUT_INDEX.TURN] = held.out.turn;
        world.outputs[row + OUTPUT_INDEX.THRUST] = /** @type {number} */ (held.out.thrust);
        world.outputs[row + OUTPUT_INDEX.SPRINT] = held.out.sprint;
    };
    return Object.assign(brain, { state });
}
