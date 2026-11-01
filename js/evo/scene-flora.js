// Measures plant diet composition and the change of diet between seasons.
import { FOOD_KIND } from '../sim/carcass.js';
import { DEATH_CAUSE, EVENT_STRIDE, EVENT_TYPE } from '../sim/events.js';
import { FLORA_NAMES } from '../sim/config-flora.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { none, ok } from './metrics-stats.js';

const SEASONS = 4;

/**
 * @returns {Record<string, any>} empty after-burn-in diet and toxin observations
 */
export function createFloraScene() {
    return {
        energy: new Float64Array(SEASONS * FLORA_NAMES.length),
        mark: new Float64Array(SEASONS * FLORA_NAMES.length),
        meals: new Float64Array(2),
        mealMark: new Float64Array(2),
        available: new Float64Array(2),
        deaths: 0,
        poisoned: 0,
        agentTicks: 0,
        sickTicks: 0,
        lastTick: -1,
        ticks: 0,
        pollinations: 0,
        hueSum: 0,
        hueCheckpoints: 0,
        fullPoolCheckpoints: 0,
        patchPoolCheckpoints: 0,
    };
}

/**
 * Reads exact cumulative intake counters; never infers eating from disappeared or reused food slots.
 * @param {ReturnType<typeof createFloraScene>} scene the scene
 * @param {import('../sim/world.js').World} world the world
 * @returns {void}
 */
export function trackFlora(scene, world) {
    if (scene.lastTick === world.tick) {
        return;
    }
    scene.lastTick = world.tick;
    trackMeals(scene, world);
    if (world.tick > BURN_IN_TICKS) {
        scene.ticks++;
        trackCondition(scene, world);
        trackEvents(scene, world);
        if (world.tick % 1000 === 0) {
            sampleAvailability(scene, world);
            sampleHues(scene, world);
            samplePatchPool(scene, world);
        }
    }
    for (let i = 0; i < scene.energy.length; i++) {
        if (world.tick > BURN_IN_TICKS) {
            scene.energy[i] += world.floraIntake[i] - scene.mark[i];
        }
        scene.mark[i] = world.floraIntake[i];
    }
}

/**
 * @param {Record<string, any>} scene the scene
 * @param {import('../sim/world.js').World} world the world
 * @returns {void}
 */
function trackMeals(scene, world) {
    for (let i = 0; i < 2; i++) {
        if (world.tick > BURN_IN_TICKS) {
            scene.meals[i] += world.floraMeals[i] - scene.mealMark[i];
        }
        scene.mealMark[i] = world.floraMeals[i];
    }
}

/**
 * @param {Record<string, any>} scene the scene
 * @param {import('../sim/world.js').World} world the world
 * @returns {void}
 */
function trackCondition(scene, world) {
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1) {
            scene.agentTicks++;
            scene.sickTicks += Number(world.dose[slot] >= world.config.sickDose);
        }
    }
}

/**
 * @param {Record<string, any>} scene the scene
 * @param {import('../sim/world.js').World} world the world
 * @returns {void}
 */
function trackEvents(scene, world) {
    const { data, count } = world.events;
    for (let at = 0; at < count * EVENT_STRIDE; at += EVENT_STRIDE) {
        if (data[at + 1] < BURN_IN_TICKS) {
            continue;
        }
        if (data[at] === EVENT_TYPE.AGENT_DIED) {
            scene.deaths++;
            scene.poisoned += Number(data[at + 4] === DEATH_CAUSE.POISONED);
        } else if (data[at] === EVENT_TYPE.PATCH_SEEDED) {
            scene.pollinations++;
        }
    }
}

/**
 * @param {Record<string, any>} scene the scene
 * @param {import('../sim/world.js').World} world the world
 * @returns {void}
 */
function sampleAvailability(scene, world) {
    for (let food = 0; food < world.foodAlive.length; food++) {
        if (world.foodAlive[food] === 1 && world.foodKind[food] === FOOD_KIND.PLANT) {
            scene.available[0]++;
            scene.available[1] += Number(world.foodTox[food] > 0);
        }
    }
}

/**
 * @param {ReturnType<typeof createFloraScene>} scene the scene
 * @param {import('../sim/world.js').World} world the world
 * @returns {void}
 */
function samplePatchPool(scene, world) {
    let alive = 0;
    for (let patch = 0; patch < world.patchAlive.length; patch++) {
        alive += world.patchAlive[patch];
    }
    scene.patchPoolCheckpoints++;
    scene.fullPoolCheckpoints += Number(alive === world.config.floraPatchMax);
}

/**
 * @param {Record<string, any>} scene the scene
 * @returns {import('./metrics-stats.js').MetricResult} minus Ivlev electivity for toxic plant items
 */
