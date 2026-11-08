// Source tests, world family, per-specialisation fitness and in-world merit (docs/designs/metric-trust.md, T20a): the
// real `step`, `observe`, `checkpoint` and `computeMetrics` on a scripted world, each value known by construction.
// Every test plants one event in the final tick and one in a tick a body dies.

import { describe, expect, it } from 'vitest';
import { SEX } from '../../js/sim/sex.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { spearman } from '../../js/evo/metrics-stats.js';
import { sourceRun, starve } from './helpers/source-world.js';

/** @type {[string, string, number][]} */
const SPECS = [
    ['eval.mean_fitness.forager', 'eval.p90_fitness.forager', 0],
    ['eval.mean_fitness.predator', 'eval.p90_fitness.predator', 1],
    ['eval.mean_fitness.reproducer', 'eval.p90_fitness.reproducer', 2],
    ['eval.mean_fitness.scout', 'eval.p90_fitness.scout', 3],
    ['eval.mean_fitness.defender', 'eval.p90_fitness.defender', 4],
];

/** Makes `slot` ready to split in the next `step`. */
function readyToSplit(/** @type {any} */ world, /** @type {number} */ slot) {
    world.ageTicks[slot] = 100;
    world.energy[slot] = 1500;
    world.cooldown[slot] = 0;
    world.pregnancy[slot] = 0;
}

/** Sets `mother` due to deliver a mating child of `father` in the next `step`. */
function dueToDeliver(/** @type {any} */ world, /** @type {number} */ mother, /** @type {number} */ father) {
    world.ageTicks[mother] = 100;
    world.energy[mother] = 1500;
    world.fatherId[mother] = world.genomeId[father];
    world.fatherLineage[mother] = world.lineageId[father];
    world.pregnancy[mother] = 1;
}

/**
 * Three agents per specialisation `s` (`base = 100 * (s + 1)`): one dies in Tick 1 at age `base + 10`, one dies in the
 * final tick at age `base + 20`, and one survives the final tick at age `base + 30`.
 */
function runSpecFitness() {
    const fitness = (/** @type {any} */ o, /** @type {number} */ slot) => o.ageTicks[slot];
    const r = sourceRun({ over: { maxAgents: 32 }, fitness });
    const { world, observer } = r;
    const groups = SPECS.map(([, , specIndex]) => {
        const trio = [r.spawn(), r.spawn(), r.spawn()];
        for (const slot of trio) {
            world.spec[slot] = specIndex;
            observer.spec[slot] = specIndex;
        }
        return { base: 100 * (specIndex + 1), d1: trio[0], d2: trio[1], live: trio[2] };
    });
    r.tick((w) => {
        for (const g of groups) {
            starve(w, g.d1, g.base + 10);
        }
    });
    r.tick((w) => {
        for (const g of groups) {
            starve(w, g.d2, g.base + 20);
            w.ageTicks[g.live] = g.base + 29;
            w.energy[g.live] = 800;
        }
    });
    return r.metrics({ fitness });
}

describe('mean_fitness.* and p90_fitness.*', () => {
    const m = runSpecFitness();

    it.each(SPECS)('computes %s and %s over the two deaths and the survivor', (meanKey, p90Key, idx) => {
        const base = 100 * (idx + 1);
        expect(m[meanKey].value).toBeCloseTo(base + 20, 12);
        expect(m[p90Key].value).toBeCloseTo(base + 28, 12);
    });
});

describe('merit_mean and merit_p90', () => {
    it('pools merit_mean across checkpoints after burn-in and averages each checkpoint p90', () => {
        const r = sourceRun({ over: { meritHalfLife: 0 } });
        const [a, b, c, doomed] = Array.from({ length: 4 }, () => r.spawn());
        const { world } = r;
        world.merit[a] = 10;
        world.merit[b] = 20;
        world.merit[c] = 30;
        r.jump(BURN_IN_TICKS);
        r.tick((w) => starve(w, doomed, 50));
        r.check(); // alive: [10, 20, 30] -> sum 60, count 3, p90 = 28
        r.tick((w) => starve(w, b, 50));
        r.check(); // alive: [10, 30] -> sum 40, count 2, p90 = 28
        const m = r.metrics();
        expect(m['eval.merit_mean'].value).toBeCloseTo((60 + 40) / 5, 12);
        expect(m['eval.merit_p90'].value).toBeCloseTo((28 + 28) / 2, 12);
    });
});

