// The two predator reflex cases (brain-reflex-tests.md, Cases): turn to prey and close, and bite the right victim.
// Bearings are in the subject's frame, positive towards positive `TURN`.

import { createConfig } from '../sim/config.js';
import { traitValue } from '../sim/traits.js';
import { FORAGER_SPEC, HUNTER_ENERGY, PREDATOR_SPEC, SUBJECT_ENERGY, heading } from './memory-probe-scenarios.js';
import { bearingPoint, signedBearing, subjectAgent, withMirrors } from './reflex-stage.js';

/** The thresholds, as shares of the output range (starting values of the doc, calibrated by T4). */
export const PREDATOR_BARS = Object.freeze({ turn: 0.15, thrust: 0.3, bite: 0 });
const BAR = PREDATOR_BARS;

/**
 * A too-big victim: full energy and the size gene at its top, so its size passes the hunter's `huntSizeRatio` limit and
 * `couldBite` is false. Energy alone cannot do it: a forager's size is capped by its store (the `prey-too-big` drill
 * is still bitable, sim-notes.md).
 */
export const BIG_GENE = 5;
const BIG_ENERGY = 2 * HUNTER_ENERGY;
/** Parent id the kin victim and the subject share. */
const SHARED_PARENT = 5;
/**
 * The prey stands this share of the view away. Closer than the drills' 0.6, so it covers more than the 22.5 degrees
 * between two of the 16 rays at every bearing: a prey between two rays is unseen, and a brain cannot answer what it
 * does not sense.
 */
const PREY_SHARE = 0.35;
/** The victim stands this many of the two bodies' radii ahead: inside the jaws. */
const JAW_SHARE = 1.2;
/** The most the victim sits off the heading in `bite-discrimination`. */
const BITE_OFF_DEG = 5;

const CONFIG = createConfig();
const STORE = CONFIG.maxEnergy;
/**
 * @param {number} energy a body's energy (a forager's store holds 2000)
 * @param {number} [gene] its size gene
 * @returns {number} its radius at the default config
 */
const radiusOf = (energy, gene = 0) =>
    Math.max(CONFIG.minSize, CONFIG.baseSize * traitValue(gene) + Math.min(energy, STORE) / CONFIG.energyToSize);

/** @typedef {import('./reflex-stage.js').Staging} Staging */

/** @type {import('./reflex-stage.js').ReflexCase} A forager in view, wide of the heading. */
const APPROACH_PREY = {
    name: 'approach-prey',
    scene: 'A real chase',
    spec: PREDATOR_SPEC,
    plan(rng, view) {
        const draw = { angle: heading(rng), bearing: signedBearing(rng, 15, 60), preyAngle: heading(rng) };
        return withMirrors(draw, (d, mirror) => {
            const bearing = mirror * d.bearing;
            const prey = {
                ...bearingPoint(d.angle, bearing, PREY_SHARE * view),
                angle: d.preyAngle,
                spec: FORAGER_SPEC,
                energy: SUBJECT_ENERGY,
            };
            const stage = { foods: [], rocks: [], agents: [subjectAgent(PREDATOR_SPEC, d.angle), prey] };
            return [{ kind: 'prey', bearing, mirror, ticks: [stage] }];
        });
    },
    check(outputs, { bearing }) {
        return Math.sign(bearing) * outputs.turn >= BAR.turn && outputs.thrust > BAR.thrust;
    },
};

/**
 * @param {{angle: number, offset: number}} d the draw
 * @param {1 | -1} mirror the orientation
 * @param {{kind: string, energy: number, sizeGene?: number, parents?: [number, number]}} victim which victim
 * @returns {Staging} the victim just ahead of the subject, inside its jaws
 */
function victimStaging(d, mirror, { kind, energy, sizeGene, parents }) {
    const bearing = mirror * d.offset;
    const gap = JAW_SHARE * (radiusOf(HUNTER_ENERGY) + radiusOf(energy, sizeGene));
    const subject = { ...subjectAgent(PREDATOR_SPEC, d.angle), parents };
    const at = bearingPoint(d.angle, bearing, gap);
    const victim = { ...at, angle: d.angle, spec: FORAGER_SPEC, energy, parents, sizeGene };
    return { kind, bearing, mirror, ticks: [{ foods: [], rocks: [], agents: [subject, victim] }] };
}

/** @type {import('./reflex-stage.js').ReflexCase} Bite a bitable prey; not one too big to bite, and not kin. */
const BITE_DISCRIMINATION = {
    name: 'bite-discrimination',
    scene: 'A real chase; Abort; Family tolerance',
    spec: PREDATOR_SPEC,
    plan(rng) {
        const draw = { angle: heading(rng), offset: signedBearing(rng, 0, BITE_OFF_DEG) };
        return withMirrors(draw, (d, mirror) => [
            victimStaging(d, mirror, { kind: 'prey', energy: SUBJECT_ENERGY }),
            victimStaging(d, mirror, { kind: 'too-big', energy: BIG_ENERGY, sizeGene: BIG_GENE }),
            victimStaging(d, mirror, { kind: 'kin', energy: SUBJECT_ENERGY, parents: [SHARED_PARENT, SHARED_PARENT] }),
        ]);
    },
    check(outputs, { kind }) {
        return kind === 'prey' ? outputs.bite > BAR.bite : outputs.bite <= BAR.bite;
    },
};

export const PREDATOR_CASES = Object.freeze([APPROACH_PREY, BITE_DISCRIMINATION]);
