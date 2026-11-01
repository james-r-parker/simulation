// Measures herd grazing, trample deaths and whether blobs clear an approaching herd's path.

import { DEATH_CAUSE, EVENT_STRIDE, EVENT_TYPE } from '../sim/events.js';
import { BURN_IN_TICKS } from './burn-in.js';

const EPISODE_LIMIT = 120;
const APPROACH_DISTANCE = 300;
const AVOID_TICKS = 15;

/** @param {Readonly<Record<string, any>>} config @returns {Record<string, any>} */
export function createHerdScene(config) {
    const specCount = Object.keys(config.specialisations).length;
    return {
        deaths: 0,
        trampled: 0,
        plantEaten: 0,
        herdGrazed: 0,
        herdCarcassEaten: 0,
        herdCarcassMark: 0,
        unavoidableTramples: 0,
        trampleDeaths: 0,
        stampedes: 0,
        elapsedTicks: 0,
        aliveSamples: 0,
        animalSamples: 0,
        gapCrossings: 0,
        recolonisations: 0,
        floraMark: new Float64Array(24),
        herdGrazeMark: 0,
        episodesClear: 0,
        episodesHit: 0,
        episodeOpen: new Uint8Array(config.maxAgents),
        episodeGenome: new Uint32Array(config.maxAgents),
        episodeHerd: new Uint32Array(config.maxAgents),
        episodeAge: new Uint16Array(config.maxAgents),
        lastGroupSide: new Uint8Array(config.herdCount),
        lastBasinOccupancy: new Uint8Array(2),
        basinCheckpointed: new Uint8Array(2),
        foodMark: new Float64Array(specCount),
        carcassMark: new Float64Array(specCount),
        foodEatenBySpec: new Float64Array(specCount),
        carcassEatenBySpec: new Float64Array(specCount),
        hunterBiteMark: new Float64Array(2),
        hunterBites: 0,
        groupCount: new Uint16Array(config.herdCount),
        groupX: new Float64Array(config.herdCount),
        basinOccupancyNow: new Uint8Array(2),
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

/** Credits a post-burn-in death before its observer slot is reset. @param {Record<string, any>} scene @param {{tick: number, slot: number, genomeId: number, cause: number, herdId: number, pinned?: boolean}} death @returns {void} */
export function noteHerdDeath(scene, { tick, slot, genomeId, cause, herdId, pinned = false }) {
    if (tick <= BURN_IN_TICKS) {
        return;
    }
    scene.deaths++;
    if (cause === DEATH_CAUSE.TRAMPLED) {
        scene.trampled++;
        scene.trampleDeaths++;
        const avoidable =
            scene.episodeOpen[slot] === 1 &&
            scene.episodeGenome[slot] === genomeId &&
            scene.episodeHerd[slot] === herdId &&
            scene.episodeAge[slot] >= AVOID_TICKS;
        scene.unavoidableTramples += Number(pinned || !avoidable);
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

/** Feeds one tick of herd and plant counters and updates active dodge episodes. @param {Record<string, any>} scene @param {Record<string, any>} world @param {Record<string, any>|null} [observer] @returns {void} */
export function trackHerd(scene, world, observer = null) {
    if (world.tick > BURN_IN_TICKS) {
        trackAfterBurn(scene, world, observer);
    }
    scene.herdGrazeMark = world.herdTotals[0];
    scene.herdCarcassMark = world.herdTotals[1];
    for (let i = 0; i < world.foodEatenBySpec.length; i++) {
        scene.foodMark[i] = world.foodEatenBySpec[i];
        scene.carcassMark[i] = world.herdCarcassEatenBySpec[i];
    }
    if (observer?.intent) {
        scene.hunterBiteMark[0] = observer.intent.run.huntBiteDeliberate;
        scene.hunterBiteMark[1] = observer.intent.run.huntBiteChance;
    }
    for (let i = 0; i < world.floraIntake.length; i++) {
        scene.floraMark[i] = world.floraIntake[i];
    }
}

/** @param {Record<string, any>} scene @param {Record<string, any>} world @param {Record<string, any>|null} observer @returns {void} */
function trackAfterBurn(scene, world, observer) {
    scene.elapsedTicks++;
    scene.herdGrazed += world.herdTotals[0] - scene.herdGrazeMark;
    scene.herdCarcassEaten += world.herdTotals[1] - scene.herdCarcassMark;
    for (let i = 0; i < world.floraIntake.length; i++) {
        scene.plantEaten += world.floraIntake[i] - scene.floraMark[i];
    }
    for (let i = 0; i < world.foodEatenBySpec.length; i++) {
        scene.foodEatenBySpec[i] += world.foodEatenBySpec[i] - scene.foodMark[i];
        scene.carcassEatenBySpec[i] += world.herdCarcassEatenBySpec[i] - scene.carcassMark[i];
    }
    if (observer?.intent) {
        const deliberate = observer.intent.run.huntBiteDeliberate;
        const chance = observer.intent.run.huntBiteChance;
        scene.hunterBites += deliberate - scene.hunterBiteMark[0] + chance - scene.hunterBiteMark[1];
    }
    countStampedes(scene, world);
    trackGroupCrossings(scene, world);
    sampleHerds(scene, world);
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1) {
            updateEpisode(scene, world, slot);
        }
    }
}

/** @param {Record<string, any>} scene @param {Record<string, any>} world @returns {void} */
function countStampedes(scene, world) {
    const { data, count } = world.events;
    for (let offset = 0; offset < count * EVENT_STRIDE; offset += EVENT_STRIDE) {
        if (data[offset] === EVENT_TYPE.HERD_STAMPEDE && data[offset + 1] > BURN_IN_TICKS) {
            scene.stampedes++;
        }
    }
}

/** @param {Record<string, any>} scene @param {Record<string, any>} world @returns {void} */
function sampleHerds(scene, world) {
    if (world.tick % 1000 !== 0) {
        return;
    }
    let alive = 0;
    const occupied = scene.basinOccupancyNow;
    occupied.fill(0);
    for (let animal = 0; animal < world.herdAlive.length; animal++) {
        if (world.herdAlive[animal] !== 1) {
            continue;
        }
        alive++;
        occupied[world.herdX[animal] < world.config.worldWidth / 2 ? 0 : 1] = 1;
    }
    scene.aliveSamples += alive;
    scene.animalSamples++;
    for (let basin = 0; basin < occupied.length; basin++) {
        if (scene.basinCheckpointed[basin] === 1 && scene.lastBasinOccupancy[basin] === 0 && occupied[basin] === 1) {
            scene.recolonisations++;
        }
        scene.lastBasinOccupancy[basin] = occupied[basin];
        scene.basinCheckpointed[basin] = 1;
    }
}

/** @param {Record<string, any>} scene @param {Record<string, any>} world @returns {void} */
function trackGroupCrossings(scene, world) {
    const groupCount = scene.groupCount;
    const groupX = scene.groupX;
    groupCount.fill(0);
    groupX.fill(0);
    for (let animal = 0; animal < world.herdAlive.length; animal++) {
        if (world.herdAlive[animal] === 1) {
            const group = world.herdGroup[animal];
            groupCount[group]++;
            groupX[group] += world.herdX[animal];
        }
    }
    for (let group = 0; group < groupCount.length; group++) {
        if (groupCount[group] === 0) {
            scene.lastGroupSide[group] = 0;
            continue;
        }
        const side = groupX[group] / groupCount[group] < world.config.worldWidth / 2 ? 1 : 2;
        if (scene.lastGroupSide[group] !== 0 && scene.lastGroupSide[group] !== side) {
            scene.gapCrossings++;
        }
        scene.lastGroupSide[group] = side;
    }
}
