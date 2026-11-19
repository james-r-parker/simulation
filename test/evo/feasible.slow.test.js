import { describe, expect, it } from 'vitest';
import { BITE_DRILLS, fairBands } from '../../js/evo/feasible.js';

describe('fairBands', () => {
    it('plays each hunting specialisation against the forager at the config forager sprint', () => {
        const bands = fairBands({ specialisations: { forager: { sprintBoost: 0.2 } } }, { trials: 1 });
        expect(Object.keys(bands)).toEqual(['predator']);
        expect(Array.isArray(bands.predator)).toBe(true);
        expect(BITE_DRILLS).toContain('prey-ahead');
    });
});
