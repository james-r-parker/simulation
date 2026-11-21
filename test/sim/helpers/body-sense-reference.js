// The naive reference of the body sense (docs/designs/body-genes.md, "Raw lanes"): the JS `bodySenseOf` the sense
// kernel replaced at body-genes T53, kept as written so the kernel's lanes are checked against it bit for bit.
import { detTanh } from '../../../js/sim/det-math.js';
import { speedSenseSpan } from '../../../js/sim/body-sense.js';

/**
 * What the body in slot `hit` shows the caster, as doubles: at 0 `tanh(size[hit] / size[caster] - 1)`, at 1 its speed
 * over `maxVelocity x SPEED_SENSE_SPAN` capped at 1, at 2 the rate the gap between them shrinks over the same span,
 * clamped to plus or minus 1 (0 when the two centres coincide).
 * @param {Record<string, any>} world the world
 * @param {number} caster the slot of the agent whose ray hit
 * @param {number} hit the slot of the agent the ray hit
 * @returns {[number, number, number]} size, speed and closing
 */
export function bodySenseReference(world, caster, hit) {
    const { x, y, vx, vy, size } = world;
    const span = speedSenseSpan(world.config);
    const hvx = vx[hit];
    const hvy = vy[hit];
    const sized = detTanh(size[hit] / size[caster] - 1);
    const speed = Math.min(1, Math.sqrt(hvx * hvx + hvy * hvy) / span);
    const dx = x[hit] - x[caster];
    const dy = y[hit] - y[caster];
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d === 0) {
        return [sized, speed, 0];
    }
    // 0 - rate, not -rate: a body crossing at a constant gap reads +0, never -0.
    const rate = (hvx - vx[caster]) * dx + (hvy - vy[caster]) * dy;
    return [sized, speed, Math.max(-1, Math.min(1, (0 - rate) / d / span))];
}
