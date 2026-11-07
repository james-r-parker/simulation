import { describe, expect, it } from 'vitest';
import { createArchive, offer } from '../../js/evo/archive.js';
import { CURVE_METRICS, bestLowerBounds, curvePoint, findPlateau, meanDrillEdge } from '../../js/evo/learning-curve.js';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';

const layout = brainLayout(createConfig({ rayCount: 2, brainHidden: 4 }));

/**
 * @param {number[]} qd qdScore per checkpoint
 * @param {number[]} food food energy per checkpoint
 * @param {(number | null)[]} edge mean drill edge per checkpoint
 * @returns {Record<string, any>[]} curve rows, generation 10 apart
 */
function curve(qd, food, edge) {
    return qd.map((q, i) => ({
        generation: 10 * (i + 1),
        qdScore: q,
        'eval.food_energy_per_1k': food[i],
        drillEdge: edge[i],
    }));
}

describe('findPlateau', () => {
    it('finds the first checkpoint after which all three series rise under 5% over the next 3', () => {
        const rising = [10, 20, 30, 40, 40.5, 40.8, 41];
        const plateau = findPlateau(curve(rising, rising, rising));
        expect(plateau).toEqual({ index: 3, generation: 40 });
    });

    it('finds none while a series still rises, or with too few checkpoints', () => {
        const flat = [10, 10, 10, 10, 10];
        expect(findPlateau(curve(flat, flat, [0.1, 0.2, 0.3, 0.4, 0.5]))).toBeNull();
        expect(findPlateau(curve([1, 1, 1], [1, 1, 1], [1, 1, 1]))).toBeNull();
    });

    it('is not fooled by a late rise after a flat stretch', () => {
        const q = [10, 10, 10, 10, 10, 10, 30];
        const found = findPlateau(curve(q, q, q));
        expect(found).toEqual({ index: 0, generation: 10 });
        const afterRise = [10, 10, 10, 30, 30];
        expect(findPlateau(curve(afterRise, afterRise, afterRise))).toBeNull();
    });

    it('treats a missing series value as no plateau, and a rise from 0 as a rise', () => {
        const flat = [10, 10, 10, 10];
        expect(findPlateau(curve(flat, flat, [null, 0, 0, 0]))).toBeNull();
        expect(findPlateau(curve(flat, flat, [0, 0, 0, 0.01]))).toBeNull();
        expect(findPlateau(curve(flat, flat, [0, 0, 0, 0]))).toEqual({ index: 0, generation: 10 });
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
            'eval.escape_rate': 4,
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
        expect([point.drillEdge, point['eval.catch_rate']]).toEqual([null, null]);
        expect(meanDrillEdge({ a: null })).toBeNull();
        expect(bestLowerBounds(createArchive(layout)).forager).toBeNull();
    });
});
