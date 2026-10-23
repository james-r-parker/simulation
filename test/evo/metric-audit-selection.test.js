// Metric audit, selection family (fitness-and-selection.md T4, part 1): `offspring_per_life`, `generation_depth_p90`,
// `opportunity_for_selection`, `fitness_lrs_corr` and `archive_lineage_share` of `metrics-selection.js`, checked end
// to end against their definitions in the Metrics table of evolution-evals.md and "### Selection metrics" of
// world-balance.md, through the real `observe` and `checkpoint`, on the smallest scenes whose value is computable by
// hand. The fitness and archive metrics are in `metric-audit-selection-fitness.test.js`.
// `eval.kin_within_call_radius` is audited in `metric-audit-intent-calls.test.js` (T3): not repeated here.
// Per-module edges pinned elsewhere are cited, not repeated: `metrics-selection.test.js` (death-log arithmetic over
// injected rows), `observer-events.test.js` (generation depth and the archive flag in isolation).

import { describe, expect, it } from 'vitest';
import { observe } from '../../js/evo/observer.js';
import { addBorn } from './helpers/observer-world.js';
import {
    B,
    FLOOR,
    IMMIGRANT,
    INITIAL,
    MATE,
    SPLIT,
    born,
    died,
    foodFitness,
    selectionRun,
} from './helpers/selection-audit.js';

const NO_LIFE = { value: null, reason: 'no completed life after burn-in' };

describe('audit: offspring, generation depth and opportunity for selection', () => {
    // Five lives, all ending after burn-in (event tick B + 100). g1, g2 start the run; g3 is their mating child, g4 a
    // split of g1, g5 the mating child of g3 and g4. Children: g1 2 (g3, g4), g2 1, g3 1 (g5), g4 1, g5 0.
    function fiveLives() {
        const r = selectionRun();
        r.at(B, (w) => {
            born(w, 0, 1, INITIAL);
            born(w, 1, 2, INITIAL);
        });
        r.at(B + 10, (w) => born(w, 2, 3, MATE, [1, 2]));
        r.at(B + 20, (w) => born(w, 3, 4, SPLIT, [1, 1]));
        r.at(B + 30, (w) => born(w, 4, 5, MATE, [3, 4]));
        r.at(B + 100, (w) => {
            [1, 2, 3, 4, 5].forEach((id, slot) => died(w, slot, id, [100, 100, 90, 80, 70][slot]));
        });
        return r;
    }

    it('reads offspring_per_life as the mean children per completed life: (2 + 1 + 1 + 1 + 0) / 5', () => {
        // A mating credits both parents once; a split names its parent twice and credits it once.
        expect(fiveLives().metrics()['eval.offspring_per_life']).toEqual({ value: 1 });
    });

    it('reads opportunity_for_selection as the population variance over the squared mean: 0.4', () => {
        // Children 2, 1, 1, 1, 0: mean 1, variance (1 + 0 + 0 + 0 + 1) / 5 = 0.4 (divisor n, not n - 1).
        expect(fiveLives().metrics()['eval.opportunity_for_selection'].value).toBeCloseTo(0.4, 12);
    });

    it('reads generation_depth_p90 as the interpolated 90th percentile of depths 0, 0, 1, 1, 2: 1.6', () => {
        // A child is one more than its deeper parent: g3 and g4 are 1, g5 is 2. Position 0.9 x 4 = 3.6 of the sorted
        // depths is 1 + 0.6 x (2 - 1) (linear interpolation between order statistics, `quantile`).
        expect(fiveLives().metrics()['eval.generation_depth_p90'].value).toBeCloseTo(1.6, 12);
    });

    it('counts a life that ends on tick 10000 and not one that ends on tick 9999', () => {
        // Both are born at 9000; the first lives 999 ticks (dies at event tick 9999), the second 1000. g1 has one child and
        // g2 two, so the mean over the counted lives is 2 only if just the second is counted.
        const r = selectionRun();
        r.at(9000, (w) => {
            born(w, 0, 1, INITIAL);
            born(w, 1, 2, INITIAL);
        });
        r.at(9500, (w) => {
            born(w, 2, 3, SPLIT, [1, 1]);
            born(w, 3, 4, SPLIT, [2, 2]);
            born(w, 4, 5, SPLIT, [2, 2]);
        });
        r.at(B - 1, (w) => died(w, 0, 1, 999));
        const early = r.metrics();
        expect(early['eval.offspring_per_life']).toEqual(NO_LIFE);
        r.at(B, (w) => died(w, 1, 2, 1000));
        // Only g2 counts: 2 children.
        expect(r.metrics()['eval.offspring_per_life']).toEqual({ value: 2 });
    });

    it('is null with the same reason on all three life metrics when no life ended after burn-in', () => {
        const m = selectionRun().metrics();
        expect(m['eval.offspring_per_life']).toEqual(NO_LIFE);
        expect(m['eval.generation_depth_p90']).toEqual(NO_LIFE);
        expect(m['eval.opportunity_for_selection']).toEqual(NO_LIFE);
    });

    it('has a mean of 0, not null, for offspring_per_life, and a null opportunity, when nobody had a child', () => {
        // The exact condition: the mean children is 0 (the denominator of the squared-mean ratio).
        const r = selectionRun();
        r.at(B, (w) => born(w, 0, 1, INITIAL));
        r.at(B + 50, (w) => died(w, 0, 1, 50));
        const m = r.metrics();
        expect(m['eval.offspring_per_life']).toEqual({ value: 0 });
        expect(m['eval.opportunity_for_selection']).toEqual({ value: null, reason: 'no children' });
    });

    it('gives floor and immigrant entries depth 0 and credits them no parent', () => {
        // x (floor) and y (immigrant) have parent fields 0. z, their mating child, is depth 1: depths 0, 0, 1 give
        // 0.9 x 2 = 1.8 of the sorted depths, 0 + 0.8 x (1 - 0).
        const r = selectionRun();
        r.at(B, (w) => {
            born(w, 0, 1, FLOOR);
            born(w, 1, 2, IMMIGRANT);
        });
        r.at(B + 10, (w) => born(w, 2, 3, MATE, [1, 2]));
        r.at(B + 60, (w) => {
            died(w, 0, 1, 60);
            died(w, 1, 2, 60);
            died(w, 2, 3, 50);
        });
        const m = r.metrics();
        expect(m['eval.generation_depth_p90'].value).toBeCloseTo(0.8, 12);
        expect(m['eval.offspring_per_life'].value).toBeCloseTo(2 / 3, 12);
    });

    it('keeps the depth and the children credit of a mother who dies on the tick she gives birth', () => {
        // g3 (depth 1) splits to g4 and dies on the same tick. g4 is depth 2 and g3 is credited its child. Depths of the
        // four lives are 0, 0, 1, 2: position 2.7 is 1 + 0.7 x (2 - 1).
        const r = selectionRun();
        r.at(B, (w) => {
            born(w, 0, 1, INITIAL);
            born(w, 1, 2, INITIAL);
        });
        r.at(B + 10, (w) => born(w, 2, 3, MATE, [1, 2]));
        r.at(B + 50, (w) => {
            born(w, 3, 4, SPLIT, [3, 3]);
            died(w, 2, 3, 40);
        });
        r.at(B + 100, (w) => {
            died(w, 0, 1, 100);
            died(w, 1, 2, 100);
            died(w, 3, 4, 50);
        });
        const m = r.metrics();
        expect(m['eval.generation_depth_p90'].value).toBeCloseTo(1.7, 12);
        // g1 1, g2 1, g3 1, g4 0.
        expect(m['eval.offspring_per_life']).toEqual({ value: 0.75 });
    });
});

