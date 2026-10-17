// Per-slot intent state: what each agent saw on its rays, whether it closed on it, how it responded to a threat, and
// whether its meals and bites were deliberate. `updateIntent` runs once per tick after `observeCombat`, reads the
// state `step` leaves behind and draws no randomness. See docs/designs/world-balance.md (Intent state).

import { OUTPUT_COUNT, OUTPUT_INDEX } from '../sim/brain-layout.js';
import { answerHuntCall } from './observer-intent-calls.js';
import { BITTEN_THIS_TICK, trackIntentEpisode } from './observer-intent-episode.js';
import { sampleGroups } from './observer-intent-group.js';
import { SCAN, scanRays } from './observer-intent-rays.js';
import { CLOSING_BITS, CLOSING_MIN, GROUP_SAMPLE_TICKS, INTENT_WINDOW, SIGNAL_LEVEL } from './observer-intent-state.js';
import { TURN_THRESHOLD } from './observer-tick.js';

export {
    CLOSING_BITS,
    CLOSING_MIN,
    GROUP_SAMPLE_TICKS,
    INTENT_WINDOW,
    RESPONSE_WINDOW,
    SIGNAL_LEVEL,
    THREAT_PROXIMITY,
    arcRays,
    createIntentState,
    resetIntentSlot,
} from './observer-intent-state.js';
export { noteEscape } from './observer-intent-episode.js';

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
 * @param {number} seen the tick of the sighting
 * @param {number} bits the closing history
 * @param {number} tick the observed tick
 * @returns {boolean} whether the sighting is current and enough of the history shows the target closing
 */
function closing(seen, bits, tick) {
    return tick - seen <= INTENT_WINDOW && popcount16(bits & CLOSING_MASK) >= CLOSING_MIN;
}

/**
 * @param {number} k a ray index
 * @param {number} rayCount rays per agent
 * @returns {number} +1 for a ray on the positive-turn side, -1 on the negative side, 0 for dead ahead or behind
 */
function sideOf(k, rayCount) {
    if (k <= 0 || 2 * k === rayCount) {
        return 0;
    }
    return 2 * k < rayCount ? 1 : -1;
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive agent
 * @param {number} side a `sideOf` value
 * @returns {boolean} whether the agent turns, beyond `TURN_THRESHOLD x maxTurn`, away from that side
 */
function turnsAway(world, slot, side) {
    const limit = TURN_THRESHOLD * world.config.maxTurn;
    const turn = world.turnRate[slot];
    return (side === 1 && turn < -limit) || (side === -1 && turn > limit);
}

/**
 * Shifts this tick's closing bit into a history and remembers the proximity.
 * @param {Uint16Array} bits the closing histories
 * @param {Float32Array} previous the nearest hit's proximity at the previous tick, 0 for none
 * @param {number} slot the slot
 * @param {number} proximity the nearest hit's proximity now, or -1 for none
 * @returns {void}
 */
function shiftClosing(bits, previous, slot, proximity) {
    const rose = proximity > previous[slot] ? 1 : 0;
    bits[slot] = ((bits[slot] << 1) | rose) & 0xffff;
    previous[slot] = Math.max(proximity, 0);
}

/**
 * Whether the agent responds to the threat on its rays this tick: turns away, sprints, calls an alarm, releases smoke
 * or bites with the threat on an arc ray. Sitting inside smoke counts without a threat.
 * @param {Record<string, any>} intent the intent state
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive agent
 * @returns {boolean}
 */
function responds(intent, world, slot) {
    const scan = intent.scan;
    if (scan[SCAN.SMOKE] === 1) {
        return true;
    }
    if (scan[SCAN.THREAT] < 0) {
        return false;
    }
    const row = slot * OUTPUT_COUNT;
    const out = world.outputs;
    const side = sideOf(scan[SCAN.THREAT_RAY], world.config.rayCount);
    return (
        turnsAway(world, slot, side) ||
        out[row + OUTPUT_INDEX.SPRINT] > SIGNAL_LEVEL ||
        out[row + OUTPUT_INDEX.ALARM] > SIGNAL_LEVEL ||
        out[row + OUTPUT_INDEX.SMOKE] > SIGNAL_LEVEL ||
        (out[row + OUTPUT_INDEX.BITE] > SIGNAL_LEVEL && scan[SCAN.THREAT_ARC] === 1)
    );
}

/**
 * Pass 1 for one alive agent: its sightings, closing histories, last response and episode latch.
 * @param {Record<string, any>} intent the intent state
 * @param {Record<string, any>} world the world after the step
 * @param {number} slot an alive slot
 * @returns {void}
 */
function senseSlot(intent, world, slot) {
    const { tick } = world;
    const scan = intent.scan;
    scanRays(scan, world, slot, intent.arc);
    shiftClosing(intent.foodBits, intent.foodProx, slot, scan[SCAN.FOOD]);
    shiftClosing(intent.preyBits, intent.preyProx, slot, scan[SCAN.PREY]);
    if (scan[SCAN.FOOD] >= 0) {
        intent.lastFood[slot] = tick;
        if (turnsAway(world, slot, sideOf(scan[SCAN.FOOD_RAY], world.config.rayCount))) {
            intent.foodBits[slot] = 0;
        }
    }
    if (scan[SCAN.PREY] >= 0) {
        intent.lastPrey[slot] = tick;
    }
    intent.threatProx[slot] = Math.max(scan[SCAN.THREAT], 0);
    if (scan[SCAN.THREAT] >= 0) {
        intent.lastThreat[slot] = tick;
    }
    if (responds(intent, world, slot)) {
        intent.lastResponse[slot] = tick;
    }
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
    return closing(intent.lastPrey[slot], intent.preyBits[slot], tick);
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} genomeId a genome id
 * @returns {number} the alive slot holding that genome, or -1 (also for id 0)
 */
export function findAlive(world, genomeId) {
    if (genomeId === 0) {
        return -1;
    }
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1 && world.genomeId[slot] === genomeId) {
            return slot;
        }
    }
    return -1;
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
    if (closing(intent.lastFood[slot], intent.foodBits[slot], world.tick)) {
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
 * @returns {void}
 */
function creditSlot(intent, world, slot) {
    creditMeal(intent, world, slot);
    creditBiteEnergy(intent, world, slot);
    if (world.bittenTimer[slot] === BITTEN_THIS_TICK) {
        const biterId = world.lastBiter[slot];
        const biter = findAlive(world, biterId);
        recordBite(intent, slot, biterId, biter >= 0 && biteDeliberate(intent, biter, world.tick));
    }
}

/**
 * Updates the intent state of every alive agent from the world after a step: first every agent's sightings and
 * responses, then the meals and bites (a victim's record needs its biter's sightings). Skips tick 0.
 * @param {Record<string, any>} intent the intent state
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function updateIntent(intent, world) {
    if (world.tick === 0) {
        return;
    }
    const { alive } = world;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1) {
            senseSlot(intent, world, slot);
        }
    }
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1) {
            creditSlot(intent, world, slot);
        }
    }
    if (world.tick % GROUP_SAMPLE_TICKS === 0) {
        sampleGroups(intent, world);
    }
}
