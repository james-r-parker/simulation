// Parent spends (natural-selection.md, Detectors), both read at mate births after burn-in.
//
// - `eval.mother_wait_by_condition`: every 10 ticks a female that `isReadyToMate`
//   and `canBear` and has no sample open is noted, with her energy over `maxEnergy`. At her next mate birth the wait is
//   the birth tick less that sample less `pregnancyTicks`, so it is the search time and the cap delay. `canBear` is in
//   the test, so a mother who cannot afford the gift is not counted as waiting by choice. The metric is the mean wait
//   of the poorest third of the pairs minus that of the richest third (ticks; positive when poor mothers wait longer).
// - `eval.childshare_by_condition`: `childShare` is a gene fixed at birth, so the question is whether selection has
//   tied it to condition. Per lineage with `MIN_SLOPE_BIRTHS` births or more, the slope of the mother's `childShare` on
//   her energy over `maxEnergy` just before the birth (her energy now plus the child's gift), with the lineage's means
//   taken out of both; the mean slope over lineages. Near 0 is expected; a clear positive value means richer mothers
//   carry the larger share.
//
// Per-slot arrays and growable logs; a Map entry the first time a lineage bears.

import { SEX } from '../sim/sex.js';
import { canBear, isReadyToMate } from '../sim/mate-eligibility.js';
import { childShareOf } from '../sim/traits.js';
import { createLog, ensureRoom } from './growable-log.js';
import { none, ok } from './metrics-stats.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { createKeyed, rowOf } from './scene-keyed.js';

/** Fewest mate births a lineage needs for the `childShare` slope. */
export const MIN_SLOPE_BIRTHS = 20;

/** A lineage whose summed squared spread of condition is under this has no slope (rounding noise, not a spread). */
const MIN_VARIANCE = 1e-9;

/** Fewest (energy, wait) pairs for the mother-wait difference: two in each third. */
export const MIN_WAIT_PAIRS = 6;

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} an empty scene
 */
export function createSpendScene(config) {
    const n = config.maxAgents;
    return {
        readySince: new Float64Array(n).fill(-1),
        readyShare: new Float64Array(n),
        waits: createLog(['share', 'wait']),
        waitCount: 0,
        slopes: createKeyed(['n', 'sx', 'sy', 'sxy', 'sxx']),
    };
}

/**
 * @param {Record<string, any>} scene the spend scene
 * @param {number} slot the slot of a born or dead agent
 * @returns {void}
 */
export function resetSpendSlot(scene, slot) {
    scene.readySince[slot] = -1;
}

/**
 * Runs one 10-tick sample: notes each mother that is ready and can bear and has no open sample.
 * @param {Record<string, any>} scene the spend scene
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleSpend(scene, world) {
    const { maxEnergy } = world.config;
    for (let slot = 0; slot < world.alive.length; slot++) {
        const mother = world.alive[slot] === 1 && world.sex[slot] === SEX.FEMALE;
        if (mother && scene.readySince[slot] < 0 && isReadyToMate(world, slot) && canBear(world, slot)) {
            scene.readySince[slot] = world.tick;
            scene.readyShare[slot] = world.energy[slot] / maxEnergy;
        }
    }
}

/**
 * Adds a mate birth to the lineage's regression sums.
 * @param {Record<string, any>} scene the spend scene
 * @param {Record<string, any>} world the world
 * @param {{mother: number, x: number}} birth the mother's slot and her energy over `maxEnergy` before the birth
 * @returns {void}
 */
function addSlope(scene, world, { mother, x }) {
    const y = childShareOf(world, mother);
    const t = scene.slopes;
    const row = rowOf(t, world.lineageId[mother]);
    t.log.n[row] += 1;
    t.log.sx[row] += x;
    t.log.sy[row] += y;
    t.log.sxy[row] += x * y;
    t.log.sxx[row] += x * x;
}

/**
 * Notes a mate birth: the mother's wait since her ready sample, and her `childShare` against her condition.
 * @param {Record<string, any>} scene the spend scene
 * @param {Record<string, any>} world the world
 * @param {{child: number, motherId: number}} birth the newborn's slot and its mother's genome id
 * @returns {void}
 */
export function noteSpendBirth(scene, world, { child, motherId }) {
    const mother = world.parentSlotA[child];
    if (world.tick < BURN_IN_TICKS || mother < 0 || world.alive[mother] !== 1 || world.genomeId[mother] !== motherId) {
        return;
    }
    if (scene.readySince[mother] >= 0) {
        const row = scene.waitCount++;
        ensureRoom(scene.waits, row);
        scene.waits.share[row] = scene.readyShare[mother];
        scene.waits.wait[row] = world.tick - scene.readySince[mother] - world.config.pregnancyTicks;
        scene.readySince[mother] = -1;
    }
    addSlope(scene, world, { mother, x: (world.energy[mother] + world.energy[child]) / world.config.maxEnergy });
}

/**
 * @param {Record<string, any>} scene the spend scene
 * @returns {import('./metrics-stats.js').MetricResult} the poorest third's mean wait minus the richest third's
 */
function waitGap(scene) {
    const n = scene.waitCount;
    if (n < MIN_WAIT_PAIRS) {
        return none(`fewer than ${MIN_WAIT_PAIRS} mother waits after burn-in`);
    }
    const order = Array.from({ length: n }, (_, i) => i).sort(
        (a, b) => scene.waits.share[a] - scene.waits.share[b] || a - b,
    );
    const third = Math.floor(n / 3);
    let poor = 0;
    let rich = 0;
    for (let i = 0; i < third; i++) {
        poor += scene.waits.wait[order[i]];
        rich += scene.waits.wait[order[n - 1 - i]];
    }
    return ok((poor - rich) / third);
}

/**
 * @param {Record<string, any>} scene the spend scene
 * @returns {import('./metrics-stats.js').MetricResult} the mean within-lineage slope of `childShare` on condition
 */
function shareSlope(scene) {
    const { rows, log } = scene.slopes;
    let total = 0;
    let lineages = 0;
    for (let row = 0; row < rows; row++) {
        const n = log.n[row];
        const varX = log.sxx[row] - (log.sx[row] * log.sx[row]) / n;
        if (n >= MIN_SLOPE_BIRTHS && varX > MIN_VARIANCE) {
            total += (log.sxy[row] - (log.sx[row] * log.sy[row]) / n) / varX;
            lineages += 1;
        }
    }
    return lineages > 0 ? ok(total / lineages) : none(`no lineage with ${MIN_SLOPE_BIRTHS} mate births after burn-in`);
}

/**
 * @param {Record<string, any>} scene the spend scene
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the two spend metrics
 */
export function spendMetrics(scene) {
    return {
        'eval.mother_wait_by_condition': waitGap(scene),
        'eval.childshare_by_condition': shareSlope(scene),
    };
}
