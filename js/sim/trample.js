// Resolves blob contacts with scripted herd bodies before the existing wall and rock response.

import { LOSS_CAUSE, removeEnergy } from './energy.js';

/** @typedef {import('./world.js').World} World */

/** @param {World} world @param {number} slot @param {number} animal @returns {void} */
function resolveContact(world, slot, animal) {
    const dx = world.x[slot] - world.herdX[animal];
    const dy = world.y[slot] - world.herdY[animal];
    const reach = world.size[slot] + world.config.herdRadius;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq >= reach * reach) {
        return;
    }
    const distance = Math.sqrt(distanceSq);
    const nx = distance > 0 ? dx / distance : 1;
    const ny = distance > 0 ? dy / distance : 0;
    world.x[slot] = world.herdX[animal] + nx * reach;
    world.y[slot] = world.herdY[animal] + ny * reach;
    const vn = (world.vx[slot] - world.herdVx[animal]) * nx + (world.vy[slot] - world.herdVy[animal]) * ny;
    if (vn >= 0) {
        return;
    }
    const closing = -vn;
    world.vx[slot] -= 2 * vn * nx;
    world.vy[slot] -= 2 * vn * ny;
    const ratio = closing / world.config.maxVelocity;
    const amount = world.config.trampleDamage * ratio * ratio * (world.size[slot] / world.baseSize[slot]);
    if (removeEnergy(world, slot, amount, LOSS_CAUSE.TRAMPLE) > 0) {
        world.lastHerdId[slot] = world.herdId[animal];
    }
}

/**
 * Resolves every live herd contact for one agent slot. A one-axis reject skips the animals whose x gap alone is at
 * least the reach: `dx * dx >= reach * reach` is monotone in `|dx|`, and `distanceSq` only adds a non-negative term,
 * so the skipped animals are exactly those `resolveContact` would return on. Order and float results are unchanged.
 * @param {World} world @param {number} slot @returns {void}
 */
export function trampleHerds(world, slot) {
    const { herdAlive, herdX } = world;
    const reach = world.size[slot] + world.config.herdRadius;
    for (let animal = 0; animal < world.herdMax; animal++) {
        if (herdAlive[animal] !== 1) {
            continue;
        }
        const dx = world.x[slot] - herdX[animal];
        if (dx >= reach || -dx >= reach) {
            continue;
        }
        resolveContact(world, slot, animal);
    }
}
