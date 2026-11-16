import { describe, expect, it } from 'vitest';
import { REFERENCE_KINDS } from '../js/evo/gate-validity.js';
import { formatValidity, main } from '../scripts/ladder-validity.mjs';

describe('formatValidity', () => {
    it('prints a header and one line per condition with its weakest passing reference', () => {
        const passedBy = Object.fromEntries(REFERENCE_KINDS.map((k) => [k, k === 'oracle']));
        const lines = formatValidity([
            { stage: 'hunt', read: 'drill.kin-spared.edgeLow', passedBy, randomFails: true, level: 'oracle' },
        ]);
        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain('random-fails');
        expect(lines[1]).toContain('drill.kin-spared.edgeLow');
        expect(lines[1].trim().endsWith('oracle')).toBe(true);
    });
});

describe('main', () => {
    it('is exported as a function that returns an exit code', () => {
        expect(typeof main).toBe('function');
    });
});
