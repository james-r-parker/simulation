// The scene detectors' state and per-tick feed (natural-selection.md, Detectors). `observeScenes` runs inside
// `observe`, after the intent state is current for the tick and before `applyEvents` reassigns slots, so a dying
// agent's slot still holds its counters. It reads the world and the observer and writes only `observer.scenes`; the
// world is untouched, so the golden `worldHash` cannot move. Each scene lives in its own `scene-*.js` module; this one
// creates them, hands them the tick's events and the 10-tick and 100-tick samples, and resets a slot on a birth.

import { EVENT_STRIDE, EVENT_TYPE, DEATH_CAUSE } from '../sim/events.js';
import { createApproachScene, noteApproachKill, resetApproachSlot, trackApproaches } from './scene-approach.js';
import { createBasinScene, noteBasinBirth, sampleBasins } from './scene-basin.js';
import { createCarcassScene, trackCarcasses } from './scene-carcass.js';
import { createPatchScene, resetPatchSlot, samplePatches } from './scene-patch.js';
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
        carcass: createCarcassScene(config),
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
            resetSceneSlot(scenes, d[o + 2]);
        }
    }
    for (let o = 0; o < end; o += EVENT_STRIDE) {
        if (d[o] === EVENT_TYPE.AGENT_BORN) {
            resetSceneSlot(scenes, d[o + 2]);
            noteBasinBirth(scenes.basin, world, { slot: d[o + 2], cause: d[o + 8] });
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
    trackApproaches(scenes.approach, observer, world);
    trackCarcasses(scenes.carcass, observer, world);
    if (world.tick % GROUP_SAMPLE_TICKS === 0) {
        sampleTerrain(scenes.terrain, observer, world);
        sampleBasins(scenes.basin, world);
    }
    if (world.tick % MOTION_SAMPLE_TICKS === 0) {
        samplePatches(scenes.patch, world);
    }
}
