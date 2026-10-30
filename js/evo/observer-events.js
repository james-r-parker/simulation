// The observer's event handling: a tick's AgentDied and AgentBorn records, PopulationFloor and the slot reset.

import { BORN_CAUSE, EVENT_STRIDE, EVENT_TYPE } from '../sim/events.js';
import { clearCells } from './cell-grid.js';
import { noteDeath } from './metrics-environment.js';
import { noteMateBirth, noteMeritDeath } from './metrics-merit.js';
import { noteMateParents, noteSplitBirth } from './metrics-diet.js';
import { isEligibleChild, noteChild, noteChildDeath, noteLineages } from './metrics-lineage.js';
import { ensureRoom } from './growable-log.js';
import { noteBirthBody, noteBody } from './observer-body.js';
import { deliberateIntake, chanceIntake } from './fitness-v6-skill.js';
import { roleSkillOf } from './descriptors.js';
import { noteBirthLineage, readDescendants, recordParents, releaseDeaths } from './observer-lineage-counters.js';
import { resetIntentSlot } from './observer-intent.js';
import { noteVisitDeath, resetVisits } from './watch-visits.js';
import { noteHunterBirth } from './watch-births.js';
import { noteBrainDeath, resetBrainSlot } from './metrics-brain.js';
import { BURN_IN_TICKS } from './burn-in.js';

export { BURN_IN_TICKS };

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
    resetIntentSlot(observer.intent, slot);
    resetVisits(observer.watch, slot);
    resetBrainSlot(observer, slot);
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
 * @param {{slot: number, eventIndex: number}} death the slot and the index of its `AgentDied` event
 * @param {number} fitness the agent's fitness, or NaN
 * @returns {void}
 */
function logDeath(observer, { slot, eventIndex }, fitness) {
    const log = observer.deaths;
    const row = observer.deathCount;
    ensureRoom(log, row);
    for (const name of observer.deathFields) {
        log[name][row] = observer[name][slot];
    }
    log.fitness[row] = fitness;
    log.roleSkill[row] = roleSkillOf(deliberateIntake(observer.intent, slot), chanceIntake(observer.intent, slot));
    log.style[row] = observer.scenes.style.atDeath[eventIndex];
    observer.deathCount = row + 1;
}

/**
 * Finishes one dead agent: final values from the record, fitness, death log, totals, untracking.
 * @param {Record<string, any>} observer the observer
 * @param {{world: Record<string, any>, d: Float64Array, o: number}} record the world, the event data and the record
 *   offset
 * @param {((observer: any, slot: number, config: any) => number) | undefined} fitness the policy's fitness
 * @returns {void}
 */
function finishDeath(observer, record, fitness) {
    const { world, d, o } = record;
    const slot = d[o + 2];
    const genomeId = d[o + 3];
    if (observer.genomeId[slot] !== genomeId) {
        // Born and died within one tick: the slot holds an older agent, so rebuild it from the record.
        resetSlot(observer, slot);
        observer.genomeId[slot] = genomeId;
        observer.lineageId[slot] = d[o + 7];
        observer.spec[slot] = d[o + 6];
        observer.ghosts.add(genomeId);
        noteBody(observer, slot, 1, 1);
    }
    observer.ageTicks[slot] = d[o + 8];
    readDescendants(observer, slot, genomeId);
    if (observer.eligibleChild[slot] === 1) {
        noteChildDeath(observer.lineage, d[o + 8]);
    }
    observer.foodEnergy[slot] = d[o + 9];
    observer.biteEnergy[slot] = d[o + 10];
    logDeath(
        observer,
        { slot, eventIndex: o / EVENT_STRIDE },
        fitness ? fitness(observer, slot, observer.config) : NaN,
    );
    observer.deathsByCause[d[o + 4]] += 1;
    if (d[o + 1] >= BURN_IN_TICKS) {
        noteDeath(observer.environment, d[o + 4]);
        noteVisitDeath(observer.watch, slot, d[o + 8]);
        noteBrainDeath(observer, world, { slot, genomeId, ageTicks: d[o + 8] });
        if (d[o + 8] >= observer.config.maturityTicks && !observer.ghosts.has(genomeId)) {
            const logged = observer.deaths.fitness[observer.deathCount - 1];
            noteMeritDeath(observer.merit, { slot, tick: d[o + 1], fitness: logged });
        }
    }
    observer.foodEnergyDead += d[o + 9];
    if (observer.slotOf.get(genomeId) === slot) {
        observer.slotOf.delete(genomeId);
    }
}

