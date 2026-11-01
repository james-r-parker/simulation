// Aggregates the post-burn-in herd scene counters into the detector metrics.

import { none, ok, share } from './metrics-stats.js';

export const HERD_SPEC_NAMES = Object.freeze(['forager', 'predator', 'reproducer', 'scout', 'defender']);

/** @param {Record<string, any>} scene @param {Record<string, any>} carcassScene @param {Record<string, any>} observer */
function carcassTotals(scene, carcassScene, observer) {
    let eaten = 0;
    let hunters = 0;
    for (let spec = 0; spec < scene.carcassEatenBySpec.length; spec++) {
        const amount = scene.carcassEatenBySpec[spec];
        eaten += amount;
        hunters += observer.intent.hunterSpec[spec] === 1 ? amount : 0;
    }
    const totalCarcass = carcassScene.eaten + eaten;
    const hunterBites = scene.hunterBites;
    return {
        eaten,
        totalCarcass,
        hunterBites,
        hunters: carcassScene.eatenByHunters + hunters,
    };
}

/** @param {Record<string, any>} scene @returns {Record<string, import('./metrics-stats.js').MetricResult>} */
function herdCoreMetrics(scene) {
    return {
        'eval.trampled_share': share(scene.trampled, scene.deaths, 'no deaths after burn-in'),
        'eval.dodge_skill': share(
            scene.episodesClear,
            scene.episodesClear + scene.episodesHit,
            'no completed herd-approach episodes after burn-in',
        ),
        'eval.herd_grazed_share': share(
            scene.herdGrazed,
            scene.herdGrazed + scene.plantEaten,
            'no herd grazing or blob plant meals after burn-in',
        ),
        'eval.trample_unavoidable_share': share(
            scene.unavoidableTramples,
            scene.trampleDeaths,
            'no trample deaths after burn-in',
        ),
    };
}

/** @param {Record<string, any>} scene @returns {Record<string, import('./metrics-stats.js').MetricResult>} */
function populationMetrics(scene) {
    return {
        'eval.herd_stampede_rate':
            scene.elapsedTicks > 0
                ? ok((scene.stampedes / scene.elapsedTicks) * 10000)
                : none('no ticks after burn-in'),
        'eval.herd_animals':
            scene.animalSamples > 0
                ? ok(scene.aliveSamples / scene.animalSamples)
                : none('no herd checkpoints after burn-in'),
        'eval.herd_gap_crossings':
            scene.elapsedTicks > 0
                ? ok((scene.gapCrossings / scene.elapsedTicks) * 100000)
                : none('no ticks after burn-in'),
        'eval.herd_recolonisations':
            scene.animalSamples > 0 ? ok(scene.recolonisations) : none('no herd checkpoints after burn-in'),
    };
}

/** @param {Record<string, any>} scene @param {Record<string, any>} carcassScene @param {Record<string, any>} observer @returns {Record<string, import('./metrics-stats.js').MetricResult>} */
function carcassMetrics(scene, carcassScene, observer) {
    const totals = carcassTotals(scene, carcassScene, observer);
    const totalMeat = totals.totalCarcass + totals.hunterBites;
    return {
        'eval.herd_carcass_meal_share': share(totals.eaten, totalMeat, 'no meat eaten after burn-in'),
        'eval.carcass_meal_share': share(totals.totalCarcass, totalMeat, 'no meat eaten after burn-in'),
        'eval.carcass_hunter_share': share(totals.hunters, totals.totalCarcass, 'no carcass eaten after burn-in'),
    };
}

/** @param {Record<string, any>} scene @returns {Record<string, import('./metrics-stats.js').MetricResult>} */
function carcassShareBySpec(scene) {
    /** @type {Record<string, import('./metrics-stats.js').MetricResult>} */
    const metrics = {};
    for (let spec = 0; spec < HERD_SPEC_NAMES.length; spec++) {
        const name = HERD_SPEC_NAMES[spec];
        metrics[`eval.herd_carcass_share.${name}`] = share(
            scene.carcassEatenBySpec[spec],
            scene.foodEatenBySpec[spec],
            `no meals for ${name} after burn-in`,
        );
    }
    return metrics;
}

/** @param {Record<string, any>} scene @returns {import('./metrics-stats.js').MetricResult} */
function herdFollowingShare(scene) {
    let ratios = 0;
    let patches = 0;
    for (let patch = 0; patch < scene.followHerdedTicks.length; patch++) {
        const herdedTicks = scene.followHerdedTicks[patch];
        const bareTicks = scene.followBareTicks[patch];
        if (herdedTicks < 3 || bareTicks < 3) {
            continue;
        }
        const bareMean = scene.followBareBlobs[patch] / bareTicks;
        if (bareMean === 0) {
            continue;
        }
        ratios += scene.followHerdedBlobs[patch] / herdedTicks / bareMean;
        patches++;
    }
    return patches > 0 ? ok(ratios / patches) : none('no patch had 3 herded and bare checkpoints with blobs present');
}

/** @param {Record<string, any>} scene @param {Record<string, any>} carcassScene @param {Record<string, any>} observer @returns {Record<string, import('./metrics-stats.js').MetricResult>} */
export function herdMetrics(scene, carcassScene, observer) {
    return {
        ...herdCoreMetrics(scene),
        ...populationMetrics(scene),
        ...carcassMetrics(scene, carcassScene, observer),
        ...carcassShareBySpec(scene),
        'eval.herd_follow_share': herdFollowingShare(scene),
        'eval.dung_food_share': share(scene.dungFoodEaten, scene.plantFoodEaten, 'no plant energy eaten after burn-in'),
        'eval.herd_seeded_patches':
            scene.elapsedTicks > 0
                ? ok((scene.herdSeededPatches / scene.elapsedTicks) * 1000)
                : none('no ticks after burn-in'),
    };
}
