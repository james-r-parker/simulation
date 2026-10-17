// Chance-or-waste controllers: each does a deliberate behaviour badly or by luck, so the intent metrics
// (world-balance.md) can be checked against a controller that should score low. They join the anti-exploit suite.

import { OUTPUT_INDEX } from '../sim/brain-layout.js';
import { detCos, detSin } from '../sim/det-math.js';
import { nextFloat } from '../sim/rng.js';
import { nearestClassRay } from './observer-tick.js';
import { COMBAT_CONTROLLERS } from './scripted-combat.js';
import {
    CH_BIGGER,
    createWander,
    eachAlive,
    SEEK_THRUST,
    seekFood,
    setOutput,
    turnTowards,
    write,
} from './scripted-parts.js';

/** @typedef {import('./scripted-parts.js').ControllerFactory} ControllerFactory */

/** Ticks per `sloppyForager` decision window: the length of one seek-or-wander choice. */
export const DECISION_WINDOW = 10;

/** The chance that a `sloppyForager` window seeks food rather than wanders. */
export const SEEK_SHARE = 0.5;

/**
 * Seeks food on half its decision windows and wanders on the rest, choosing each window from its `rng`.
 * @type {ControllerFactory}
 */
function sloppyForager({ world, rng }) {
    const wander = createWander(world, rng);
    const owner = new Uint32Array(world.alive.length);
    const seeking = new Uint8Array(world.alive.length);
    return eachAlive((w, slot) => {
        if (w.tick % DECISION_WINDOW === 0 || owner[slot] !== w.genomeId[slot]) {
            owner[slot] = w.genomeId[slot];
            seeking[slot] = nextFloat(rng) < SEEK_SHARE ? 1 : 0;
        }
        if (seeking[slot] === 1) {
            seekFood(w, slot);
        } else {
            wander(w, slot);
        }
    });
}

/**
 * Holds still with the bite output set: it bites only what comes into its jaws.
 * @type {ControllerFactory}
 */
function jawSitter() {
    return eachAlive((w, slot) => {
        write(w, slot, 0, 0);
        setOutput(w, slot, OUTPUT_INDEX.BITE, 1);
    });
}

/**
 * Runs `hunter` and sets the hunt call on every tick, so most calls have nothing to answer.
 * @type {ControllerFactory}
 */
function huntCallSpammer(context) {
    const hunt = COMBAT_CONTROLLERS.hunter(context);
    const call = eachAlive((w, slot) => setOutput(w, slot, OUTPUT_INDEX.HUNT, 1));
    return (world) => {
        hunt(world);
        call(world);
    };
}

/**
 * The ray index that points at the nearest living agent of the same lineage within `callRadius`. Kin rays (parent,
 * child, sibling) are almost never on a prey's rays while a threat is, so the grouper reads lineage from the world.
 * @param {Record<string, any>} w the world
 * @param {number} slot an alive agent
 * @returns {number} the ray index, or -1 when no lineage mate is that near
 */
function nearestMateRay(w, slot) {
    let best = -1;
    let bestSquare = w.config.callRadius * w.config.callRadius;
    for (let s = 0; s < w.alive.length; s++) {
        const dx = w.x[s] - w.x[slot];
        const dy = w.y[s] - w.y[slot];
        const square = dx * dx + dy * dy;
        if (s !== slot && w.alive[s] === 1 && w.lineageId[s] === w.lineageId[slot] && square <= bestSquare) {
            bestSquare = square;
            best = s;
        }
    }
    if (best < 0) {
        return -1;
    }
    const cos = detCos(w.angle[slot]);
    const sin = detSin(w.angle[slot]);
    const dx = w.x[best] - w.x[slot];
    const dy = w.y[best] - w.y[slot];
    let ray = 0;
    let bestDot = -Infinity;
    for (let k = 0; k < w.config.rayCount; k++) {
        const dot = dx * (cos * w.rayCos[k] - sin * w.raySin[k]) + dy * (sin * w.rayCos[k] + cos * w.raySin[k]);
        if (dot > bestDot) {
            bestDot = dot;
            ray = k;
        }
    }
    return ray;
}

/**
 * Runs `fleer`, but with a threat on its rays turns towards the nearest lineage mate instead of straight away.
 * @type {ControllerFactory}
 */
function grouper(context) {
    const flee = COMBAT_CONTROLLERS.fleer(context);
    const gather = eachAlive((w, slot) => {
        if (nearestClassRay(w, slot, CH_BIGGER, CH_BIGGER) >= 0) {
            const mate = nearestMateRay(w, slot);
            if (mate >= 0) {
                setOutput(w, slot, OUTPUT_INDEX.TURN, turnTowards(mate, w.config.rayCount));
            }
        }
    });
    return (world) => {
        flee(world);
        gather(world);
    };
}

/**
 * Holds `SEEK_THRUST` straight ahead and never turns: it eats only what lies in its path.
 * @type {ControllerFactory}
 */
function cruiser() {
    return eachAlive((w, slot) => write(w, slot, SEEK_THRUST, 0));
}

/** The chance-or-waste controllers by name, merged into `SCRIPTED_CONTROLLERS`. */
export const INTENT_CONTROLLERS = Object.freeze({
    sloppyForager,
    jawSitter,
    huntCallSpammer,
    grouper,
    cruiser,
});
