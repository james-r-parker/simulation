// Reads what one body shows another along a ray (docs/designs/body-genes.md, "Raw lanes"): its size against the
// caster's, its speed and the rate the gap between them shrinks. No RNG, no clock, no allocation.

import { detTanh } from './det-math.js';

/** The speed, in units of `maxVelocity`, that reads 1: a body at the cruise cap reads 0.5 and a sprinting one more. */
export const SPEED_SENSE_SPAN = 2;

/** Values `bodySenseOf` writes: size, speed, closing. */
export const BODY_SENSE_LANES = 3;

/** Where `bodySenseBegin` leaves the caster's size, velocity, position and the speed span, after the three values. */
const C_SIZE = 3;
const C_VX = 4;
const C_VY = 5;
const C_X = 6;
const C_Y = 7;
const C_SPAN = 8;

/** Length of the scratch `bodySenseBegin` and `bodySenseOf` share: the three values, then the caster's six numbers. */
export const BODY_SENSE_SCRATCH = 9;

/**
 * Reads the caster's size, velocity and position and the speed span into `out` once, for every `bodySenseOf` of its
 * rays.
 * @param {import('./world.js').World} world the world
 * @param {number} caster the slot of the agent whose rays are cast
 * @param {Float64Array} out the scratch, `BODY_SENSE_SCRATCH` long
 * @returns {void}
 */
export function bodySenseBegin(world, caster, out) {
    out[C_SIZE] = world.size[caster];
    out[C_VX] = world.vx[caster];
    out[C_VY] = world.vy[caster];
    out[C_X] = world.x[caster];
    out[C_Y] = world.y[caster];
    out[C_SPAN] = world.config.maxVelocity * SPEED_SENSE_SPAN;
}

/**
 * Writes what the body in slot `hit` shows the caster `bodySenseBegin` read into `out`: at 0
 * `tanh(size[hit] / size[caster] - 1)` (0 for an equal body, below 0 for a smaller one), at 1 its speed over
 * `maxVelocity x SPEED_SENSE_SPAN` capped at 1, and at 2 the rate the gap between them shrinks over the same span,
 * clamped to plus or minus 1 (above 0 while they close, below 0 while it opens, 0 when the two centres coincide).
 * @param {import('./world.js').World} world the world
 * @param {number} hit the slot of the agent the ray hit
 * @param {Float64Array} out the scratch `bodySenseBegin` filled; the three values go at 0, 1 and 2
 * @returns {void}
 */
export function bodySenseOf(world, hit, out) {
    const span = out[C_SPAN];
    const hvx = world.vx[hit];
    const hvy = world.vy[hit];
    out[0] = detTanh(world.size[hit] / out[C_SIZE] - 1);
    out[1] = Math.min(1, Math.sqrt(hvx * hvx + hvy * hvy) / span);
    const dx = world.x[hit] - out[C_X];
    const dy = world.y[hit] - out[C_Y];
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d === 0) {
        out[2] = 0;
        return;
    }
    // 0 - rate, not -rate: a body crossing at a constant gap reads +0, never -0.
    const rate = (hvx - out[C_VX]) * dx + (hvy - out[C_VY]) * dy;
    out[2] = Math.max(-1, Math.min(1, (0 - rate) / d / span));
}
