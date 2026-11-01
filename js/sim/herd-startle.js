// Detects nearby hunters on a staggered cadence and gives threatened herds a seeded-world flee direction.

import { EVENT_TYPE, pushEvent } from './events.js';
import { specParams } from './spec-params.js';

const SENSE_INTERVAL = 8;
const EPSILON = 1e-9;

/** @typedef {import('./world.js').World} World */

/** @param {World} world @param {number} group @param {number} hunter @returns {boolean} */
function threatensGroup(world, group, hunter) {
    const rangeSq = world.config.herdStartleRadius * world.config.herdStartleRadius;
    for (let animal = group * world.config.herdSize; animal < (group + 1) * world.config.herdSize; animal++) {
        if (world.herdAlive[animal] !== 1) {
            continue;
        }
        const dx = world.x[hunter] - world.herdX[animal];
        const dy = world.y[hunter] - world.herdY[animal];
        if (dx * dx + dy * dy <= rangeSq) {
            return true;
        }
    }
    return false;
}

/** @param {World} world @param {number} group @param {number} hunter @returns {number} */
function centroidDistanceSq(world, group, hunter) {
    const dx = world.x[hunter] - world.groupCentroidX[group];
    const dy = world.y[hunter] - world.groupCentroidY[group];
    return dx * dx + dy * dy;
}

/** @param {World} world @param {number} group @param {number} hunter @returns {void} */
function setFleeDirection(world, group, hunter) {
    let dx = world.groupCentroidX[group] - world.x[hunter];
    let dy = world.groupCentroidY[group] - world.y[hunter];
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance <= EPSILON) {
        dx = group % 2 === 0 ? 1 : -1;
        dy = 0;
    } else {
        dx /= distance;
        dy /= distance;
    }
    world.groupFleeX[group] = dx;
    world.groupFleeY[group] = dy;
}

/** @param {World} world @param {number} group @param {number} hunter @returns {void} */
function startStampede(world, group, hunter) {
    world.groupAlarm[group] = world.config.herdStampedeTicks;
    setFleeDirection(world, group, hunter);
    const offset = pushEvent(world.events, EVENT_TYPE.HERD_STAMPEDE, world.tick);
    world.events.data[offset + 2] = group;
    world.events.data[offset + 3] = hunter;
    world.events.data[offset + 4] = world.groupAnimalCount[group];
}

/** @param {World} world @param {number} group @returns {void} */
function senseGroupHunters(world, group) {
    let nearest = -1;
    let nearestDistance = Infinity;
    for (let hunter = 0; hunter < world.alive.length; hunter++) {
        if (world.alive[hunter] !== 1 || !specParams(world.config, world.spec[hunter]).canHunt) {
            continue;
        }
        if (!threatensGroup(world, group, hunter)) {
            continue;
        }
        const distance = centroidDistanceSq(world, group, hunter);
        if (distance < nearestDistance) {
            nearest = hunter;
            nearestDistance = distance;
        }
    }
    if (nearest >= 0) {
        startStampede(world, group, nearest);
    }
}

/** Checks one herd on its staggered eight-tick interval. @param {World} world @param {number} group @returns {void} */
export function senseHunters(world, group) {
    if ((world.tick + group) % SENSE_INTERVAL !== 0 || world.groupAnimalCount[group] === 0) {
        return;
    }
    senseGroupHunters(world, group);
}
