// Pack lift and prey size at pack kills (training-stages.md, Detectors).
//
// A hunter kill is a pack kill when the previous biter inside `packWindow` is a hunter of the killer's lineage (`killKind`
// in `observer-combat.js`). Two hunters of one lineage often stand together because kin live near each other, so a
// count of pack kills alone does not say they hunted together. `eval.pack_lift` compares it with the count a lineage mix
// alone gives:
//
// - a paired kill is a hunter kill whose previous biter is a known hunter (of any lineage);
// - under independence the previous biter is of the killer's lineage with the probability of that lineage's share of
//   all hunter bites in the run, so the expected pack kills are the sum, over paired kills, of the killer lineage's share;
// - the lift is the pack kills over that sum: 1 when the pairing is the mix, above 1 when kin bite the same prey more
//   than their share.
//
// `eval.pack_prey_size_ratio`: the mean `size` of the victims of pack kills over that of the victims of the other hunter
// kills. Counts come from bites and deaths at or after `BURN_IN_TICKS`. A tracked lineage costs one Map entry the first
// time it bites; nothing is allocated per tick.

import { BURN_IN_TICKS } from './burn-in.js';
import { none, ok } from './metrics-stats.js';
import { KILL, killKind } from './observer-combat.js';
import { SPEC_RADIX } from './hunter-table.js';
import { createKeyed, rowOf } from './scene-keyed.js';

/** Fewest paired kills for `eval.pack_lift`. */
export const MIN_PAIRED_KILLS = 30;

/** Fewest pack kills, and fewest other kills, for `eval.pack_prey_size_ratio`. */
export const MIN_SIZE_KILLS = 10;

/**
 * @returns {Record<string, any>} an empty pack-lift scene: per lineage the hunter bites and the paired kills, and the
 *   pack and solo kill counts with the sum of their victims' sizes
 */
export function createPackLiftScene() {
    return {
        lineages: createKeyed(['bites', 'paired']),
        bites: 0,
        packKills: 0,
        soloKills: 0,
        packSize: 0,
        soloSize: 0,
    };
}

/**
 * @param {Record<string, any>} scene the pack-lift scene
 * @param {number} lineage the biter's lineage
 * @returns {void}
 */
function addBite(scene, lineage) {
    const { lineages } = scene;
    const row = rowOf(lineages, lineage);
    lineages.log.bites[row] += 1;
    scene.bites += 1;
}

/**
 * Counts a hunter's bite on a live victim, by the biter's lineage (the approach scene's bite hook).
 * @param {Record<string, any>} scene the pack-lift scene
 * @param {Record<string, any>} world the world
 * @param {number} biter the biter's slot
 * @returns {void}
 */
export function notePackBite(scene, world, biter) {
    if (world.tick >= BURN_IN_TICKS && world.huntBySpec[world.spec[biter]] === 1) {
        addBite(scene, world.lineageId[biter]);
    }
}

/**
 * Notes an eaten death: a hunter kill is a bite (the fatal one no tick sees on a live victim), and a pack or a solo kill
 * with the victim's size. Call before the victim's slot is reset.
 * @param {Record<string, any>} scene the pack-lift scene
 * @param {Record<string, any>} observer the observer
 * @param {{world: Record<string, any>, victim: number, killer: number, previous: number}} death the world, the victim's
 *   slot, and the genome ids of the killer and of the previous biter (0 for none)
 * @returns {void}
 */
export function notePackKill(scene, observer, { world, victim, killer, previous }) {
    if (world.tick < BURN_IN_TICKS) {
        return;
    }
    const { combat } = observer;
    const kind = killKind(combat, killer, previous);
    if (kind === KILL.NONE) {
        return;
    }
    const lineage = Math.floor(combat.knownAgents.get(killer) / SPEC_RADIX);
    addBite(scene, lineage);
    if (
        previous !== 0 &&
        combat.knownAgents.has(previous) &&
        combat.hunterSpec[combat.knownAgents.get(previous) % SPEC_RADIX] === 1
    ) {
        const row = rowOf(scene.lineages, lineage);
        scene.lineages.log.paired[row] += 1;
    }
    if (kind === KILL.PACK) {
        scene.packKills += 1;
        scene.packSize += world.size[victim];
    } else {
        scene.soloKills += 1;
        scene.soloSize += world.size[victim];
    }
}

/**
 * @param {Record<string, any>} scene the pack-lift scene
 * @returns {{paired: number, expected: number}} the paired kills and the pack kills the lineage mix alone expects
 */
function expectedPacks(scene) {
    const { rows, log } = scene.lineages;
    let paired = 0;
    let expected = 0;
    for (let row = 0; row < rows; row++) {
        paired += log.paired[row];
        expected += (log.paired[row] * log.bites[row]) / scene.bites;
    }
    return { paired, expected };
}

/**
 * @param {Record<string, any>} scene the pack-lift scene
 * @returns {import('./metrics-stats.js').MetricRecord} `eval.pack_lift` and `eval.pack_prey_size_ratio`
 */
export function packLiftMetrics(scene) {
    const { paired, expected } = expectedPacks(scene);
    const lift =
        paired >= MIN_PAIRED_KILLS && expected > 0
            ? ok(scene.packKills / expected)
            : none(`under ${MIN_PAIRED_KILLS} hunter kills with a hunter as the previous biter`);
    const enough = scene.packKills >= MIN_SIZE_KILLS && scene.soloKills >= MIN_SIZE_KILLS;
    const ratio =
        enough && scene.soloSize > 0
            ? ok(scene.packSize / scene.packKills / (scene.soloSize / scene.soloKills))
            : none(`under ${MIN_SIZE_KILLS} pack kills or under ${MIN_SIZE_KILLS} solo kills`);
    return { 'eval.pack_lift': lift, 'eval.pack_prey_size_ratio': ratio };
}
