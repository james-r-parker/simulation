import { describe, expect, it } from 'vitest';
import { createKeyed, rowOf } from '../../js/evo/scene-keyed.js';

describe('keyed rows', () => {
    it('gives each key one row, in first-seen order', () => {
        const t = createKeyed(['n']);
        expect(rowOf(t, 70)).toBe(0);
        expect(rowOf(t, 5)).toBe(1);
        expect(rowOf(t, 70)).toBe(0);
        expect(t.rows).toBe(2);
    });

    it('keeps the sums when the columns grow', () => {
        const t = createKeyed(['n']);
        for (let key = 1; key <= 40; key++) {
            t.log.n[rowOf(t, key)] += key;
        }
        t.log.n[rowOf(t, 3)] += 100;
        expect(t.rows).toBe(40);
        expect(t.log.n[rowOf(t, 3)]).toBe(103);
        expect(t.log.n[rowOf(t, 40)]).toBe(40);
        expect(t.log.capacity).toBeGreaterThanOrEqual(40);
    });
});
