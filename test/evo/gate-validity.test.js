import { describe, expect, it } from 'vitest';
import { REFERENCE_KINDS, gateValidity } from '../../js/evo/gate-validity.js';

/** @param {string} read a condition key @param {number} min its bound @returns {any[]} a one-stage ladder */
const ladderOf = (read, min) => [
    { name: 'probe', config: null, minGenerations: 1, maxGenerations: 2, gate: [{ read, min }] },
];

describe('gateValidity', () => {
    it('reads each drill condition against every reference and the random brains', () => {
        const [row] = gateValidity(ladderOf('drill.food-ahead.edgeLow', 0.3), { trials: 8 });
        expect(row.stage).toBe('probe');
        expect(Object.keys(row.passedBy)).toEqual([...REFERENCE_KINDS]);
        expect(row.passedBy.memoryless).toBe(true);
        expect(row.randomFails).toBe(true);
        expect(row.level).toBe('memoryless');
    });

    it('calls a condition nothing can reach invalid, and skips conditions that are not drill readings', () => {
        const ladder = [
            ...ladderOf('drill.food-ahead.edgeLow', 1.5),
            ...ladderOf('retention.all', 1),
            ...ladderOf('crossplay.cycleShare', 0),
        ];
        const rows = gateValidity(ladder, { trials: 8 });
        expect(rows).toHaveLength(1);
        expect(rows[0].level).toBe('none');
        expect(Object.values(rows[0].passedBy).some(Boolean)).toBe(false);
    });

    it('is a function of its seed', () => {
        const ladder = ladderOf('drill.food-ahead.edgeLow', 0.3);
        expect(gateValidity(ladder, { seed: 3, trials: 8 })).toEqual(gateValidity(ladder, { seed: 3, trials: 8 }));
    });
});
