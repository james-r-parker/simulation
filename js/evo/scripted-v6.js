// Exploit probes for `fitnessV6` (fitness-and-selection.md, Phase 3): each controller farms one term of the fitness and
// joins the anti-exploit suite, whose bounds say how little it may score. They write whole output rows through
// `write`, so SPLIT is held at 1 as for every controller; only `mateHopper` sets MATE.

import { OUTPUT_INDEX } from '../sim/brain-layout.js';
import { isReadyToMate } from '../sim/mate-eligibility.js';
import { FITNESS_V6_SKILL } from './fitness-v6-skill.js';
import { nearestClassRay } from './observer-tick.js';
import { BODY_BITTEN, COMBAT_CONTROLLERS, bodyInput } from './scripted-combat.js';
import {
    CH_FIRST_AGENT,
    CH_LAST_AGENT,
    CH_PREY,
    CH_THREAT,
    SEEK_THRUST,
    createMealMeter,
    eachAlive,
    rayTowardPoint,
    seekFood,
    setOutput,
    turnTowards,
    write,
} from './scripted-parts.js';

/** @typedef {import('./scripted-parts.js').ControllerFactory} ControllerFactory */

/** Ticks a bitten `baiter` runs `fleer` before it goes looking for a bigger agent again (the escape episode length). */
export const BAIT_FLEE_TICKS = 300;

/** The turn of `splitSpammer`: a fixed circle, so it meets food by chance and never steers at it. */
export const SPAMMER_TURN = 0.25;

/** `patrol` counts a patch as reached, and moves on to the next, inside this share of `foodPatchRadius`. */
export const PATROL_REACH = 0.5;

/**
 * Seeks the bigger agents that can bite it until one does, then runs `fleer` for `BAIT_FLEE_TICKS`, then seeks again;
 * with nothing bigger in sight it seeks food, so it feeds while it waits. It provokes bites to be credited for escaping
 * them (the escape credit).
 * @type {ControllerFactory}
 */
function baiter(context) {
    const { world } = context;
    const flee = COMBAT_CONTROLLERS.fleer(context);
    const fleeUntil = new Uint32Array(world.alive.length);
    const owner = new Uint32Array(world.alive.length);
    const bait = eachAlive((w, slot) => {
        if (owner[slot] !== w.genomeId[slot]) {
            owner[slot] = w.genomeId[slot];
            fleeUntil[slot] = 0;
        }
        if (bodyInput(w, slot, BODY_BITTEN) > 0) {
            fleeUntil[slot] = w.tick + BAIT_FLEE_TICKS;
        }
        if (w.tick < fleeUntil[slot]) {
            return;
        }
        const k = nearestClassRay(w, slot, CH_THREAT, CH_THREAT);
        if (k < 0) {
            seekFood(w, slot);
        } else {
            write(w, slot, SEEK_THRUST, turnTowards(k, w.config.rayCount));
        }
    });
    return (w) => {
        // `fleer` writes every row (and keeps its own sighting state), then the baiting rows replace those not fleeing.
        flee(w);
        bait(w);
    };
}

/**
 * Seeks food with SPRINT set on every tick: a sprint is a response to a threat, and the sprint-as-response rule must
 * not pay a sprint that has nothing to answer.
 * @type {ControllerFactory}
 */
function sprinter() {
    return eachAlive((w, slot) => {
        seekFood(w, slot);
        setOutput(w, slot, OUTPUT_INDEX.SPRINT, 1);
    });
}

/**
 * Runs `foodSeeker` until the food it has eaten reaches the skill gate, then holds still: the survival term pays age up
 * to ten times the deliberate intake, and an idle blob lives long. The meal is the food energy gained since the genome
 * was born (the world's own deliberate-intake tracker runs only with merit on; a seeker's food is deliberate).
 * @type {ControllerFactory}
 */
function gateThenIdle({ world }) {
    const eaten = createMealMeter(world);
    return eachAlive((w, slot) => {
        if (eaten(w, slot) < FITNESS_V6_SKILL.GATE) {
            seekFood(w, slot);
        } else {
            write(w, slot, 0, 0);
        }
    });
}

