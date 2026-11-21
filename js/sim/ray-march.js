// Casts each agent's rays against the circles near it, writing proximity and the hit's class to its inputs row.
// An agent class channel holds the hit's proximity; fixture channels hold 1. An agent hit also writes what its body
// shows (size, speed, closing: `bodySenseOf`) to the per-ray lanes beside `rayHue`. The gather and the nearest hit of every
// ray run in the sense kernel (`sense_slot` in wasm/src/sense.rs, docs/designs/wasm-kernels.md); the JS ray march was
// deleted when the kernel was adopted (T11). The hit classes are rules and stay here.

import {
    CH_FOOD,
    CH_KIN,
    CH_MEGAFAUNA,
    CH_OBSTACLE,
    CH_OTHER,
    CH_PREY,
    CH_SMOKE,
    CH_THREAT,
    CH_WALL,
    RAY_CHANNELS,
} from './brain-layout.js';
import { detCos, detSin } from './det-math.js';
import { bodySenseBegin, bodySenseOf } from './body-sense.js';
import { couldBite } from './bite-rule.js';
import { isKin } from './kin.js';
import { AGENT, FOOD, KIND_STRIDE, OX, OY, RANGE } from './ray-gather.js';
import { COVER_TOTALS } from './cover.js';
import { visionOf } from './traits.js';
import { SENSE_WORD, senseSlot, beginSense } from './wasm-sense.js';

import { noteMatesSeen } from './mate-scarcity.js';

/** @typedef {import('./world.js').World} World */
/** @typedef {import('./spatial-hash.js').SpatialHash} SpatialHash */

// Indices into `world.rayScratch` beyond the ones `ray-gather.js` owns (4 and 5 hold the last ray's direction).
const BEST_T = 6;
const BEST_KEY = 7;
/** Where `castRays` leaves the casting agent's heading cosine and sine in `world.rayScratch`, for the other sensors. */
export const COS_H = 8;
export const SIN_H = 9;

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
 * Writes what the body in slot `other` shows the caster (read by `bodySenseBegin` in `castSlot`) into the caster's
 * per-ray lanes at `at`.
 * @param {World} world the world
 * @param {number} other the slot of the agent hit
 * @param {number} at the ray's index in `raySize`, `raySpeed` and `rayClosing`
 * @returns {void}
 */
function writeBody(world, other, at) {
    const out = world.bodySenseScratch;
    bodySenseOf(world, other, out);
    world.raySize[at] = out[0];
    world.raySpeed[at] = out[1];
    world.rayClosing[at] = out[2];
}

/**
 * Writes the current ray's best hit as `RAY_CHANNELS` input values at `base`, its food hue (0 when the hit is not food)
 * and, for an agent hit, its body lanes (`castSlot` zeroed the slot's body lanes before its rays).
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
        const other = key - kind * KIND_STRIDE;
        inputs[base + agentChannel(world, slot, other)] = proximity;
        writeBody(world, other, hue);
    } else {
        inputs[base + CHANNEL_OF_KIND[kind]] = 1;
    }
}

/**
 * Puts the caster's origin, vision range and heading cosine and sine into `world.rayScratch`.
 * @param {World} world the world
 * @param {number} slot the casting agent
 * @returns {Float64Array} the scratch
 */
function setOrigin(world, slot) {
    const s = world.rayScratch;
    s[OX] = world.x[slot];
    s[OY] = world.y[slot];
    s[RANGE] = visionOf(world, slot);
    s[COS_H] = detCos(world.angle[slot]);
    s[SIN_H] = detSin(world.angle[slot]);
    return s;
}

/**
 * Casts one agent's rays in the WASM sense kernel and writes its ray block; the tick must be begun
 * (`beginSense`).
 * @param {World} world the world
 * @param {number} slot the alive agent
 * @returns {number} the gathered row count
 */
export function castSlot(world, slot) {
    const s = setOrigin(world, slot);
    const count = senseSlot(world, slot);
    const { views } = world.wasm;
    if (views.senseParams[SENSE_WORD.conceals] === 1) {
        world.coverTotals[COVER_TOTALS.CONCEALED_HITS] += views.senseParams[SENSE_WORD.concealed];
    }
    noteMatesSeen(world, slot, count);
    const { rayBestT: bestT, rayBestKey: bestKey, raySmoke } = views;
    const rowBase = slot * world.layout.rawInputCount;
    const rays = world.config.rayCount;
    const lanes = slot * rays;
    world.raySize.fill(0, lanes, lanes + rays);
    world.raySpeed.fill(0, lanes, lanes + rays);
    world.rayClosing.fill(0, lanes, lanes + rays);
    bodySenseBegin(world, slot, world.bodySenseScratch);
    for (let k = 0; k < rays; k++) {
        s[BEST_T] = bestT[k];
        s[BEST_KEY] = bestKey[k];
        const base = rowBase + k * RAY_CHANNELS;
        writeRay(world, slot, base, k);
        if (raySmoke[k] === 1) {
            world.inputs[base + CH_SMOKE] = 1; // body-genes T13a: the ray saw through smoke to its hit
        }
    }
    return count;
}

/**
 * Casts all of an agent's rays and writes `rayCount x RAY_CHANNELS` values at the start of its inputs row.
 * @param {World} world the world
 * @param {SpatialHash} hash the hash built for this tick
 * @param {number} slot the alive agent
 * @returns {number} the gathered row count
 */
export function castRays(world, hash, slot) {
    beginSense(world, hash);
    return castSlot(world, slot);
}
