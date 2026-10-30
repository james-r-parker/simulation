// The probes' reference controllers (brain-capacity-and-memory.md, Memory probes): a memoryless one, which must score a
// gain of 0, and one that stores its target in `MEMORY_A`, which must score a clearly positive gain. Both seek food,
// flee a threat and hunt prey by sight; they differ only in what they do when the target drops out of the senses.

import { BODY_INPUT, OUTPUT_INDEX } from '../sim/brain-layout.js';
import { bodyInput, turnAway } from './scripted-combat.js';
import { nearestClassRay } from './observer-tick.js';
import {
    CH_FOOD,
    CH_PREY,
    CH_THREAT,
    SEEK_THRUST,
    eachAlive,
    setOutput,
    turnTowards,
    write,
} from './scripted-parts.js';

/** What `MEMORY_A` holds: the kind of target last seen, signed so a flight and a search differ. */
const REMEMBER_FOOD = 1;
const REMEMBER_THREAT = -1;
/** A stored value beyond this magnitude counts as a memory. */
const MEMORY_THRESHOLD = 0.5;
/** The gait of an agent with nothing to go on: it backs off. */
const IDLE_THRUST = -0.4;
const IDLE_TURN = 0;

/** The reference kinds. */
export const REFERENCES = Object.freeze(['memoryless', 'memory-storing']);

/**
 * Flees at full thrust, away from the threat when one is in view.
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {number} threat the ray of the nearest threat, or -1
 * @returns {number} what to store: `REMEMBER_THREAT`
 */
function flee(world, slot, threat) {
    write(world, slot, 1, threat >= 0 ? turnAway(threat, world.config.rayCount) : 0);
    return REMEMBER_THREAT;
}

/**
 * Chases prey: sprints at it and bites.
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {number} prey the ray of the nearest prey
 * @returns {number} what to store: nothing
 */
function chase(world, slot, prey) {
    write(world, slot, 1, turnTowards(prey, world.config.rayCount));
    setOutput(world, slot, OUTPUT_INDEX.SPRINT, 1);
    setOutput(world, slot, OUTPUT_INDEX.BITE, 1);
    return 0;
}

/**
 * Seeks food, or heads straight on towards food that was seen and has left the senses.
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {number} food the ray of the nearest food, or -1
 * @returns {number} what to store: `REMEMBER_FOOD`
 */
function seek(world, slot, food) {
    write(world, slot, SEEK_THRUST, food >= 0 ? turnTowards(food, world.config.rayCount) : 0);
    return REMEMBER_FOOD;
}

/**
 * Picks the behaviour from what the agent sees and remembers.
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {number} memory the `MEMORY_A` read-back (0 for the memoryless controller)
 * @returns {number} what to store in `MEMORY_A`
 */
function decide(world, slot, memory) {
    const food = nearestClassRay(world, slot, CH_FOOD, CH_FOOD);
    const threat = nearestClassRay(world, slot, CH_THREAT, CH_THREAT);
    const prey = nearestClassRay(world, slot, CH_PREY, CH_PREY);
    if (threat >= 0 || (food < 0 && prey < 0 && memory < -MEMORY_THRESHOLD)) {
        return flee(world, slot, threat);
    }
    if (food >= 0 || (prey < 0 && memory > MEMORY_THRESHOLD)) {
        return seek(world, slot, food);
    }
    if (prey >= 0) {
        return chase(world, slot, prey);
    }
    write(world, slot, IDLE_THRUST, IDLE_TURN);
    return 0;
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {boolean} remembers whether the controller reads and writes `MEMORY_A`
 * @returns {void}
 */
function act(world, slot, remembers) {
    const stored = decide(world, slot, remembers ? bodyInput(world, slot, BODY_INPUT.MEMORY_A) : 0);
    if (remembers) {
        setOutput(world, slot, OUTPUT_INDEX.MEMORY_A, stored);
    }
}

/**
 * @param {string} kind one of `REFERENCES`
 * @returns {import('./memory-probe-run.js').Subject} the reference as a probe subject
 * @throws {Error} on an unknown kind
 */
export function referenceSubject(kind) {
    if (!REFERENCES.includes(kind)) {
        throw new Error(`reference: expected one of ${REFERENCES.join(', ')}, got "${kind}"`);
    }
    const remembers = kind === 'memory-storing';
    return {
        name: kind,
        id: 0,
        spec: null,
        weights: null,
        act: eachAlive((world, slot) => act(world, slot, remembers)),
    };
}
