// Reads what one body shows another along a ray (docs/designs/body-genes.md, "Raw lanes"): its size against the
// caster's, its speed and the rate the gap between them shrinks. No RNG, no clock, no allocation.

import { detTanh } from './det-math.js';

/** The speed, in units of `maxVelocity`, that reads 1: a body at the cruise cap reads 0.5 and a sprinting one more. */
export const SPEED_SENSE_SPAN = 2;

/** Values `bodySenseOf` writes: size, speed, closing. */
export const BODY_SENSE_LANES = 3;

/**
 * Writes what the body in slot `hit` shows the caster into `out`: at 0 `tanh(size[hit] / size[caster] - 1)` (0 for an
 * equal body, below 0 for a smaller one), at 1 its speed over `maxVelocity x SPEED_SENSE_SPAN` capped at 1, and at 2
 * the rate the gap between them shrinks over the same span, clamped to plus or minus 1 (above 0 while they close, below
 * 0 while it opens, 0 when the two centres coincide).
 * @param {import('./world.js').World} world the world
 * @param {number} caster the slot of the agent whose ray hit
 * @param {number} hit the slot of the agent the ray hit
 * @param {Float64Array | Float32Array} out where the three values go, at 0, 1 and 2
 * @returns {void}
 */
export function bodySenseOf(world, caster, hit, out) {
    const { x, y, vx, vy, size } = world;
    const span = world.config.maxVelocity * SPEED_SENSE_SPAN;
    const hvx = vx[hit];
    const hvy = vy[hit];
    out[0] = detTanh(size[hit] / size[caster] - 1);
    out[1] = Math.min(1, Math.sqrt(hvx * hvx + hvy * hvy) / span);
    const dx = x[hit] - x[caster];
    const dy = y[hit] - y[caster];
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d === 0) {
        out[2] = 0;
        return;
    }
    // 0 - rate, not -rate: a body crossing at a constant gap reads +0, never -0.
    const rate = (hvx - vx[caster]) * dx + (hvy - vy[caster]) * dy;
    out[2] = Math.max(-1, Math.min(1, (0 - rate) / d / span));
}
