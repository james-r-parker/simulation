// The scale of what one body shows another along a ray (docs/designs/body-genes.md, "Raw lanes"): its size against the
// caster's, its speed and the rate the gap between them shrinks. The sense kernel (`write_body` in wasm/src/sense.rs)
// writes the three lanes for every agent hit; the JS `bodySenseOf` it replaced (body-genes T53) is the tests' naive
// reference (test/sim/helpers/body-sense-reference.js).

/** The speed, in units of `maxVelocity`, that reads 1: a body at the cruise cap reads 0.5 and a sprinting one more. */
export const SPEED_SENSE_SPAN = 2;

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @returns {number} the speed and closing rate that read 1: `maxVelocity x SPEED_SENSE_SPAN`
 */
export function speedSenseSpan(config) {
    return config.maxVelocity * SPEED_SENSE_SPAN;
}
