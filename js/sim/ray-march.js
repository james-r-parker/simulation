// Casts each agent's rays against the circles near it, writing proximity and the hit's class to its inputs row.
// An agent class channel holds the hit's proximity; fixture channels hold 1.

import { CH_MEGAFAUNA, RAY_CHANNELS } from './brain-layout.js';
import { detCos, detSin } from './det-math.js';
import { couldBite } from './bite-rule.js';
import { isKin } from './kin.js';
import { AGENT, FOOD, KIND_STRIDE, LOCAL_STRIDE, OBSTACLE, OX, OY, RANGE, WALL, gatherNear } from './ray-gather.js';
import { COVER_TOTALS } from './cover.js';
import { visionOf } from './traits.js';

import { noteMatesSeen } from './mate-scarcity.js';

/** @typedef {import('./world.js').World} World */
/** @typedef {import('./spatial-hash.js').SpatialHash} SpatialHash */

// Indices into `world.rayScratch` beyond the ones `ray-gather.js` owns.
const DX = 4;
const DY = 5;
const BEST_T = 6;
const BEST_KEY = 7;
/** Where `castRays` leaves the casting agent's heading cosine and sine in `world.rayScratch`, for the other sensors. */
export const COS_H = 8;
export const SIN_H = 9;

// Offsets of each class flag within a ray's channels.
const CH_FOOD = 1;
const CH_THREAT = 2;
const CH_PREY = 3;
const CH_OTHER = 4;
const CH_KIN = 5;
const CH_WALL = 6;
const CH_OBSTACLE = 7;
const CH_SMOKE = 8;

/**
 * @param {number} origin ray origin on one axis
 * @param {number} dir ray direction on that axis
 * @param {number} extent world size on that axis
 * @returns {number} distance to the boundary line the ray heads for, or Infinity when parallel
 */
function wallDistance(origin, dir, extent) {
    if (dir < 0) {
        return -origin / dir;
    }
    return dir > 0 ? (extent - origin) / dir : Infinity;
}

/**
 * @param {number} b the ray direction dotted with the origin relative to the centre
 * @param {number} c the origin's squared distance to the centre less the squared radius
 * @returns {number} the distance to the circle's surface (0 from inside), or -1 for none
 */
export function circleHit(b, c) {
    const disc = b * b - c;
    if (disc < 0 || (b > 0 && c > 0)) {
        return -1;
    }
    const t = -b - Math.sqrt(disc);
    // t < 0 means the origin is inside: a ray from outside (c > 0, b <= 0) always has -b >= sqrt(disc).
    return t < 0 ? 0 : t;
}

/**
 * Seeds the current ray's best hit with the wall it heads for, when that lies within range.
 * @param {World} world the world
 * @returns {void}
 */
function seedWithWall(world) {
    const s = world.rayScratch;
    const tWall = Math.min(
        wallDistance(s[OX], s[DX], world.config.worldWidth),
        wallDistance(s[OY], s[DY], world.config.worldHeight),
    );
    const near = tWall >= 0 && tWall <= s[RANGE];
    s[BEST_T] = near ? tWall : Infinity;
    s[BEST_KEY] = WALL * KIND_STRIDE;
}

/** Per-ray scratch of `nearestHitsAll`: the ray's direction and its best hit so far. Sized on first use. */
let rayDirX = new Float64Array(0);
let rayDirY = new Float64Array(0);
let rayBestT = new Float64Array(0);
let rayBestKey = new Float64Array(0);

/**
 * The nearest hit of every ray of the caster at once among the gathered circles and the walls, walking the gathered circles once and testing each against all the
 * rays. A ray's hit is the least distance, ties to the lower key, so the order the circles are met in does not change
 * it. Leaves each ray's `rayBestT` (Infinity for none) and `rayBestKey`.
 * @param {World} world the world
 * @param {number} count the gathered rows in `world.rayLocal`
 * @returns {void}
 */
function nearestHitsAll(world, count) {
    const { rayLocal: local, rayScratch: s, rayCos, raySin } = world;
    const rays = world.config.rayCount;
    if (rayDirX.length < rays) {
        rayDirX = new Float64Array(rays);
        rayDirY = new Float64Array(rays);
        rayBestT = new Float64Array(rays);
        rayBestKey = new Float64Array(rays);
    }
    for (let k = 0; k < rays; k++) {
        s[DX] = s[COS_H] * rayCos[k] - s[SIN_H] * raySin[k];
        s[DY] = s[SIN_H] * rayCos[k] + s[COS_H] * raySin[k];
        rayDirX[k] = s[DX];
        rayDirY[k] = s[DY];
        seedWithWall(world);
        rayBestT[k] = s[BEST_T];
        rayBestKey[k] = s[BEST_KEY];
    }
    const range = s[RANGE];
    for (let at = 0, end = count * LOCAL_STRIDE; at < end; at += LOCAL_STRIDE) {
        const lx = local[at];
        const ly = local[at + 1];
        const lc = local[at + 2];
        const lk = local[at + 3];
        for (let k = 0; k < rays; k++) {
            const t = circleHit(rayDirX[k] * lx + rayDirY[k] * ly, lc);
            if (t >= 0 && t <= range && (t < rayBestT[k] || (t === rayBestT[k] && lk < rayBestKey[k]))) {
                rayBestT[k] = t;
                rayBestKey[k] = lk;
            }
        }
    }
}

