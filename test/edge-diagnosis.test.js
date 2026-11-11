import { describe, expect, it } from 'vitest';
import { diagnose, readProbes, render } from '../scripts/edge-diagnosis.mjs';
import {
    episodes,
    flowTable,
    intervalTable,
    median,
    ratioReading,
    seasonOf,
    sumFunnels,
    swapShares,
} from '../scripts/lib/edge-diagnosis.mjs';

/** @param {Record<string, (number | null)[]>} columns metric values by short name @returns {Record<string, any>} a report */
function report(columns) {
    const names = {
        ratio: 'eval.edge_birth_death_ratio',
        deaths: 'eval.edge_deaths_per_prey',
        mateE: 'eval.edge_mate_births_per_prey',
        splitE: 'eval.edge_split_births_per_prey',
        starveE: 'eval.edge_starve_per_prey',
        eatenE: 'eval.edge_eaten_per_prey',
        mateR: 'eval.edge_ref_mate_births_per_prey',
        splitR: 'eval.edge_ref_split_births_per_prey',
        starveR: 'eval.edge_ref_starve_per_prey',
        eatenR: 'eval.edge_ref_eaten_per_prey',
    };
    const metrics = Object.fromEntries(Object.entries(names).map(([k, name]) => [name, { values: columns[k] }]));
    return {
        seeds: columns.deaths.map((_, i) => i + 1),
        metrics,
        config: { eraSeasonTicks: 10, floorTrigger: 8 },
        traces: [],
    };
}

describe('swapShares', () => {
    it('closes the deficit by each swap, skipping null and non-positive seeds', () => {
        // seed 1: deficit 0.2 - 0.1 = 0.1; mate gap 0.05 (share 0.5), starve gap 0.02 (0.2), eaten gap -0.01 (-0.1)
        // seed 2: no edge span; seed 3: births exceed deaths
        const r = report({
            ratio: [0.5, null, 1.2],
            deaths: [0.2, null, 0.1],
            mateE: [0.05, null, 0.08],
            splitE: [0.05, null, 0.08],
            starveE: [0.12, null, 0.1],
            eatenE: [0.01, null, 0.0],
            mateR: [0.1, 0.1, 0.1],
            splitR: [0.05, 0.1, 0.1],
            starveR: [0.1, 0.1, 0.1],
            eatenR: [0.02, 0.1, 0.1],
        });
        const s = swapShares(r);
        expect(s).toMatchObject({ seeds: 2, positive: 1 });
        expect(s.median.mate).toBeCloseTo(0.5, 12);
        expect(s.median.split).toBeCloseTo(0, 12);
        expect(s.median.starve).toBeCloseTo(0.2, 12);
        expect(s.median.eaten).toBeCloseTo(-0.1, 12);
        expect(s.pooled.mate).toBeCloseTo(0.5, 12);
    });

    it('reads the edge ratio against the bar', () => {
        const r = report({
            ratio: [0.5, null, 1.2, 0.6],
            deaths: [1, 1, 1, 1],
            mateE: [1, 1, 1, 1],
            splitE: [1, 1, 1, 1],
            starveE: [1, 1, 1, 1],
            eatenE: [1, 1, 1, 1],
            mateR: [1, 1, 1, 1],
            splitR: [1, 1, 1, 1],
            starveR: [1, 1, 1, 1],
            eatenR: [1, 1, 1, 1],
        });
        expect(ratioReading(r, 0.6)).toMatchObject({ seeds: 3, nulls: 1, under: 1, over: 2, median: 0.6 });
    });
});

