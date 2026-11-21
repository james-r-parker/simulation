// The detector list: each detector is named once, and the lean ones are among them.

import { describe, expect, it } from 'vitest';
import { DETECTORS, LEAN_DETECTORS } from '../../js/evo/detectors.js';

describe('DETECTORS', () => {
    it('names each detector once, and the lean ones are among them', () => {
        const names = DETECTORS.map((detector) => detector.name);
        expect(new Set(names).size).toBe(names.length);
        for (const lean of LEAN_DETECTORS) {
            expect(DETECTORS).toContain(lean);
        }
    });
});
