// Per-slot intent state: what each agent saw on its rays, whether it closed on it, how it responded to a threat, and
// whether its meals and bites were deliberate. `updateIntent` runs once per tick after `observeCombat`, reads the
// state `step` leaves behind and draws no randomness. See docs/designs/world-balance.md (Intent state).

import { OUTPUT_COUNT, OUTPUT_INDEX } from '../sim/brain-layout.js';
import { detCos, detSin } from '../sim/det-math.js';
import { answerHuntCall } from './observer-intent-calls.js';
import { BITTEN_THIS_TICK, trackIntentEpisode } from './observer-intent-episode.js';
import { sampleGroups } from './observer-intent-group.js';
import { collectHunters, resolveThreat } from './observer-intent-threat.js';
import {
    CLOSING_BITS,
    CLOSING_MIN,
    CLOSING_SPEED,
    GROUP_SAMPLE_TICKS,
    INTENT_WINDOW,
    SIGNAL_LEVEL,
} from './observer-intent-state.js';
import { SCAN, SCAN_SIZE, summariseRays } from './ray-summary.js';
import { turnTowards } from './scripted-parts.js';
import { TURN_THRESHOLD } from './observer-tick.js';

export {
    CALM_MIN_TICKS,
    CLOSING_BITS,
    CLOSING_MIN,
    CLOSING_SPEED,
    GROUP_SAMPLE_TICKS,
    INTENT_WINDOW,
    RESPONSE_LIFT,
    RESPONSE_WINDOW,
    SIGNAL_LEVEL,
    THREAT_PROXIMITY,
    arcRays,
    createIntentState,
    resetIntentSlot,
} from './observer-intent-state.js';
export { noteEscape } from './observer-intent-episode.js';

/** The scan row length, re-exported for tests that build their own row. */
export { SCAN_SIZE };

const CLOSING_MASK = (1 << CLOSING_BITS) - 1;

/**
 * @param {number} v a 16-bit value
 * @returns {number} the number of set bits
 */
function popcount16(v) {
    const pairs = v - ((v >> 1) & 0x5555);
    const nibbles = (pairs & 0x3333) + ((pairs >> 2) & 0x3333);
    const bytes = (nibbles + (nibbles >> 4)) & 0x0f0f;
    return (bytes + (bytes >> 8)) & 0x1f;
}

/**
 * @param {Record<string, any>} intent the intent state
 * @param {Record<string, any>} kind a `FOOD` or `PREY` descriptor
 * @param {number} slot the slot
 * @param {number} tick the observed tick
 * @returns {boolean} whether the sighting is current, enough of the history shows the agent closing on the target,
 *   and the agent either turned towards it within the window or never saw it off the ray dead ahead
 */
function isDeliberate(intent, kind, slot, tick) {
    const bits = intent[kind.bits][slot] & CLOSING_MASK;
    if (tick - intent[kind.seen][slot] > INTENT_WINDOW || popcount16(bits) < CLOSING_MIN) {
        return false;
    }
    const turned = tick - intent[kind.turn][slot] <= INTENT_WINDOW;
    return turned || intent[kind.off][slot] < intent[kind.start][slot];
}

/** What `trackTarget` needs to know about each kind of target: its state arrays and scan offsets. */
const FOOD = Object.freeze({
    bits: 'foodBits',
    seen: 'lastFood',
    turn: 'foodTurn',
    off: 'foodOff',
    start: 'foodStart',
    prox: SCAN.FOOD,
    ray: SCAN.FOOD_RAY,
    clears: true,
});
const PREY = Object.freeze({
    bits: 'preyBits',
    seen: 'lastPrey',
    turn: 'preyTurn',
    off: 'preyOff',
    start: 'preyStart',
    prox: SCAN.PREY,
    ray: SCAN.PREY_RAY,
    clears: false,
});

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive agent
 * @param {number} k a ray index
 * @returns {number} the agent's velocity component along ray `k`'s direction
 */
