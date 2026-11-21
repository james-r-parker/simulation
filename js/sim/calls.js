// The signal phase: call timers, alarm and hunt calls, smoke releases, then who hears what.

import { CH_THREAT, OUTPUT_COUNT, OUTPUT_INDEX, RAY_CHANNELS } from './brain-layout.js';
import { EVENT_TYPE, pushEvent, EVENT } from './events.js';
import { LOSS_CAUSE, removeEnergy } from './energy.js';
import { depositPheromone } from './pheromones.js';
import { releaseSmoke } from './smoke.js';
import { cellRange } from './spatial-hash.js';
import { noteHeard } from './effect-hear.js';
import { huddlePass } from './effect-huddle.js';
import { settleCalls } from './effect-social.js';
import { GATE, LANE_ID, gateOpen, liveOf } from './effects.js';
import { specParams } from './spec-params.js';
import { HEARD_STRIDE } from './world.js';
import { SPEC } from './specs.js';

/** @typedef {import('./world.js').World} World */
/** @typedef {import('./spatial-hash.js').SpatialHash} SpatialHash */

/** The `callScratch` slot that counts the alarm and hunt calls fired this tick, so a tick with none settles nothing. */
const CALLS_FIRED = 4;

// The lanes read here, as constants: a property load from `LANE_ID` in a hot loop boxes its number.
const ALARM_COST_LANE = LANE_ID.alarmCost;
const HUNT_CALL_COST_LANE = LANE_ID.huntCallCost;

/** Offsets of the alarm and hunt halves of a `heard` row. */
const ALARM_HEARD = 0;
const HUNT_HEARD = 3;

/**
 * Effective call radius for `caller` (scouts get `scoutCallRadiusMultiplier`).
 * @param {World} world the world
 * @param {number} caller the calling slot
 * @returns {number} radius in world units
 */
function callerRadius(world, caller) {
    const { callRadius, scoutCallRadiusMultiplier } = world.config;
    return world.spec[caller] === SPEC.SCOUT ? callRadius * scoutCallRadiusMultiplier : callRadius;
}

/**
 * Takes 1 from each of the three timers of every alive slot that is above 0.
 * @param {World} world the world
 * @returns {void}
 */
function tickTimers(world) {
    const { alive, alarmTimer, huntTimer, smokeTimer } = world;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1) {
            alarmTimer[slot] -= alarmTimer[slot] > 0 ? 1 : 0;
            huntTimer[slot] -= huntTimer[slot] > 0 ? 1 : 0;
            smokeTimer[slot] -= smokeTimer[slot] > 0 ? 1 : 0;
        }
    }
}

/**
 * Pushes a call event with the caller's id, specialisation and position.
 * @param {World} world the world
 * @param {number} type an `EVENT_TYPE` code
 * @param {number} slot the caller
 * @returns {number} the record offset, so a caller can add fields
 */
function pushCall(world, type, slot) {
    const o = pushEvent(world.events, type, world.tick);
    const d = world.events.data;
    d[o + EVENT.ALARM_CALLED.SLOT] = slot;
    d[o + EVENT.ALARM_CALLED.GENOME_ID] = world.genomeId[slot];
    d[o + EVENT.ALARM_CALLED.SPEC] = world.spec[slot];
    d[o + EVENT.ALARM_CALLED.X] = world.x[slot];
    d[o + EVENT.ALARM_CALLED.Y] = world.y[slot];
    return o;
}

/**
 * @param {World} world the world
 * @param {number} slot the agent
 * @param {number} output an `OUTPUT_INDEX` value
 * @param {number} threshold the output must exceed this
 * @returns {boolean}
 */
function outputAbove(world, slot, output, threshold) {
    return world.outputs[slot * OUTPUT_COUNT + output] > threshold;
}

/**
 * @param {World} world the world
 * @param {number} slot the caller
 * @returns {boolean} whether any of the caller's rays holds a threat (an agent that can bite it) this tick
 */
function threatInView(world, slot) {
    const { inputs, config } = world;
    const origin = slot * world.layout.rawInputCount;
    for (let k = 0; k < config.rayCount; k++) {
        if (inputs[origin + k * RAY_CHANNELS + CH_THREAT] > 0) {
            return true;
        }
    }
    return false;
}