describe('merit_mate_gain and split_gated_share', () => {
    it('computes merit_mate_gain across two mating births after burn-in and split_gated_share across ready ticks', () => {
        const r = sourceRun({ over: { maxAgents: 16, meritHalfLife: 0, splitDeliberateMin: 100 } });
        const [mother1, mother2, father1, father2, male3, openSplitter, doomed] = Array.from({ length: 7 }, () =>
            r.spawn(),
        );
        const { world } = r;
        [mother1, mother2, openSplitter, doomed].forEach((s) => {
            world.sex[s] = SEX.FEMALE;
        });
        [father1, father2, male3].forEach((s) => {
            world.sex[s] = SEX.MALE;
        });
        world.spec[male3] = 1; // Excluded from spec-0 male pool during Tick 1.
        world.merit[father1] = 30;
        world.merit[father2] = 10;
        world.merit[male3] = 20;
        world.deliberateIntake[openSplitter] = 150;
        r.jump(BURN_IN_TICKS);
        // Tick 1: `mother1` delivers (`father1` 30 vs spec-0 males [30, 10] -> mean 20, gain 10);
        // `openSplitter` (open) and `father1` (gated) are ready to split (1 gated of 2 ready); `doomed` dies.
        r.tick((w) => {
            w.rng.lifecycle.s.fill(0);
            dueToDeliver(w, mother1, father1);
            readyToSplit(w, openSplitter);
            readyToSplit(w, father1);
            starve(w, doomed, 50);
        });
        // Final tick: `male3` switches to spec 0, `father2` dies (before births in applyEvents), and `mother2` delivers
        // (`father1` 30 vs spec-0 males [30, 20] -> mean 25, gain 5); `father1` is still ready and gated (2 gated of 3 ready).
        world.spec[male3] = 0;
        r.tick((w) => {
            w.rng.lifecycle.s.fill(0);
            dueToDeliver(w, mother2, father1);
            readyToSplit(w, father1);
            starve(w, father2, 50);
        });
        const m = r.metrics();
        expect(m['eval.merit_mate_gain'].value).toBeCloseTo((10 + 5) / (20 + 25), 12);
        expect(m['eval.split_gated_share'].value).toBeCloseTo(2 / 3, 12);
    });
});

describe('merit_fitness_corr', () => {
    it('computes Spearman correlation over 30 mature deaths after burn-in, the 30th dying in the final tick', () => {
        const fitness = (/** @type {any} */ o, /** @type {number} */ slot) => o.ageTicks[slot];
        const r = sourceRun({ over: { maxAgents: 64, meritHalfLife: 0 }, fitness });
        const { world } = r;
        const agents = Array.from({ length: 30 }, () => r.spawn());
        const merits = agents.map((_, i) => 10 * i);
        const ages = agents.map((_, i) => 100 + Math.floor(i / 3) * 5 + (i % 3));
        agents.forEach((slot, i) => {
            world.merit[slot] = merits[i];
        });
        r.jump(BURN_IN_TICKS);
        // Tick 1 snapshots `world.merit` into `observer.merit.view` for subsequent deaths.
        r.tick((w) => {
            for (const slot of agents) {
                w.energy[slot] = 800;
            }
        });
        r.tick((w) => {
            for (let i = 0; i < 29; i++) {
                starve(w, agents[i], ages[i]);
            }
        });
        expect(r.metrics({ fitness })['eval.merit_fitness_corr'].value).toBeNull();
        r.tick((w) => starve(w, agents[29], ages[29]));
        const expected = spearman(Float64Array.from(merits), Float64Array.from(ages));
        expect(r.metrics({ fitness })['eval.merit_fitness_corr'].value).toBeCloseTo(expected, 12);
    });
});
