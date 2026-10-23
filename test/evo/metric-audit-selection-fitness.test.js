// Metric audit, selection family (fitness-and-selection.md T4, part 2): `eval.p90_fitness.<spec>` and
// `eval.mean_fitness.<spec>` of `metrics-fitness.js`, and the archive's `eval.coverage` and `eval.qd_score`, checked
// end to end against their definitions in the Metrics table of evolution-evals.md, through the real `observe` and
// `computeMetrics` and the real archive API, on the smallest scenes computable by hand. The selection metrics are in
// `metric-audit-selection.test.js`. Pinned elsewhere and not repeated: `metrics-fitness.test.js` (pooling over the
// death log and the living, over injected rows) and `archive.test.js` (counts over all 500 cells, one offer per cell).

import { describe, expect, it } from 'vitest';
import { CELLS, createArchive, offer, seedArchive } from '../../js/evo/archive.js';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { pushBorn, pushDied } from './helpers/observer-world.js';
import { foodFitness, selectionRun } from './helpers/selection-audit.js';

const SPECS = ['forager', 'predator', 'reproducer', 'scout', 'defender'];

describe('audit: p90_fitness and mean_fitness per specialisation', () => {
    // Four agents born at tick 100: foragers g1, g2 and g4, predator g3. g1, g2, g3 die at tick 200 (before burn-in:
    // the metrics pool every death) having eaten 1, 3 and 10. g4 is alive at the end with 5 eaten. Fitness is the food
    // energy eaten.
    function scene(/** @type {any} */ fitness = foodFitness) {
        const r = selectionRun({ fitness });
        const { specialisations } = r.world.config;
        const spec = [
            specialisations.forager,
            specialisations.forager,
            specialisations.predator,
            specialisations.forager,
        ];
        for (let slot = 0; slot < 4; slot++) {
            addBlob(r.world);
        }
        r.world.foodEnergy[3] = 5;
        r.at(100, (w) => spec.forEach((s, slot) => pushBorn(w, { slot, genomeId: slot + 1, spec: s.index })));
        r.at(200, (w) => {
            [1, 3, 10].forEach((food, slot) => {
                pushDied(w, { slot, genomeId: slot + 1, spec: spec[slot].index, ageTicks: 100, foodEnergy: food });
                w.alive[slot] = 0;
            });
        });
        return r;
    }

    it('pools the dead and the living of a spec: forager 1, 3, 5 has mean 3 and p90 3 + 0.8 x 2 = 4.6', () => {
        const m = scene().metrics({ fitness: foodFitness });
        expect(m['eval.mean_fitness.forager'].value).toBeCloseTo(3, 12);
        expect(m['eval.p90_fitness.forager'].value).toBeCloseTo(4.6, 12);
    });

    it('keeps specs apart: the lone predator death has mean and p90 10', () => {
        const m = scene().metrics({ fitness: foodFitness });
        expect(m['eval.mean_fitness.predator']).toEqual({ value: 10 });
        expect(m['eval.p90_fitness.predator']).toEqual({ value: 10 });
    });

    it('is null per spec with no agent, naming the spec, for every other spec', () => {
        const m = scene().metrics({ fitness: foodFitness });
        for (const name of SPECS.filter((s) => s !== 'forager' && s !== 'predator')) {
            expect(m[`eval.mean_fitness.${name}`]).toEqual({ value: null, reason: `no agents of ${name}` });
            expect(m[`eval.p90_fitness.${name}`]).toEqual({ value: null, reason: `no agents of ${name}` });
        }
    });

    it('is null with reason "no fitness" for every spec when computeMetrics gets no fitness function', () => {
        const m = scene().metrics();
        for (const name of SPECS) {
            expect(m[`eval.mean_fitness.${name}`]).toEqual({ value: null, reason: 'no fitness' });
            expect(m[`eval.p90_fitness.${name}`]).toEqual({ value: null, reason: 'no fitness' });
        }
        expect(Object.keys(m).filter((k) => /_fitness\./.test(k))).toHaveLength(2 * SPECS.length);
    });

    it('skips deaths observed without a fitness (NaN) and uses the living alone', () => {
        // The observer was not given a fitness function, so the death log holds NaN; only g4 (5) is scored.
        const m = scene(null).metrics({ fitness: foodFitness });
        expect(m['eval.mean_fitness.forager']).toEqual({ value: 5 });
        expect(m['eval.mean_fitness.predator']).toEqual({ value: null, reason: 'no agents of predator' });
    });

    it('scores a death with the counters it ended with, children included', () => {
        // A forager g1 with one split child (a child of g1) dies; a fitness of 7 x children + food reads both.
        const r = selectionRun({ fitness: (o, slot) => 7 * o.children[slot] + o.foodEnergy[slot] });
        r.at(100, (w) => pushBorn(w, { slot: 0, genomeId: 1 }));
        r.at(110, (w) => pushBorn(w, { slot: 1, genomeId: 2, cause: 2, parentA: 1, parentB: 1 }));
        r.at(200, (w) => pushDied(w, { slot: 0, genomeId: 1, ageTicks: 100, foodEnergy: 4 }));
        expect(r.metrics({ fitness: foodFitness })['eval.mean_fitness.forager'].value).toBeCloseTo((7 + 4 + 0) / 2, 12);
    });
});

