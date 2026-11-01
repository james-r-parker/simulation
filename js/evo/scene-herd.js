// Measures herd grazing, trample deaths and whether blobs clear an approaching herd's path.

import { DEATH_CAUSE } from '../sim/events.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { share } from './metrics-stats.js';

const EPISODE_LIMIT = 120;
const APPROACH_DISTANCE = 300;

/** @param {number} maxAgents @returns {Record<string, any>} */
export function createHerdScene(maxAgents) {
    return {
        deaths: 0,
        trampled: 0,
        plantEaten: 0,
        herdGrazed: 0,
        floraMark: new Float64Array(24),
        herdGrazeMark: 0,
        episodesClear: 0,
        episodesHit: 0,
        episodeOpen: new Uint8Array(maxAgents),
        episodeGenome: new Uint32Array(maxAgents),
        episodeHerd: new Uint32Array(maxAgents),
        episodeAge: new Uint16Array(maxAgents),
    };
}

/** @param {Record<string, any>} scene @param {number} slot @returns {void} */
export function resetHerdSlot(scene, slot) {
    scene.episodeOpen[slot] = 0;
    scene.episodeGenome[slot] = 0;
    scene.episodeHerd[slot] = 0;
    scene.episodeAge[slot] = 0;
}

/** @param {Record<string, any>} scene @param {number} slot @param {number} genomeId @param {number} herdId @returns {void} */
function closeEpisode(scene, slot, genomeId, herdId) {
    if (scene.episodeOpen[slot] && scene.episodeGenome[slot] === genomeId && scene.episodeHerd[slot] === herdId) {
        scene.episodesHit++;
        resetHerdSlot(scene, slot);
    }
}

/** Credits a post-burn-in death before its observer slot is reset. @param {Record<string, any>} scene @param {{tick: number, slot: number, genomeId: number, cause: number, herdId: number}} death @returns {void} */
export function noteHerdDeath(scene, { tick, slot, genomeId, cause, herdId }) {
    if (tick <= BURN_IN_TICKS) {
        return;
    }
    scene.deaths++;
    if (cause === DEATH_CAUSE.TRAMPLED) {
        scene.trampled++;
        closeEpisode(scene, slot, genomeId, herdId);
    }
}

/** @param {Record<string, any>} world @param {number} slot @param {number} animal @returns {boolean} */
function inLane(world, slot, animal) {
    const vx = world.herdVx[animal];
    const vy = world.herdVy[animal];
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed <= world.config.herdWalkSpeed) {
        return false;
    }
    const dx = world.x[slot] - world.herdX[animal];
    const dy = world.y[slot] - world.herdY[animal];
    const forward = (dx * vx + dy * vy) / speed;
    if (forward <= 0 || forward > APPROACH_DISTANCE) {
        return false;
    }
    const lateral = Math.abs(dx * vy - dy * vx) / speed;
    return lateral < world.config.herdRadius + world.size[slot];
}

/** @param {Record<string, any>} world @param {number} slot @param {number} animal @returns {boolean} */
function touches(world, slot, animal) {
    const dx = world.x[slot] - world.herdX[animal];
    const dy = world.y[slot] - world.herdY[animal];
    const reach = world.size[slot] + world.config.herdRadius;
    return dx * dx + dy * dy <= reach * reach;
}

/** @param {Record<string, any>} scene @param {Record<string, any>} world @param {number} slot @param {number} animal @returns {void} */
function openEpisode(scene, world, slot, animal) {
    scene.episodeOpen[slot] = 1;
    scene.episodeGenome[slot] = world.genomeId[slot];
    scene.episodeHerd[slot] = world.herdId[animal];
    scene.episodeAge[slot] = 0;
}

/** @param {Record<string, any>} world @param {number} herdId @returns {number} */
function findHerdAnimal(world, herdId) {
    for (let i = 0; i < world.herdId.length; i++) {
        if (world.herdAlive[i] === 1 && world.herdId[i] === herdId) {
            return i;
        }
    }
    return -1;
}

/** @param {Record<string, any>} scene @param {Record<string, any>} world @param {number} slot @returns {void} */
function updateOpenEpisode(scene, world, slot) {
    const animal = findHerdAnimal(world, scene.episodeHerd[slot]);
    if (animal < 0) {
        scene.episodesClear++;
        resetHerdSlot(scene, slot);
    } else if (touches(world, slot, animal)) {
        scene.episodesHit++;
        resetHerdSlot(scene, slot);
    } else {
        scene.episodeAge[slot]++;
        if (!inLane(world, slot, animal) || scene.episodeAge[slot] >= EPISODE_LIMIT) {
            scene.episodesClear++;
            resetHerdSlot(scene, slot);
        }
    }
}

/** @param {Record<string, any>} scene @param {Record<string, any>} world @param {number} slot @returns {void} */
function updateEpisode(scene, world, slot) {
    const genomeId = world.genomeId[slot];
    if (scene.episodeOpen[slot] && scene.episodeGenome[slot] !== genomeId) {
        resetHerdSlot(scene, slot);
    }
    if (scene.episodeOpen[slot]) {
        updateOpenEpisode(scene, world, slot);
        return;
    }
    for (let animal = 0; animal < world.herdAlive.length; animal++) {
        if (world.herdAlive[animal] === 1 && inLane(world, slot, animal)) {
            openEpisode(scene, world, slot, animal);
            return;
        }
    }
}

/** Feeds one tick of herd and plant counters and updates active dodge episodes. @param {Record<string, any>} scene @param {Record<string, any>} world @returns {void} */
export function trackHerd(scene, world) {
    if (world.tick > BURN_IN_TICKS) {
        scene.herdGrazed += world.herdTotals[0] - scene.herdGrazeMark;
        for (let i = 0; i < world.floraIntake.length; i++) {
            scene.plantEaten += world.floraIntake[i] - scene.floraMark[i];
        }
        for (let slot = 0; slot < world.alive.length; slot++) {
            if (world.alive[slot] === 1) {
                updateEpisode(scene, world, slot);
            }
        }
    }
    scene.herdGrazeMark = world.herdTotals[0];
    for (let i = 0; i < world.floraIntake.length; i++) {
        scene.floraMark[i] = world.floraIntake[i];
    }
}

/** @param {Record<string, any>} scene @returns {Record<string, import('./metrics-stats.js').MetricResult>} */
export function herdMetrics(scene) {
    const totalEpisodes = scene.episodesClear + scene.episodesHit;
    return {
        'eval.trampled_share': share(scene.trampled, scene.deaths, 'no deaths after burn-in'),
        'eval.dodge_skill': share(
            scene.episodesClear,
            totalEpisodes,
            'no completed herd-approach episodes after burn-in',
        ),
        'eval.herd_grazed_share': share(
            scene.herdGrazed,
            scene.herdGrazed + scene.plantEaten,
            'no herd grazing or blob plant meals after burn-in',
        ),
    };
}