function speedAlong(world, slot, k) {
    const cosH = detCos(world.angle[slot]);
    const sinH = detSin(world.angle[slot]);
    const dx = cosH * world.rayCos[k] - sinH * world.raySin[k];
    const dy = sinH * world.rayCos[k] + cosH * world.raySin[k];
    return world.vx[slot] * dx + world.vy[slot] * dy;
}

/**
 * Updates one target kind for an agent: the sighting, the closing history (a tick closes when the agent's speed
 * towards the nearest target ray is above `CLOSING_SPEED x maxVelocity`), turns towards the target and off-axis ticks.
 * Turning away from food clears its closing history.
 * @param {Record<string, any>} intent the intent state
 * @param {Record<string, any>} world the world after the step
 * @param {number} slot an alive slot
 * @param {Record<string, any>} kind `FOOD` or `PREY`
 * @returns {void}
 */
function trackTarget(intent, world, slot, kind) {
    const { tick } = world;
    const bits = intent[kind.bits];
    if (intent.scan[kind.prox] < 0) {
        bits[slot] = (bits[slot] << 1) & 0xffff;
        return;
    }
    const k = intent.scan[kind.ray];
    if (tick - intent[kind.seen][slot] > INTENT_WINDOW) {
        intent[kind.start][slot] = tick;
    }
    intent[kind.seen][slot] = tick;
    intent[kind.off][slot] = k === 0 ? intent[kind.off][slot] : tick;
    const towards = world.turnRate[slot] * turnTowards(k, world.config.rayCount);
    const limit = TURN_THRESHOLD * world.config.maxTurn;
    intent[kind.turn][slot] = towards > limit ? tick : intent[kind.turn][slot];
    const closes = speedAlong(world, slot, k) > CLOSING_SPEED * world.config.maxVelocity;
    bits[slot] = ((bits[slot] << 1) | (closes ? 1 : 0)) & 0xffff;
    if (kind.clears && towards < -limit) {
        bits[slot] = 0;
    }
}

/**
 * Whether the agent responds to the threat this tick: turns away from it, sprints, releases smoke or bites with it on
 * an arc ray (an alarm call is not one; it is judged by `alarm_precision`). Sitting inside smoke counts without a
 * threat. While the threat is out of sight, the side and arc flag of its last sighting stand in.
 * @param {Record<string, any>} intent the intent state
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive agent
 * @returns {boolean}
 */
