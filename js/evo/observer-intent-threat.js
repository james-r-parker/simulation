// What counts as a threat for the intent state. A bigger-class hit alone is not one (at the default size ratio about
// half the population reads bigger): the nearest `canHunt` agent of another lineage within vision range must lie in
// the direction of a ray that hits something bigger, to within half a ray spacing.

import { RAY_CHANNELS } from '../sim/brain-layout.js';
import { detCos, detSin } from '../sim/det-math.js';
import { SCAN } from './ray-summary.js';
import { CH_BIGGER } from './scripted-parts.js';

/**
 * Lists the alive `canHunt` slots into `intent.hunters`; call it once per tick, before `resolveThreat`.
 * @param {Record<string, any>} intent the intent state
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function collectHunters(intent, world) {
    const { alive, spec } = world;
    let count = 0;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1 && intent.hunterSpec[spec[slot]] === 1) {
            intent.hunters[count] = slot;
            count += 1;
        }
    }
    intent.hunterCount = count;
}

/**
 * @param {Record<string, any>} intent the intent state
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {number} the nearest listed hunter of another lineage within vision range, or -1
 */
function nearestHunter(intent, world, slot) {
    const { x, y, lineageId } = world;
    const vision = world.visionBySpec[world.spec[slot]];
    let best = -1;
    let bestDistance = vision * vision;
    for (let i = 0; i < intent.hunterCount; i++) {
        const h = intent.hunters[i];
        const dx = x[h] - x[slot];
        const dy = y[h] - y[slot];
        const d2 = dx * dx + dy * dy;
        if (h !== slot && lineageId[h] !== lineageId[slot] && d2 <= bestDistance) {
            best = h;
            bestDistance = d2;
        }
    }
    return best;
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {number} h another agent
 * @returns {number} the index of the ray whose direction is closest to the direction of `h` (the lowest on a tie)
 */
function rayTowards(world, slot, h) {
    const dx = world.x[h] - world.x[slot];
    const dy = world.y[h] - world.y[slot];
    const cosH = detCos(world.angle[slot]);
    const sinH = detSin(world.angle[slot]);
    const forward = dx * cosH + dy * sinH;
    const left = dy * cosH - dx * sinH;
    let best = 0;
    let bestDot = -Infinity;
    for (let k = 0; k < world.config.rayCount; k++) {
        const dot = forward * world.rayCos[k] + left * world.raySin[k];
        if (dot > bestDot) {
            bestDot = dot;
            best = k;
        }
    }
    return best;
}

/**
 * Finds the agent's threat this tick and writes `THREAT` (proximity), `THREAT_RAY` and `THREAT_ARC` into the scan
 * row, all -1 (0 for the arc flag) when there is none. Needs the row filled by `summariseRays`.
 * @param {Record<string, any>} intent the intent state
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive agent
 * @returns {boolean} whether the agent sees a threat
 */
export function resolveThreat(intent, world, slot) {
    const scan = intent.scan;
    if (scan[SCAN.BIGGER] === 0) {
        return false;
    }
    const h = nearestHunter(intent, world, slot);
    if (h < 0) {
        return false;
    }
    const k = rayTowards(world, slot, h);
    const base = slot * world.layout.inputCount + k * RAY_CHANNELS;
    if (world.inputs[base + CH_BIGGER] !== 1) {
        return false;
    }
    scan[SCAN.THREAT] = world.inputs[base];
    scan[SCAN.THREAT_RAY] = k;
    scan[SCAN.THREAT_ARC] = intent.arc[k];
    return true;
}
