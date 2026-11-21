// The scripted bodies of the Phase 4 scenes (docs/designs/role-budget.md, "Cross-check against the sim"): a forager that steers to the
// nearest food and grazes, a wayfarer that walks at a given speed until food is in view and then steers to it (or heads for the
// nearest patch first), and a sitter that does nothing. Each is given the full world state; steering uses the vectors of
// chase-oracles.js, so the same inputs give the same outputs everywhere.

import { OUTPUT_COUNT, OUTPUT_INDEX } from '../sim/brain-layout.js';
import { thrustEfficiency } from '../sim/temperature.js';
import { steer } from './chase-oracles.js';

/** How far inside the touching distance a body holds `BITE` while it closes on food, so it bites on the tick it can eat. */
const BITE_MARGIN = 30;

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the body
 * @returns {number} the offset of its output row, the row zeroed
 */
function clearRow(world, slot) {
    const row = slot * OUTPUT_COUNT;
    world.outputs.fill(0, row, row + OUTPUT_COUNT);
    return row;
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the body
 * @param {number} speed the steady speed wanted, in px a tick
 * @returns {number} the `THRUST` output that gives it at the body's fat and temperature (at most 1): the steady speed is
 *   `output x maxThrust x efficiency x fat x damping / (1 - damping)`
 */
export function walkThrust(world, slot, speed) {
    const { lanes, config } = world;
    const fat = 1 - (lanes.fatSlowShare[slot] * world.energy[slot]) / lanes.maxEnergy[slot];
    const per = (lanes.maxThrust[slot] * thrustEfficiency(world, slot) * fat * config.damping) / (1 - config.damping);
    return Math.min(1, speed / per);
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the body
 * @param {number} within the furthest distance to look at
 * @returns {{food: number, gap: number}} the nearest alive food within `within` of the body (food -1 when none) and its gap
 */
export function nearestFood(world, slot, within) {
    let food = -1;
    let best = within * within;
    const { foodAlive, foodX, foodY } = world;
    for (let i = 0; i < foodAlive.length; i++) {
        if (foodAlive[i] === 1) {
            const dx = foodX[i] - world.x[slot];
            const dy = foodY[i] - world.y[slot];
            const d2 = dx * dx + dy * dy;
            if (d2 < best) {
                best = d2;
                food = i;
            }
        }
    }
    return { food, gap: food < 0 ? Infinity : Math.sqrt(best) };
}

/**
 * Whether food can be in reach at all: the body is within a patch's disc and a view of it. Skips the scan of every food item for
 * a body that is far from every patch.
 * @param {Record<string, any>} world the world
 * @param {number} slot the body
 * @param {number} view the distance it sees food at
 * @returns {boolean} whether a patch is near enough that food may be inside `view`
 */
function nearAPatch(world, slot, view) {
    const reach = world.config.foodPatchRadius + view + BITE_MARGIN;
    for (let i = 0; i < world.config.foodPatchCount; i++) {
        const dx = world.patchX[i] - world.x[slot];
        const dy = world.patchY[i] - world.y[slot];
        if (dx * dx + dy * dy < reach * reach) {
            return true;
        }
    }
    return false;
}

/**
 * The foraging brain: steers at the nearest alive food, holds `THRUST` and `BITE` (a non-hunter eats only while it holds `BITE`), so
 * it runs the grazing gait and the handling gait of a meal as the sim sets them.
 * @param {{slot: number}} body the forager
 * @returns {(world: Record<string, any>) => void} a `brain` phase body
 */
export function foragerBrain({ slot }) {
    return (world) => {
        const row = clearRow(world, slot);
        const { food } = nearestFood(world, slot, Infinity);
        if (food >= 0) {
            const aim = { x: world.foodX[food] - world.x[slot], y: world.foodY[food] - world.y[slot] };
            world.outputs[row + OUTPUT_INDEX.TURN] = steer(world, slot, aim);
        }
        world.outputs[row + OUTPUT_INDEX.THRUST] = 1;
        world.outputs[row + OUTPUT_INDEX.BITE] = 1;
    };
}

/**
 * The first-meal brain. It walks at `speed` px a tick (the `THRUST` output that gives that steady speed at the body's fat), on
 * the heading it started with in `find` mode, or on the line to the nearest patch's centre in `reach` mode; once food is inside
 * `view` it steers to the nearest and holds `BITE` close to it. It records the tick it first ate (`world.foodEnergy[slot]` above 0).
 * @param {{slot: number, mode: 'reach' | 'find', speed: number, view: number}} body the body, the mode, the walking speed and
 *   the distance it sees food at
 * @returns {((world: Record<string, any>) => void) & {state: {ateTick: number}}} a `brain` phase body and its reading
 */
export function wayfarerBrain({ slot, mode, speed, view }) {
    const state = { ateTick: -1 };
    const brain = (/** @type {Record<string, any>} */ world) => {
        const row = clearRow(world, slot);
        if (state.ateTick < 0 && world.foodEnergy[slot] > 0) {
            state.ateTick = world.tick;
        }
        world.outputs[row + OUTPUT_INDEX.THRUST] = walkThrust(world, slot, speed);
        const seen = nearAPatch(world, slot, view) ? nearestFood(world, slot, view) : { food: -1, gap: Infinity };
        if (seen.food >= 0) {
            const aim = { x: world.foodX[seen.food] - world.x[slot], y: world.foodY[seen.food] - world.y[slot] };
            world.outputs[row + OUTPUT_INDEX.TURN] = steer(world, slot, aim);
            const touch = world.size[slot] + world.foodRadius[seen.food];
            world.outputs[row + OUTPUT_INDEX.BITE] = seen.gap < touch + BITE_MARGIN ? 1 : 0;
        } else if (mode === 'reach') {
            world.outputs[row + OUTPUT_INDEX.TURN] = steer(world, slot, nearestPatch(world, slot));
        }
    };
    return Object.assign(brain, { state });
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the body
 * @returns {{x: number, y: number}} the vector from the body to the nearest patch's centre
 */
function nearestPatch(world, slot) {
    let best = Infinity;
    let aim = { x: 0, y: 0 };
    for (let i = 0; i < world.config.foodPatchCount; i++) {
        const dx = world.patchX[i] - world.x[slot];
        const dy = world.patchY[i] - world.y[slot];
        if (dx * dx + dy * dy < best) {
            best = dx * dx + dy * dy;
            aim = { x: dx, y: dy };
        }
    }
    return aim;
}

/**
 * The sitter: it holds nothing, so `THRUST`, `TURN` and `SPRINT` stay 0.
 * @param {{slot: number}} body the sitter
 * @returns {(world: Record<string, any>) => void} a `brain` phase body
 */
export function sitterBrain({ slot }) {
    return (world) => {
        clearRow(world, slot);
    };
}

/**
 * The searcher of the idle scene: it walks straight at `speed` px a tick on its heading, with nothing else held, as a body
 * searching with no food in view does.
 * @param {{slot: number, speed: number}} body the searcher and its walking speed
 * @returns {(world: Record<string, any>) => void} a `brain` phase body
 */
export function walkerBrain({ slot, speed }) {
    return (world) => {
        const row = clearRow(world, slot);
        world.outputs[row + OUTPUT_INDEX.THRUST] = walkThrust(world, slot, speed);
    };
}
