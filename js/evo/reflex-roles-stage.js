// What the role reflex cases share (brain-reflex-tests.md, Phase 5): where an item stands on the forward rays, a lone
// subject with others about it, a prey the subject can bite, and a call heard from a bearing with nothing in view.
// Bearings are in the subject's frame, positive towards positive `TURN`.

import { createConfig } from '../sim/config.js';
import { detCos, detSin } from '../sim/det-math.js';
import { nextFloat } from '../sim/rng.js';
import { SPEC } from '../sim/specs.js';
import { SUBJECT_ENERGY, heading } from './memory-probe-scenarios.js';
import { DEG, bearingPoint, signedBearing, subjectAgent, withMirrors } from './reflex-stage.js';

/** The ray spacing, and the farthest forward ray a threat or a herd stands on (ray 3 is 67.5 degrees off). */
export const RAY_SPACING = (2 * Math.PI) / createConfig().rayCount;
const RAY_JITTER_DEG = 3;
const FORWARD_RAYS = 3;
/** A heard call is loud, and comes from this far off the heading. */
const HEARD_LOUDNESS = 1;
const HEARD_FROM_DEG = 20;
const HEARD_TO_DEG = 140;

/** @typedef {import('./reflex-stage.js').ReflexCase} ReflexCase */

/**
 * @param {import('../sim/rng.js').Rng} rng the case's stream
 * @returns {number} a signed bearing on one of the forward rays (a whole number of ray spacings, 1 to `FORWARD_RAYS`)
 *   plus up to `RAY_JITTER_DEG` either way, so the item stands on that ray alone
 */
export function forwardRay(rng) {
    const k = 1 + Math.floor(FORWARD_RAYS * nextFloat(rng));
    const bearing = k * RAY_SPACING + (2 * nextFloat(rng) - 1) * RAY_JITTER_DEG * DEG;
    return nextFloat(rng) < 0.5 ? -bearing : bearing;
}

/**
 * @param {number} angle the subject's heading
 * @param {number} spec the subject's specialisation
 * @param {import('./pool-discrimination-stage.js').StagedAgent[]} [others] the other agents
 * @returns {{foods: never[], rocks: never[], agents: import('./pool-discrimination-stage.js').StagedAgent[]}} a tick
 */
export const lone = (angle, spec, others = []) => ({
    foods: [],
    rocks: [],
    agents: [subjectAgent(spec, angle), ...others],
});

/**
 * @param {number} angle the subject's heading
 * @param {number} bearing where the forager stands, in the subject's frame
 * @param {number} distance its distance
 * @returns {import('./pool-discrimination-stage.js').StagedAgent} a forager a predator can bite, facing along the heading
 */
export const preyAt = (angle, bearing, distance) => ({
    ...bearingPoint(angle, bearing, distance),
    angle,
    spec: SPEC.FORAGER,
    energy: SUBJECT_ENERGY,
});

/**
 * A loud call heard from a bearing, with nothing in view.
 * @param {number} spec the subject's specialisation
 * @param {'alarm' | 'hunt'} [call] which call is heard (default the alarm)
 * @returns {ReflexCase['plan']} the plan
 */
export const heardPlan =
    (spec, call = 'alarm') =>
    (rng) => {
        const draw = { angle: heading(rng), bearing: signedBearing(rng, HEARD_FROM_DEG, HEARD_TO_DEG) };
        return withMirrors(draw, (d, mirror) => {
            const bearing = mirror * d.bearing;
            const ux = detCos(d.angle + bearing);
            const uy = detSin(d.angle + bearing);
            const heard = { loudness: HEARD_LOUDNESS, ux, uy, call };
            return [{ kind: call, bearing, mirror, ticks: [{ ...lone(d.angle, spec), heard }] }];
        });
    };
