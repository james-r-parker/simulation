// Registry entries of the world family (part 5): the body-gene detectors (docs/designs/body-genes.md, T9).

import { entry } from './entry.js';

/** The fields every `eval.gene_spread.<trait>` entry shares. */
const SPREAD = {
    module: 'js/evo/scene-genes.js',
    unit: 'ratio',
    intended: 'higher',
    direction: 'watch',
    nullWhen: ['no 1000-tick checkpoint after burn-in with a spec that has the trait in its menu and two agents alive'],
    arithmetic: 'test/evo/scene-genes.test.js',
    source: 'test/evo/metric-source-genes.test.js',
};

export const WORLD_5 = {
    'eval.gene_spread.size': entry('world', {
        ...SPREAD,
        meaning: 'How much the size ratio differs between bodies of one spec; 0 is a population of clones.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the size ratio over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_spread.vision': entry('world', {
        ...SPREAD,
        meaning: 'How much the vision ratio differs between bodies of one spec; 0 is a population of clones.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the vision ratio over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_spread.childShare': entry('world', {
        ...SPREAD,
        meaning: 'How much the childShare ratio differs between bodies of one spec; 0 is a population of clones.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the childShare ratio over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_spread.learn': entry('world', {
        ...SPREAD,
        meaning: 'How much the learn gene differs between bodies of one spec; 0 is a population of clones.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the learn gene over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_spread.speed': entry('world', {
        ...SPREAD,
        meaning: 'How much the speed ratio differs between bodies of one spec; 0 is a population of clones.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the speed ratio over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_spread.sprintStore': entry('world', {
        ...SPREAD,
        meaning: 'How much the sprintStore ratio differs between bodies of one spec; 0 is a population of clones.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the sprintStore ratio over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_spread.fat': entry('world', {
        ...SPREAD,
        meaning: 'How much the fat ratio differs between bodies of one spec; 0 is a population of clones.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the fat ratio over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_spread.heatBand': entry('world', {
        ...SPREAD,
        meaning: 'How much the heatBand shift differs between bodies of one spec; 0 is a population of clones.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the heatBand shift over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_spread.burn': entry('world', {
        ...SPREAD,
        meaning: 'How much the burn ratio differs between bodies of one spec; 0 is a population of clones.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the burn ratio over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_spread.hearing': entry('world', {
        ...SPREAD,
        meaning: 'How much the hearing ratio differs between bodies of one spec; 0 is a population of clones.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the hearing ratio over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_spread.nose': entry('world', {
        ...SPREAD,
        meaning: 'How much the nose ratio differs between bodies of one spec; 0 is a population of clones.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the nose ratio over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_spread.smokeSight': entry('world', {
        ...SPREAD,
        meaning: 'How much the smokeSight ratio differs between bodies of one spec; 0 is a population of clones.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the smokeSight ratio over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_spread.eyesOrEars': entry('world', {
        ...SPREAD,
        meaning: 'How much the eyesOrEars ratio differs between bodies of one spec; 0 is a population of clones.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the eyesOrEars ratio over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_spread.clearOrSmoke': entry('world', {
        ...SPREAD,
        meaning: 'How much the clearOrSmoke ratio differs between bodies of one spec; 0 is a population of clones.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the clearOrSmoke ratio over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_spread.agileOrFast': entry('world', {
        ...SPREAD,
        meaning: 'How much the agileOrFast ratio differs between bodies of one spec; 0 is a population of clones.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the agileOrFast ratio over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_spread.wideOrFar': entry('world', {
        ...SPREAD,
        meaning: 'How much the wideOrFar ratio differs between bodies of one spec; 0 is a population of clones.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the wideOrFar ratio over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_spread.gut': entry('world', {
        ...SPREAD,
        meaning: 'How much the gut ratio differs between bodies of one spec; 0 is a population of clones.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the gut ratio over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_spread.nerve': entry('world', {
        ...SPREAD,
        meaning: 'How much the nerve ratio differs between bodies of one spec; 0 is a population of clones.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the nerve ratio over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_edge_share': entry('world', {
        module: 'js/evo/scene-genes.js',
        meaning:
            'Over 0.3 means a menu is too narrow or a cost too weak: many bodies sit at the edge of what their gene may give.',
        counts: 'At each 1000-tick checkpoint after burn-in, the share of living agents with a menu (a non-raw trait with a span above 0) that have any menu gene at or beyond 90% of its span (|tanh(gene)| of 0.9 or more), averaged over the checkpoints.',
        unit: 'share',
        direction: 'watch',
        intended: 'lower',
        nullWhen: ['no agent with a menu (every span is 0) at a checkpoint after burn-in'],
        arithmetic: 'test/evo/scene-genes.test.js',
        source: 'test/evo/metric-source-genes.test.js',
    }),
};