function avoidance(scene) {
    if (scene.meals[0] === 0 || scene.available[0] === 0) {
        return none('no plant meals or plant availability checkpoints after burn-in');
    }
    const r = scene.meals[1] / scene.meals[0];
    const p = scene.available[1] / scene.available[0];
    return p + r > 0 ? ok((p - r) / (p + r)) : none('no toxic plant meals or availability after burn-in');
}

/**
 * @param {import('../sim/world.js').World} world the world
 * @param {number} species pollinated species
 * @returns {number} population hue deviation, or -1 without a living patch
 */
function hueDeviation(world, species) {
    let sum = 0;
    let count = 0;
    for (let patch = 0; patch < world.patchAlive.length; patch++) {
        if (world.patchAlive[patch] === 1 && world.patchSpecies[patch] === species) {
            sum += world.patchHue[patch];
            count++;
        }
    }
    if (count === 0) {
        return -1;
    }
    const mean = sum / count;
    let squares = 0;
    for (let patch = 0; patch < world.patchAlive.length; patch++) {
        if (world.patchAlive[patch] === 1 && world.patchSpecies[patch] === species) {
            const delta = world.patchHue[patch] - mean;
            squares += delta * delta;
        }
    }
    return Math.sqrt(squares / count);
}

/**
 * @param {Record<string, any>} scene the scene
 * @param {import('../sim/world.js').World} world the world
 * @returns {void}
 */
function sampleHues(scene, world) {
    let sum = 0;
    let species = 0;
    for (let i = 0; i < FLORA_NAMES.length; i++) {
        if (world.config.flora[FLORA_NAMES[i]].pollenChance === 0) {
            continue;
        }
        const deviation = hueDeviation(world, i);
        if (deviation >= 0) {
            sum += deviation;
            species++;
        }
    }
    if (species > 0) {
        scene.hueSum += sum / species;
        scene.hueCheckpoints++;
    }
}

/**
 * @param {ReturnType<typeof createFloraScene>} scene the scene
 * @returns {number[]} energy totals per season
 */
function totals(scene) {
    const sums = [0, 0, 0, 0];
    for (let season = 0; season < SEASONS; season++) {
        for (let species = 0; species < FLORA_NAMES.length; species++) {
            sums[season] += scene.energy[season * FLORA_NAMES.length + species];
        }
    }
    return sums;
}

/**
 * @param {ReturnType<typeof createFloraScene>} scene the scene
 * @param {number[]} sums per-season total energy
 * @returns {import('./metrics-stats.js').MetricResult} mean distance over season pairs with meals
 */
function dietShift(scene, sums) {
    let distance = 0;
    let pairs = 0;
    for (let a = 0; a < SEASONS; a++) {
        for (let b = a + 1; b < SEASONS; b++) {
            if (sums[a] === 0 || sums[b] === 0) {
                continue;
            }
            for (let species = 0; species < FLORA_NAMES.length; species++) {
                distance +=
                    Math.abs(scene.energy[a * 6 + species] / sums[a] - scene.energy[b * 6 + species] / sums[b]) / 2;
            }
            pairs++;
        }
    }
    return pairs > 0 ? ok(distance / pairs) : none('fewer than two seasons with plant meals after burn-in');
}

/**
 * @param {ReturnType<typeof createFloraScene>} scene the scene
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} species shares and seasonal diet shift
 */
export function floraMetrics(scene) {
    const sums = totals(scene);
    const total = sums.reduce((sum, n) => sum + n, 0);
    /** @type {Record<string, import('./metrics-stats.js').MetricResult>} */
    const result = {
        'eval.seasonal_diet_shift': dietShift(scene, sums),
        'eval.pollination_rate':
            scene.ticks > 0 ? ok((1000 * scene.pollinations) / scene.ticks) : none('no observed ticks after burn-in'),
        'eval.flora_hue_spread':
            scene.hueCheckpoints > 0
                ? ok(scene.hueSum / scene.hueCheckpoints)
                : none('no live pollinated species at checkpoints after burn-in'),
        'eval.flora_patch_pool_full_share':
            scene.patchPoolCheckpoints > 0
                ? ok(scene.fullPoolCheckpoints / scene.patchPoolCheckpoints)
                : none('no patch-pool checkpoints after burn-in'),
        'eval.toxic_avoidance': avoidance(scene),
        'eval.toxic_death_share':
            scene.deaths > 0 ? ok(scene.poisoned / scene.deaths) : none('no deaths after burn-in'),
        'eval.sick_share':
            scene.agentTicks > 0 ? ok(scene.sickTicks / scene.agentTicks) : none('no alive agent-ticks after burn-in'),
    };
    for (let species = 0; species < FLORA_NAMES.length; species++) {
        let energy = 0;
        for (let season = 0; season < SEASONS; season++) {
            energy += scene.energy[season * 6 + species];
        }
        result[`eval.food_species_share.${FLORA_NAMES[species]}`] =
            total > 0 ? ok(energy / total) : none('no plant meals after burn-in');
    }
    return result;
}
