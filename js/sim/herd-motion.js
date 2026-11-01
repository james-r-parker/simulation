// Selects patch routes and advances scripted herd animals without per-tick allocation.

import { nextFloat } from './rng.js';
import { EVENT_TYPE, pushEvent } from './events.js';
import { steerGroup } from './herd-steering.js';

const STAY_SPREAD = 0.25;

/** @typedef {import('./world.js').World} World */

/** @param {World} world @param {number} group @param {number} patch @returns {boolean} */
function patchAvailable(world, group, patch) {
    if (world.patchAlive[patch] !== 1 || world.patchWeight[patch] <= 0 || patch === world.groupPatch[group]) {
        return false;
    }
    if (!patchMeetsThreshold(world, group, patch) || !patchIsReachable(world, group, patch)) {
        return false;
    }
    return !reservedByOther(world, group, patch);
}

/** @param {World} world @param {number} group @param {number} patch @returns {boolean} */
function patchMeetsThreshold(world, group, patch) {
    return (
        world.groupPatch[group] >= 0 ||
        world.groupPatchWeight[group] === 0 ||
        world.patchWeight[patch] >= world.groupPatchWeight[group] * world.config.herdLeaveShare
    );
}

/** @param {World} world @param {number} group @param {number} patch @returns {boolean} */
function patchIsReachable(world, group, patch) {
    if (world.wallGapY.length > 0) {
        return true;
    }
    const patchIsLeft = world.patchX[patch] < world.config.worldWidth / 2;
    const groupIsLeft = world.groupCentroidX[group] < world.config.worldWidth / 2;
    return patchIsLeft === groupIsLeft;
}

/** @param {World} world @param {number} group @param {number} patch @returns {boolean} */
function reservedByOther(world, group, patch) {
    for (let other = 0; other < world.groupPatch.length; other++) {
        if (other !== group && world.groupPatch[other] === patch) {
            return true;
        }
    }
    return false;
}

/** @param {World} world @param {number} group @param {number} patch @returns {number} */
function patchScore(world, group, patch) {
    const dx = world.patchX[patch] - world.groupCentroidX[group];
    const dy = world.patchY[patch] - world.groupCentroidY[group];
    const distance = Math.sqrt(dx * dx + dy * dy);
    return world.patchWeight[patch] / (1 + distance / (4 * world.config.foodPatchRadius));
}

/** @param {World} world @param {number} group @returns {number} */
function choosePatch(world, group) {
    let best = -1;
    let bestScore = -1;
    for (let patch = 0; patch < world.patchWeight.length; patch++) {
        if (!patchAvailable(world, group, patch)) {
            continue;
        }
        const score = patchScore(world, group, patch);
        if (score > bestScore) {
            best = patch;
            bestScore = score;
        }
    }
    return best;
}

/** @param {World} world @param {number} group @param {number} patch @returns {void} */
function setRoute(world, group, patch) {
    world.groupPatch[group] = patch;
    if (patch >= 0) {
        world.groupPatchWeight[group] = world.patchWeight[patch];
    }
    const offset = pushEvent(world.events, EVENT_TYPE.HERD_ROUTE_CHANGED, world.tick);
    world.events.data[offset + 2] = group;
    world.events.data[offset + 3] = patch;
}

/** @param {World} world @param {number} group @returns {void} */
function summarizeGroup(world, group) {
    let count = 0;
    let x = 0;
    let y = 0;
    let vx = 0;
    let vy = 0;
    const start = group * world.config.herdSize;
    const end = start + world.config.herdSize;
    for (let slot = start; slot < end; slot++) {
        if (world.herdAlive[slot] !== 1) {
            continue;
        }
        count++;
        x += world.herdX[slot];
        y += world.herdY[slot];
        vx += world.herdVx[slot];
        vy += world.herdVy[slot];
    }
    world.groupAnimalCount[group] = count;
    if (count > 0) {
        world.groupCentroidX[group] = x / count;
        world.groupCentroidY[group] = y / count;
        world.groupFleeX[group] = vx / count;
        world.groupFleeY[group] = vy / count;
    }
}

/** @param {World} world @param {number} group @returns {boolean} */
function lostRoute(world, group) {
    const patch = world.groupPatch[group];
    return (
        patch >= 0 &&
        (world.patchAlive[patch] !== 1 ||
            world.patchWeight[patch] < world.groupPatchWeight[group] * world.config.herdLeaveShare)
    );
}

/** @param {World} world @param {number} group @returns {boolean} */
function waitAtPatch(world, group) {
    if (world.groupStay[group] === 0) {
        return false;
    }
    world.groupStay[group]--;
    if (world.groupStay[group] === 0) {
        setRoute(world, group, -1);
        const next = choosePatch(world, group);
        if (next >= 0) {
            setRoute(world, group, next);
        }
    }
    return true;
}

/** @param {World} world @param {number} group @returns {boolean} */
function atPatch(world, group) {
    const patch = world.groupPatch[group];
    const dx = world.groupCentroidX[group] - world.patchX[patch];
    const dy = world.groupCentroidY[group] - world.patchY[patch];
    return dx * dx + dy * dy <= world.config.foodPatchRadius * world.config.foodPatchRadius;
}

/** @param {World} world @param {number} group @returns {void} */
function updateRoute(world, group) {
    if (lostRoute(world, group)) {
        setRoute(world, group, -1);
    }
    if (waitAtPatch(world, group)) {
        return;
    }
    const current = world.groupPatch[group];
    if (current >= 0) {
        if (atPatch(world, group)) {
            world.groupPatchWeight[group] = world.patchWeight[current];
            world.groupStay[group] = Math.max(
                1,
                Math.floor(world.config.herdStayTicks * (1 + STAY_SPREAD * nextFloat(world.rng.herds))),
            );
        }
        return;
    }
    const patch = choosePatch(world, group);
    if (patch >= 0) {
        setRoute(world, group, patch);
    }
}

/** @param {World} world @param {number} group @returns {number} */
function nearestGap(world, group) {
    let best = 0;
    let distance = Math.abs(world.wallGapY[0] - world.groupCentroidY[group]);
    for (let gap = 1; gap < world.wallGapY.length; gap++) {
        const candidate = Math.abs(world.wallGapY[gap] - world.groupCentroidY[group]);
        if (candidate < distance) {
            best = gap;
            distance = candidate;
        }
    }
    return best;
}

/** @param {World} world @param {number} group @returns {void} */
function routeTarget(world, group) {
    const patch = world.groupPatch[group];
    if (patch < 0) {
        return;
    }
    const px = world.patchX[patch];
    const py = world.patchY[patch];
    const left = world.groupCentroidX[group] < world.config.worldWidth / 2;
    const targetLeft = px < world.config.worldWidth / 2;
    let targetX = px;
    let targetY = py;
    if (left !== targetLeft && world.wallGapY.length > 0) {
        const gap = nearestGap(world, group);
        targetX = world.config.worldWidth / 2 + (left ? 3 : -3) * world.config.herdRadius;
        targetY = world.wallGapY[gap];
    }
    steerGroup(world, group, targetX, targetY);
}

/** Advances all herd groups by one tick. @param {World} world @returns {void} */
export function stepHerds(world) {
    if (world.herdMax === 0) {
        return;
    }
    for (let group = 0; group < world.config.herdCount; group++) {
        summarizeGroup(world, group);
        if (world.groupAnimalCount[group] === 0) {
            continue;
        }
        updateRoute(world, group);
        routeTarget(world, group);
    }
}
