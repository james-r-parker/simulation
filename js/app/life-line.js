// The life line: the last events of any agent's life, for the strip under the inspector (docs/designs/ambient-display.md,
// "Follow as a story"). A ring of the played effects, one row for each agent an effect involves (a bite is a bite given
// and a bite taken), so a subject the camera has just handed to still shows its recent past. Typed, no allocation after
// `createLifeLine`. The ring holds the last `LIFE_CAPACITY` rows, so a quiet life's oldest events fall out first.

import { CLIENT_KIND } from './renderer/client-kinds.js';

/** The rows remembered, across all agents. */
export const LIFE_CAPACITY = 4096;
const CAUSE_SHIFT = 8;
const CAUSE_MASK = 0xff;
/** The events a strip shows. */
export const LIFE_EVENTS = 12;

/** The life events, by code. */
export const LIFE = Object.freeze({ BORN: 0, MEAL: 1, BITE_GIVEN: 2, BITE_TAKEN: 3, MATE: 4, BIRTH: 5, KILL: 6 });

/** The label of each life event, by code. */
export const LIFE_LABELS = Object.freeze(['born', 'meal', 'bite given', 'bite taken', 'mate', 'birth', 'kill']);

/**
 * @typedef {object} LifeLine
 * @property {Uint32Array} genome the agent each row is about
 * @property {Uint8Array} code the row's event, a `LIFE` code
 * @property {number} next the next row to write
 * @property {number} count rows held
 */

/** @returns {LifeLine} an empty ring */
export function createLifeLine() {
    return { genome: new Uint32Array(LIFE_CAPACITY), code: new Uint8Array(LIFE_CAPACITY), next: 0, count: 0 };
}

/**
 * @param {LifeLine} life the ring
 * @param {number} genome the agent
 * @param {number} code a `LIFE` code
 * @returns {void}
 */
function push(life, genome, code) {
    if (genome === 0) {
        return;
    }
    life.genome[life.next] = genome;
    life.code[life.next] = code;
    life.next = (life.next + 1) % LIFE_CAPACITY;
    life.count = Math.min(life.count + 1, LIFE_CAPACITY);
}

/**
 * Remembers what a played effect did to the agents it names: a birth (the newborn is born, its mother gives birth), a
 * bite, a mating, a kill (the killer of an `EATEN` death) or a meal.
 * @param {LifeLine} life the ring
 * @param {{kind: number, a: number, b: number, c: number}} effect the played effect
 * @param {{kinds: Record<string, number>, eatenCause: number}} ctx the layout codes
 * @returns {void}
 */
export function noteLife(life, effect, ctx) {
    const { kinds } = ctx;
    if (effect.kind === kinds.BORN) {
        push(life, effect.a, LIFE.BORN);
        push(life, effect.c, LIFE.BIRTH);
    } else if (effect.kind === kinds.BITE) {
        push(life, effect.a, LIFE.BITE_GIVEN);
        push(life, effect.b, LIFE.BITE_TAKEN);
    } else if (effect.kind === kinds.MATED) {
        push(life, effect.a, LIFE.MATE);
        push(life, effect.b, LIFE.MATE);
    } else if (effect.kind === kinds.DIED && ((effect.c >>> CAUSE_SHIFT) & CAUSE_MASK) === ctx.eatenCause) {
        push(life, effect.b, LIFE.KILL);
    } else if (effect.kind === CLIENT_KIND.MEAL) {
        push(life, effect.a, LIFE.MEAL);
    }
}

/**
 * @param {LifeLine} life the ring
 * @param {number} genome the agent
 * @param {Uint8Array} out receives the codes, oldest first, at most `LIFE_EVENTS`
 * @returns {number} how many were written
 */
export function lastEvents(life, genome, out) {
    let n = 0;
    for (let k = 1; k <= life.count && n < LIFE_EVENTS; k++) {
        const i = (life.next - k + LIFE_CAPACITY) % LIFE_CAPACITY;
        if (life.genome[i] === genome) {
            out[LIFE_EVENTS - 1 - n] = life.code[i];
            n += 1;
        }
    }
    out.copyWithin(0, LIFE_EVENTS - n, LIFE_EVENTS);
    return n;
}