describe('audit: fitness_lrs_corr', () => {
    // `n` lives born at B, each ending at B + 30 (mature: maturityTicks is 20). Life i ate `food(i)` and had `kids(i)`
    // children (splits born at B + 5, never dying). Its fitness is its food energy.
    /**
     * @param {number} n the number of lives
     * @param {{food?: (i: number) => number, kids?: (i: number) => number}} [shape] food eaten and children by life
     * @returns {ReturnType<typeof selectionRun>} the run
     */
    function lives(n, { food = (i) => i, kids = (i) => (i >= 15 ? 1 : 0) } = {}) {
        const r = selectionRun({ fitness: foodFitness });
        let slot = n;
        r.at(B, (w) => {
            for (let i = 0; i < n; i++) {
                born(w, i, 100 + i, INITIAL);
            }
        });
        r.at(B + 5, (w) => {
            for (let i = 0; i < n; i++) {
                for (let k = 0; k < kids(i); k++) {
                    born(w, slot, 1000 + slot++, SPLIT, [100 + i, 100 + i]);
                }
            }
        });
        r.at(B + 30, (w) => {
            for (let i = 0; i < n; i++) {
                died(w, i, 100 + i, 30, food(i));
            }
        });
        return r;
    }

    it('is the Spearman correlation of fitness at death and children: sqrt(1687.5 / 2247.5)', () => {
        // 30 mature lives, fitness 0..29 (ranks 1..30), children 0 for 15 and 1 for 15 (ranks 8 and 23). Pearson on the
        // ranks: covariance sum 1687.5, rank variance sums 2247.5 and 1687.5, so r = sqrt(1687.5 / 2247.5).
        const m = lives(30).metrics()['eval.fitness_lrs_corr'];
        expect(m.value).toBeCloseTo(Math.sqrt(1687.5 / 2247.5), 12);
    });

    it('needs 30 mature deaths with a fitness: 29 is null with the exact reason, 30 is a value', () => {
        const reason = 'fewer than 30 mature deaths with a fitness';
        expect(lives(29).metrics()['eval.fitness_lrs_corr']).toEqual({ value: null, reason });
        expect(lives(30).metrics()['eval.fitness_lrs_corr'].value).not.toBeNull();
    });

    it('does not count an immature death, a pre-burn-in death or one without a fitness', () => {
        // 29 usable lives plus one of each excluded kind: still 29, so still null.
        const r = lives(29);
        r.at(B + 31, (w) => {
            born(w, 40, 500, INITIAL);
            born(w, 41, 501, INITIAL);
        });
        r.at(B + 40, (w) => died(w, 40, 500, 9, 9999)); // age 9 < maturityTicks 20
        const reason = 'fewer than 30 mature deaths with a fitness';
        expect(r.metrics()['eval.fitness_lrs_corr']).toEqual({ value: null, reason });
        const early = selectionRun({ fitness: foodFitness });
        early.at(100, (w) => {
            for (let i = 0; i < 30; i++) {
                born(w, i, 100 + i, INITIAL);
            }
        });
        early.at(500, (w) => {
            for (let i = 0; i < 30; i++) {
                died(w, i, 100 + i, 400, i);
            }
        });
        expect(early.metrics()['eval.fitness_lrs_corr']).toEqual({ value: null, reason });
        const none = selectionRun();
        none.at(B, (w) => {
            for (let i = 0; i < 30; i++) {
                born(w, i, 100 + i, INITIAL);
            }
        });
        none.at(B + 30, (w) => {
            for (let i = 0; i < 30; i++) {
                died(w, i, 100 + i, 30, i);
            }
        });
        expect(none.metrics()['eval.fitness_lrs_corr']).toEqual({ value: null, reason });
    });

    it('is null when children are constant, and when fitness is constant', () => {
        const reason = 'fitness or children is constant';
        expect(lives(30, { kids: () => 1 }).metrics()['eval.fitness_lrs_corr']).toEqual({ value: null, reason });
        expect(lives(30, { food: () => 7 }).metrics()['eval.fitness_lrs_corr']).toEqual({ value: null, reason });
    });

    it('gives a negative correlation when the fitter have fewer children: -sqrt(1687.5 / 2247.5)', () => {
        const m = lives(30, { kids: (i) => (i < 15 ? 1 : 0) }).metrics()['eval.fitness_lrs_corr'];
        expect(m.value).toBeCloseTo(-Math.sqrt(1687.5 / 2247.5), 12);
    });
});

