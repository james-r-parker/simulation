// Retains death sites as soil marks that can fruit as fungus in a later season.
import { nextFloat } from './rng.js';

/** The mycelium fields included in world checkpoints. */
export const MYCELIUM_ARRAYS = ['myceliumX', 'myceliumY', 'myceliumSize', 'myceliumTicks'];

/**
 * @param {import('./world.js').World} world the world
 * @param {{x: number, y: number, size: number}} body the death site
 * @returns {void}
 */
export function addMyceliumMark(world, { x, y, size }) {
    let picked = 0;
    for (let i = 0; i < world.myceliumTicks.length; i++) {
        if (world.myceliumTicks[i] < world.myceliumTicks[picked]) {
            picked = i;
        }
        if (world.myceliumTicks[i] === 0) {
            picked = i;
            break;
        }
    }
    world.myceliumX[picked] = x;
    world.myceliumY[picked] = y;
    world.myceliumSize[picked] = size;
    world.myceliumTicks[picked] = world.config.myceliumLife;
}

/**
 * @param {import('./world.js').World} world the world
 * @returns {void}
 */
export function ageMycelium(world) {
    for (let i = 0; i < world.myceliumTicks.length; i++) {
        if (world.myceliumTicks[i] > 0 && --world.myceliumTicks[i] === 0) {
            for (const name of MYCELIUM_ARRAYS) {
                world[name][i] = 0;
            }
        }
    }
}

/**
 * Draws one float over live marks weighted by body size, in ascending slot order.
 * @param {import('./world.js').World} world the world
 * @returns {number} the mark slot, or -1 without a live mark
 */
export function pickMark(world) {
    let total = 0;
    let last = -1;
    for (let i = 0; i < world.myceliumTicks.length; i++) {
        if (world.myceliumTicks[i] > 0) {
            total += world.myceliumSize[i];
            last = i;
        }
    }
    let target = nextFloat(world.rng.food) * total;
    if (total === 0) {
        return -1;
    }
    for (let i = 0; i < last; i++) {
        if (world.myceliumTicks[i] > 0) {
            target -= world.myceliumSize[i];
            if (target < 0) {
                return i;
            }
        }
    }
    return last;
}

/**
 * @param {number} x centre x
 * @param {number} y centre y
 * @param {number} size mark size
 * @returns {boolean} whether all mark fields are finite
 */
function finiteMark(x, y, size) {
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(size);
}

/**
 * @param {number} x centre x
 * @param {number} y centre y
 * @param {Readonly<Record<string, any>>} c config
 * @returns {boolean} whether the point is inside the world
 */
function insideWorld(x, y, c) {
    return x >= 0 && x <= c.worldWidth && y >= 0 && y <= c.worldHeight;
}

/**
 * @param {import('./world.js').World} world the world
 * @returns {void}
 */
export function assertMycelium(world) {
    const { myceliumLife } = world.config;
    for (let i = 0; i < world.myceliumTicks.length; i++) {
        const ticks = world.myceliumTicks[i];
        const x = world.myceliumX[i];
        const y = world.myceliumY[i];
        const size = world.myceliumSize[i];
        const finite = finiteMark(x, y, size);
        const inside = insideWorld(x, y, world.config);
        const valid = ticks === 0 ? x === 0 && y === 0 && size === 0 : inside && size > 0;
        if (!finite || ticks < 0 || ticks > myceliumLife || !valid) {
            throw new Error('mycelium invariant: invalid mark');
        }
    }
}
