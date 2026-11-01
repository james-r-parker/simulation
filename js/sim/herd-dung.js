// Adds capped dung fertility zones on a seed-derived interval for each live herd animal.

import { fertileZoneSlot, writeFertileZone, ZONE_ORIGIN } from './environment.js';

/** @typedef {import('./world.js').World} World */

/** @param {World} world @returns {number} the oldest live dung zone, or -1 */
function oldestDungZone(world) {
    let oldest = -1;
    for (let slot = 0; slot < world.zoneAlive.length; slot++) {
        if (world.zoneAlive[slot] !== 1 || world.zoneOrigin[slot] !== ZONE_ORIGIN.DUNG) {
            continue;
        }
        if (
            oldest < 0 ||
            world.zoneFertility[slot] / world.zoneInitial[slot] <
                world.zoneFertility[oldest] / world.zoneInitial[oldest]
        ) {
            oldest = slot;
        }
    }
    return oldest;
}

/**
 * Adds a dung zone, replacing the oldest dung at its cap and otherwise using the normal oldest-zone slot policy.
 * @param {World} world the world
 * @param {number} x zone centre x
 * @param {number} y zone centre y
 * @returns {number} the slot used, or -1 when dung zones are disabled or there are no zone slots
 */
export function addDungZone(world, x, y) {
    const cap = world.config.herdDungZoneMax;
    if (cap === 0) {
        return -1;
    }
    let dungCount = 0;
    for (let slot = 0; slot < world.zoneAlive.length; slot++) {
        if (world.zoneAlive[slot] === 1 && world.zoneOrigin[slot] === ZONE_ORIGIN.DUNG) {
            dungCount++;
        }
    }
    const slot = dungCount >= cap ? oldestDungZone(world) : fertileZoneSlot(world);
    return writeFertileZone(world, {
        slot,
        x,
        y,
        size: world.config.herdDungSize,
        origin: ZONE_ORIGIN.DUNG,
    });
}

/**
 * Drops dung on each elapsed interval while the animal has a store above half its maximum.
 * Uses age as the interval clock, so the rule needs no extra state or random draws.
 * @param {World} world the world
 * @returns {void}
 */
export function dropHerdDung(world) {
    const { herdDungTicks, herdStoreMax } = world.config;
    if (world.config.herdDungZoneMax === 0) {
        return;
    }
    for (let animal = 0; animal < world.herdAlive.length; animal++) {
        if (
            world.herdAlive[animal] === 1 &&
            world.herdStore[animal] > herdStoreMax / 2 &&
            (world.herdAge[animal] + 1) % herdDungTicks === 0
        ) {
            addDungZone(world, world.herdX[animal], world.herdY[animal]);
        }
    }
}
