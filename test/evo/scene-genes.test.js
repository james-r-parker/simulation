// The body-gene detectors (body-genes.md, T9): the arithmetic, against hand-built state.

import { describe, expect, it } from 'vitest';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import {
    createGenesScene,
    EDGE_SHARE,
    genesDetector,
    genesMetrics,
    genesSummary,
    sampleGenes,
} from '../../js/evo/scene-genes.js';
import { TRAITS } from '../../js/sim/body-traits.js';
import { TRAIT_INDEX as INDEX, TRAIT_SLOTS } from '../../js/sim/brain-layout.js';
import { detTanh } from '../../js/sim/det-math.js';
import { SPEC_COUNT } from '../../js/sim/specs.js';
import { directionOf, intendedOf, loose, namesOf } from './helpers/metric-registry.js';

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
    'eval.gene_sd.size',
    'eval.gene_sd.vision',
    'eval.gene_sd.childShare',
    'eval.gene_sd.speed',
    'eval.gene_sd.sprintStore',
    'eval.gene_sd.fat',
    'eval.gene_sd.heatBand',
    'eval.gene_sd.burn',
    'eval.gene_sd.hearing',
    'eval.gene_sd.nose',
    'eval.gene_sd.smokeSight',
    'eval.gene_sd.eyesOrEars',
    'eval.gene_sd.clearOrSmoke',
    'eval.gene_sd.agileOrFast',
    'eval.gene_sd.wideOrFar',
    'eval.gene_sd.gut',
    'eval.gene_sd.nerve',
];

const WEIGHTS = 40;
const TRAIT_START = 10;
const SIZE = INDEX.SIZE;
const SPEED = INDEX.SPEED;

/**
 * A world with the given agents. Slot `i` is `agents[i]`: its spec and its trait genes by trait index. `spans` is the
 * menu: spec to trait index to span.
 * @param {{spec: number, genes?: Record<number, number>}[]} agents the living agents
 * @param {Record<number, Record<number, number>>} spans the menu
 * @param {number} [tick] the world's tick
 * @returns {Record<string, any>} the world
 */
function world(agents, spans, tick = BURN_IN_TICKS) {
    const w = {
        tick,
        layout: { weightCount: WEIGHTS, traitStart: TRAIT_START },
        weights: new Float32Array(WEIGHTS * (agents.length + 1)),
        alive: new Uint8Array(agents.length + 1),
        spec: new Uint8Array(agents.length + 1),
        traitSpans: new Float64Array(SPEC_COUNT * TRAIT_SLOTS),
    };
    agents.forEach(({ spec, genes = {} }, slot) => {
        w.alive[slot] = 1;
        w.spec[slot] = spec;
        for (const [index, gene] of Object.entries(genes)) {
            w.weights[slot * WEIGHTS + TRAIT_START + Number(index)] = gene;
        }
    });
    for (const [spec, menu] of Object.entries(spans)) {
        for (const [index, span] of Object.entries(menu)) {
            w.traitSpans[Number(spec) * TRAIT_SLOTS + Number(index)] = span;
        }
    }
    return w;
}

/** @param {Record<string, any>} scene @param {string} name @returns {number | null | undefined} the metric's value */
function read(scene, name) {
    return loose(genesMetrics(scene))[name]?.value;
}

