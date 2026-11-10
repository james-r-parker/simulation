// The trace of a hunting drill's trial (training.md T19): why a lost `prey-ahead` trial was lost, read tick by tick from
// the world and never written back. The subject is slot 0 and the prey slot 1. `noteTick` allocates nothing, so the
// drill's `done` check can call it every tick.

import { OUTPUT_INDEX } from '../sim/brain-layout.js';
import { canBite } from '../sim/bite-rule.js';
import { DEATH_CAUSE, EVENT_STRIDE, EVENT_TYPE } from '../sim/events.js';

/**
 * The most the pair's distance may exceed the summed radii at the end of a tick and still count as touching: contact
 * resolution pushes an overlapping pair just apart, so the touching pair of a bite tick ends at 1.0005 radii, not below 1.
 */
const TOUCH_GAP = 1.01;

/**
 * The ordered reasons a hunting trial is lost. The first that holds is the one reported.
 * @typedef {'never-bit' | 'never-in-jaws' | 'bit-prey-lived' | 'subject-starved-or-recoiled-first' | 'prey-died-unkilled'} LostReason
 */

/**
 * @typedef {object} PreyTrace
 * @property {number} closest the closest approach so far, in the two bodies' summed radii (1 is touching)
 * @property {number} jawTicks ticks with the prey inside the jaws: touching (within `TOUCH_GAP`), ahead, and bitable
 * @property {number} biteTicks ticks with `BITE` above 0 (anywhere)
 * @property {number} biteJawTicks ticks with `BITE` above 0 and the prey inside the jaws
 * @property {boolean} preyDied whether the prey was dead at the last tick noted
 * @property {boolean} subjectDied whether the subject was dead at the last tick noted
 * @property {boolean} subjectStarvedOrRecoiled whether the subject starved or paid recoil on a death tick
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
        subjectStarvedOrRecoiled: false,
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
    if (trace.subjectDied) {
        noteSubjectDeath(trace, world);
    }
    if (trace.subjectDied || trace.preyDied) {
        return;
    }
    noteApproach(trace, world);
}

/** @param {PreyTrace} trace trace @param {Record<string, any>} world sim world */
function noteSubjectDeath(trace, world) {
    if (world.events === undefined) {
        return;
    }
    const { data, count } = world.events;
    for (let i = 0; i < count; i++) {
        const o = i * EVENT_STRIDE;
        const starved = data[o] === EVENT_TYPE.AGENT_DIED && data[o + 2] === 0 && data[o + 4] === DEATH_CAUSE.STARVED;
        const recoiled = data[o] === EVENT_TYPE.HUNTER_RECOIL_LIFE && data[o + 2] === 0;
        if (starved || recoiled) {
            trace.subjectStarvedOrRecoiled = true;
        }
    }
}

/** @param {PreyTrace} trace trace @param {Record<string, any>} world sim world */
function noteApproach(trace, world) {
    const dx = world.x[1] - world.x[0];
    const dy = world.y[1] - world.y[0];
    const gap = Math.sqrt(dx * dx + dy * dy) / (world.size[0] + world.size[1]);
    trace.closest = Math.min(trace.closest, gap);
    const inJaws = gap <= TOUCH_GAP && canBite(world, 0, 1);
    const biting = world.outputs[OUTPUT_INDEX.BITE] > 0;
    trace.jawTicks += inJaws ? 1 : 0;
    trace.biteTicks += biting ? 1 : 0;
    trace.biteJawTicks += biting && inJaws ? 1 : 0;
}

/**
 * Why a trial was lost, by the first reason that holds: the output never above 0; above 0 but the prey never in the
 * jaws; a bite landed and the prey lived; the subject starved or paid recoil first. A prey that died without the subject's
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
    if (!trace.preyDied && trace.biteJawTicks > 0) {
        return 'bit-prey-lived';
    }
    if (trace.subjectStarvedOrRecoiled) {
        return 'subject-starved-or-recoiled-first';
    }
    return 'prey-died-unkilled';
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