/**
 * @param {Uint8Array} coverRing the ring byte of each agent slot (`stepCover`)
 * @param {number} key a gathered circle's packed key
 * @param {number} casterRing the casting agent's ring byte
 * @returns {boolean} true when the circle is an agent standing in a ring the caster is not in
 */
function isConcealed(coverRing, key, casterRing) {
    if (key < AGENT * KIND_STRIDE || key >= OBSTACLE * KIND_STRIDE) {
        return false;
    }
    const ring = coverRing[key - AGENT * KIND_STRIDE];
    return ring !== 0 && ring !== casterRing;
}

/**
 * The nearest hit of one ray with `coverConceals`: an agent whose centre is inside a ring is skipped by a ray from outside that ring
 * (a ray from inside the same ring sees it), so the ray goes on to whatever lies behind. Each skip is counted.
 * @param {World} world the world
 * @param {number} count the gathered rows in `world.rayLocal`
 * @param {number} casterRing the casting agent's ring byte (0 outside every ring)
 * @returns {void}
 */
function nearestHitCovered(world, count, casterRing) {
    const { rayLocal: local, rayScratch: s, coverRing, coverTotals } = world;
    seedWithWall(world);
    let bestT = s[BEST_T];
    let bestKey = s[BEST_KEY];
    for (let at = 0, end = count * LOCAL_STRIDE; at < end; at += LOCAL_STRIDE) {
        const t = circleHit(s[DX] * local[at] + s[DY] * local[at + 1], local[at + 2]);
        const key = local[at + 3];
        if (t < 0 || t > s[RANGE] || t > bestT || (t === bestT && key >= bestKey)) {
            continue;
        }
        if (isConcealed(coverRing, key, casterRing)) {
            coverTotals[COVER_TOTALS.CONCEALED_HITS] += 1;
        } else {
            bestT = t;
            bestKey = key;
        }
    }
    s[BEST_T] = bestT;
    s[BEST_KEY] = bestKey;
}

/** Class channel of each hit kind; an agent's channel depends on its class, so its entry is unused. */
const CHANNEL_OF_KIND = Object.freeze([CH_FOOD, CH_THREAT, CH_OBSTACLE, CH_WALL, CH_SMOKE, CH_MEGAFAUNA]);

/**
 * @param {World} world the world
 * @param {number} slot the casting agent
 * @param {number} other the slot of the agent hit
 * @returns {number} the channel offset for that agent: kin, else a threat when it can bite the caster, else prey when
 *   the caster can bite it, else other
 */
function agentChannel(world, slot, other) {
    if (isKin(world, slot, other)) {
        return CH_KIN;
    }
    if (couldBite(world, other, slot)) {
        return CH_THREAT;
    }
    return couldBite(world, slot, other) ? CH_PREY : CH_OTHER;
}

/**
 * Writes the current ray's best hit as `RAY_CHANNELS` input values at `base`.
 * @param {World} world the world
 * @param {number} slot the casting agent
 * @param {number} base index of the ray's first value in `world.inputs`
 * @param {number} ray the ray index
 * @returns {void}
 */
function writeRay(world, slot, base, ray) {
    const { inputs, rayScratch: s, rayHue } = world;
    const hue = slot * world.config.rayCount + ray;
    rayHue[hue] = 0;
    for (let ch = 0; ch < RAY_CHANNELS; ch++) {
        inputs[base + ch] = 0;
    }
    if (s[BEST_T] === Infinity) {
        return;
    }
    const proximity = 1 - s[BEST_T] / s[RANGE];
    inputs[base] = proximity;
    const key = s[BEST_KEY];
    const kind = Math.floor(key / KIND_STRIDE);
    if (kind === FOOD) {
        rayHue[hue] = world.foodHue[key];
    }
    if (kind === AGENT) {
        inputs[base + agentChannel(world, slot, key - kind * KIND_STRIDE)] = proximity;
    } else {
        inputs[base + CHANNEL_OF_KIND[kind]] = 1;
    }
}

/**
 * Casts all of an agent's rays and writes `rayCount x RAY_CHANNELS` values at the start of its inputs row.
 * @param {World} world the world
 * @param {SpatialHash} hash the hash built for this tick
 * @param {number} slot the alive agent
 * @returns {void}
 */
export function castRays(world, hash, slot) {
    const s = world.rayScratch;
    s[OX] = world.x[slot];
    s[OY] = world.y[slot];
    s[RANGE] = visionOf(world, slot);
    s[COS_H] = detCos(world.angle[slot]);
    s[SIN_H] = detSin(world.angle[slot]);
    const count = gatherNear(world, hash, slot);
    noteMatesSeen(world, slot, count);
    const { rayCos, raySin } = world;
    const rowBase = slot * world.layout.rawInputCount;
    const conceals = world.config.coverConceals;
    const casterRing = world.coverRing[slot];
    const rays = world.config.rayCount;
    if (conceals) {
        for (let k = 0; k < rays; k++) {
            s[DX] = s[COS_H] * rayCos[k] - s[SIN_H] * raySin[k];
            s[DY] = s[SIN_H] * rayCos[k] + s[COS_H] * raySin[k];
            nearestHitCovered(world, count, casterRing);
            writeRay(world, slot, rowBase + k * RAY_CHANNELS, k);
        }
        return;
    }
    nearestHitsAll(world, count);
    for (let k = 0; k < rays; k++) {
        s[BEST_T] = rayBestT[k];
        s[BEST_KEY] = rayBestKey[k];
        writeRay(world, slot, rowBase + k * RAY_CHANNELS, k);
    }
}