describe('eval.gene_spread.<trait>', () => {
    it('is the standard deviation of the ratio inside a spec that has the trait in its menu', () => {
        const scene = createGenesScene();
        sampleGenes(
            scene,
            world(
                [
                    { spec: 0, genes: { [SIZE]: 0.5 } },
                    { spec: 0, genes: { [SIZE]: -0.5 } },
                ],
                { 0: { [SIZE]: 0.3 } },
            ),
        );
        // The ratios are 1 +- 0.3 tanh(0.5): their standard deviation is the half-gap.
        expect(read(scene, 'eval.gene_spread.size')).toBeCloseTo(0.3 * detTanh(0.5), 6);
    });

    it('averages over the specs that have the trait and two agents, and over the checkpoints', () => {
        const scene = createGenesScene();
        const menus = { 0: { [SIZE]: 0.3 }, 1: { [SIZE]: 0.3 } };
        const spec0 = [
            { spec: 0, genes: { [SIZE]: 1 } },
            { spec: 0, genes: { [SIZE]: -1 } },
        ];
        sampleGenes(scene, world([...spec0, { spec: 1 }, { spec: 1 }], menus));
        const wide = 0.3 * detTanh(1);
        expect(read(scene, 'eval.gene_spread.size')).toBeCloseTo(wide / 2, 6);
        sampleGenes(scene, world([...spec0, { spec: 1 }, { spec: 1 }], menus, BURN_IN_TICKS + 1000));
        expect(read(scene, 'eval.gene_spread.size')).toBeCloseTo(wide / 2, 6);
        sampleGenes(scene, world([{ spec: 1 }, { spec: 1 }], menus, BURN_IN_TICKS + 2000));
        expect(read(scene, 'eval.gene_spread.size')).toBeCloseTo((wide / 2 + wide / 2 + 0) / 3, 6);
    });

    it('is null for a trait no spec holds in its menu, or a spec with one agent', () => {
        const scene = createGenesScene();
        sampleGenes(
            scene,
            world([{ spec: 0, genes: { [SIZE]: 1 } }, { spec: 1 }, { spec: 1 }], { 0: { [SIZE]: 0.3 } }),
        );
        expect(read(scene, 'eval.gene_spread.size')).toBeNull();
        expect(read(scene, 'eval.gene_spread.speed')).toBeNull();
    });

    it('reads the gene of a raw trait and the shift of an offset trait', () => {
        const scene = createGenesScene();
        const learn = INDEX.LEARN;
        const band = INDEX.HEAT_BAND;
        sampleGenes(
            scene,
            world(
                [
                    { spec: 0, genes: { [learn]: 1, [band]: 1 } },
                    { spec: 0, genes: { [learn]: 3, [band]: -1 } },
                ],
                { 0: { [band]: 2 } },
            ),
        );
        expect(read(scene, 'eval.gene_spread.learn')).toBeCloseTo(1, 6);
        expect(read(scene, 'eval.gene_spread.heatBand')).toBeCloseTo(2 * detTanh(1), 6);
    });

    it('reads nothing before burn-in or off a 1000-tick checkpoint', () => {
        const scene = createGenesScene();
        const agents = [
            { spec: 0, genes: { [SIZE]: 1 } },
            { spec: 0, genes: { [SIZE]: -1 } },
        ];
        sampleGenes(scene, world(agents, { 0: { [SIZE]: 0.3 } }, BURN_IN_TICKS - 1000));
        sampleGenes(scene, world(agents, { 0: { [SIZE]: 0.3 } }, BURN_IN_TICKS + 1));
        expect(scene.checkpoints).toBe(0);
        expect(read(scene, 'eval.gene_spread.size')).toBeNull();
    });
});

describe('eval.gene_edge_share', () => {
    it('is the share of agents with a menu that have a menu gene at 90% of its span or more', () => {
        const scene = createGenesScene();
        const menu = { 0: { [SIZE]: 0.3, [SPEED]: 0.3 } };
        expect(detTanh(2)).toBeGreaterThan(EDGE_SHARE);
        expect(detTanh(0.5)).toBeLessThan(EDGE_SHARE);
        sampleGenes(
            scene,
            world(
                [
                    { spec: 0, genes: { [SIZE]: 0.5, [SPEED]: -2 } },
                    { spec: 0, genes: { [SIZE]: 0.5 } },
                    { spec: 0, genes: { [SIZE]: -2 } },
                    { spec: 0 },
                ],
                menu,
            ),
        );
        expect(read(scene, 'eval.gene_edge_share')).toBe(0.5);
    });

    it('does not count an agent with no menu, a gene beyond a span of 0 or a raw gene', () => {
        const scene = createGenesScene();
        sampleGenes(
            scene,
            world(
                [
                    { spec: 0, genes: { [SIZE]: 0.5 } },
                    { spec: 1, genes: { [SIZE]: 5, [INDEX.LEARN]: 5 } },
                ],
                { 0: { [SIZE]: 0.3 } },
            ),
        );
        expect(read(scene, 'eval.gene_edge_share')).toBe(0);
    });

    it('is null when no agent has a menu', () => {
        const scene = createGenesScene();
        sampleGenes(scene, world([{ spec: 0, genes: { [SIZE]: 5 } }], {}));
        expect(read(scene, 'eval.gene_edge_share')).toBeNull();
    });
});

