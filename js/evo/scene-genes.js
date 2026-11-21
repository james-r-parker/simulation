// How far apart are the bodies, and do they pile up at the edge of their menu (body-genes.md, Detectors, T9)? Read at the
// 1000-tick checkpoints from `BURN_IN_TICKS`, from the genes of the living agents. Detectors only, never fitness.
//
// - `eval.gene_spread.<trait>` (watch) for every entry of `TRAITS`: the standard deviation (over the agents, not a sample
//   estimate) of the trait's ratio inside one spec, averaged over the specs whose menu holds the trait (a span above 0)
//   and have two agents alive, then averaged over the checkpoints. A `raw` trait (`learn`) reads its gene, an `offset`
//   trait (`heatBand`) its shift. Null when no checkpoint has such a spec. The names avoid `eval.trait_spread`, which stays
//   the spread of the four original genes.
// - `eval.gene_edge_share` (watch): the share of living agents, among those with a menu (any non-raw trait with a span
//   above 0), with any menu gene at or beyond `EDGE_SHARE` of its span (|tanh(gene)| at or above 0.9; a `raw` trait has no
//   span and is not read), averaged over the checkpoints: a menu that is too narrow or a cost that is too weak. Null with
//   no agent that has a menu.
//
// A checkpoint is one pass over the agent slots and the trait list, into scratch tallies made once; nothing is allocated
// per tick. The scene reads the world and writes only itself, so no hash can move. `genesSummary` is the same reading as
// one `BodyGenesSummary`, for the eval log.

import { TRAIT_SLOTS } from '../sim/brain-layout.js';
import { TRAITS, traitRatio } from '../sim/body-traits.js';
import { detTanh } from '../sim/det-math.js';
import { SPEC_COUNT } from '../sim/specs.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { bySuffix, none, ok } from './metrics-stats.js';

/** The share of its span at which a menu gene counts as at the edge. */
export const EDGE_SHARE = 0.9;

/** Ticks between the checkpoints (the 1000-tick checkpoint every scene shares). */
const CHECKPOINT_TICKS = 1000;

const TRAIT_COUNT = TRAITS.length;
const NO_SAMPLE =
    'no 1000-tick checkpoint after burn-in with a spec that has the trait in its menu and two agents alive';
const NO_MENU = 'no agent with a menu (every span is 0) at a checkpoint after burn-in';

/**
 * @typedef {object} BodyGenesSummary the genes of a run, read at its checkpoints after burn-in
 * @property {number} checkpoints how many checkpoints were read
 * @property {Record<string, number | null>} spread by trait name: the mean within-spec standard deviation of the ratio;
 *   null when no checkpoint had a spec with the trait in its menu and two agents alive
 * @property {number | null} edgeShare the mean share of agents with a menu that sit at the edge of it; null with none
 */

/**
 * @returns {Record<string, any>} an empty genes scene: the running sums of the spread of each trait and of the edge
 *   share, and the scratch tallies of one checkpoint
 */
export function createGenesScene() {
    return {
        checkpoints: 0,
        spreadSum: new Float64Array(TRAIT_COUNT),
        spreadCount: new Float64Array(TRAIT_COUNT),
        edgeSum: 0,
        edgeCount: 0,
        agents: new Float64Array(SPEC_COUNT),
        sum: new Float64Array(SPEC_COUNT * TRAIT_COUNT),
        sumSq: new Float64Array(SPEC_COUNT * TRAIT_COUNT),
    };
}

/**
 * @param {Float64Array} traitSpans every spec's span for every trait slot
 * @param {number} spec a spec
 * @param {Readonly<import('../sim/body-traits.js').Trait>} trait a trait
 * @returns {boolean} whether the spec's menu holds the trait (a `raw` trait is always read)
 */
function inMenu(traitSpans, spec, trait) {
    return trait.kind === 'raw' || traitSpans[spec * TRAIT_SLOTS + trait.index] > 0;
}

/**
 * Tallies one agent into the scratch: its spec's count, and the sum and sum of squares of each menu trait's ratio.
 * @param {Record<string, any>} scene the genes scene
 * @param {Record<string, any>} world the world
 * @param {number} slot a living agent
 * @returns {{menu: boolean, edge: boolean}} whether the agent has a menu, and any menu gene at the edge of its span
 */