describe('audit: archive_lineage_share', () => {
    // Four agents. Every slot but 1 is an archive draw. Slots 0 and 1 are alive from the start; 2 and 3 are born at
    // B + 50.
    function run() {
        const r = selectionRun();
        r.observer.archiveDraw = (/** @type {number} */ slot) => slot !== 1;
        addBorn(r.world);
        addBorn(r.world);
        observe(r.observer, r.world);
        return r;
    }

    it('is the pooled share of agent-ticks at checkpoints after burn-in: (1 + 3) / (2 + 4)', () => {
        // Checkpoints: tick 9000 (excluded, burn-in), tick B with 2 alive of which 1 archive, tick B + 100 with 4 alive
        // of which 3. Pooled 4 / 6; the mean of the two shares would be 0.625.
        const r = run();
        r.check(9000);
        r.check(B);
        r.at(B + 50, (w) => {
            addBorn(w);
            addBorn(w);
        });
        r.check(B + 100);
        expect(r.metrics()['eval.archive_lineage_share'].value).toBeCloseTo(4 / 6, 12);
    });

    it('is null with reason "no archive" for a policy with no archive draw', () => {
        const r = selectionRun();
        r.check(B);
        expect(r.metrics()['eval.archive_lineage_share']).toEqual({ value: null, reason: 'no archive' });
    });

    it('is null with a reason when no checkpoint after burn-in saw an agent', () => {
        const reason = 'no checkpoint after burn-in';
        const r = run();
        r.check(B - 1);
        expect(r.metrics()['eval.archive_lineage_share']).toEqual({ value: null, reason });
        const empty = selectionRun();
        empty.observer.archiveDraw = () => true;
        empty.check(B);
        expect(empty.metrics()['eval.archive_lineage_share']).toEqual({ value: null, reason });
    });

    it('keeps the archive flag of a child whose parent died on the tick it was born', () => {
        // g1 is an archive draw; g3 is its (mating) child; g4 is born from g3 on the tick g3 dies. g4 alive alone at the
        // checkpoint: every agent is in an archive lineage, so the share is 1.
        const r = selectionRun();
        r.observer.archiveDraw = (/** @type {number} */ slot) => slot === 0;
        for (let i = 0; i < 4; i++) {
            addBorn(r.world);
        }
        r.at(B, (w) => {
            born(w, 0, 1, INITIAL);
            born(w, 1, 2, INITIAL);
        });
        r.at(B + 10, (w) => born(w, 2, 3, MATE, [1, 2]));
        r.at(B + 50, (w) => {
            born(w, 3, 4, SPLIT, [3, 3]);
            died(w, 2, 3, 40);
        });
        for (const slot of [0, 1, 2]) {
            r.world.alive[slot] = 0;
            r.world.population -= 1;
        }
        r.check(B + 60);
        expect(r.metrics()['eval.archive_lineage_share']).toEqual({ value: 1 });
    });
});
