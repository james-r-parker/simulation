// The scripted references of the role reflex cases (brain-reflex-tests.md, Phase 5): for each case a controller that reads
// only what a brain reads (the ray block and the body inputs) and does the right thing, so a case's bar can say whether
// it separates anything. Each is memoryless and writes a whole output row.

import { BODY_INPUT, CH_MEGAFAUNA, OUTPUT_INDEX, RAY_CHANNELS } from '../sim/brain-layout.js';
import { nearestClassRay } from './observer-tick.js';
import { bodyInput, turnAway } from './scripted-combat.js';
import { CH_PREY, CH_THREAT, eachAlive, setOutput, turnTowards, write } from './scripted-parts.js';

/** The gait of a reference that is going somewhere: well above every thrust bar. */
const GO_THRUST = 0.6;
/** A prey ray this near (1 at contact, 0 at the eye's range) is in the jaws; the staged jaws read about 0.8, a prey at half the view 0.5. */
const JAWS_NEARNESS = 0.65;
/** `SPRINT` effort per unit of nearness: 1 from half the nearness a prey at the staged `near` share has. */
const SPRINT_PER_NEARNESS = 2;

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {number} k a ray
 * @returns {number} the ray's nearness (1 at contact, 0 at the eye's range)
 */
const nearness = (world, slot, k) => world.inputs[slot * world.layout.rawInputCount + k * RAY_CHANNELS];

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {number} the heard alarm's loudness
 */
const heardLoudness = (world, slot) => bodyInput(world, slot, BODY_INPUT.HEARD_ALARM);

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {number} the side of the heard alarm: positive on the positive `TURN` side
 */
const heardSide = (world, slot) => bodyInput(world, slot, BODY_INPUT.HEARD_ALARM + 2);

/**
 * Heads for the nearest prey ray at full thrust and writes the rest of the row 0.
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {number} the nearest prey ray, or -1
 */
function closeOnPrey(world, slot) {
    const k = nearestClassRay(world, slot, CH_PREY, CH_PREY);
    write(world, slot, k < 0 ? 0 : 1, turnTowards(k, world.config.rayCount));
    return k;
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {void}
 */
function sprintOnPrey(world, slot) {
    const k = closeOnPrey(world, slot);
    if (k >= 0) {
        setOutput(world, slot, OUTPUT_INDEX.SPRINT, Math.min(1, SPRINT_PER_NEARNESS * nearness(world, slot, k)));
    }
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {void}
 */
function holdTheBite(world, slot) {
    const k = closeOnPrey(world, slot);
    if (k >= 0 && nearness(world, slot, k) >= JAWS_NEARNESS) {
        setOutput(world, slot, OUTPUT_INDEX.BITE, 1);
    }
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {void}
 */
function callOnThreat(world, slot) {
    write(world, slot, 0, 0);
    const seen = nearestClassRay(world, slot, CH_THREAT, CH_THREAT) >= 0;
    setOutput(world, slot, OUTPUT_INDEX.ALARM, seen ? 1 : 0);
}

/**
 * @param {number} sign +1 to turn to the call, -1 to turn from it
 * @returns {(world: Record<string, any>, slot: number) => void} the controller
 */
const onAlarm = (sign) => (world, slot) => {
    const heard = heardLoudness(world, slot) > 0;
    write(world, slot, heard ? GO_THRUST : 0, heard ? sign * Math.sign(heardSide(world, slot)) : 0);
};

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {void}
 */
function clearTheHerd(world, slot) {
    const k = nearestClassRay(world, slot, CH_MEGAFAUNA, CH_MEGAFAUNA);
    write(world, slot, k < 0 ? 0 : GO_THRUST, k < 0 ? 0 : turnAway(k, world.config.rayCount));
}

/** The reference's behaviour for each role case. */
const BEHAVIOURS = Object.freeze({
    'sprint-on-prey': sprintOnPrey,
    'hold-the-bite': holdTheBite,
    'call-on-threat': callOnThreat,
    'turn-to-alarm': onAlarm(1),
    'flee-on-alarm': onAlarm(-1),
    'clear-the-herd': clearTheHerd,
});

/**
 * @param {string} name a case's name, `<case>` or `<case>:<spec>` (a case given to another specialisation)
 * @returns {string} the case's name without the specialisation
 */
const baseName = (name) => name.split(':')[0];

/**
 * @param {string} name a case's name
 * @returns {boolean} whether it is a role case with a reference here
 */
export const hasRoleReference = (name) => Object.hasOwn(BEHAVIOURS, baseName(name));

/**
 * @param {string} name the name of a role case
 * @returns {import('./reflex-eval.js').ReflexSubject} its reference, as a scripted subject
 * @throws {Error} on a name that is not a role case
 */
export function roleReference(name) {
    if (!hasRoleReference(name)) {
        throw new Error(`roleReference: no reference for "${name}"; known: ${Object.keys(BEHAVIOURS).join(', ')}`);
    }
    const behave = BEHAVIOURS[/** @type {keyof typeof BEHAVIOURS} */ (baseName(name))];
    return { name: `role-${name}`, id: 0, weights: null, act: eachAlive(behave) };
}
