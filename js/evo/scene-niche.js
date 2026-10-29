// Rule 1, the diversity bonus (natural-selection.md, Detectors): `eval.niche_replacement`. At each 1000-tick
// checkpoint from `BURN_IN_TICKS`, the alive agents are placed in the cells of the `v6` descriptor (the deliberate share
// of intake against the body plan, the cell of the agent's specialisation's grid) and the lineages in the rarest quarter
// of the occupied cells are noted: the cells sorted by agent count, ties to the lower cell, the first
// `ceil(occupied / 4)`. At the next checkpoint the metric counts how many of those lineages had a child mature in
// between (an agent whose `ageTicks` reached `maturityTicks` and that has parents): the share with a matured child.
// Per-cell counts are preallocated; a checkpoint allocates its lineage set, once per 1000 ticks.

import { cellOf } from './archive.js';
import { bodyPlanOf, roleSkillOf } from './descriptors.js';
import { chanceIntake, deliberateIntake } from './fitness-v6-skill.js';
import { SPEC_RADIX } from './hunter-table.js';
import { none, ok } from './metrics-stats.js';

const CELLS = 100;

/**
 * @returns {Record<string, any>} an empty scene: the cell counts, the rare lineages and those with a matured child
 */
export function createNicheScene() {
    return {
        counts: new Int32Array(SPEC_RADIX * CELLS),
        rare: new Set(),
        matured: new Set(),
        eligible: 0,
        replaced: 0,
    };
}

/**
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive slot
 * @returns {number} the slot's cell among all specialisations' grids
 */
function cellId(observer, world, slot) {
    const skill = roleSkillOf(deliberateIntake(observer.intent, slot), chanceIntake(observer.intent, slot));
    const body = bodyPlanOf(observer.sizeTrait[slot], observer.visionTrait[slot], world.config.traitsEnabled);
    return world.spec[slot] * CELLS + cellOf(skill, body);
}

/**
 * Notes a child that has just matured when its lineage is one of the rare ones.
 * @param {Record<string, any>} scene the niche scene
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive slot whose `ageTicks` equals `maturityTicks`
 * @returns {void}
 */
export function noteNicheMatured(scene, observer, world, slot) {
    if (scene.rare.size > 0 && observer.parentGenomeA[slot] !== 0 && scene.rare.has(world.lineageId[slot])) {
        scene.matured.add(world.lineageId[slot]);
    }
}

/**
 * @param {Int32Array} counts the agents per cell
 * @returns {Set<number>} the cells in the rarest quarter of the occupied ones
 */
function rarestCells(counts) {
    const occupied = [];
    for (let cell = 0; cell < counts.length; cell++) {
        if (counts[cell] > 0) {
            occupied.push(cell);
        }
    }
    occupied.sort((a, b) => counts[a] - counts[b] || a - b);
    return new Set(occupied.slice(0, Math.ceil(occupied.length / 4)));
}

/**
 * Closes the last checkpoint's account and opens the next: call at each 1000-tick checkpoint at or after burn-in.
 * @param {Record<string, any>} scene the niche scene
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function checkpointNiche(scene, observer, world) {
    scene.eligible += scene.rare.size;
    scene.replaced += scene.matured.size;
    scene.matured.clear();
    scene.rare.clear();
    scene.counts.fill(0);
    for (let slot = 0; slot < world.alive.length; slot++) {
        scene.counts[world.alive[slot] === 1 ? cellId(observer, world, slot) : 0] += world.alive[slot];
    }
    const rare = rarestCells(scene.counts);
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1 && rare.has(cellId(observer, world, slot))) {
            scene.rare.add(world.lineageId[slot]);
        }
    }
}

/**
 * @param {Record<string, any>} scene the niche scene
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} `eval.niche_replacement`
 */
export function nicheMetrics(scene) {
    const reason = 'no rare-niche lineage followed to a next checkpoint after burn-in';
    return { 'eval.niche_replacement': scene.eligible > 0 ? ok(scene.replaced / scene.eligible) : none(reason) };
}
