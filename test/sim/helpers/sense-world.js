import { allocAgent } from '../../../js/sim/world.js';
import { buildHash } from '../../../js/sim/spatial-hash.js';
import { smallWorld } from './small-world.js';

/** Where unused obstacles are parked: far outside the world and out of every ray's reach. */
const PARKED = 5000;

/**
 * Builds an empty world with a hash and parked obstacles.
 * @param {Record<string, any>} [over] config overrides
 * @returns {ReturnType<typeof smallWorld>}
 */
export function senseWorld(over = {}) {
    const w = smallWorld({ obstacleCount: 2, ...over });
    for (let i = 0; i < w.obsX.length; i++) {
        w.obsX[i] = PARKED;
        w.obsY[i] = PARKED;
        w.obsRadius[i] = 1;
    }
    return w;
}

/**
 * Adds an agent facing +x.
 * @param {ReturnType<typeof smallWorld>} w the world
 * @param {number} x centre x
 * @param {number} y centre y
 * @param {number} size radius
 * @returns {number} the slot
 */
export function addAgent(w, x, y, size) {
    const slot = allocAgent(w);
    w.x[slot] = x;
    w.y[slot] = y;
    w.size[slot] = size;
    w.genomeId[slot] = slot + 100;
    w.temperature[slot] = w.config.temperatureStart;
    return slot;
}

/**
 * Adds a food item.
 * @param {ReturnType<typeof smallWorld>} w the world
 * @param {number} x centre x
 * @param {number} y centre y
 * @param {number} r radius
 * @returns {number} the food slot
 */
export function addFood(w, x, y, r) {
    const f = w.foodAlive.indexOf(0);
    w.foodAlive[f] = 1;
    w.foodX[f] = x;
    w.foodY[f] = y;
    w.foodRadius[f] = r;
    w.foodCount += 1;
    return f;
}

/**
 * Appends a smoke cloud of the config's radius with a long life.
 * @param {ReturnType<typeof smallWorld>} w the world
 * @param {number} x centre x
 * @param {number} y centre y
 * @returns {number} the cloud index
 */
export function addCloud(w, x, y) {
    const i = w.cloudCount;
    w.cloudX[i] = x;
    w.cloudY[i] = y;
    w.cloudTtl[i] = w.config.smokeTicks;
    w.cloudCount += 1;
    return i;
}

/**
 * Rebuilds the world's hash.
 * @param {ReturnType<typeof smallWorld>} w the world
 * @returns {ReturnType<typeof smallWorld>['hash']}
 */
export function rebuild(w) {
    buildHash(w.hash, w);
    return w.hash;
}
