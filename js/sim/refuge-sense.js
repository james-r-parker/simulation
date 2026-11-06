// Writes the three refuge body inputs: the bearing to the nearest ring (sine and cosine in the agent's frame) and how
// near its edge is. Zero when `refugeSense` is false or the world has no rings (refuge.md Phase 3).

import { BODY_INPUT, RAY_CHANNELS } from './brain-layout.js';
import { ringRadius } from './terrain.js';

/** @typedef {import('./world.js').World} World */

/**
 * Writes `refugeBearingSin`, `refugeBearingCos` and `refugeNear` into the agent's body block. The nearest ring is the
 * one with the nearest centre (every ring has one radius, so that is also the nearest edge). The bearing is the angle
 * to its centre relative to the heading; inside a ring `refugeNear` is 1, otherwise it falls from 1 at the edge to 0
 * at `refugeSenseRange` and stays there. Allocates nothing; `world.refugeCentres` is read once at world creation.
 * @param {World} world the world
 * @param {number} slot the alive agent
 * @param {number} cH the cosine of the agent's heading
 * @param {number} sH the sine of the agent's heading
 * @returns {void}
 */
export function writeRefugeInputs(world, slot, cH, sH) {
    const o = slot * world.layout.rawInputCount + world.config.rayCount * RAY_CHANNELS;
    const out = world.inputs;
    const centres = world.refugeCentres;
    const { refugeSense, refugeSenseRange } = world.config;
    let sin = 0;
    let cos = 0;
    let near = 0;
    if (refugeSense && centres.length > 0) {
        const x = world.x[slot];
        const y = world.y[slot];
        let best = Infinity;
        let bx = 0;
        let by = 0;
        for (let i = 0; i < centres.length; i += 2) {
            const dx = centres[i] - x;
            const dy = centres[i + 1] - y;
            const d2 = dx * dx + dy * dy;
            if (d2 < best) {
                best = d2;
                bx = dx;
                by = dy;
            }
        }
        const distance = Math.sqrt(best);
        if (distance > 0) {
            cos = (bx * cH + by * sH) / distance;
            sin = (by * cH - bx * sH) / distance;
        }
        near = Math.max(0, 1 - Math.max(0, distance - ringRadius(world.config)) / refugeSenseRange);
    }
    out[o + BODY_INPUT.REFUGE_BEARING_SIN] = sin;
    out[o + BODY_INPUT.REFUGE_BEARING_COS] = cos;
    out[o + BODY_INPUT.REFUGE_NEAR] = near;
}
