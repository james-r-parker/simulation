// The scripted references of the body-sense and call reflex cases (brain-reflex-tests.md, T21a): a pick of the weaker of
// two prey, a flight from a threat only while it closes, a held sprint when the view is crowded with threats, and a turn
// to a hunt call. Each reads only what a brain reads (the pooled body sense and view shares, the heard call) and writes a
// whole output row.

import { BODY_INPUT } from '../sim/brain-layout.js';
import {
    GO_THRUST,
    heardLoudness,
    heardSide,
    pooledAt,
    pooledValues,
    sprintOnPrey,
} from './reflex-references-parts.js';
import { write } from './scripted-parts.js';

/** Where the threat's closing sits in the body sense block: after the prey's two hits (6) and its size and speed (2). */
const THREAT_CLOSING = 8;

/**
 * Turns to the weaker of the two prey hits: the one whose size and speed read lower together.
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {void}
 */
function pickTheWeak(world, slot) {
    const { pooled, sense } = pooledAt(world);
    const prey = pooled.prey;
    const [s0, sine0, s1, sine1, size0, speed0, size1, speed1] = pooledValues(world, slot, [
        prey,
        prey + 2,
        prey + 3,
        prey + 5,
        sense,
        sense + 1,
        sense + 3,
        sense + 4,
    ]);
    const second = s1 > 0 && size1 + speed1 < size0 + speed0;
    write(world, slot, s0 > 0 ? 1 : 0, s0 > 0 ? Math.sign(second ? sine1 : sine0) : 0);
}

/**
 * Flees a threat that is closing, off its side, and stands still while it leaves.
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {void}
 */
function fleeWhatCloses(world, slot) {
    const { pooled, sense } = pooledAt(world);
    const [closing, sine] = pooledValues(world, slot, [sense + THREAT_CLOSING, pooled.threat + 2]);
    write(world, slot, closing > 0 ? GO_THRUST : 0, closing > 0 ? -Math.sign(sine) : 0);
}

/**
 * Sprints at the prey in view, unless the view holds any threat.
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {void}
 */
function mindTheNumbers(world, slot) {
    const [threats] = pooledValues(world, slot, [pooledAt(world).count]);
    if (threats > 0) {
        write(world, slot, 0, 0);
    } else {
        sprintOnPrey(world, slot);
    }
}

/**
 * Turns to a heard hunt call and goes.
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {void}
 */
function answerTheCall(world, slot) {
    const heard = heardLoudness(world, slot, BODY_INPUT.HEARD_HUNT) > 0;
    write(world, slot, heard ? GO_THRUST : 0, heard ? Math.sign(heardSide(world, slot, BODY_INPUT.HEARD_HUNT)) : 0);
}

/** The reference's behaviour for each body-sense case. */
export const BODY_BEHAVIOURS = Object.freeze({
    'pick-the-weak': pickTheWeak,
    'flee-what-closes': fleeWhatCloses,
    'mind-the-numbers': mindTheNumbers,
    'answer-the-call': answerTheCall,
});