describe('trace readings', () => {
    const sample = (/** @type {number[]} */ prey) =>
        prey.map((p, j) => ({ tick: 10000 + j * 1000, prey: p, pop: p + 5 }));

    it('names the season of a tick', () => {
        expect(seasonOf(0, 10)).toBe(0);
        expect(seasonOf(10, 10)).toBe(1);
        expect(seasonOf(39, 10)).toBe(3);
        expect(seasonOf(40, 10)).toBe(0);
    });

    it('finds the runs under 100 prey and the fall into each', () => {
        const eps = episodes(sample([500, 300, 200, 90, 80, 150, 120, 60]), 1000000);
        expect(eps).toHaveLength(2);
        expect(eps[0]).toMatchObject({ length: 2, censored: false, peak: 500, descentSamples: 3, bandSamples: 2 });
        expect(eps[1]).toMatchObject({ length: 1, censored: true, minPop: 65 });
    });

    it('groups intervals by the band and season they start in', () => {
        const t = intervalTable([sample([200, 100, 50, 100])], 1000000);
        expect(t['band/all']).toMatchObject({ n: 2, fall: 2 });
        expect(t['edge/all']).toMatchObject({ n: 1, fall: 0 });
        expect(t['edge/all'].meanChange).toBeCloseTo(1, 12);
    });

    it('pools births and deaths per prey by band, from probe rows', () => {
        const rows = {
            prey: [200, 50, 50],
            mate: [0, 10, 12],
            split: [0, 10, 12],
            deaths: [0, 40, 45],
            starved: [0, 20, 22],
            eaten: [0, 5, 5],
        };
        const t = flowTable([{ rows }], 1000000);
        expect(t['band/all']).toMatchObject({ n: 1, mate: 10 / 125, deaths: 40 / 125 });
        expect(t['edge/all'].starved).toBeCloseTo(2 / 50, 12);
        expect(t['high/all']).toBeUndefined();
    });
});

describe('funnels and the printout', () => {
    it('sums funnels across probes', () => {
        const f = (/** @type {number} */ n) => ({
            samples: 1,
            prey: 5,
            seen: { a: n },
            unseen: { a: 1 },
            seasons: [{ a: n }, { a: 0 }, { a: 0 }, { a: 1 }],
        });
        expect(sumFunnels([f(2), f(3)])).toEqual({
            samples: 2,
            prey: 10,
            seen: { a: 5 },
            unseen: { a: 2 },
            seasons: [{ a: 5 }, { a: 0 }, { a: 0 }, { a: 2 }],
        });
    });

    it('takes medians', () => {
        expect(median([3, 1, 2])).toBe(2);
        expect(median([])).toBeNaN();
    });

    it('prints the diagnosis of a small report', () => {
        const col = (/** @type {number} */ v) => [v, v];
        const r = report({
            ratio: [0.9, 1],
            deaths: col(0.2),
            mateE: col(0.05),
            splitE: col(0.1),
            starveE: col(0.1),
            eatenE: col(0.02),
            mateR: col(0.08),
            splitR: col(0.1),
            starveR: col(0.1),
            eatenR: col(0.02),
        });
        r.traces = [{ interval: 10000, prey: [300, 200, 80, 90, 120], pop: [305, 205, 85, 95, 125] }];
        const text = render(diagnose(r));
        expect(text).toContain('edge ratio: 2 seeds');
        expect(text).toContain('| mate | 0.600 | 0.600 |');
        expect(text).toContain('episodes: 1');
    });
});

describe('probe readings', () => {
    const probe = {
        rows: {
            prey: [200, 50, 50],
            mate: [0, 10, 12],
            split: [0, 10, 12],
            deaths: [0, 40, 45],
            starved: [0, 20, 22],
            eaten: [0, 5, 5],
        },
        funnel: {
            samples: 1,
            prey: 50,
            seen: { mates: 1, heat: 2 },
            unseen: { mates: 0, heat: 1 },
            seasons: [{ mates: 1, heat: 3 }, {}, {}, {}],
        },
        bandFunnel: {
            samples: 1,
            prey: 200,
            seen: { mates: 0, heat: 4 },
            unseen: { mates: 0, heat: 0 },
            seasons: [{ mates: 0, heat: 4 }, {}, {}, {}],
        },
    };

    it('reads and prints the band flows and both funnels', () => {
        const r = report({
            ratio: [0.9],
            deaths: [0.2],
            mateE: [0.05],
            splitE: [0.1],
            starveE: [0.1],
            eatenE: [0.02],
            mateR: [0.08],
            splitR: [0.1],
            starveR: [0.1],
            eatenR: [0.02],
        });
        r.traces = [{ interval: 10000, prey: [300, 80, 120], pop: [305, 85, 125] }];
        const d = diagnose(r);
        d.probes = readProbes(r, [probe]);
        expect(d.probes.edgeFunnel.seen.heat).toBe(2);
        const text = render(d);
        expect(text).toContain('probes: 1 seeds replayed');
        expect(text).toContain('funnel at the edge (1 checkpoints');
        expect(text).toContain('| heat | 2 | 1 |');
        expect(text).toContain('funnel at 100 to 400 prey');
    });
});
