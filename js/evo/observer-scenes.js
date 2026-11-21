import { createHerdScene, trackHerd } from './scene-herd.js';
// The scene detectors' state and per-tick feed (natural-selection.md, Detectors). `observeScenes` runs inside
// `observe`, after the intent state is current for the tick and before `applyEvents` reassigns slots, so a dying
// agent's slot still holds its counters. It reads the world and the observer and writes only `observer.scenes`; the
// world is untouched, so the golden `worldHash` cannot move. Each scene lives in its own `scene-*.js` module; this one
// creates them, hands them the tick's events and the 10-tick and 100-tick samples, and resets a slot on a birth.

import { BASIN_CHECKPOINT_TICKS, createBasinScene, sampleBasins } from './scene-basin.js';
import { createBalanceScene, sampleBalance } from './scene-balance.js';
import { createCapacityScene, sampleCapacity } from './scene-capacity.js';
import { createEatScene, sampleEat } from './scene-eat.js';
import { createEdgeScene, sampleEdge } from './scene-edge.js';
import { createDivergenceScene, sampleDivergence } from './scene-divergence.js';
import { createFamilyScene, sampleFamilies } from './scene-families.js';
import { createDiseaseScene, noteDiseaseEvents, sampleDiseaseFamilies } from './scene-disease.js';
import { createCarcassScene, trackCarcasses } from './scene-carcass.js';
import { createGuardScene, sampleGuards } from './scene-guards.js';
import { createGuildScene, sampleGuilds, tickGuilds } from './scene-guilds.js';
import { createKinProximityScene, sampleKinProximity } from './scene-kin-proximity.js';
import { createConditionScene, sampleCondition } from './scene-condition.js';
import { createPatchScene, samplePatches } from './scene-patch.js';
import { createSeasonScene, sampleSeason } from './scene-season.js';
import { createSeasonMapScene, sampleSeasonMap } from './scene-season-map.js';
import { createSpendScene, sampleSpend } from './scene-spend.js';
import { createHeritageScene } from './scene-heritage.js';
import { createMateScene } from './scene-mate.js';
import { createNicheScene } from './scene-niche.js';
import { createProofScene, trackProof } from './scene-proof.js';
import { DETECTORS, LEAN_DETECTORS } from './detectors.js';
import { compileDetectors, createStates, dispatchEvents, tickDetectors } from './observer-detectors.js';
import { noteEvents } from './observer-scenes-events.js';
import { trackSlots } from './observer-scenes-slots.js';
import { createStyle, tickStyle } from './style.js';
import { createReachScene, sampleReach } from './scene-reach.js';
import { createRefugeScene, sampleRefuge } from './scene-refuge.js';
import { createRefugeOutcomeScene, sampleRefugeOutcome, tickRefugeBites } from './scene-refuge-outcome.js';
import { createTerrainScene, sampleTerrain } from './scene-terrain.js';
import { GROUP_SAMPLE_TICKS } from './observer-intent-state.js';
import { MOTION_SAMPLE_TICKS } from './observer-tick.js';

export { resetSceneSlot } from './observer-scenes-events.js';

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @param {boolean} [lean] build only the style and terrain scenes (the policy core, lean-observer.md)
 * @returns {Record<string, any>} the scenes, each empty
 */
export function createScenes(config, lean = false) {
    if (lean) {
        return { lean: true, terrain: createTerrainScene(config), style: createStyle(config) };
    }
    return {
        herd: createHerdScene(config),
        patch: createPatchScene(config),
        terrain: createTerrainScene(config),
        refuge: createRefugeScene(config),
        reach: createReachScene(),
        refugeOutcome: createRefugeOutcomeScene(config),
        basin: createBasinScene(),
        balance: createBalanceScene(),
        families: createFamilyScene(config),
        divergence: createDivergenceScene(config),
        carcass: createCarcassScene(config),
        style: createStyle(config),
        condition: createConditionScene(config),
        spend: createSpendScene(config),
        season: createSeasonScene(),
        seasonMap: createSeasonMapScene(),
        heritage: createHeritageScene(config),
        niche: createNicheScene(),
        mate: createMateScene(config),
        proof: createProofScene(config),
        disease: createDiseaseScene(config),
        guards: createGuardScene(config),
        guilds: createGuildScene(config),
        capacity: createCapacityScene(config),
        edge: createEdgeScene(),
        eat: createEatScene(config),
        kin: createKinProximityScene(config),
    };
}

