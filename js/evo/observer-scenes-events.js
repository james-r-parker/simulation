// The scenes' event pass: a tick's deaths, then its births and the records the scenes read, and the slot reset a death
// or a birth makes (split from `observer-scenes.js`, which creates the scenes and feeds them the samples).

import { noteHerdDeath, resetHerdSlot } from './scene-herd.js';
import { BORN_CAUSE, EVENT, EVENT_STRIDE, EVENT_TICK, EVENT_TYPE, DEATH_CAUSE } from '../sim/events.js';
import { noteApproachKill, resetApproachSlot } from './scene-approach.js';
import { noteBasinBirth } from './scene-basin.js';
import { noteCapacityDeath } from './scene-capacity.js';
import { noteEdgeBirth, noteEdgeDeath } from './scene-edge.js';
import { noteCompetenceBirth, noteCompetenceRecord } from './scene-competence.js';
import { notePackKill } from './scene-pack-lift.js';
import { resetKinematicsSlot } from './scene-kinematics.js';
import { noteGuildAlarm, noteGuildBirth, noteGuildDeath } from './scene-guilds.js';
import { noteBiteLifeRecord } from './scene-bite-life.js';
import { noteRecruitBirth, noteRecruitRecord } from './scene-recruit.js';
import { noteHunterBirth, noteHunterRecord } from './scene-hunters.js';
import { flushCondition, resetConditionSlot } from './scene-condition.js';
import { resetPatchSlot } from './scene-patch.js';
import { noteSpendBirth, resetSpendSlot } from './scene-spend.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { noteHeritageBirth, noteHeritageDeath, resetHeritageSlot } from './scene-heritage.js';
import { resetMateSlot } from './scene-mate.js';
import { noteProofDeath, noteProofKill } from './scene-proof.js';
import { noteStyleAtDeath, noteStyleDeath, resetStyleSlot } from './style.js';
import { noteStillnessDeath, resetStillnessSlot } from './scene-stillness.js';

const DIED = EVENT.AGENT_DIED;
const ALARM = EVENT.ALARM_CALLED;
const BORN = EVENT.AGENT_BORN;

/**
 * Clears the per-slot state of a slot whose agent died or was replaced.
 * @param {Record<string, any>} scenes the scenes
 * @param {number} slot the slot
 * @returns {void}
 */
export function resetSceneSlot(scenes, slot) {
    if (scenes.lean === true) {
        resetStyleSlot(scenes.style, slot);
        return;
    }
    resetPatchSlot(scenes.patch, slot);
    resetApproachSlot(scenes.approach, slot);
    resetStillnessSlot(scenes.stillness, slot);
    resetKinematicsSlot(scenes.kinematics, slot);
    resetStyleSlot(scenes.style, slot);
    resetConditionSlot(scenes.condition, slot);
    resetSpendSlot(scenes.spend, slot);
    resetHeritageSlot(scenes.heritage, slot);
    resetMateSlot(scenes.mate, slot);
    resetHerdSlot(scenes.herd, slot);
}

/**
 * Moves a dying agent's per-life counters into the run totals. A slot the observer does not track under this genome (born
 * and died in one tick) has nothing to move.
 * @param {Record<string, any>} scenes the scenes
 * @param {Record<string, any>} observer the observer
 * @param {{slot: number, genomeId: number, tick: number, age: number}} death the dying agent
 * @returns {void}
 */
function noteDeath(scenes, observer, { slot, genomeId, tick, age }) {
    if (observer.genomeId[slot] !== genomeId) {
        return;
    }
    flushCondition(scenes.condition, observer.config, slot);
    if (tick >= BURN_IN_TICKS) {
        noteStyleDeath(observer, slot);
        if (age >= observer.config.maturityTicks) {
            noteHeritageDeath(scenes.heritage, observer, { slot, age });
        }
    }
}

/**
 * The lean observer's death note: only the style scene sees it.
 * @param {Record<string, any>} observer the observer
 * @param {Float64Array} d the event data
 * @param {number} o the record offset of the `AgentDied`
 * @returns {void}
 */
function noteLeanDeath(observer, d, o) {
    const slot = d[o + DIED.SLOT];
    noteStyleAtDeath(observer, o / EVENT_STRIDE, { slot, genomeId: d[o + DIED.GENOME_ID] });
    if (observer.genomeId[slot] === d[o + DIED.GENOME_ID] && d[o + EVENT_TICK] >= BURN_IN_TICKS) {
        noteStyleDeath(observer, slot);
    }
    resetSceneSlot(observer.scenes, slot);
}

/**
 * An eaten agent's notes to the scenes that read who killed it and how.
 * @param {Record<string, any>} scenes the scenes
 * @param {Record<string, any>} observer the observer
 * @param {{world: Record<string, any>, o: number}} record the world and the `AgentDied` record's offset
 * @returns {void}
 */
function noteEatenDeath(scenes, observer, { world, o }) {
    const d = world.events.data;
    noteApproachKill(scenes.approach, observer, world, {
        killerId: d[o + DIED.BY],
        victimId: d[o + DIED.GENOME_ID],
    });
    notePackKill(scenes.packLift, observer, {
        world,
        size: d[o + DIED.SIZE],
        killer: d[o + DIED.BY],
        previous: d[o + DIED.PARTNER],
    });
}

/**
 * A dying agent's notes to every scene.
 * @param {Record<string, any>} scenes the scenes
 * @param {Record<string, any>} observer the observer
 * @param {{world: Record<string, any>, o: number}} record the world and the `AgentDied` record's offset
 * @returns {void}
 */
