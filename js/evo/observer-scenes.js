// The scene detectors' state and per-tick feed (natural-selection.md, Detectors). `observeScenes` runs inside
// `observe`, after the intent state is current for the tick and before `applyEvents` reassigns slots, so a dying
// agent's slot still holds its counters. It reads the world and the observer and writes only `observer.scenes`; the
// world is untouched, so the golden `worldHash` cannot move. Each scene lives in its own `scene-*.js` module; this one
// creates them, hands them the tick's events and the 10-tick and 100-tick samples, and resets a slot on a birth.

import { BORN_CAUSE, EVENT_STRIDE, EVENT_TYPE, DEATH_CAUSE } from '../sim/events.js';
import { createApproachScene, noteApproachKill, resetApproachSlot, trackApproaches } from './scene-approach.js';
import { BASIN_CHECKPOINT_TICKS, createBasinScene, noteBasinBirth, sampleBasins } from './scene-basin.js';
import { createBalanceScene, sampleBalance } from './scene-balance.js';
import { createFamilyScene, sampleFamilies } from './scene-families.js';
import { createCarcassScene, trackCarcasses } from './scene-carcass.js';
import { createConditionScene, flushCondition, resetConditionSlot, sampleCondition } from './scene-condition.js';
import { createPatchScene, resetPatchSlot, samplePatches } from './scene-patch.js';
import { createSeasonScene, sampleSeason } from './scene-season.js';
import { createSpendScene, noteSpendBirth, resetSpendSlot, sampleSpend } from './scene-spend.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { createHeritageScene, noteHeritageBirth, noteHeritageDeath, resetHeritageSlot } from './scene-heritage.js';
import { createMateScene, resetMateSlot } from './scene-mate.js';
import { createNicheScene } from './scene-niche.js';
import { createProofScene, noteProofDeath, noteProofKill, trackProof } from './scene-proof.js';
import { trackSlots } from './observer-scenes-slots.js';
import { createStyle, noteStyleAtDeath, noteStyleDeath, resetStyleSlot, tickStyle } from './style.js';
import { createTerrainScene, sampleTerrain } from './scene-terrain.js';
import { GROUP_SAMPLE_TICKS } from './observer-intent-state.js';
import { MOTION_SAMPLE_TICKS } from './observer-tick.js';

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} the scenes, each empty
 */
export function createScenes(config) {
    return {
        patch: createPatchScene(config),
        approach: createApproachScene(config),
        terrain: createTerrainScene(config),
        basin: createBasinScene(),
        balance: createBalanceScene(),
        families: createFamilyScene(config),
        carcass: createCarcassScene(config),
        style: createStyle(config),
        condition: createConditionScene(config),
        spend: createSpendScene(config),
        season: createSeasonScene(),
        heritage: createHeritageScene(config),
        niche: createNicheScene(),
        mate: createMateScene(config),
        proof: createProofScene(config),
    };
}

/**
 * Clears the per-slot state of a slot whose agent died or was replaced.
 * @param {Record<string, any>} scenes the scenes
 * @param {number} slot the slot
 * @returns {void}
 */
export function resetSceneSlot(scenes, slot) {
    resetPatchSlot(scenes.patch, slot);
    resetApproachSlot(scenes.approach, slot);
    resetStyleSlot(scenes.style, slot);
    resetConditionSlot(scenes.condition, slot);
    resetSpendSlot(scenes.spend, slot);
    resetHeritageSlot(scenes.heritage, slot);
    resetMateSlot(scenes.mate, slot);
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
 * Applies a tick's deaths, then its births, as `applyEvents` orders them.
 * @param {Record<string, any>} scenes the scenes
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
function noteEvents(scenes, observer, world) {
    const d = world.events.data;
    const end = world.events.count * EVENT_STRIDE;
    for (let o = 0; o < end; o += EVENT_STRIDE) {
        if (d[o] === EVENT_TYPE.AGENT_DIED) {
            if (d[o + 4] === DEATH_CAUSE.EATEN) {
                noteApproachKill(scenes.approach, observer, world, { killerId: d[o + 5], victimId: d[o + 3] });
            }
            noteStyleAtDeath(observer, o / EVENT_STRIDE, { slot: d[o + 2], genomeId: d[o + 3] });
            noteDeath(scenes, observer, { slot: d[o + 2], genomeId: d[o + 3], tick: d[o + 1], age: d[o + 8] });
            noteProofDeath(scenes.proof, observer, { slot: d[o + 2], genomeId: d[o + 3], tick: d[o + 1] });
            noteProofKill(scenes.proof, { cause: d[o + 4], lineageId: d[o + 7] });
            resetSceneSlot(scenes, d[o + 2]);
        }
    }
    for (let o = 0; o < end; o += EVENT_STRIDE) {
        if (d[o] === EVENT_TYPE.AGENT_BORN) {
            resetSceneSlot(scenes, d[o + 2]);
            noteBasinBirth(scenes.basin, world, { slot: d[o + 2], cause: d[o + 8] });
            if (d[o + 8] === BORN_CAUSE.MATE) {
                noteSpendBirth(scenes.spend, world, { child: d[o + 2], motherId: d[o + 6] });
            }
            if (d[o + 8] === BORN_CAUSE.MATE || d[o + 8] === BORN_CAUSE.SPLIT) {
                noteHeritageBirth(scenes.heritage, world, d[o + 2]);
            }
        }
    }
}

/**
 * Feeds the scenes one tick. Call it once right after `createWorld` and once after every `step`.
 * @param {Record<string, any>} observer the observer, whose intent state is current for this tick
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function observeScenes(observer, world) {
    const scenes = observer.scenes;
    noteEvents(scenes, observer, world);
    if (world.tick === 0) {
        return;
    }
    trackProof(scenes.proof, world);
    trackApproaches(scenes.approach, observer, world);
    trackCarcasses(scenes.carcass, observer, world);
    tickStyle(observer, world);
    trackSlots(scenes, observer, world);
    if (world.tick % GROUP_SAMPLE_TICKS === 0) {
        sampleTerrain(scenes.terrain, observer, world);
        sampleBasins(scenes.basin, world);
        sampleSpend(scenes.spend, world);
    }
    if (world.tick % MOTION_SAMPLE_TICKS === 0) {
        samplePatches(scenes.patch, world);
        sampleCondition(scenes.condition, world);
    }
    if (world.tick % BASIN_CHECKPOINT_TICKS === 0) {
        sampleSeason(scenes.season, scenes.terrain, world);
        sampleBalance(scenes.balance, world);
        sampleFamilies(scenes.families, world);
    }
}