describe('audit: coverage and qd_score', () => {
    const layout = brainLayout({ rayCount: 2, brainHidden: 4 });
    const TOTAL = SPECS.length * CELLS;
    const genome = (/** @type {number} */ id, /** @type {number} */ spec, /** @type {number} */ cell, fitness = 0) => ({
        spec,
        cell,
        row: new Float32Array(layout.weightCount).fill(id),
        sigma: 0.07,
        id,
        fitness,
    });
    const clone = (/** @type {number} */ refId, /** @type {number} */ cellIndex, /** @type {number} */ fitness) => ({
        ...genome(900 + refId, 0, 0, fitness),
        isClone: true,
        archiveRef: cellIndex,
        refId,
    });

    it('count only elites: a challenger adds no cell and no fitness', () => {
        const archive = createArchive(layout);
        offer(archive, genome(1, 0, 0, 10));
        expect(offer(archive, genome(2, 0, 0, 25))).toBe('challenger');
        offer(archive, genome(3, 1, 7, 40));
        expect(computeFrom(archive).coverage).toBe(2 / TOTAL);
        expect(computeFrom(archive).qd_score).toBe((10 + 40) / TOTAL);
    });

    it('use the elite mean over all its fitness evaluations: 10 and a clone scoring 30 give 20', () => {
        const archive = createArchive(layout);
        offer(archive, genome(1, 0, 0, 10));
        offer(archive, genome(3, 1, 7, 40));
        expect(offer(archive, clone(1, 0, 30))).toBe('clone');
        expect(computeFrom(archive).qd_score).toBe((20 + 40) / TOTAL);
        expect(computeFrom(archive).coverage).toBe(2 / TOTAL);
    });

    it('move to the new elite when a challenger replaces it: mean (25 + 100 + 100) / 3 = 75', () => {
        const archive = createArchive(layout);
        offer(archive, genome(1, 0, 0, 10));
        offer(archive, genome(2, 0, 0, 25));
        offer(archive, clone(2, 0, 100));
        expect(offer(archive, clone(2, 0, 100))).toBe('replaced');
        expect(computeFrom(archive).qd_score).toBe(75 / TOTAL);
        expect(computeFrom(archive).coverage).toBe(1 / TOTAL);
    });

    it('count a seeded champion as an occupied cell scoring 0 until it is tested', () => {
        const archive = createArchive(layout);
        seedArchive(archive, { spec: 2, cell: 99, id: 5, sigma: 0.07, weights: new Float32Array(layout.weightCount) });
        expect(computeFrom(archive)).toEqual({ coverage: 1 / TOTAL, qd_score: 0 });
    });

    it('are 0 for an empty archive, and null with reason "no archive" without one', () => {
        expect(computeFrom(createArchive(layout))).toEqual({ coverage: 0, qd_score: 0 });
        const m = selectionRun().metrics();
        expect(m['eval.coverage']).toEqual({ value: null, reason: 'no archive' });
        expect(m['eval.qd_score']).toEqual({ value: null, reason: 'no archive' });
    });

    /**
     * @param {any} archive the archive
     * @returns {{coverage: number, qd_score: number}} the two metrics as `computeMetrics` reports them
     */
    function computeFrom(archive) {
        const m = selectionRun().metrics({ archive });
        return { coverage: m['eval.coverage'].value, qd_score: m['eval.qd_score'].value };
    }
});
