import { describe, expect, it } from 'vitest';
import { formatCurve } from '../scripts/train-curve.mjs';

/**
 * @param {number} generation the row's generation
 * @param {number | null} difficulty the adaptive value on the row
 * @returns {Record<string, any>} a gated curve row
 */
const row = (generation, difficulty) => ({
    generation,
    stage: 'hunt',
    trainTicks: 1,
    wallSeconds: 1,
    coverage: 0.1,
    qdScore: 1,
    drillEdge: 0.2,
    difficulty,
    gate: { stage: 'hunt', passed: false, conditions: [] },
});

describe('train:curve difficulty column', () => {
    it('prints the adaptive value of each row beside the gate columns', () => {
        const lines = formatCurve([row(1, 0.1), row(2, 0.15)]);
        expect(lines[0]).toMatch(/progress\s+best\s+difficulty\s/);
        expect(lines[1]).toMatch(/\s0\.100\s/);
        expect(lines[2]).toMatch(/\s0\.150\s/);
    });

    it('leaves the column out of a run with no adaptive stage', () => {
        expect(formatCurve([row(1, null)])[0]).not.toContain('difficulty');
    });
});
