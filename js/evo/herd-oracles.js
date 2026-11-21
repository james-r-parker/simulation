// The scripted body of the herd scene (docs/designs/role-budget.md, "Cross-check against the sim"): a body that stands until a herd animal
// is on a ray, then, `reaction` ticks later, turns for the nearer flank and runs. It is given the full world state; steering uses the
// vectors of chase-oracles.js.

import { OUTPUT_COUNT, OUTPUT_INDEX } from '../sim/brain-layout.js';
import { steer } from './chase-oracles.js';

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the body
 * @returns {number} the distance to the nearest alive herd animal's centre, Infinity with none
 */
export function nearestAnimal(world, slot) {
    let best = Infinity;
    for (let animal = 0; animal < world.herdMax; animal++) {
        if (world.herdAlive[animal] === 1) {
            const dx = world.herdX[animal] - world.x[slot];
            const dy = world.herdY[animal] - world.y[slot];
            best = Math.min(best, Math.sqrt(dx * dx + dy * dy));
        }
    }
    return best;
}

/**
 * The body that clears a herd: it stands until the nearest animal is within `seeGap` (a ray meets an animal at `viewReach` plus
 * `herdRadius`), waits `reaction` ticks, then holds `THRUST` (and `SPRINT` when asked) and steers for the flank on the side of the
 * herd's centre line it stands on (`(0, +-1)`, the flee axis being +x).
 * @param {{slot: number, seeGap: number, reaction: number, sprint: boolean, run?: boolean}} body the body, the centre gap at which it
 *   sees the herd, the ticks from seeing to moving, whether it sprints and whether it runs at all (false: it stands)
 * @returns {((world: Record<string, any>) => void) & {state: {seenTick: number}}} a `brain` phase body and its reading
 */
export function clearerBrain({ slot, seeGap, reaction, sprint, run = true }) {
    const state = { seenTick: -1 };
    const brain = (/** @type {Record<string, any>} */ world) => {
        const row = slot * OUTPUT_COUNT;
        world.outputs.fill(0, row, row + OUTPUT_COUNT);
        if (state.seenTick < 0 && nearestAnimal(world, slot) <= seeGap) {
            state.seenTick = world.tick;
        }
        if (run && state.seenTick >= 0 && world.tick >= state.seenTick + reaction) {
            const side = Math.sign(world.y[slot] - world.groupCentroidY[0]) || 1;
            world.outputs[row + OUTPUT_INDEX.THRUST] = 1;
            world.outputs[row + OUTPUT_INDEX.SPRINT] = sprint ? 1 : 0;
            world.outputs[row + OUTPUT_INDEX.TURN] = steer(world, slot, { x: 0, y: side });
        }
    };
    return Object.assign(brain, { state });
}
