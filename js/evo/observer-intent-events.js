// The intent state's event handling, run each tick after `updateIntent`: calls and smoke classified as precise or
// idle, hunt calls queued and answered, and eaten deaths read for pursuit and pack convergence.

import { TIMER_CAP } from '../sim/world.js';
import { DEATH_CAUSE, EVENT_STRIDE, EVENT_TYPE } from '../sim/events.js';
import { KILL, killKind } from './observer-combat.js';
import { biteDeliberate, findAlive, recordBite } from './observer-intent.js';
import { pushHuntCall, resolveHuntCalls, sampleHearers } from './observer-intent-calls.js';
import { INTENT_WINDOW } from './observer-intent-state.js';

/**
 * Counts a call or smoke release as precise or idle for its caller's slot.
 * @param {Record<string, any>} intent the intent state
 * @param {number} slot the caller's slot
 * @param {boolean} precise whether the call met its rule
 * @returns {void}
 */
function noteSignal(intent, slot, precise) {
    if (precise) {
        intent.preciseSignal[slot] += 1;
    } else {
        intent.idleSignal[slot] += 1;
        intent.run.idleSignals += 1;
    }
}

/**
 * @param {Record<string, any>} intent the intent state
 * @param {Record<string, any>} world the world
 * @param {number} caller the caller's slot
 * @returns {number} the living agents of the caller's lineage within `callRadius` of it, not counting the caller
 */
function kinAround(intent, world, caller) {
    const { alive, lineageId, x, y } = world;
    const r2 = intent.callRadius * intent.callRadius;
    let count = 0;
    for (let s = 0; s < alive.length; s++) {
        const dx = x[s] - x[caller];
        const dy = y[s] - y[caller];
        if (s !== caller && alive[s] === 1 && lineageId[s] === lineageId[caller] && dx * dx + dy * dy <= r2) {
            count += 1;
        }
    }
    return count;
}

/**
 * Reads the fatal bite of an eaten death and counts the kill toward pursuit and pack convergence.
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @param {number} o the record offset of the `AgentDied`
 * @returns {void}
 */
export function noteIntentDeath(observer, world, o) {
    const { intent, combat } = observer;
    const d = world.events.data;
    const slot = d[o + 2];
    const killerId = d[o + 5];
    if (world.lastBiteTick[slot] === world.tick) {
        const killer = findAlive(world, observer.slotOf, killerId);
        recordBite(intent, slot, killerId, killer >= 0 && biteDeliberate(intent, killer, world.tick));
    }
    const kind = killKind(combat, killerId, d[o + 11]);
    if (kind >= KILL.HUNT) {
        intent.run.huntKillsDeliberate += intent.lastBiteDeliberate[slot];
    }
    if (kind === KILL.PACK) {
        intent.run.packKillsConvergent += intent.lastBiteDeliberate[slot] & intent.prevBiteDeliberate[slot];
    }
}

/**
 * Handles one call or smoke record: precision from the caller's sightings, and the queue for a hunt call.
 * @param {Record<string, any>} intent the intent state
 * @param {Record<string, any>} world the world
 * @param {number} type an `EVENT_TYPE` of a call or smoke
 * @param {number} slot the caller's slot
 * @returns {void}
 */
function noteCall(intent, world, type, slot) {
    const { tick } = world;
    const { run } = intent;
    const threat = tick - intent.lastThreat[slot] <= INTENT_WINDOW;
    let precise = threat;
    if (type === EVENT_TYPE.ALARM_CALLED) {
        run.alarms += 1;
        run.alarmsPrecise += precise ? 1 : 0;
        run.kinNearSum += kinAround(intent, world, slot);
    } else if (type === EVENT_TYPE.PACK_CALLED) {
        precise = tick - intent.lastPrey[slot] <= INTENT_WINDOW;
        run.huntCalls += 1;
        run.huntCallsPrecise += precise ? 1 : 0;
        pushHuntCall(intent.calls, tick, world.lineageId[slot]);
    } else {
        precise = threat || world.bittenTimer[slot] < TIMER_CAP;
        run.smokes += 1;
        run.smokesPrecise += precise ? 1 : 0;
    }
    noteSignal(intent, slot, precise);
}

/**
 * Classifies a tick's call, smoke and eaten-death events and advances the hunt-call queue. Call it after
 * `updateIntent` and before `applyEvents`, so a dead agent's slot still holds its state.
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function noteIntentEvents(observer, world) {
    const { intent } = observer;
    const d = world.events.data;
    const end = world.events.count * EVENT_STRIDE;
    sampleHearers(intent, world);
    for (let o = 0; o < end; o += EVENT_STRIDE) {
        const type = d[o];
        if (type === EVENT_TYPE.AGENT_DIED && d[o + 4] === DEATH_CAUSE.EATEN) {
            noteIntentDeath(observer, world, o);
        } else if (
            type === EVENT_TYPE.ALARM_CALLED ||
            type === EVENT_TYPE.PACK_CALLED ||
            type === EVENT_TYPE.SMOKE_RELEASED
        ) {
            noteCall(intent, world, type, d[o + 2]);
        }
    }
    resolveHuntCalls(intent.calls, world.tick, intent.packWindow);
}