/**
 * Fires an alarm call for a slot that is not a hunter and whose alarm output is above `alarmThreshold`: pays, starts the timer, notes in `alarmSeen` whether a threat was on its rays, deposits danger and pushes the event.
 * @param {World} world the world
 * @param {number} slot an alive slot
 * @returns {void}
 */
function alarm(world, slot) {
    const { callTicks, alarmThreshold, scoutAlarmCostMultiplier } = world.config;
    const wanted = outputAbove(world, slot, OUTPUT_INDEX.ALARM, alarmThreshold) && gateOpen(world, slot, GATE.ALARM);
    if (!wanted || specParams(world.config, world.spec[slot]).canHunt) {
        return;
    }
    const cost =
        liveOf(world, slot, ALARM_COST_LANE) * (world.spec[slot] === SPEC.SCOUT ? scoutAlarmCostMultiplier : 1);
    if (world.energy[slot] <= cost) {
        return;
    }
    removeEnergy(world, slot, cost, LOSS_CAUSE.COST);
    world.alarmTimer[slot] = callTicks;
    world.callScratch[CALLS_FIRED] += 1;
    const threat = threatInView(world, slot);
    world.alarmSeen[slot] = threat ? 1 : 0;
    depositPheromone(world, world.danger, world.x[slot], world.y[slot]);
    pushCall(world, EVENT_TYPE.ALARM_CALLED, slot);
}

/**
 * Fires a hunt call for a hunter whose hunt output is above `huntCallThreshold`: pays, starts the timer, deposits hunt scent and pushes the event.
 * @param {World} world the world
 * @param {number} slot an alive slot
 * @returns {void}
 */
function huntCall(world, slot) {
    const { callTicks, huntCallThreshold } = world.config;
    const wanted = outputAbove(world, slot, OUTPUT_INDEX.HUNT, huntCallThreshold) && gateOpen(world, slot, GATE.HUNT);
    if (!wanted || !specParams(world.config, world.spec[slot]).canHunt) {
        return;
    }
    const cost = liveOf(world, slot, HUNT_CALL_COST_LANE);
    if (world.energy[slot] <= cost) {
        return;
    }
    removeEnergy(world, slot, cost, LOSS_CAUSE.COST);
    world.huntTimer[slot] = callTicks;
    world.callScratch[CALLS_FIRED] += 1;
    depositPheromone(world, world.hunt, world.x[slot], world.y[slot]);
    pushCall(world, EVENT_TYPE.PACK_CALLED, slot);
}

/**
 * Releases smoke for a slot whose smoke output is above `smokeThreshold`: starts the cooldown, then pays and releases
 * a cloud, or pushes `SmokeRefused` and pays nothing when the pool is full.
 * @param {World} world the world
 * @param {number} slot an alive slot
 * @returns {void}
 */
function smoke(world, slot) {
    const { smokeCost, smokeCooldown, smokeThreshold, maxClouds } = world.config;
    const wanted = outputAbove(world, slot, OUTPUT_INDEX.SMOKE, smokeThreshold) && gateOpen(world, slot, GATE.SMOKE);
    if (!wanted || world.energy[slot] <= smokeCost) {
        return;
    }
    world.smokeTimer[slot] = smokeCooldown;
    if (world.cloudCount >= maxClouds) {
        const o = pushEvent(world.events, EVENT_TYPE.SMOKE_REFUSED, world.tick);
        world.events.data[o + EVENT.SMOKE_REFUSED.SLOT] = slot;
        world.events.data[o + EVENT.SMOKE_REFUSED.GENOME_ID] = world.genomeId[slot];
        return;
    }
    removeEnergy(world, slot, smokeCost, LOSS_CAUSE.COST);
    const cloud = releaseSmoke(world, slot);
    world.events.data[pushCall(world, EVENT_TYPE.SMOKE_RELEASED, slot) + EVENT.SMOKE_RELEASED.CLOUD] = cloud;
}

/**
 * Lets each alive slot, in ascending order, fire its alarm, hunt call and smoke.
 * @param {World} world the world
 * @returns {void}
 */
function fireCalls(world) {
    const { alive } = world;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1) {
            alarm(world, slot);
            huntCall(world, slot);
            smoke(world, slot);
        }
    }
}