function tallyAgent(scene, world, slot) {
    const { layout, weights, traitSpans } = world;
    const spec = world.spec[slot];
    const genes = slot * layout.weightCount + layout.traitStart;
    scene.agents[spec]++;
    let menu = false;
    let edge = false;
    for (let t = 0; t < TRAIT_COUNT; t++) {
        const trait = TRAITS[t];
        if (!inMenu(traitSpans, spec, trait)) {
            continue;
        }
        const gene = weights[genes + trait.index];
        const value =
            trait.kind === 'raw' ? gene : traitRatio(trait, gene, traitSpans[spec * TRAIT_SLOTS + trait.index]);
        scene.sum[spec * TRAIT_COUNT + t] += value;
        scene.sumSq[spec * TRAIT_COUNT + t] += value * value;
        if (trait.kind !== 'raw') {
            menu = true;
            edge = edge || Math.abs(detTanh(gene)) >= EDGE_SHARE;
        }
    }
    return { menu, edge };
}

/**
 * Adds this checkpoint's mean within-spec standard deviation of each trait to the running sums.
 * @param {Record<string, any>} scene the genes scene
 * @param {Float64Array} traitSpans every spec's span for every trait slot
 * @returns {void}
 */
function addSpread(scene, traitSpans) {
    for (let t = 0; t < TRAIT_COUNT; t++) {
        let total = 0;
        let specs = 0;
        for (let spec = 0; spec < SPEC_COUNT; spec++) {
            const n = scene.agents[spec];
            if (n >= 2 && inMenu(traitSpans, spec, TRAITS[t])) {
                const mean = scene.sum[spec * TRAIT_COUNT + t] / n;
                total += Math.sqrt(Math.max(0, scene.sumSq[spec * TRAIT_COUNT + t] / n - mean * mean));
                specs++;
            }
        }
        if (specs > 0) {
            scene.spreadSum[t] += total / specs;
            scene.spreadCount[t]++;
        }
    }
}

/**
 * Takes the checkpoint at the world's tick, if it is a 1000-tick checkpoint at or after burn-in.
 * @param {Record<string, any>} scene the genes scene
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleGenes(scene, world) {
    if (world.tick < BURN_IN_TICKS || world.tick % CHECKPOINT_TICKS !== 0) {
        return;
    }
    scene.agents.fill(0);
    scene.sum.fill(0);
    scene.sumSq.fill(0);
    let menus = 0;
    let edges = 0;
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1) {
            const { menu, edge } = tallyAgent(scene, world, slot);
            menus += menu ? 1 : 0;
            edges += edge ? 1 : 0;
        }
    }
    scene.checkpoints++;
    if (menus > 0) {
        scene.edgeSum += edges / menus;
        scene.edgeCount++;
    }
    addSpread(scene, world.traitSpans);
}

/**
 * @param {Record<string, any>} scene the genes scene
 * @returns {BodyGenesSummary} the run's genes so far
 */
export function genesSummary(scene) {
    /** @type {Record<string, number | null>} */
    const spread = {};
    TRAITS.forEach((trait, t) => {
        spread[trait.name] = scene.spreadCount[t] === 0 ? null : scene.spreadSum[t] / scene.spreadCount[t];
    });
    return {
        checkpoints: scene.checkpoints,
        spread,
        edgeShare: scene.edgeCount === 0 ? null : scene.edgeSum / scene.edgeCount,
    };
}

/**
 * @param {Record<string, any>} scene the genes scene
 * @returns {import('./metrics-stats.js').MetricRecord} the spread of each trait and the edge share
 */
export function genesMetrics(scene) {
    const summary = genesSummary(scene);
    const names = TRAITS.map((trait) => trait.name);
    return {
        ...bySuffix('eval.gene_spread', names, (t) => {
            const value = summary.spread[names[t]];
            return value === null ? none(NO_SAMPLE) : ok(value);
        }),
        'eval.gene_edge_share': summary.edgeShare === null ? none(NO_MENU) : ok(summary.edgeShare),
    };
}

/** @type {import('./observer-detectors.js').Detector} */
export const genesDetector = {
    name: 'genes',
    modules: ['js/evo/scene-genes.js'],
    every: 1000,
    create: () => createGenesScene(),
    onTick: (scene, world) => sampleGenes(scene, world),
    metrics: (scene) => genesMetrics(scene),
};