/**
 * Splits at every chance (the sim splits any agent with the energy) and takes in only what it meets by chance: it
 * circles at a fixed turn and never steers at food. It probes the `BORN` term and the chance weight of intake.
 * @type {ControllerFactory}
 */
function splitSpammer() {
    return eachAlive((w, slot) => write(w, slot, SEEK_THRUST, SPAMMER_TURN));
}

/**
 * Whether the agent is a child of a mating that has not yet reached maturity: its parents differ (a split child has
 * the same id twice) and it is younger than `maturityTicks`.
 * @param {Record<string, any>} w the world
 * @param {number} slot an alive agent
 * @returns {boolean}
 */
function isUnraisedChild(w, slot) {
    return w.ageTicks[slot] < w.config.maturityTicks && w.parentA[slot] !== w.parentB[slot];
}

/**
 * Holds MATE and, whenever it is ready to mate, walks to the nearest agent of any kind (the others are ready too, being
 * of its own kind); otherwise it seeks food, which the gated lineage terms need. A child of a mating burns its energy at
 * a sprint instead of feeding, so it dies before `maturityTicks` more often than not and `MATURED` pays little while
 * `MATING` pays at every birth.
 * @type {ControllerFactory}
 */
function mateHopper() {
    return eachAlive((w, slot) => {
        if (isUnraisedChild(w, slot)) {
            write(w, slot, 1, 1);
            setOutput(w, slot, OUTPUT_INDEX.SPRINT, 1);
            return;
        }
        const k = isReadyToMate(w, slot) ? nearestClassRay(w, slot, CH_FIRST_AGENT, CH_LAST_AGENT) : -1;
        if (k < 0) {
            seekFood(w, slot);
        } else {
            write(w, slot, SEEK_THRUST, turnTowards(k, w.config.rayCount));
        }
        setOutput(w, slot, OUTPUT_INDEX.MATE, 1);
    });
}

/**
 * Follows the nearest prey (an agent it can bite) at full thrust and never bites; with no prey in sight it seeks food.
 * The `CHASE` term pays ticks inside a chain of deliberate bites, which following alone must not open.
 * @type {ControllerFactory}
 */
function chaseDrifter() {
    return eachAlive((w, slot) => {
        const k = nearestClassRay(w, slot, CH_PREY, CH_PREY);
        if (k < 0) {
            seekFood(w, slot);
        } else {
            write(w, slot, 1, turnTowards(k, w.config.rayCount));
        }
    });
}

/**
 * Walks the food patches in a ring (starting at the patch numbered by its slot), moving on when one is reached, and
 * never steers at food: it travels for the `MIGRATE` term and takes in only what it meets by chance, so the skill gate
 * that multiplies the term should stay shut. With no patches it holds `SEEK_THRUST` straight ahead, as `cruiser` does.
 * @type {ControllerFactory}
 */
function patrol({ world }) {
    const target = new Int32Array(world.alive.length);
    const owner = new Uint32Array(world.alive.length);
    return eachAlive((w, slot) => {
        const { foodPatchCount, foodPatchRadius } = w.config;
        if (foodPatchCount === 0) {
            write(w, slot, SEEK_THRUST, 0);
            return;
        }
        if (owner[slot] !== w.genomeId[slot]) {
            owner[slot] = w.genomeId[slot];
            target[slot] = slot % foodPatchCount;
        }
        const dx = w.patchX[target[slot]] - w.x[slot];
        const dy = w.patchY[target[slot]] - w.y[slot];
        const reach = PATROL_REACH * foodPatchRadius;
        if (dx * dx + dy * dy < reach * reach) {
            target[slot] = (target[slot] + 1) % foodPatchCount;
        }
        const k = rayTowardPoint(w, slot, w.patchX[target[slot]], w.patchY[target[slot]]);
        write(w, slot, SEEK_THRUST, turnTowards(k, w.config.rayCount));
    });
}

/** The `fitnessV6` exploit controllers by name, merged into `SCRIPTED_CONTROLLERS`. */
export const V6_CONTROLLERS = Object.freeze({
    baiter,
    sprinter,
    gateThenIdle,
    splitSpammer,
    mateHopper,
    chaseDrifter,
    patrol,
});
