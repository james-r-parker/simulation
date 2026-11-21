// The body-gene metrics in a real world (docs/designs/metric-trust.md, "Source tests"; body-genes.md, T9): the real `step`
// and `observe` run a planted pair of agents. Their trait genes are written into the weight rows; the metric reads them back
// at the first checkpoint after burn-in, through the world's own span table and `traitRatio`.

import { describe, expect, it } from 'vitest';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { TRAIT_INDEX } from '../../js/sim/brain-layout.js';
import { detTanh } from '../../js/sim/det-math.js';
import { sourceRun } from './helpers/source-world.js';

/** Every metric the detector reports, written out so the registry test finds each name in this file. */
const NAMES = [
    'eval.gene_spread.size',
    'eval.gene_spread.vision',
    'eval.gene_spread.childShare',
    'eval.gene_spread.learn',
    'eval.gene_spread.speed',
    'eval.gene_spread.sprintStore',
    'eval.gene_spread.fat',
    'eval.gene_spread.heatBand',
    'eval.gene_spread.burn',
    'eval.gene_spread.hearing',
    'eval.gene_spread.nose',
    'eval.gene_spread.smokeSight',
    'eval.gene_spread.eyesOrEars',
    'eval.gene_spread.clearOrSmoke',
    'eval.gene_spread.agileOrFast',
    'eval.gene_spread.wideOrFar',
    'eval.gene_spread.gut',
    'eval.gene_spread.nerve',
    'eval.gene_edge_share',
];

/**
 * Spawns two foragers with the given size genes and runs to the first checkpoint after burn-in.
 * @param {[number, number]} genes the two agents' size genes
 * @param {Record<string, any>} [over] config overrides
 * @returns {Record<string, any>} the metrics
 */
function planted(genes, over = {}) {
    const run = sourceRun({ over });
    const { world } = run;
    const slots = [run.spawn(), run.spawn()];
    slots.forEach((slot, k) => {
        world.weights[slot * world.layout.weightCount + world.layout.traitStart + TRAIT_INDEX.SIZE] = genes[k];
        world.energy[slot] = 500;
    });
    run.jump(BURN_IN_TICKS - 1);
    run.tick();
    return run.metrics();
}

describe('eval.gene_spread.size and eval.gene_edge_share in a planted world', () => {
    const MENU = { specialisations: { forager: { genes: { size: 0.2 } } } };

    it('reads the spread of the planted ratios, and 0 edge share inside the span', () => {
        const metrics = planted([0.5, -0.5], MENU);
        expect(metrics['eval.gene_spread.size']?.value).toBeCloseTo(0.2 * detTanh(0.5), 5);
        expect(metrics['eval.gene_edge_share']?.value).toBe(0);
    });

    it('reads an edge share of 1 when every agent with a menu has a gene at the edge', () => {
        const metrics = planted([3, -3], { specialisations: { forager: { genes: { size: 0.2 } } } });
        expect(metrics['eval.gene_spread.size']?.value).toBeCloseTo(0.2 * detTanh(3), 5);
        expect(metrics['eval.gene_edge_share']?.value).toBe(1);
    });

    it('reads null for a trait that is in no menu', () => {
        const metrics = planted([0.5, -0.5], MENU);
        expect(metrics['eval.gene_spread.sprintStore']?.value).toBeNull();
    });

    it('reports every gene metric of the registry in the real report', () => {
        const metrics = planted([0.5, -0.5], MENU);
        for (const name of NAMES) {
            expect(Object.hasOwn(metrics, name), name).toBe(true);
        }
    });
});
