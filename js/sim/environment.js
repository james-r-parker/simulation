// Season phase, obstacle motion and fertile zones.

/** @typedef {import('./world.js').World} World */

import { yearTicks } from './eras.js';

const SEASONS_PER_YEAR = 4;

/** Origin markers for fertile zones. */
export const ZONE_ORIGIN = Object.freeze({ DEATH: 0, DUNG: 1 });

/**
 * Writes the season index and phase for a tick into `world.season`.
 * @param {World} world the world
 * @param {number} tick the tick to describe
 * @returns {void}
 */
export function seasonAt(world, tick) {
    const seasonLength = yearTicks(world.config);
    const phase = (tick % seasonLength) / seasonLength;
    world.season[0] = Math.floor(phase * SEASONS_PER_YEAR);
    world.season[1] = phase;
}

/**
 * Updates `world.season` for the current tick.
 * @param {World} world the world
 * @returns {void}
 */
export function updateSeason(world) {
    seasonAt(world, world.tick);
}

/**
 * @param {World} world the world
 * @returns {number} the lowest free zone slot, or the alive zone with the lowest fertility ratio when all are alive
 */
export function fertileZoneSlot(world) {
    const { zoneAlive, zoneFertility, zoneInitial } = world;
    let worst = 0;
    for (let i = 0; i < zoneAlive.length; i++) {
        if (zoneAlive[i] === 0) {
            return i;
        }
        if (zoneFertility[i] / zoneInitial[i] < zoneFertility[worst] / zoneInitial[worst]) {
            worst = i;
        }
    }
    return zoneAlive.length === 0 ? -1 : worst;
}

/** @param {World} world @param {{slot:number,x:number,y:number,size:number,origin:number}} zone @returns {number} */
export function writeFertileZone(world, { slot, x, y, size, origin }) {
    if (slot < 0) {
        return -1;
    }
    const fertility = size * world.config.fertileZoneFertility;
    world.zoneAlive[slot] = 1;
    world.zoneOrigin[slot] = origin;
    world.zoneX[slot] = x;
    world.zoneY[slot] = y;
    world.zoneInitial[slot] = fertility;
    world.zoneFertility[slot] = fertility;
    return slot;
}

/**
 * Adds a fertile zone, replacing the most depleted one when all slots are alive.
 * @param {World} world the world
 * @param {number} x the zone centre x
 * @param {number} y the zone centre y
 * @param {number} size the size of the creature that died there
 * @returns {number} the slot used
 */
export function addFertileZone(world, x, y, size) {
    return writeFertileZone(world, { slot: fertileZoneSlot(world), x, y, size, origin: ZONE_ORIGIN.DEATH });
}

/**
 * Decays every alive zone and frees those at or below zero fertility.
 * @param {World} world the world
 * @returns {void}
 */
export function decayFertileZones(world) {
    const { zoneAlive, zoneX, zoneY, zoneFertility, zoneInitial, zoneOrigin } = world;
    const { fertileZoneDecay } = world.config;
    for (let i = 0; i < zoneAlive.length; i++) {
        if (zoneAlive[i] === 0) {
            continue;
        }
        zoneFertility[i] -= fertileZoneDecay * zoneInitial[i];
        if (zoneFertility[i] <= 0) {
            zoneAlive[i] = 0;
            zoneX[i] = 0;
            zoneY[i] = 0;
            zoneOrigin[i] = ZONE_ORIGIN.DEATH;
            zoneFertility[i] = 0;
            zoneInitial[i] = 0;
        }
    }
}
