import { describe, expect, it } from 'vitest';
import { createArchive, offer } from '../../js/evo/archive.js';
import { CURVE_METRICS, bestLowerBounds, curvePoint, findPlateau, meanDrillEdge } from '../../js/evo/learning-curve.js';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';

const layout = brainLayout(createConfig({ rayCount: 2, brainHidden: 4 }));

/**
 * @param {number[]} qd qdScore per checkpoint
 * @param {number[]} food food energy per checkpoint
 * @param {(number | null)[]} zero hunter zero-kill share per checkpoint
 * @param {(number | null)[]} [edge] mean drill edge per checkpoint (a column only; `findPlateau` ignores it)
 * @param {(number | null)[]} [bite] bite-on-prey share per checkpoint (default a flat 0.5)
 * @returns {Record<string, any>[]} curve rows, generation 10 apart
 */
function curve(qd, food, zero, edge = [], bite = qd.map(() => 0.5)) {
    return qd.map((q, i) => ({
        generation: 10 * (i + 1),
        qdScore: q,
        'eval.food_energy_per_1k': food[i],
        'eval.hunter_zero_kill_share': zero[i],
        drillEdge: edge[i] ?? null,
        'eval.bite_on_prey': bite[i],
    }));
}

describe('findPlateau', () => {
    it('finds the first checkpoint after which qd and food rise and zero-kill share falls by under 5% over the next 3', () => {
        const rising = [10, 20, 30, 40, 40.5, 40.8, 41];
        const falling = [0.9, 0.8, 0.7, 0.6, 0.59, 0.585, 0.58];
        expect(findPlateau(curve(rising, rising, falling))).toEqual({ index: 3, generation: 40 });
    });

    it('finds none while a series still rises, or with too few checkpoints', () => {
        const flat = [10, 10, 10, 10, 10];
        expect(findPlateau(curve([10, 20, 30, 40, 50], flat, flat))).toBeNull();
        expect(findPlateau(curve([1, 1, 1], [1, 1, 1], [1, 1, 1]))).toBeNull();
    });

    it('is no plateau while the zero-kill share is still falling', () => {
        const flat = [10, 10, 10, 10, 10];
        expect(findPlateau(curve(flat, flat, [0.9, 0.8, 0.7, 0.6, 0.5]))).toBeNull();
    });

    it('is a plateau for a flat zero-kill share, and a rising drill edge alone no longer hides it', () => {
        const flat = [10, 10, 10, 10, 10];
        const edge = [0.1, 0.2, 0.3, 0.4, 0.5];
        expect(findPlateau(curve(flat, flat, [0.8, 0.8, 0.8, 0.8, 0.8], edge))).toEqual({ index: 0, generation: 10 });
    });

    it('is no plateau while the bite-on-prey share still rises, and is one once it is flat', () => {
        const flat = [10, 10, 10, 10, 10];
        const zero = [0.8, 0.8, 0.8, 0.8, 0.8];
        expect(findPlateau(curve(flat, flat, zero, [], [0.2, 0.3, 0.4, 0.5, 0.6]))).toBeNull();
        const seven = [10, 10, 10, 10, 10, 10, 10];
        const settles = [0.2, 0.4, 0.6, 0.6, 0.6, 0.6, 0.6];
        expect(findPlateau(curve(seven, seven, seven, [], settles))).toEqual({ index: 2, generation: 30 });
        expect(findPlateau(curve(flat, flat, zero, [], [null, 0.5, 0.5, 0.5, 0.5]))).toEqual({
            index: 1,
            generation: 20,
        });
    });

    it('counts a zero-kill share that rises as flat (no progress), not as a plateau-breaker', () => {
        const flat = [10, 10, 10, 10];
        expect(findPlateau(curve(flat, flat, [0.5, 0.6, 0.7, 0.8]))).toEqual({ index: 0, generation: 10 });
    });

    it('is not fooled by a late rise after a flat stretch', () => {
        const q = [10, 10, 10, 10, 10, 10, 30];
        const z = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
        expect(findPlateau(curve(q, q, z))).toEqual({ index: 0, generation: 10 });
        const afterRise = [10, 10, 10, 30, 30];
        expect(findPlateau(curve(afterRise, afterRise, [0.5, 0.5, 0.5, 0.5, 0.5]))).toBeNull();
    });

    it('treats a missing series value as no plateau, and a rise from 0 in qd as a rise', () => {
        const flat = [10, 10, 10, 10];
        expect(findPlateau(curve(flat, flat, [null, 0.5, 0.5, 0.5]))).toBeNull();
        expect(findPlateau(curve([0, 0, 0, 0.01], flat, [0.5, 0.5, 0.5, 0.5]))).toBeNull();
        expect(findPlateau(curve([0, 0, 0, 0], flat, [0.5, 0.5, 0.5, 0.5]))).toEqual({ index: 0, generation: 10 });
    });
});

