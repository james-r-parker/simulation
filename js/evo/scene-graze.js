// Does holding the bite slow a forager (eat-choice.md, Phase 5, T21)? Read from the eat sample (`scene-eat.js`): every
// `EAT_SAMPLE_TICKS` ticks after burn-in, over the alive non-hunters (`huntBySpec` 0), pooled over the run:
//
// - `eval.graze_time_share` (watch): of the non-hunter samples, the share holding `BITE` above 0.
// - `eval.graze_speed_ratio` (watch, intended lower): per specialisation, the mean speed of the moving non-hunters (speed
//   above 0) holding `BITE` above 0 over the mean speed of those not holding it, pooled over the samples; then the mean
//   over the specialisations that have both. `grazeThrust` below 1 slows a grazer, so the ratio falls under 1.
//
// Every accumulator is a fixed array made with the scene; nothing is allocated per sample. The scene reads the world and
// writes only itself, so no hash can move.

import { OUTPUT_COUNT, OUTPUT_INDEX } from '../sim/brain-layout.js';
import { none, ok } from './metrics-stats.js';

const NO_SAMPLE = 'no non-hunter at a sample after burn-in';
const NO_SPEC = 'no specialisation with moving non-hunters holding BITE and not holding it';

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} an empty graze scene: the pooled sample counts, and per specialisation the speed sums
 *   and counts of the moving non-hunters holding `BITE` and not
 */
export function createGrazeScene(config) {
    const specs = Math.max(...Object.values(config.specialisations).map((s) => s.index)) + 1;
    return {
        samples: 0,
        holding: 0,
        holdSpeed: new Float64Array(specs),
        holdCount: new Int32Array(specs),
        freeSpeed: new Float64Array(specs),
        freeCount: new Int32Array(specs),
    };
}

/**
 * Adds one alive non-hunter to the tallies.
 * @param {Record<string, any>} scene the graze scene
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive non-hunter
 * @returns {void}
 */
export function tallyGraze(scene, world, slot) {
    const holds = world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.BITE] > 0;
    const spec = world.spec[slot];
    const speed = Math.sqrt(world.vx[slot] * world.vx[slot] + world.vy[slot] * world.vy[slot]);
    scene.samples += 1;
    scene.holding += holds ? 1 : 0;
    if (speed > 0) {
        scene.holdSpeed[spec] += holds ? speed : 0;
        scene.holdCount[spec] += holds ? 1 : 0;
        scene.freeSpeed[spec] += holds ? 0 : speed;
        scene.freeCount[spec] += holds ? 0 : 1;
    }
}

/**
 * @param {Record<string, any>} scene the graze scene
 * @returns {import('./metrics-stats.js').MetricResult} the mean over the specialisations with moving agents holding and not
 *   holding `BITE` of the mean speed holding over the mean speed not holding; null when there is none
 */
function grazeSpeedRatio(scene) {
    let sum = 0;
    let specs = 0;
    for (let spec = 0; spec < scene.holdCount.length; spec++) {
        if (scene.holdCount[spec] > 0 && scene.freeCount[spec] > 0) {
            sum += scene.holdSpeed[spec] / scene.holdCount[spec] / (scene.freeSpeed[spec] / scene.freeCount[spec]);
            specs += 1;
        }
    }
    return specs === 0 ? none(NO_SPEC) : ok(sum / specs);
}

/**
 * @param {Record<string, any>} scene the graze scene
 * @returns {import('./metrics-stats.js').MetricRecord} the graze time share and the graze speed ratio, each null with a
 *   reason when nothing was sampled
 */
export function grazeMetrics(scene) {
    return {
        'eval.graze_time_share': scene.samples === 0 ? none(NO_SAMPLE) : ok(scene.holding / scene.samples),
        'eval.graze_speed_ratio': grazeSpeedRatio(scene),
    };
}