describe('the genes detector', () => {
    it('summarises the run: the spread by trait name, the edge share and the checkpoints', () => {
        const scene = createGenesScene();
        sampleGenes(
            scene,
            world(
                [
                    { spec: 0, genes: { [SIZE]: 2 } },
                    { spec: 0, genes: { [SIZE]: -2 } },
                ],
                { 0: { [SIZE]: 0.3 } },
            ),
        );
        const summary = genesSummary(scene);
        expect(summary.checkpoints).toBe(1);
        expect(summary.edgeShare).toBe(1);
        expect(Object.keys(summary.spread)).toEqual(TRAITS.map((trait) => trait.name));
        expect(summary.spread.size).toBeCloseTo(0.3 * detTanh(2), 6);
        expect(summary.spread.speed).toBeNull();
    });

    it('has a metric for every trait of the registry and the edge share, all watch metrics', () => {
        const names = TRAITS.map((trait) => `eval.gene_spread.${trait.name}`)
            .concat(TRAITS.filter((trait) => trait.kind !== 'raw').map((trait) => `eval.gene_sd.${trait.name}`))
            .concat('eval.gene_edge_share');
        expect([...NAMES].sort()).toEqual([...names].sort());
        expect(Object.keys(genesMetrics(createGenesScene())).sort()).toEqual([...NAMES].sort());
        expect(namesOf('js/evo/scene-genes.js')).toEqual([...NAMES].sort());
        for (const name of NAMES) {
            expect(directionOf(name)).toBe('watch');
        }
        expect(intendedOf('eval.gene_edge_share')).toBe('lower');
    });

    it('is a detector that runs every 1000 ticks and gives each run its own scene', () => {
        expect(genesDetector.every).toBe(1000);
        expect(genesDetector.create({}, { runTicks: 0 })).not.toBe(genesDetector.create({}, { runTicks: 0 }));
    });
});

describe('eval.gene_sd.<trait>', () => {
    const PAIR = [
        { spec: 0, genes: { [SPEED]: 0.5 } },
        { spec: 0, genes: { [SPEED]: -0.3 } },
    ];

    it('is the standard deviation of the gene, whatever the span', () => {
        for (const span of [0.05, 0.3]) {
            const scene = createGenesScene();
            sampleGenes(scene, world(PAIR, { 0: { [SPEED]: span } }));
            // The genes are 0.5 and -0.3: half the gap is 0.4, and the span does not enter.
            expect(read(scene, 'eval.gene_sd.speed')).toBeCloseTo(0.4, 6);
        }
    });

    it('reads above the span where the ratio spread cannot', () => {
        const scene = createGenesScene();
        sampleGenes(scene, world(PAIR, { 0: { [SPEED]: 0.05 } }));
        expect(read(scene, 'eval.gene_spread.speed')).toBeLessThan(0.05);
        expect(read(scene, 'eval.gene_sd.speed')).toBeGreaterThan(0.05);
    });

    it('averages over the specs that have the trait and two agents, and over the checkpoints', () => {
        const scene = createGenesScene();
        const menus = { 0: { [SIZE]: 0.3 }, 1: { [SIZE]: 0.3 } };
        const spec0 = [
            { spec: 0, genes: { [SIZE]: 1 } },
            { spec: 0, genes: { [SIZE]: -1 } },
        ];
        sampleGenes(scene, world([...spec0, { spec: 1 }, { spec: 1 }], menus));
        expect(read(scene, 'eval.gene_sd.size')).toBeCloseTo(0.5, 6);
        sampleGenes(scene, world([{ spec: 0 }, { spec: 0 }], menus, BURN_IN_TICKS + 1000));
        expect(read(scene, 'eval.gene_sd.size')).toBeCloseTo(0.25, 6);
    });

    it('is null for a trait in no menu and has no entry for a raw trait', () => {
        const scene = createGenesScene();
        sampleGenes(scene, world(PAIR, { 0: { [SPEED]: 0.3 } }));
        expect(read(scene, 'eval.gene_sd.sprintStore')).toBeNull();
        expect(genesSummary(scene).geneSd.learn).toBeDefined();
        expect(Object.hasOwn(genesMetrics(scene), `eval.gene_sd.${'learn'}`)).toBe(false);
    });
});
