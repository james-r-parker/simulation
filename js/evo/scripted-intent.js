// Chance-or-waste controllers: each does a deliberate behaviour badly or by luck, so the intent metrics
// (world-balance.md) can be checked against a controller that should score low. They join the anti-exploit suite.

import { OUTPUT_INDEX } from '../sim/brain-layout.js';
import { nextFloat } from '../sim/rng.js';
import { nearestClassRay } from './observer-tick.js';
import { COMBAT_CONTROLLERS } from './scripted-combat.js';
import {
    CH_BIGGER,
    CH_KIN,
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
 * Runs `fleer`, but with a threat on its rays turns towards the nearest kin hit instead of straight away.
 * @type {ControllerFactory}
 */
function grouper(context) {
    const flee = COMBAT_CONTROLLERS.fleer(context);
    const gather = eachAlive((w, slot) => {
        const kin = nearestClassRay(w, slot, CH_KIN, CH_KIN);
        if (kin >= 0 && nearestClassRay(w, slot, CH_BIGGER, CH_BIGGER) >= 0) {
            setOutput(w, slot, OUTPUT_INDEX.TURN, turnTowards(kin, w.config.rayCount));
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