/**
 * Sets a newborn's generation depth and archive-lineage flag. A child of a mating or split is one generation deeper
 * than its deeper parent and inherits the flag of either (both read by `noteParentage` before the tick's deaths, so a
 * parent that dies on the tick of the birth still counts); any other entrant is generation 0, and in the archive
 * lineage when the policy's `observer.archiveDraw(slot)` says its genome came from the archive.
 * @param {Record<string, any>} observer the observer
 * @param {Float64Array} d the event data
 * @param {number} o the record offset of the `AgentBorn`
 * @returns {void}
 */
function setLineage(observer, d, o) {
    const slot = d[o + 2];
    const packed = observer.parentage.get(d[o + 3]);
    if (packed === undefined) {
        observer.archiveLineage[slot] = observer.archiveDraw?.(slot) ? 1 : 0;
        return;
    }
    observer.generation[slot] = Math.floor(packed / 2);
    observer.archiveLineage[slot] = packed % 2;
}

/**
 * Reads, before the tick's deaths untrack anyone, the generation depth and archive flag each mating or split child
 * gets from its parents, into `observer.parentage` (genome id to `depth * 2 + flag`).
 * @param {Record<string, any>} observer the observer
 * @param {Float64Array} d the event data
 * @param {number} count the number of records
 * @returns {void}
 */
function noteParentage(observer, d, count) {
    const { slotOf, generation, archiveLineage, parentage } = observer;
    parentage.clear();
    for (let i = 0; i < count; i++) {
        const o = i * EVENT_STRIDE;
        if (d[o] !== EVENT_TYPE.AGENT_BORN || (d[o + 8] !== BORN_CAUSE.MATE && d[o + 8] !== BORN_CAUSE.SPLIT)) {
            continue;
        }
        const a = slotOf.get(d[o + 6]);
        const b = slotOf.get(d[o + 7]);
        const depth = 1 + Math.max(a === undefined ? 0 : generation[a], b === undefined ? 0 : generation[b]);
        const flag = Math.max(a === undefined ? 0 : archiveLineage[a], b === undefined ? 0 : archiveLineage[b]);
        parentage.set(d[o + 3], depth * 2 + flag);
    }
}

/**
 * Feeds a birth after burn-in to the mate-gain and parent-diet metrics.
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @param {Float64Array} d the event data
 * @param {number} o the record offset
 * @returns {void}
 */
function noteDietBirth(observer, world, d, o) {
    if (d[o + 8] === BORN_CAUSE.MATE) {
        noteMateBirth(observer.merit, world, d[o + 2], d[o + 7]);
        noteMateParents(observer.diet, world, d[o + 2], d[o + 7]);
    } else if (d[o + 8] === BORN_CAUSE.SPLIT) {
        noteSplitBirth(observer.diet, world, d[o + 2]);
    }
}

/**
 * Starts tracking a newborn in its slot with zeroed counters.
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @param {Float64Array} d the event data
 * @param {number} o the record offset
 * @returns {void}
 */
function startBirth(observer, world, d, o) {
    const slot = d[o + 2];
    observer.births[d[o + 8]] += 1;
    if (d[o + 1] >= BURN_IN_TICKS) {
        observer.birthsAfterBurnIn[d[o + 8]] += 1;
    }
    noteHunterBirth(observer, d, o);
    if (d[o + 1] >= BURN_IN_TICKS) {
        noteDietBirth(observer, world, d, o);
    }
    const child = isEligibleChild(observer.lineage, d, o);
    if (child) {
        noteChild(observer.lineage, observer.ghosts.has(d[o + 3]));
    }
    if (observer.ghosts.has(d[o + 3])) {
        return;
    }
    resetSlot(observer, slot);
    observer.genomeId[slot] = d[o + 3];
    observer.lineageId[slot] = d[o + 4];
    observer.spec[slot] = d[o + 5];
    observer.birthTick[slot] = d[o + 1];
    observer.eligibleChild[slot] = child ? 1 : 0;
    noteBirthBody(observer, world, slot, d[o + 3]);
    setLineage(observer, d, o);
    recordParents(observer, d, o);
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
    noteLineages(observer.lineage, d, count);
    noteParentage(observer, d, count);
    noteBirthLineage(observer, d, count);
    for (let i = 0; i < count; i++) {
        if (d[i * EVENT_STRIDE] === EVENT_TYPE.AGENT_DIED) {
            finishDeath(observer, { world, d, o: i * EVENT_STRIDE }, fitness);
        }
    }
    releaseDeaths(observer, d, count);
    for (let i = 0; i < count; i++) {
        if (d[i * EVENT_STRIDE] === EVENT_TYPE.AGENT_BORN) {
            startBirth(observer, world, d, i * EVENT_STRIDE);
        }
    }
    for (let i = 0; i < count; i++) {
        if (d[i * EVENT_STRIDE] === EVENT_TYPE.POPULATION_FLOOR) {
            noteFloor(observer, d[i * EVENT_STRIDE + 1]);
        }
    }
}