function responds(intent, world, slot) {
    if (intent.scan[SCAN.SMOKE] === 1) {
        return true;
    }
    if (world.tick - intent.lastThreat[slot] > INTENT_WINDOW) {
        return false;
    }
    const row = slot * OUTPUT_COUNT;
    const out = world.outputs;
    const away = world.turnRate[slot] * intent.threatSide[slot] < -TURN_THRESHOLD * world.config.maxTurn;
    return (
        away ||
        out[row + OUTPUT_INDEX.SPRINT] > SIGNAL_LEVEL ||
        out[row + OUTPUT_INDEX.SMOKE] > SIGNAL_LEVEL ||
        (out[row + OUTPUT_INDEX.BITE] > SIGNAL_LEVEL && intent.threatArc[slot] === 1)
    );
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive agent
 * @returns {boolean} whether the agent turns, sprints, releases smoke or bites at all, threat or not
 */
function active(world, slot) {
    const row = slot * OUTPUT_COUNT;
    const out = world.outputs;
    return (
        Math.abs(world.turnRate[slot]) > TURN_THRESHOLD * world.config.maxTurn ||
        out[row + OUTPUT_INDEX.SPRINT] > SIGNAL_LEVEL ||
        out[row + OUTPUT_INDEX.SMOKE] > SIGNAL_LEVEL ||
        out[row + OUTPUT_INDEX.BITE] > SIGNAL_LEVEL
    );
}

/**
 * Updates the threat sighting, the last response and the two response-rate counters of an agent: ticks and responses
 * while a threat sighting is current (reset when a new sighting run starts), and ticks and any action while none is.
 * @param {Record<string, any>} intent the intent state
 * @param {Record<string, any>} world the world after the step
 * @param {number} slot an alive slot
 * @returns {void}
 */
function trackThreat(intent, world, slot) {
    const { tick } = world;
    const scan = intent.scan;
    if (scan[SCAN.THREAT] >= 0) {
        if (tick - intent.lastThreat[slot] > INTENT_WINDOW) {
            intent.thrTicks[slot] = 0;
            intent.thrResp[slot] = 0;
        }
        intent.lastThreat[slot] = tick;
        intent.threatSide[slot] = turnTowards(scan[SCAN.THREAT_RAY], world.config.rayCount);
        intent.threatArc[slot] = scan[SCAN.THREAT_ARC];
    }
    intent.threatProx[slot] = Math.max(scan[SCAN.THREAT], 0);
    const response = responds(intent, world, slot);
    if (response) {
        intent.lastResponse[slot] = tick;
    }
    if (tick - intent.lastThreat[slot] <= INTENT_WINDOW) {
        intent.thrTicks[slot] += 1;
        intent.thrResp[slot] += response ? 1 : 0;
    } else {
        intent.calmTicks[slot] += 1;
        intent.calmResp[slot] += response || active(world, slot) ? 1 : 0;
    }
}

/**
 * Counts an alive tick for the slot, and whether a threat sighting and prey ahead are current: the base rates
 * that `alarm_precision` and `hunt_call_precision` are lifts over.
 * @param {Record<string, any>} intent the intent state
 * @param {number} tick the observed tick
 * @param {number} slot an alive slot whose sightings are updated
 * @returns {void}
 */
function countCueTicks(intent, tick, slot) {
    intent.aliveTicks[slot] += 1;
    intent.threatCueTicks[slot] += tick - intent.lastThreat[slot] <= INTENT_WINDOW ? 1 : 0;
    intent.preyCueTicks[slot] += tick - intent.lastPrey[slot] <= INTENT_WINDOW ? 1 : 0;
}

/**
 * Pass 1 for one alive agent: its sightings, closing histories, threat, responses and episode latch.
 * @param {Record<string, any>} intent the intent state
 * @param {Record<string, any>} world the world after the step
 * @param {number} slot an alive slot
 * @returns {void}
 */
function senseSlot(intent, world, slot) {
    summariseRays(world, slot, intent.scan, intent.arc);
    resolveThreat(intent, world, slot);
    trackTarget(intent, world, slot, FOOD);
    trackTarget(intent, world, slot, PREY);
    trackThreat(intent, world, slot);
    countCueTicks(intent, world.tick, slot);
    if (intent.hunterSpec[world.spec[slot]] === 0) {
        trackIntentEpisode(intent, world, slot);
    }
}

/**
 * @param {Record<string, any>} intent the intent state
 * @param {number} slot a slot whose pass 1 has run this tick
 * @param {number} tick the observed tick
 * @returns {boolean} whether a bite by the slot this tick is deliberate
 */
export function biteDeliberate(intent, slot, tick) {
    return isDeliberate(intent, PREY, slot, tick);
}

/**
 * @param {Record<string, any>} world the world
 * @param {Map<number, number>} slotOf the observer's genome id to slot map
 * @param {number} genomeId a genome id
 * @returns {number} the alive slot holding that genome, or -1 (an agent born this tick is not in the map yet)
 */
export function findAlive(world, slotOf, genomeId) {
    const slot = slotOf.get(genomeId);
    return slot !== undefined && world.alive[slot] === 1 && world.genomeId[slot] === genomeId ? slot : -1;
}

/**
 * Records a bite on a victim: the previous record moves to `prevBiteDeliberate` when the biter changes.
 * @param {Record<string, any>} intent the intent state
 * @param {number} victim the victim's slot
 * @param {number} biterId the biter's genome id
 * @param {boolean} deliberate whether the bite was deliberate
 * @returns {void}
 */
export function recordBite(intent, victim, biterId, deliberate) {
    if (intent.biterId[victim] !== biterId) {
        intent.prevBiteDeliberate[victim] = intent.lastBiteDeliberate[victim];
        intent.biterId[victim] = biterId;
    }
    intent.lastBiteDeliberate[victim] = deliberate ? 1 : 0;
}

/**
 * Credits the food energy gained this tick.
 * @param {Record<string, any>} intent the intent state
 * @param {Record<string, any>} world the world after the step
 * @param {number} slot an alive slot
 * @returns {void}
 */
function creditMeal(intent, world, slot) {
    const gained = world.foodEnergy[slot] - intent.foodMark[slot];
    intent.foodMark[slot] = world.foodEnergy[slot];
    if (gained <= 0) {
        return;
    }
    if (isDeliberate(intent, FOOD, slot, world.tick)) {
        intent.deliberateFood[slot] += gained;
        intent.run.foodDeliberate += gained;
    } else {
        intent.chanceFood[slot] += gained;
        intent.run.foodChance += gained;
    }
}

/**
 * Credits the bite energy gained this tick, and lets a deliberate bite by a hunter answer the hunt call it heard.
 * @param {Record<string, any>} intent the intent state
 * @param {Record<string, any>} world the world after the step
 * @param {number} slot an alive slot
 * @returns {void}
 */
function creditBiteEnergy(intent, world, slot) {
    const gained = world.biteEnergy[slot] - intent.biteMark[slot];
    intent.biteMark[slot] = world.biteEnergy[slot];
    if (gained <= 0) {
        return;
    }
    const hunter = intent.hunterSpec[world.spec[slot]] === 1;
    const deliberate = biteDeliberate(intent, slot, world.tick);
    intent[deliberate ? 'deliberateBite' : 'chanceBite'][slot] += gained;
    if (hunter) {
        intent.run[deliberate ? 'huntBiteDeliberate' : 'huntBiteChance'] += gained;
    }
    if (hunter && deliberate && intent.heardCall[slot] > 0) {
        answerHuntCall(intent.calls, intent.heardCall[slot] - 1, world.tick, intent.packWindow);
    }
}

/**
 * Pass 2 for one alive agent: meals, bites it landed and the bite record when it was bitten.
 * @param {Record<string, any>} intent the intent state
 * @param {Record<string, any>} world the world after the step
 * @param {number} slot an alive slot
 * @param {Map<number, number>} slotOf the observer's genome id to slot map, to find the biter
 * @returns {void}
 */
function creditSlot(intent, world, slot, slotOf) {
    creditMeal(intent, world, slot);
    creditBiteEnergy(intent, world, slot);
    if (world.bittenTimer[slot] === BITTEN_THIS_TICK) {
        const biterId = world.lastBiter[slot];
        const biter = findAlive(world, slotOf, biterId);
        recordBite(intent, slot, biterId, biter >= 0 && biteDeliberate(intent, biter, world.tick));
    }
}

/**
 * Updates the intent state of every alive agent from the world after a step: first every agent's sightings and
 * responses, then the meals and bites (a victim's record needs its biter's sightings). Skips tick 0.
 * @param {Record<string, any>} intent the intent state
 * @param {Record<string, any>} world the world
 * @param {Map<number, number>} slotOf the observer's genome id to slot map, to find a bite's biter
 * @returns {void}
 */
export function updateIntent(intent, world, slotOf) {
    if (world.tick === 0) {
        return;
    }
    const { alive } = world;
    collectHunters(intent, world);
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1) {
            senseSlot(intent, world, slot);
        }
    }
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1) {
            creditSlot(intent, world, slot, slotOf);
        }
    }
    if (world.tick % GROUP_SAMPLE_TICKS === 0) {
        sampleGroups(intent, world);
    }
}
