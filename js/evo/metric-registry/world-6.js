// Registry entries of the world family (part 6): the body-gene spread in gene units (docs/designs/body-genes.md, T15; E274).
// Beside `eval.gene_spread.<trait>`, which stays: that one is in ratio units and the span caps it.

import { entry } from './entry.js';

/** The fields every `eval.gene_sd.<trait>` entry shares. */
/** @type {{module: string, unit: string, intended: 'higher', direction: 'watch', nullWhen: string[], arithmetic: string, source: string}} */
const SD = {
    module: 'js/evo/scene-genes.js',
    unit: 'gene',
    intended: 'higher',
    direction: 'watch',
    nullWhen: ['no 1000-tick checkpoint after burn-in with a spec that has the trait in its menu and two agents alive'],
    arithmetic: 'test/evo/scene-genes.test.js',
    source: 'test/evo/metric-source-genes.test.js',
};

/** Why a new trait's entry is null at the defaults (metric-noise T27, E276). */
const NEW_TRAIT_FLAT =
    'null at the defaults: body-genes T18b keeps the new trait spans at 0, so no spec has the trait in its menu';

export const WORLD_6 = {
    'eval.gene_sd.size': entry('world', {
        ...SD,
        meaning:
            'How far apart the size genes of one spec sit, before the span scales them; 0 is a population of clones, 1.47 is the gene of an edge.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the size gene (before span x tanh) over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_sd.vision': entry('world', {
        ...SD,
        meaning:
            'How far apart the vision genes of one spec sit, before the span scales them; 0 is a population of clones, 1.47 is the gene of an edge.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the vision gene (before span x tanh) over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_sd.childShare': entry('world', {
        ...SD,
        meaning:
            'How far apart the childShare genes of one spec sit, before the span scales them; 0 is a population of clones, 1.47 is the gene of an edge.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the childShare gene (before span x tanh) over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_sd.speed': entry('world', {
        ...SD,
        expectedFlat: NEW_TRAIT_FLAT,
        meaning:
            'How far apart the speed genes of one spec sit, before the span scales them; 0 is a population of clones, 1.47 is the gene of an edge.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the speed gene (before span x tanh) over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_sd.sprintStore': entry('world', {
        ...SD,
        expectedFlat: NEW_TRAIT_FLAT,
        meaning:
            'How far apart the sprintStore genes of one spec sit, before the span scales them; 0 is a population of clones, 1.47 is the gene of an edge.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the sprintStore gene (before span x tanh) over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_sd.fat': entry('world', {
        ...SD,
        expectedFlat: NEW_TRAIT_FLAT,
        meaning:
            'How far apart the fat genes of one spec sit, before the span scales them; 0 is a population of clones, 1.47 is the gene of an edge.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the fat gene (before span x tanh) over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_sd.heatBand': entry('world', {
        ...SD,
        expectedFlat: NEW_TRAIT_FLAT,
        meaning:
            'How far apart the heatBand genes of one spec sit, before the span scales them; 0 is a population of clones, 1.47 is the gene of an edge.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the heatBand gene (before span x tanh) over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_sd.burn': entry('world', {
        ...SD,
        expectedFlat: NEW_TRAIT_FLAT,
        meaning:
            'How far apart the burn genes of one spec sit, before the span scales them; 0 is a population of clones, 1.47 is the gene of an edge.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the burn gene (before span x tanh) over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_sd.hearing': entry('world', {
        ...SD,
        expectedFlat: NEW_TRAIT_FLAT,
        meaning:
            'How far apart the hearing genes of one spec sit, before the span scales them; 0 is a population of clones, 1.47 is the gene of an edge.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the hearing gene (before span x tanh) over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_sd.nose': entry('world', {
        ...SD,
        expectedFlat: NEW_TRAIT_FLAT,
        meaning:
            'How far apart the nose genes of one spec sit, before the span scales them; 0 is a population of clones, 1.47 is the gene of an edge.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the nose gene (before span x tanh) over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_sd.smokeSight': entry('world', {
        ...SD,
        expectedFlat: NEW_TRAIT_FLAT,
        meaning:
            'How far apart the smokeSight genes of one spec sit, before the span scales them; 0 is a population of clones, 1.47 is the gene of an edge.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the smokeSight gene (before span x tanh) over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_sd.eyesOrEars': entry('world', {
        ...SD,
        expectedFlat: NEW_TRAIT_FLAT,
        meaning:
            'How far apart the eyesOrEars genes of one spec sit, before the span scales them; 0 is a population of clones, 1.47 is the gene of an edge.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the eyesOrEars gene (before span x tanh) over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_sd.clearOrSmoke': entry('world', {
        ...SD,
        expectedFlat: NEW_TRAIT_FLAT,
        meaning:
            'How far apart the clearOrSmoke genes of one spec sit, before the span scales them; 0 is a population of clones, 1.47 is the gene of an edge.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the clearOrSmoke gene (before span x tanh) over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_sd.agileOrFast': entry('world', {
        ...SD,
        expectedFlat: NEW_TRAIT_FLAT,
        meaning:
            'How far apart the agileOrFast genes of one spec sit, before the span scales them; 0 is a population of clones, 1.47 is the gene of an edge.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the agileOrFast gene (before span x tanh) over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_sd.wideOrFar': entry('world', {
        ...SD,
        expectedFlat: NEW_TRAIT_FLAT,
        meaning:
            'How far apart the wideOrFar genes of one spec sit, before the span scales them; 0 is a population of clones, 1.47 is the gene of an edge.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the wideOrFar gene (before span x tanh) over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_sd.gut': entry('world', {
        ...SD,
        expectedFlat: NEW_TRAIT_FLAT,
        meaning:
            'How far apart the gut genes of one spec sit, before the span scales them; 0 is a population of clones, 1.47 is the gene of an edge.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the gut gene (before span x tanh) over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
    'eval.gene_sd.nerve': entry('world', {
        ...SD,
        expectedFlat: NEW_TRAIT_FLAT,
        meaning:
            'How far apart the nerve genes of one spec sit, before the span scales them; 0 is a population of clones, 1.47 is the gene of an edge.',
        counts: 'At each 1000-tick checkpoint after burn-in, the standard deviation of the nerve gene (before span x tanh) over the living agents of a spec, averaged over the specs whose menu holds the trait and have two agents alive, then over the checkpoints.',
    }),
};
