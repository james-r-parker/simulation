// Eras (world-balance T53): seasons that last minutes, winter and summer acting on patch regrowth, and a drought that
// stops one basin's patches regrowing for a summer. All of it is off unless `erasEnabled`; off draws nothing.

import { EVENT_TYPE, pushEvent } from './events.js';
import { nextFloat } from './rng.js';

/** @typedef {import('./world.js').World} World */

const SEASONS_PER_YEAR = 4;
const SUMMER = 1;
const WINTER = 3;
/** The patch regrowth multiplier in summer. */
export const SUMMER_REGROW = 1.5;

/**
 * @param {Readonly<Record<string, any>>} config the config
 * @returns {number} the ticks in one full year of four seasons
 */
export function yearTicks(config) {
    return config.erasEnabled ? SEASONS_PER_YEAR * config.eraSeasonTicks : config.seasonLength;
}

/**
 * @param {World} world the world
 * @param {number} x a patch's x
 * @returns {number} the basin the x lies in: 0 west of the middle line, 1 east of it
 */
export function basinOf(world, x) {
    return x < world.config.worldWidth / 2 ? 0 : 1;
}

/**
 * The multiplier on one patch's regrowth rate this tick: the season's (winter `winterRegrow`, summer 1.5) and 0 for a
 * patch in the basin under drought. 1 when eras are off.
 * @param {World} world the world
 * @param {number} patch the patch index
 * @returns {number} the multiplier
 */
export function patchRegrowFactor(world, patch) {
    if (!world.config.erasEnabled) {
        return 1;
    }
    if (world.era[0] >= 0 && basinOf(world, world.patchX[patch]) === world.era[0]) {
        return 0;
    }
    const season = world.season[0];
    if (season === WINTER) {
        return world.config.winterRegrow;
    }
    return season === SUMMER ? SUMMER_REGROW : 1;
}

/**
 * Starts or ends a drought at a season boundary: summer may bring one (probability `droughtChance`, then a basin
 * from the `food` stream), any other season ends it.
 * @param {World} world the world
 * @param {number} year the zero-based year
 * @returns {void}
 */
function updateDrought(world, year) {
    if (world.season[0] !== SUMMER) {
        world.era[0] = -1;
        return;
    }
    const rng = world.rng.food;
    if (nextFloat(rng) < world.config.droughtChance) {
        world.era[0] = nextFloat(rng) < 0.5 ? 0 : 1;
        const o = pushEvent(world.events, EVENT_TYPE.DROUGHT_STARTED, world.tick);
        world.events.data[o + 2] = world.era[0];
        world.events.data[o + 3] = year;
    }
}

/**
 * At each season boundary (after tick 0) pushes `SeasonChanged` and updates the drought. Call after `updateSeason`.
 * @param {World} world the world
 * @returns {void}
 */
export function advanceEra(world) {
    const { erasEnabled, eraSeasonTicks } = world.config;
    if (!erasEnabled || world.tick === 0 || world.tick % eraSeasonTicks !== 0) {
        return;
    }
    const year = Math.floor(world.tick / (SEASONS_PER_YEAR * eraSeasonTicks));
    const o = pushEvent(world.events, EVENT_TYPE.SEASON_CHANGED, world.tick);
    world.events.data[o + 2] = world.season[0];
    world.events.data[o + 3] = year;
    updateDrought(world, year);
}
