// The cover state (docs/designs/refuge.md): which refuge ring each alive agent stands in, refreshed at the start of the
// `sense` phase so the rays and `feed` read this tick's positions. Derived from positions, so it is outside `worldHash`
// and a world restored from a snapshot computes it before first use. Does nothing with both cover switches off.

import { EVENT_TYPE, pushEvent } from './events.js';
import { refugeCentresOf, refugeIndexAt, ringRadius } from './terrain.js';

/** @typedef {import('./world.js').World} World */

/** Indices into `world.coverTotals`: the agents in a ring this tick, then running counts since the world began. */
export const COVER_TOTALS = Object.freeze({ IN_RINGS: 0, AGENT_TICKS: 1, CONCEALED_HITS: 2, FOOD_REJECTED: 3 });

/** Ticks between `CoverTotals` records. */
export const COVER_LOG_TICKS = 1000;

/**
 * Allocates the cover state: one byte per agent slot (ring index plus 1, 0 outside every ring), the counters and the
 * not-yet-read ring centres.
 * @param {World} world the world being built
 * @returns {void}
 */
export function allocCoverState(world) {
    world.coverRing = new Uint8Array(world.config.maxAgents);
    world.coverTotals = new Float64Array(4);
    world.coverCentres = null;
}

/**
 * @param {World} world the world
 * @returns {Float64Array} the refuge centres, read once from the rocks and kept
 */
function centresOf(world) {
    if (world.coverCentres === null) {
        world.coverCentres = refugeCentresOf(world);
    }
    return world.coverCentres;
}

/**
 * @param {World} world the world
 * @param {number} x a point's x
 * @param {number} y a point's y
 * @returns {number} the index of the ring holding the point, or -1 outside every ring
 */
export function ringIndexAt(world, x, y) {
    return refugeIndexAt(centresOf(world), ringRadius(world.config), x, y);
}

/**
 * @param {World} world the world
 * @returns {void}
 */
function pushCoverRecords(world) {
    const d = world.events.data;
    if (world.tick === 0) {
        const { config } = world;
        const o = pushEvent(world.events, EVENT_TYPE.COVER_CONFIG, world.tick);
        d[o + 2] = config.coverConceals ? 1 : 0;
        d[o + 3] = config.coverFoodFree ? 1 : 0;
        d[o + 4] = config.refugeCount;
        d[o + 5] = 2 * config.refugeSizeMax;
        d[o + 6] = ringRadius(config);
    } else if (world.tick % COVER_LOG_TICKS === 0) {
        const t = world.coverTotals;
        const o = pushEvent(world.events, EVENT_TYPE.COVER_TOTALS, world.tick);
        d[o + 2] = t[COVER_TOTALS.IN_RINGS];
        d[o + 3] = t[COVER_TOTALS.AGENT_TICKS];
        d[o + 4] = t[COVER_TOTALS.CONCEALED_HITS];
        d[o + 5] = t[COVER_TOTALS.FOOD_REJECTED];
    }
}

/**
 * Writes `world.coverRing` for this tick (0 for a dead slot) and counts the agents in rings. Returns before any loop
 * when `coverConceals` and `coverFoodFree` are both off. Allocates nothing and draws no random number.
 * @param {World} world the world
 * @returns {void}
 */
export function stepCover(world) {
    const { coverConceals, coverFoodFree } = world.config;
    if (!coverConceals && !coverFoodFree) {
        return;
    }
    const centres = centresOf(world);
    const radius = ringRadius(world.config);
    const { alive, coverRing, x, y } = world;
    let inRings = 0;
    for (let slot = 0; slot < coverRing.length; slot++) {
        const ring = alive[slot] === 1 ? refugeIndexAt(centres, radius, x[slot], y[slot]) + 1 : 0;
        coverRing[slot] = ring;
        inRings += ring === 0 ? 0 : 1;
    }
    world.coverTotals[COVER_TOTALS.IN_RINGS] = inRings;
    world.coverTotals[COVER_TOTALS.AGENT_TICKS] += inRings;
    pushCoverRecords(world);
}

/**
 * Throws when a cover byte names a ring that does not exist.
 * @param {World} world the world
 * @returns {void}
 */
export function assertCover(world) {
    const { coverRing } = world;
    for (let slot = 0; slot < coverRing.length; slot++) {
        if (coverRing[slot] > world.config.refugeCount) {
            const error = new Error(
                `invariant cover violated at tick ${world.tick}, slot ${slot}, value ${coverRing[slot]}: ring byte is above refugeCount ${world.config.refugeCount}`,
            );
            throw Object.assign(error, { invariant: 'cover', tick: world.tick, slot, value: coverRing[slot] });
        }
    }
}