describe('curvePoint', () => {
    const archive = createArchive(layout);
    const row = new Float32Array(layout.weightCount);
    offer(archive, { spec: 0, cell: 3, row, sigma: 0.1, id: 1, fitness: 5 });

    it('records the archive, the drill edges and the metrics', () => {
        const metrics = Object.fromEntries(CURVE_METRICS.map((name, i) => [name, i]));
        const point = curvePoint({
            generation: 10,
            stage: 'nursery',
            trainTicks: 600,
            wallSeconds: 3,
            archive,
            drillEdges: { 'food-ahead': 0.5, 'prey-ahead': -0.1, 'two-foods': null },
            metrics,
        });
        expect(point).toMatchObject({
            generation: 10,
            stage: 'nursery',
            trainTicks: 600,
            drillEdge: 0.2,
            'eval.food_energy_per_1k': 0,
            'eval.escape_share': CURVE_METRICS.indexOf('eval.escape_share'),
        });
        expect(point.coverage).toBeCloseTo(1 / 500);
        expect(point.best.forager).toBeTypeOf('number');
        expect(point.best.predator).toBeNull();
        expect(JSON.parse(JSON.stringify(point)).drill).toEqual({
            'food-ahead': 0.5,
            'prey-ahead': -0.1,
            'two-foods': null,
        });
    });

    it('carries a field for each curve metric, the hunter ones included', () => {
        const names = [
            'eval.hunter_kills_per_life_p50',
            'eval.hunter_zero_kill_share',
            'eval.hunter_income_share.kill',
            'eval.hunter_income_share.bite',
            'eval.hunter_income_share.carcass',
            'eval.hunter_income_share.herd',
            'eval.hunter_kill_rate_by_source.mate-hunter-parent',
            'eval.hunter_kill_rate_by_source.split-hunter-parent',
            'eval.escape_share',
            'eval.food_energy_per_1k',
            'eval.births_per_1k',
            'eval.bite_on_prey',
            'eval.bite_off_kin',
            'eval.bite_off_other',
        ];
        expect([...CURVE_METRICS].sort()).toEqual([...names].sort());
        const metrics = Object.fromEntries(names.map((name, i) => [name, i + 1]));
        const point = curvePoint({
            generation: 0,
            stage: 's',
            trainTicks: 0,
            wallSeconds: 0,
            archive,
            drillEdges: {},
            metrics,
        });
        for (const [i, name] of names.entries()) {
            expect(point[name]).toBe(i + 1);
        }
        expect(CURVE_METRICS).not.toContain('eval.hunter_catches_per_1k');
        expect(CURVE_METRICS).not.toContain('eval.fed_median_lifespan');
    });

    it('has null for a metric with no value and for the edge when no drill applies', () => {
        const point = curvePoint({
            generation: 0,
            stage: 's',
            trainTicks: 0,
            wallSeconds: 0,
            archive,
            drillEdges: {},
            metrics: {},
        });
        expect([point.drillEdge, point['eval.hunter_zero_kill_share']]).toEqual([null, null]);
        expect(meanDrillEdge({ a: null })).toBeNull();
        expect(bestLowerBounds(createArchive(layout)).forager).toBeNull();
    });
});
