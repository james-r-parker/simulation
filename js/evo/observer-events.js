// The observer's event handling: a tick's AgentDied and AgentBorn records, PopulationFloor and the slot reset.

import { BORN_CAUSE, EVENT_STRIDE, EVENT_TYPE } from '../sim/events.js';
import { clearCells } from './cell-grid.js';
import { ensureRoom } from './growable-log.js';

/** The end of burn-in: floor episodes and the after-burn-in metrics count from this tick. */
export const BURN_IN_TICKS = 10000;

/**
 * Zeroes every per-slot counter and the cell bitset of a slot.
 * @param {Record<string, any>} observer the observer
 * @param {number} slot the slot
 * @returns {void}
 */
export function resetSlot(observer, slot) {
    for (const name of observer.slotArrays) {
        observer[name][slot] = 0;
    }
    clearCells(observer, slot);
}

/**
 * Credits kills (`by`) and children (`parentA`, `parentB`; a split names one parent twice and also counts in
 * `childrenFromSplit`) to the tracked agents
 * alive at the start of the tick, so a mother that dies the tick she gives birth is still credited.
 * @param {Record<string, any>} observer the observer
 * @param {Float64Array} d the event data
 * @param {number} count the number of records
 * @returns {void}
 */
function creditRelations(observer, d, count) {
    const { slotOf } = observer;
    for (let i = 0; i < count; i++) {
        const o = i * EVENT_STRIDE;
        if (d[o] === EVENT_TYPE.AGENT_DIED) {
            const killer = slotOf.get(d[o + 5]);
            if (killer !== undefined) {
                observer.kills[killer] += 1;
            }
        } else if (d[o] === EVENT_TYPE.AGENT_BORN) {
            const a = slotOf.get(d[o + 6]);
            const b = slotOf.get(d[o + 7]);
            if (a !== undefined) {
                observer.children[a] += 1;
                observer.childrenFromSplit[a] += d[o + 8] === BORN_CAUSE.SPLIT ? 1 : 0;
            }
            if (b !== undefined && b !== a) {
                observer.children[b] += 1;
            }
        }
    }
}

/**
 * Appends a death-log row from the slot's counters.
 * @param {Record<string, any>} observer the observer
 * @param {number} slot the slot
 * @param {number} fitness the agent's fitness, or NaN
 * @returns {void}
 */
function logDeath(observer, slot, fitness) {
    const log = observer.deaths;
    const row = observer.deathCount;
    ensureRoom(log, row);
    for (const name of observer.deathFields) {
        log[name][row] = observer[name][slot];
    }
    log.fitness[row] = fitness;
    observer.deathCount = row + 1;
}

/**
 * Finishes one dead agent: final values from the record, fitness, death log, totals, untracking.
 * @param {Record<string, any>} observer the observer
 * @param {Float64Array} d the event data
 * @param {number} o the record offset
 * @param {((observer: any, slot: number, config: any) => number) | undefined} fitness the policy's fitness
 * @returns {void}
 */
function finishDeath(observer, d, o, fitness) {
    const slot = d[o + 2];
    const genomeId = d[o + 3];
    if (observer.genomeId[slot] !== genomeId) {
        // Born and died within one tick: the slot holds an older agent, so rebuild it from the record.
        resetSlot(observer, slot);
        observer.genomeId[slot] = genomeId;
        observer.lineageId[slot] = d[o + 7];
        observer.spec[slot] = d[o + 6];
        observer.ghosts.add(genomeId);
    }
    observer.ageTicks[slot] = d[o + 8];
    observer.foodEnergy[slot] = d[o + 9];
    observer.biteEnergy[slot] = d[o + 10];
    logDeath(observer, slot, fitness ? fitness(observer, slot, observer.config) : NaN);
    observer.deathsByCause[d[o + 4]] += 1;
    observer.foodEnergyDead += d[o + 9];
    if (observer.slotOf.get(genomeId) === slot) {
        observer.slotOf.delete(genomeId);
    }
}

/**
 * Starts tracking a newborn in its slot with zeroed counters.
 * @param {Record<string, any>} observer the observer
 * @param {Float64Array} d the event data
 * @param {number} o the record offset
 * @returns {void}
 */
function startBirth(observer, d, o) {
    const slot = d[o + 2];
    observer.births[d[o + 8]] += 1;
    if (d[o + 1] >= BURN_IN_TICKS) {
        observer.birthsAfterBurnIn[d[o + 8]] += 1;
    }
    if (observer.ghosts.has(d[o + 3])) {
        return;
    }
    resetSlot(observer, slot);
    observer.genomeId[slot] = d[o + 3];
    observer.lineageId[slot] = d[o + 4];
    observer.spec[slot] = d[o + 5];
    observer.birthTick[slot] = d[o + 1];
    observer.slotOf.set(d[o + 3], slot);
}

/**
 * Counts a floor episode when this tick starts a new run of consecutive floor ticks, from `BURN_IN_TICKS`.
 * @param {Record<string, any>} observer the observer
 * @param {number} tick the event's tick
 * @returns {void}
 */
function noteFloor(observer, tick) {
    if (tick < BURN_IN_TICKS) {
        return;
    }
    if (tick - observer.lastFloorTick > 1) {
        observer.floorEpisodes += 1;
    }
    observer.lastFloorTick = tick;
}

/**
 * Applies a tick's event records: credits (kills, children), then deaths, then births, then floor records.
 * Deaths run before births so a slot freed and refilled in one tick keeps the newborn's counters.
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @param {((observer: any, slot: number, config: any) => number) | undefined} fitness the policy's fitness
 * @returns {void}
 */
export function applyEvents(observer, world, fitness) {
    const d = world.events.data;
    const count = world.events.count;
    observer.ghosts.clear();
    creditRelations(observer, d, count);
    for (let i = 0; i < count; i++) {
        if (d[i * EVENT_STRIDE] === EVENT_TYPE.AGENT_DIED) {
            finishDeath(observer, d, i * EVENT_STRIDE, fitness);
        }
    }
    for (let i = 0; i < count; i++) {
        if (d[i * EVENT_STRIDE] === EVENT_TYPE.AGENT_BORN) {
            startBirth(observer, d, i * EVENT_STRIDE);
        }
    }
    for (let i = 0; i < count; i++) {
        if (d[i * EVENT_STRIDE] === EVENT_TYPE.POPULATION_FLOOR) {
            noteFloor(observer, d[i * EVENT_STRIDE + 1]);
        }
    }
}
