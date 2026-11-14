// The shape of a smoke cloud over its life: it grows from half size over the first quarter and fades from 55% of its
// age. Pure.

/**
 * @param {number} life 1 when the cloud is new, 0 when it ends (the third snapshot word)
 * @param {{radiusScale: number, alpha: number}} [out] receives the result
 * @returns {{radiusScale: number, alpha: number}} `radiusScale` 0.5 growing to 1 (cubic ease-out) over the first
 *   quarter of its age; `alpha` 1, fading to 0 (smoothstep) from 55% of its age
 */
export function cloudShape(life, out = { radiusScale: 0, alpha: 0 }) {
    const age = 1 - life;
    const grow = 1 - (1 - Math.min(age / 0.25, 1)) ** 3;
    const t = Math.min(Math.max((age - 0.55) / 0.45, 0), 1);
    out.radiusScale = 0.5 + 0.5 * grow;
    out.alpha = 1 - t * t * (3 - 2 * t);
    return out;
}
