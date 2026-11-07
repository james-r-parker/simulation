// World render effects (renderer-event-effects Phase 3): a herd animal's death, a calf, dung that seeds a patch, a patch
// that dies, and a hunter's first deliberate kill, each from its existing sim event. Positions come from the world arrays
// the events point at, which the sim leaves set when the thing dies. Reads the world and never changes it.

import { EVENT_TYPE } from '../sim/events.js';
import { beginEffect, EFFECT_KIND, placeEffect } from './effect-ring.js';

/**
 * Writes words `a` to `d` of a record.
 * @param {{u32: Uint32Array}} log the effect log
 * @param {number} w the record's word offset
 * @param {[number, number, number, number]} words `a`, `b`, `c` and `d`
 * @returns {void}
 */
function words(log, w, [a, b, c, d]) {
    log.u32[w + 4] = a;
    log.u32[w + 5] = b;
    log.u32[w + 6] = c;
    log.u32[w + 7] = d;
}

/**
 * @param {any} log the effect log
 * @param {Record<string, any>} world the world just stepped
 * @param {number} o the event's offset
 * @returns {void}
 */
function addHerdAnimal(log, world, o) {
    const d = world.events.data;
    const died = d[o] === EVENT_TYPE.HERD_ANIMAL_DIED;
    const animal = d[o + 3];
    const w = beginEffect(log, died ? EFFECT_KIND.HERD_DIED : EFFECT_KIND.CALF_BORN, d[o + 1]);
    placeEffect(log, w, world.herdX[animal], world.herdY[animal]);
    words(log, w, [d[o + 2], animal, 0, 0]);
}

/**
 * @param {any} log the effect log
 * @param {Record<string, any>} world the world just stepped
 * @param {number} o the event's offset
 * @returns {void}
 */
function addDung(log, world, o) {
    const d = world.events.data;
    const w = beginEffect(log, EFFECT_KIND.DUNG_DROPPED, d[o + 1]);
    placeEffect(log, w, d[o + 7], d[o + 8]);
    words(log, w, [d[o + 6], d[o + 5], Math.round((world.patchHue[d[o + 5]] + 1) * 0.5 * 4095), 0]);
}

/**
 * @param {any} log the effect log
 * @param {Record<string, any>} world the world just stepped
 * @param {number} o the event's offset
 * @returns {void}
 */
function addWilt(log, world, o) {
    const d = world.events.data;
    const patch = d[o + 2];
    const w = beginEffect(log, EFFECT_KIND.PATCH_WILTED, d[o + 1]);
    placeEffect(log, w, world.patchX[patch], world.patchY[patch]);
    words(log, w, [d[o + 3], Math.round((world.patchHue[patch] + 1) * 0.5 * 4095), 0, 0]);
}

/**
 * A hunter's first deliberate kill, at the killer; skipped when the killer is no longer in the world.
 * @param {any} log the effect log
 * @param {Record<string, any>} world the world just stepped
 * @param {number} o the event's offset
 * @param {Map<number, number> | undefined} slotOf genome id to slot
 * @returns {void}
 */
function addFirstKill(log, world, o, slotOf) {
    const d = world.events.data;
    const genome = d[o + 2];
    const slot = slotOf?.get(genome);
    if (d[o + 4] !== 1 || slot === undefined || world.alive[slot] !== 1 || world.genomeId[slot] !== genome) {
        return;
    }
    const w = beginEffect(log, EFFECT_KIND.FIRST_KILL, d[o + 1]);
    placeEffect(log, w, world.x[slot], world.y[slot]);
    words(log, w, [genome, world.spec[slot], world.lineageId[slot], 0]);
}

/**
 * Adds the world effect for one event, when it has one.
 * @param {any} log the effect log
 * @param {Record<string, any>} world the world just stepped
 * @param {number} o the event's offset
 * @param {Map<number, number> | undefined} slotOf genome id to slot
 * @returns {boolean} whether the event was a world event
 */
export function addWorldEffect(log, world, o, slotOf) {
    switch (world.events.data[o]) {
        case EVENT_TYPE.HERD_ANIMAL_DIED:
        case EVENT_TYPE.HERD_ANIMAL_BORN:
            addHerdAnimal(log, world, o);
            return true;
        case EVENT_TYPE.HERD_SEEDED:
            addDung(log, world, o);
            return true;
        case EVENT_TYPE.PATCH_DIED:
            addWilt(log, world, o);
            return true;
        case EVENT_TYPE.HUNTER_KILL:
            addFirstKill(log, world, o, slotOf);
            return true;
        default:
            return false;
    }
}