/**
 * Records the call in `callScratch` against one hearer when it is within the caller's radius times the hearer's
 * `hearing` lane, keeping the loudest call: its loudness is `1 - d / (radius x hearing)` times the call's strength.
 * @param {World} world the world
 * @param {number} hearer the other agent
 * @returns {void}
 */
function hearOne(world, hearer) {
    const scratch = world.callScratch;
    const caller = scratch[0];
    const offset = scratch[1];
    const strength = scratch[2];
    const radius = callerRadius(world, caller) * world.lanes.hearing[hearer];
    const dx = world.x[caller] - world.x[hearer];
    const dy = world.y[caller] - world.y[hearer];
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d >= radius) {
        return;
    }
    const loudness = Math.fround((1 - d / radius) * strength);
    noteHeard(world, hearer, loudness);
    const row = hearer * HEARD_STRIDE + offset;
    if (loudness > world.heard[row]) {
        world.heard[row] = loudness;
        world.heard[row + 1] = d > 0 ? dx / d : 0;
        world.heard[row + 2] = d > 0 ? dy / d : 0;
    }
}

/**
 * @param {World} world the world
 * @param {SpatialHash} hash the hash built this tick
 * @param {number} cell a cell index
 * @returns {void}
 */
function hearInCell(world, hash, cell) {
    const caller = world.callScratch[0];
    for (let e = hash.cellStart[cell]; e < hash.cellStart[cell + 1]; e++) {
        const id = hash.entries[e];
        if (id < hash.maxAgents && id !== caller && world.alive[id] === 1) {
            hearOne(world, id);
        }
    }
}

/**
 * Lets every hashed agent within the caller's radius times its own `hearing` lane hear the caller in `callScratch`;
 * the cells searched reach the radius times the largest `hearing` lane of the pass.
 * @param {World} world the world
 * @param {SpatialHash} hash the hash built this tick
 * @returns {void}
 */
function spread(world, hash) {
    const caller = world.callScratch[0];
    const reach = callerRadius(world, caller) * world.callScratch[3];
    const range = cellRange(hash, world.x[caller], world.y[caller], reach);
    for (let row = range[1]; row <= range[3]; row++) {
        const rowStart = row * hash.cols;
        for (let cell = rowStart + range[0]; cell <= rowStart + range[2]; cell++) {
            hearInCell(world, hash, cell);
        }
    }
}

/**
 * @param {World} world the world
 * @returns {number} the largest `hearing` lane of an alive slot, at least 1
 */
function largestHearing(world) {
    const { alive } = world;
    const { hearing } = world.lanes;
    let most = 1;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1 && hearing[slot] > most) {
            most = hearing[slot];
        }
    }
    return most;
}

/**
 * One hearing pass: every alive slot whose timer is above 0 calls to the agents around it.
 * @param {World} world the world
 * @param {SpatialHash} hash the hash built this tick
 * @param {Uint16Array} timers the alarm or hunt timers
 * @param {number} offset `ALARM_HEARD` or `HUNT_HEARD`
 * @returns {void}
 */
function hearPass(world, hash, timers, offset) {
    const { alive, callScratch } = world;
    const { callTicks } = world.config;
    callScratch[3] = largestHearing(world);
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1 && timers[slot] > 0) {
            callScratch[0] = slot;
            callScratch[1] = offset;
            callScratch[2] = timers[slot] / callTicks;
            spread(world, hash);
        }
    }
}

/**
 * Runs the signal phase: ticks the timers, fires alarm, hunt and smoke actions in slot order, then rebuilds `heard`
 * from the live alarm and hunt calls of the agents in `hash`, then recounts the `huddled` stacks on every eighth tick.
 * @param {World} world the world
 * @param {SpatialHash} hash the hash built this tick
 * @returns {void}
 */
export function signalAll(world, hash) {
    tickTimers(world);
    world.callScratch[CALLS_FIRED] = 0;
    fireCalls(world);
    world.heard.fill(0);
    hearPass(world, hash, world.alarmTimer, ALARM_HEARD);
    hearPass(world, hash, world.huntTimer, HUNT_HEARD);
    if (world.callScratch[CALLS_FIRED] > 0) {
        settleCalls(world);
        world.callHeard.fill(0);
    }
    huddlePass(world, hash);
}
