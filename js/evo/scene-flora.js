// Measures plant diet composition and the change of diet between seasons.
import { FLORA_NAMES } from '../sim/config-flora.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { none, ok } from './metrics-stats.js';

const SEASONS = 4;

/**
 * @returns {{energy: Float64Array, mark: Float64Array}} empty after-burn-in intake and the last observed counters
 */
export function createFloraScene() {
    return {
        energy: new Float64Array(SEASONS * FLORA_NAMES.length),
        mark: new Float64Array(SEASONS * FLORA_NAMES.length),
    };
}

/**
 * Reads exact cumulative intake counters; never infers eating from disappeared or reused food slots.
 * @param {ReturnType<typeof createFloraScene>} scene the scene
 * @param {import('../sim/world.js').World} world the world
 * @returns {void}
 */
export function trackFlora(scene, world) {
    for (let i = 0; i < scene.energy.length; i++) {
        if (world.tick > BURN_IN_TICKS) {
            scene.energy[i] += world.floraIntake[i] - scene.mark[i];
        }
        scene.mark[i] = world.floraIntake[i];
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
    const result = { 'eval.seasonal_diet_shift': dietShift(scene, sums) };
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