function noteFullDeath(scenes, observer, { world, o }) {
    const d = world.events.data;
    noteHerdDeath(scenes.herd, {
        tick: d[o + EVENT_TICK],
        slot: d[o + DIED.SLOT],
        genomeId: d[o + DIED.GENOME_ID],
        cause: d[o + DIED.CAUSE],
        herdId: d[o + DIED.BY],
        pinned: d[o + DIED.PARTNER] === 1,
    });
    if (d[o + DIED.CAUSE] === DEATH_CAUSE.EATEN) {
        noteEatenDeath(scenes, observer, { world, o });
    }
    if (observer.genomeId[d[o + DIED.SLOT]] === d[o + DIED.GENOME_ID]) {
        noteStillnessDeath(scenes.stillness, d[o + DIED.SLOT], d[o + EVENT_TICK]);
    }
    noteCapacityDeath(scenes.capacity, { cause: d[o + DIED.CAUSE], foodEnergy: d[o + DIED.FOOD_ENERGY] });
    noteEdgeDeath(scenes.edge, world, {
        cause: d[o + DIED.CAUSE],
        spec: d[o + DIED.SPEC],
        foodEnergy: d[o + DIED.FOOD_ENERGY],
    });
    noteGuildDeath(scenes.guilds, {
        tick: d[o + EVENT_TICK],
        spec: d[o + DIED.SPEC],
        age: d[o + DIED.AGE_TICKS],
        cause: d[o + DIED.CAUSE],
    });
    noteStyleAtDeath(observer, o / EVENT_STRIDE, { slot: d[o + DIED.SLOT], genomeId: d[o + DIED.GENOME_ID] });
    noteDeath(scenes, observer, {
        slot: d[o + DIED.SLOT],
        genomeId: d[o + DIED.GENOME_ID],
        tick: d[o + EVENT_TICK],
        age: d[o + DIED.AGE_TICKS],
    });
    noteProofDeath(scenes.proof, observer, {
        slot: d[o + DIED.SLOT],
        genomeId: d[o + DIED.GENOME_ID],
        tick: d[o + EVENT_TICK],
    });
    noteProofKill(scenes.proof, { cause: d[o + DIED.CAUSE], lineageId: d[o + DIED.LINEAGE_ID] });
    resetSceneSlot(scenes, d[o + DIED.SLOT]);
}

/**
 * One event record's notes to every scene, after the tick's deaths: the records the scenes read and the births.
 * @param {Record<string, any>} scenes the scenes
 * @param {Record<string, any>} world the world
 * @param {number} o the record offset
 * @returns {void}
 */
function noteFullRecord(scenes, world, o) {
    const d = world.events.data;
    noteHunterRecord(scenes.hunters, d, o);
    noteBiteLifeRecord(scenes.biteLife, d, o, world);
    noteCompetenceRecord(scenes.competence, d, o);
    noteRecruitRecord(scenes.recruit, d, o);
    if (d[o] === EVENT_TYPE.ALARM_CALLED) {
        noteGuildAlarm(scenes.guilds, world, d[o + ALARM.SLOT]);
    }
    if (d[o] !== EVENT_TYPE.AGENT_BORN) {
        return;
    }
    noteGuildBirth(scenes.guilds, { tick: d[o + EVENT_TICK], spec: d[o + BORN.SPEC], cause: d[o + BORN.CAUSE] });
    noteHunterBirth(scenes.hunters, world, d[o + BORN.SLOT]);
    noteRecruitBirth(scenes.recruit, world, d, o);
    noteEdgeBirth(scenes.edge, world, { cause: d[o + BORN.CAUSE], spec: d[o + BORN.SPEC] });
    noteCompetenceBirth(scenes.competence, world, d[o + BORN.SLOT]);
    resetSceneSlot(scenes, d[o + BORN.SLOT]);
    noteBasinBirth(scenes.basin, world, { slot: d[o + BORN.SLOT], cause: d[o + BORN.CAUSE] });
    if (d[o + BORN.CAUSE] === BORN_CAUSE.MATE) {
        noteSpendBirth(scenes.spend, world, { child: d[o + BORN.SLOT], motherId: d[o + BORN.PARENT_A] });
    }
    if (d[o + BORN.CAUSE] === BORN_CAUSE.MATE || d[o + BORN.CAUSE] === BORN_CAUSE.SPLIT) {
        noteHeritageBirth(scenes.heritage, world, d[o + BORN.SLOT]);
    }
}

/**
 * Applies a tick's deaths, then its births, as `applyEvents` orders them. A lean observer's scenes (`scenes.lean`)
 * note only the style scene.
 * @param {Record<string, any>} scenes the scenes
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function noteEvents(scenes, observer, world) {
    const d = world.events.data;
    const end = world.events.count * EVENT_STRIDE;
    const lean = scenes.lean === true;
    for (let o = 0; o < end; o += EVENT_STRIDE) {
        if (d[o] !== EVENT_TYPE.AGENT_DIED) {
            continue;
        }
        if (lean) {
            noteLeanDeath(observer, d, o);
        } else {
            noteFullDeath(scenes, observer, { world, o });
        }
    }
    for (let o = 0; o < end; o += EVENT_STRIDE) {
        if (!lean) {
            noteFullRecord(scenes, world, o);
        } else if (d[o] === EVENT_TYPE.AGENT_BORN) {
            resetSceneSlot(scenes, d[o + BORN.SLOT]);
        }
    }
}
