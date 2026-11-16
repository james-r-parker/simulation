// The input-only reference (senses-and-motor.md, Lesson probes): a scripted subject that reads only what a brain reads
// (the ray block and the body inputs, `world.inputs`, and the hue of the food on a ray) and plays every drill with one
// rule set: flee a threat (to the refuge when the body inputs name one), eat the nearest food whose hue is not the toxic
// one, chase prey the rays call bitable, and scan in place when it senses nothing. What it wins is what the senses allow
// a competent controller; the gap to the oracle (`js/evo/lesson-oracles.js`) is what the senses lose. A detector, never
// fitness; `referenceSubject('input-reader')` returns it.

import { BODY_INPUT, RAY_CHANNELS, OUTPUT_INDEX } from '../sim/brain-layout.js';
import { FLORA_DEFAULTS } from '../sim/config-flora.js';
import { bodyInput, turnAway } from './scripted-combat.js';
import { nearestClassRay } from './observer-tick.js';
import {
    CH_FOOD,
    CH_KIN,
    CH_PREY,
    CH_THREAT,
    SEEK_THRUST,
    eachAlive,
    setOutput,
    turnTowards,
    write,
    writeForage,
} from './scripted-parts.js';

/** The reference's name in `referenceSubject`. */
export const INPUT_READER = 'input-reader';
/** Two food hues closer than this are the same food. */
const SAME_HUE = 0.05;
/** The spin of a reference that senses nothing: a full turn at no thrust, so it scans the whole circle. */
const SCAN_TURN = 1;
/** A refuge counts as sensed above this nearness. */
const REFUGE_SENSED = 0;

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {number} the ray of the nearest food that is not the toxic one, or -1
 */
function nearestSafeFood(world, slot) {
    const { rayCount } = world.config;
    const base = (/** @type {number} */ k) => slot * world.layout.rawInputCount + k * RAY_CHANNELS;
    const isSafe = (/** @type {number} */ k) =>
        world.inputs[base(k) + CH_FOOD] > 0 &&
        Math.abs(world.rayHue[slot * rayCount + k] - FLORA_DEFAULTS.toxiccap.hue) >= SAME_HUE;
    const safe = Array.from({ length: rayCount }, (_, k) => k).filter(isSafe);
    if (safe.length === 0) {
        return -1;
    }
    return safe.reduce((best, k) => (world.inputs[base(k)] > world.inputs[base(best)] ? k : best));
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {number} threat the ray of the nearest threat
 * @returns {void} flees: towards the refuge when the body inputs name one, else away from the threat, at a sprint
 */
function flee(world, slot, threat) {
    const near = bodyInput(world, slot, BODY_INPUT.REFUGE_NEAR);
    let turn = turnAway(threat, world.config.rayCount);
    if (near > REFUGE_SENSED) {
        const cos = bodyInput(world, slot, BODY_INPUT.REFUGE_BEARING_COS);
        const sin = bodyInput(world, slot, BODY_INPUT.REFUGE_BEARING_SIN);
        turn = cos < 0 ? Math.sign(sin) || 1 : Math.max(-1, Math.min(1, 4 * sin));
    }
    write(world, slot, 1, turn);
    setOutput(world, slot, OUTPUT_INDEX.SPRINT, 1);
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {void} writes one agent's outputs from its inputs alone
 */
function read(world, slot) {
    const rays = world.config.rayCount;
    const threat = nearestClassRay(world, slot, CH_THREAT, CH_THREAT);
    const food = nearestSafeFood(world, slot);
    const prey = nearestClassRay(world, slot, CH_PREY, CH_PREY);
    if (threat >= 0) {
        flee(world, slot, threat);
    } else if (food >= 0) {
        writeForage(world, slot, SEEK_THRUST * 2, turnTowards(food, rays));
    } else if (prey >= 0) {
        write(world, slot, 1, turnTowards(prey, rays));
        setOutput(world, slot, OUTPUT_INDEX.SPRINT, 1);
        setOutput(world, slot, OUTPUT_INDEX.BITE, 1);
    } else {
        write(world, slot, 0, SCAN_TURN);
    }
}

/**
 * @returns {import('./memory-probe-run.js').Subject} the reference as a probe subject; its `spec` is null, so it takes
 *   the scenario's
 */
export function readerSubject() {
    return {
        name: INPUT_READER,
        id: 0,
        spec: null,
        weights: null,
        act: eachAlive((world, slot) => read(world, slot)),
    };
}

/** The name of the reference that spares kin (`kin-spared`). */
export const KIN_SPARING = 'kin-sparing';

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {number} ray a ray index
 * @returns {number} how near the ray's hit is (1 at contact)
 */
function nearness(world, slot, ray) {
    return world.inputs[slot * world.layout.rawInputCount + ray * RAY_CHANNELS];
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {void} withdraws the bite while a clone is nearer than the prey on the rays: the sim refuses a bite on kin, but
 *   the lesson is not to want one (`kin-spared`)
 */
function spareKin(world, slot) {
    const kin = nearestClassRay(world, slot, CH_KIN, CH_KIN);
    const prey = nearestClassRay(world, slot, CH_PREY, CH_PREY);
    if (kin >= 0 && (prey < 0 || nearness(world, slot, kin) > nearness(world, slot, prey))) {
        setOutput(world, slot, OUTPUT_INDEX.BITE, 0);
    }
}

/**
 * @returns {import('./memory-probe-run.js').Subject} the input reader that holds its bite while a clone is nearer than the
 *   prey: the senses-only reference of `kin-spared`, where `memoryless` and `input-reader` bite whenever prey is in view
 */
export function kinSparingSubject() {
    const reader = readerSubject();
    const act = /** @type {(world: Record<string, any>) => void} */ (reader.act);
    return {
        ...reader,
        name: KIN_SPARING,
        act: (world) => {
            act(world);
            for (let slot = 0; slot < world.alive.length; slot++) {
                if (world.alive[slot] === 1) {
                    spareKin(world, slot);
                }
            }
        },
    };
}
