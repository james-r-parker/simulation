// The signal phase: call timers, alarm and hunt calls, smoke releases, then who hears what.

import { OUTPUT_COUNT, OUTPUT_INDEX } from './brain-layout.js';
import { EVENT_TYPE, pushEvent } from './events.js';
import { LOSS_CAUSE, removeEnergy } from './energy.js';
import { depositPheromone } from './pheromones.js';
import { releaseSmoke } from './smoke.js';
import { cellRange } from './spatial-hash.js';
import { specParams } from './spec-params.js';
import { HEARD_STRIDE } from './world.js';

/** @typedef {import('./world.js').World} World */
/** @typedef {import('./spatial-hash.js').SpatialHash} SpatialHash */

/** Offsets of the alarm and hunt halves of a `heard` row. */
const ALARM_HEARD = 0;
const HUNT_HEARD = 3;

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
    d[o + 2] = slot;
    d[o + 3] = world.genomeId[slot];
    d[o + 4] = world.spec[slot];
    d[o + 5] = world.x[slot];
    d[o + 6] = world.y[slot];
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
 * Fires an alarm call for a slot that is not a hunter: pays, starts the timer, deposits danger and pushes the event.
 * @param {World} world the world
 * @param {number} slot an alive slot
 * @returns {void}
 */
function alarm(world, slot) {
    const { alarmCost, callTicks } = world.config;
    const wanted = outputAbove(world, slot, OUTPUT_INDEX.ALARM, 0) && world.alarmTimer[slot] === 0;
    if (!wanted || world.energy[slot] <= alarmCost || specParams(world.config, world.spec[slot]).canHunt) {
        return;
    }
    removeEnergy(world, slot, alarmCost, LOSS_CAUSE.COST);
    world.alarmTimer[slot] = callTicks;
    depositPheromone(world, world.danger, world.x[slot], world.y[slot]);
    pushCall(world, EVENT_TYPE.ALARM_CALLED, slot);
}

/**
 * Fires a hunt call for a hunter: pays, starts the timer, deposits hunt scent and pushes the event.
 * @param {World} world the world
 * @param {number} slot an alive slot
 * @returns {void}
 */
function huntCall(world, slot) {
    const { huntCallCost, callTicks } = world.config;
    const wanted = outputAbove(world, slot, OUTPUT_INDEX.HUNT, 0) && world.huntTimer[slot] === 0;
    if (!wanted || world.energy[slot] <= huntCallCost || !specParams(world.config, world.spec[slot]).canHunt) {
        return;
    }
    removeEnergy(world, slot, huntCallCost, LOSS_CAUSE.COST);
    world.huntTimer[slot] = callTicks;
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
    const wanted = outputAbove(world, slot, OUTPUT_INDEX.SMOKE, smokeThreshold) && world.smokeTimer[slot] === 0;
    if (!wanted || world.energy[slot] <= smokeCost) {
        return;
    }
    world.smokeTimer[slot] = smokeCooldown;
    if (world.cloudCount >= maxClouds) {
        const o = pushEvent(world.events, EVENT_TYPE.SMOKE_REFUSED, world.tick);
        world.events.data[o + 2] = slot;
        world.events.data[o + 3] = world.genomeId[slot];
        return;
    }
    removeEnergy(world, slot, smokeCost, LOSS_CAUSE.COST);
    const cloud = releaseSmoke(world, slot);
    world.events.data[pushCall(world, EVENT_TYPE.SMOKE_RELEASED, slot) + 7] = cloud;
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
 * Records the call in `callScratch` against one hearer when it is within `callRadius`, keeping the loudest call.
 * @param {World} world the world
 * @param {number} hearer the other agent
 * @returns {void}
 */
function hearOne(world, hearer) {
    const scratch = world.callScratch;
    const caller = scratch[0];
    const offset = scratch[1];
    const strength = scratch[2];
    const radius = world.config.callRadius;
    const dx = world.x[caller] - world.x[hearer];
    const dy = world.y[caller] - world.y[hearer];
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d >= radius) {
        return;
    }
    const loudness = Math.fround((1 - d / radius) * strength);
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
 * Lets every hashed agent within `callRadius` of the caller in `callScratch` hear it.
 * @param {World} world the world
 * @param {SpatialHash} hash the hash built this tick
 * @returns {void}
 */
function spread(world, hash) {
    const caller = world.callScratch[0];
    const range = cellRange(hash, world.x[caller], world.y[caller], world.config.callRadius);
    for (let row = range[1]; row <= range[3]; row++) {
        const rowStart = row * hash.cols;
        for (let cell = rowStart + range[0]; cell <= rowStart + range[2]; cell++) {
            hearInCell(world, hash, cell);
        }
    }
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
 * from the live alarm and hunt calls of the agents in `hash`.
 * @param {World} world the world
 * @param {SpatialHash} hash the hash built this tick
 * @returns {void}
 */
export function signalAll(world, hash) {
    tickTimers(world);
    fireCalls(world);
    world.heard.fill(0);
    hearPass(world, hash, world.alarmTimer, ALARM_HEARD);
    hearPass(world, hash, world.huntTimer, HUNT_HEARD);
}
