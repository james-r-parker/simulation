// Controllers for the reward-hacking audit (fitness proxies): each does something a credit rule might pay for by
// mistake - circling in a patch, travelling to food backwards, stopping just short of it - and joins the scripted set
// so the staged credit tests and the exploit suite can score them against known outcomes.

import { RAY_CHANNELS } from '../sim/brain-layout.js';
import { nearestClassRay } from './observer-tick.js';
import { CH_FOOD, SEEK_THRUST, eachAlive, turnTowards, write } from './scripted-parts.js';

/** @typedef {import('./scripted-parts.js').ControllerFactory} ControllerFactory */

/** The turn of `patchCircler`: a circle of about 200 px radius at `SEEK_THRUST`, so it stays inside a food patch. */
export const CIRCLE_TURN = 0.15;

/** A food hit nearer than this proximity (1 is touching) makes `nearMiss` stop thrusting. */
export const NEAR_MISS_PROXIMITY = 0.5;

/** The thrust of `backingCollider`: it reverses at this share of full thrust. */
export const REVERSE_THRUST = -0.4;

/**
 * Circles at a fixed turn and never steers at food: a ring of food around it passes in front of it on every lap, and
 * its constant turn is a turn towards every food hit on the turning side.
 * @type {ControllerFactory}
 */
function patchCircler() {
    return eachAlive((w, slot) => write(w, slot, SEEK_THRUST, CIRCLE_TURN));
}

/**
 * `patchCircler` turning the other way, so food on the other side of its heading is the one it turns towards.
 * @type {ControllerFactory}
 */
function patchCirclerRight() {
    return eachAlive((w, slot) => write(w, slot, SEEK_THRUST, -CIRCLE_TURN));
}

/**
 * Faces away from the nearest food and reverses into it: it reaches the food travelling backwards, with the food on a
 * rear ray. With no food in sight it holds still.
 * @type {ControllerFactory}
 */
function backingCollider() {
    return eachAlive((w, slot) => {
        const k = nearestClassRay(w, slot, CH_FOOD, CH_FOOD);
        if (k < 0) {
            write(w, slot, 0, 0);
            return;
        }
        const half = w.config.rayCount / 2;
        if (Math.abs(k - half) <= 1) {
            write(w, slot, REVERSE_THRUST, 0);
        } else {
            // Turn so the food slides round to the rear ray: away from it, then reverse once it is behind.
            write(w, slot, 0, k < half ? -1 : 1);
        }
    });
}

/**
 * Steers at the nearest food as `foodSeeker` does but stops thrusting once it is near, so it never touches what it
 * approached; with no food in sight it holds still.
 * @type {ControllerFactory}
 */
function nearMiss() {
    return eachAlive((w, slot) => {
        const k = nearestClassRay(w, slot, CH_FOOD, CH_FOOD);
        if (k < 0) {
            write(w, slot, 0, 0);
            return;
        }
        const near = w.inputs[slot * w.layout.rawInputCount + k * RAY_CHANNELS] > NEAR_MISS_PROXIMITY;
        write(w, slot, near ? 0 : SEEK_THRUST, turnTowards(k, w.config.rayCount));
    });
}

/** The audit controllers by name, merged into `SCRIPTED_CONTROLLERS`. */
export const AUDIT_CONTROLLERS = Object.freeze({
    patchCircler,
    patchCirclerRight,
    backingCollider,
    nearMiss,
});
