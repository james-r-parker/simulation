// The trace of a hunting drill's trial (training.md T19): why a lost `prey-ahead` trial was lost, read tick by tick from
// the world and never written back. The subject is slot 0 and the prey slot 1. `noteTick` allocates nothing, so the
// drill's `done` check can call it every tick.

import { OUTPUT_INDEX } from '../sim/brain-layout.js';
import { canBite } from '../sim/bite-rule.js';

/**
 * The ordered reasons a hunting trial is lost. The first that holds is the one reported.
 * @typedef {'never-bit' | 'never-in-jaws' | 'bit-prey-lived' | 'subject-died-first' | 'prey-died-unkilled'} LostReason
 */

/**
 * @typedef {object} PreyTrace
 * @property {number} closest the closest approach so far, in the two bodies' summed radii (1 is touching)
 * @property {number} jawTicks ticks with the prey inside the jaws: touching, ahead, and bitable
 * @property {number} biteTicks ticks with `BITE` above 0 (anywhere)
 * @property {number} biteJawTicks ticks with `BITE` above 0 and the prey inside the jaws
 * @property {boolean} preyDied whether the prey was dead at the last tick noted
 * @property {boolean} subjectDied whether the subject was dead at the last tick noted
 */

/** @returns {PreyTrace} a trace of a trial not yet played */
export function createPreyTrace() {
    return {
        closest: Infinity,
        jawTicks: 0,
        biteTicks: 0,
        biteJawTicks: 0,
        preyDied: false,
        subjectDied: false,
    };
}

/**
 * Notes the world after a tick.
 * @param {PreyTrace} trace the trace
 * @param {Record<string, any>} world the world, the subject in slot 0 and the prey in slot 1
 * @returns {void}
 */
export function noteTick(trace, world) {
    trace.subjectDied = world.alive[0] === 0;
    trace.preyDied = world.alive[1] === 0;
    if (trace.subjectDied || trace.preyDied) {
        return;
    }
    const dx = world.x[1] - world.x[0];
    const dy = world.y[1] - world.y[0];
    const gap = Math.sqrt(dx * dx + dy * dy) / (world.size[0] + world.size[1]);
    trace.closest = Math.min(trace.closest, gap);
    const inJaws = gap <= 1 && canBite(world, 0, 1);
    const biting = world.outputs[OUTPUT_INDEX.BITE] > 0;
    trace.jawTicks += inJaws ? 1 : 0;
    trace.biteTicks += biting ? 1 : 0;
    trace.biteJawTicks += biting && inJaws ? 1 : 0;
}

/**
 * Why a trial was lost, by the first reason that holds: the output never above 0; above 0 but the prey never in the
 * jaws; the subject starved or recoiled first; a bite landed and the prey lived. A prey that died without the subject's
 * kill (it starved from sprinting) is the last, so the list is total.
 * @param {PreyTrace} trace the finished trace
 * @returns {LostReason} the reason
 */
export function lostReason(trace) {
    if (trace.biteTicks === 0) {
        return 'never-bit';
    }
    if (trace.biteJawTicks === 0) {
        return 'never-in-jaws';
    }
    if (trace.subjectDied) {
        return 'subject-died-first';
    }
    return trace.preyDied ? 'prey-died-unkilled' : 'bit-prey-lived';
}

/**
 * @param {PreyTrace} trace the finished trace
 * @param {boolean} won whether the trial was won
 * @returns {Record<string, any>} the `DrillTrial` fields: the closest approach (null when the two never stood together),
 *   the tick counts, `preyDied`, and `reason` (null for a won trial)
 */
export function traceFields(trace, won) {
    return {
        closest: Number.isFinite(trace.closest) ? trace.closest : null,
        jawTicks: trace.jawTicks,
        biteTicks: trace.biteTicks,
        biteJawTicks: trace.biteJawTicks,
        preyDied: trace.preyDied,
        reason: won ? null : lostReason(trace),
    };
}
