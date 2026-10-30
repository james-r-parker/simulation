// Rule 5, who is chosen (natural-selection.md, Detectors), read at the start of each mating after burn-in (the tick a
// mother turns pregnant, when the candidates are still where they were):
//
// - `eval.mate_skill_gap`: the chosen mate's within-specialisation rank percentile minus the mean percentile of the
//   candidates in range (alive, of her specialisation, of the other sex, within
//   `size + size + mateRange`, and ready to mate; the chosen mate is always one). Positive when mates are chosen on rank.
// - `eval.mate_hunter_lean`: the `canHunt` share of the matings minus the `canHunt` share of the other adults ready to
//   mate at those matings; negative when grazers are favoured.
//
// The percentile is the sim's mate rank (js/sim/mate-rank.js, the `rank` score whatever the world's `mateRank` is),
// computed here on demand and fresh, for the chosen mate and the candidates, by the same functions the sim's pass uses.
// Per-slot arrays only.

import { isReadyToMate } from '../sim/mate-eligibility.js';
import { fillScores, percentileInto } from '../sim/mate-rank.js';
import { none, ok } from './metrics-stats.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { findAlive } from './observer-intent.js';

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} an empty scene
 */
export function createMateScene(config) {
    return {
        wasPregnant: new Uint8Array(config.maxAgents),
        scores: new Float64Array(config.maxAgents),
        percentiles: new Float64Array(config.maxAgents),
        gapSum: 0,
        gapCount: 0,
        matings: 0,
        hunterMatings: 0,
        readyAdults: 0,
        readyHunters: 0,
    };
}

/**
 * @param {Record<string, any>} scene the mate scene
 * @param {number} slot the slot of a born or dead agent
 * @returns {void}
 */
export function resetMateSlot(scene, slot) {
    scene.wasPregnant[slot] = 0;
}

/**
 * @param {Record<string, any>} world the world
 * @param {{mother: number, other: number, father: number}} pair the mother, a candidate and the chosen father
 * @returns {boolean} whether the candidate is one the mother could have chosen
 */
function isCandidate(world, { mother, other, father }) {
    const dx = world.x[other] - world.x[mother];
    const dy = world.y[other] - world.y[mother];
    const reach = world.size[mother] + world.size[other] + world.config.mateRange;
    const sexOk = world.sex[other] !== world.sex[mother];
    const near = Math.sqrt(dx * dx + dy * dy) < reach;
    return (
        world.alive[other] === 1 &&
        other !== mother &&
        world.spec[other] === world.spec[mother] &&
        sexOk &&
        near &&
        (other === father || isReadyToMate(world, other))
    );
}

/**
 * Notes one mating: the percentile gap, and the ready adults' hunter share.
 * @param {Record<string, any>} scene the mate scene
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @param {number} mother the new mother's slot
 * @returns {void}
 */
function noteMating(scene, observer, world, mother) {
    const father = findAlive(world, observer.slotOf, world.fatherId[mother]);
    const { hunterSpec } = observer.intent;
    fillScores(world, scene.scores, 'rank');
    let candidates = 0;
    let percentiles = 0;
    for (let other = 0; other < world.alive.length; other++) {
        if (world.alive[other] === 1 && other !== mother && isReadyToMate(world, other)) {
            scene.readyAdults += 1;
            scene.readyHunters += hunterSpec[world.spec[other]];
        }
        if (isCandidate(world, { mother, other, father })) {
            candidates += 1;
            percentileInto(world, scene.scores, { slot: other, out: scene.percentiles });
            percentiles += scene.percentiles[other];
        }
    }
    scene.matings += 1;
    scene.hunterMatings += hunterSpec[world.spec[mother]];
    if (father >= 0 && candidates > 0) {
        percentileInto(world, scene.scores, { slot: father, out: scene.percentiles });
        scene.gapSum += scene.percentiles[father] - percentiles / candidates;
        scene.gapCount += 1;
    }
}

/**
 * Notes the matings that started this tick (a mother newly pregnant) at or after burn-in.
 * @param {Record<string, any>} scene the mate scene
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function trackMatings(scene, observer, world) {
    for (let slot = 0; slot < world.alive.length; slot++) {
        const pregnant = world.alive[slot] === 1 && world.pregnancy[slot] > 0 ? 1 : 0;
        if (pregnant === 1 && scene.wasPregnant[slot] === 0 && world.tick >= BURN_IN_TICKS) {
            noteMating(scene, observer, world, slot);
        }
        scene.wasPregnant[slot] = pregnant;
    }
}

/**
 * @param {Record<string, any>} scene the mate scene
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the two mate metrics
 */
export function mateMetrics(scene) {
    const lean =
        scene.matings > 0 && scene.readyAdults > 0
            ? ok(scene.hunterMatings / scene.matings - scene.readyHunters / scene.readyAdults)
            : none('no mating with a ready adult in view after burn-in');
    return {
        'eval.mate_skill_gap':
            scene.gapCount > 0 ? ok(scene.gapSum / scene.gapCount) : none('no mating with a chosen mate after burn-in'),
        'eval.mate_hunter_lean': lean,
    };
}