/**
 * The observer's scene layer: the compiled detector list and every scene's state.
 * @param {Readonly<Record<string, any>>} config the world's config
 * @param {{runTicks?: number, lean?: boolean}} options the observer's options
 * @returns {{plan: import('./observer-detectors.js').Plan, scenes: Record<string, any>}} `observer.plan` and `observer.scenes`
 */
export function createSceneLayer(config, { runTicks = 0, lean = false }) {
    const plan = compileDetectors(lean ? LEAN_DETECTORS : DETECTORS);
    return { plan, scenes: { ...createScenes(config, lean), ...createStates(plan, config, runTicks) } };
}

/**
 * Feeds the lean scenes one tick: the style scene's births, deaths and bite chains.
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
function observeLean(observer, world) {
    noteEvents(observer.scenes, observer, world);
    if (world.tick !== 0) {
        tickStyle(observer, world);
    }
}

/** @param {Record<string, any>} scenes @param {Record<string, any>} world */
function sampleCheckpoints(scenes, world) {
    sampleSeason(scenes.season, scenes.terrain, world);
    sampleSeasonMap(scenes.seasonMap, world);
    sampleBalance(scenes.balance, world);
    sampleFamilies(scenes.families, world);
    sampleDivergence(scenes.divergence, world);
    sampleDiseaseFamilies(scenes.disease, world);
    sampleGuards(scenes.guards, world);
    sampleGuilds(scenes.guilds, world);
    sampleCapacity(scenes.capacity, world);
    sampleEdge(scenes.edge, world);
    sampleKinProximity(scenes.kin, world);
}

/**
 * Feeds the scenes one tick. Call it once right after `createWorld` and once after every `step`.
 * @param {Record<string, any>} observer the observer, whose intent state is current for this tick
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function observeScenes(observer, world) {
    const scenes = observer.scenes;
    if (scenes.lean === true) {
        observeLean(observer, world);
        return;
    }
    noteEvents(scenes, observer, world);
    noteDiseaseEvents(scenes.disease, world);
    dispatchEvents(observer.plan, observer, world);
    trackHerd(scenes.herd, world, observer);
    if (world.tick === 0) {
        tickDetectors(observer.plan, observer, world);
        return;
    }
    trackProof(scenes.proof, world);
    trackCarcasses(scenes.carcass, observer, world, scenes.scent);
    tickStyle(observer, world);
    tickGuilds(scenes.guilds, world);
    tickRefugeBites(scenes.refugeOutcome, observer, world);
    trackSlots(scenes, observer, world);
    tickDetectors(observer.plan, observer, world);
    if (world.tick % GROUP_SAMPLE_TICKS === 0) {
        sampleTerrain(scenes.terrain, observer, world);
        sampleRefuge(scenes.refuge, observer, world);
        sampleReach(scenes.reach, observer, world);
        sampleRefugeOutcome(scenes.refugeOutcome, observer, world);
        sampleBasins(scenes.basin, world);
        sampleSpend(scenes.spend, world);
    }
    if (world.tick % MOTION_SAMPLE_TICKS === 0) {
        samplePatches(scenes.patch, world);
        sampleCondition(scenes.condition, world);
        sampleEat(scenes.eat, world);
    }
    if (world.tick % BASIN_CHECKPOINT_TICKS === 0) {
        sampleCheckpoints(scenes, world);
    }
}
