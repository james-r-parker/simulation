// The unit-level director soak (renderer-event-effects T34) on a small world: shots are taken, shares sum to 1 and no
// kind holds the screen alone. The recorded default-world numbers are in the design doc.
import { describe, expect, it } from 'vitest';
import { scaleTimeout } from '../../../scripts/lib/test-timeout.mjs';
import { SMALL_CONFIG } from '../../worker/helpers/host-harness.js';
import { directorSoak } from './helpers/director-soak.js';

describe('director soak', () => {
    it(
        'takes shots of more than one kind on a small world',
        () => {
            const r = directorSoak({ seed: 1, overrides: SMALL_CONFIG, ticks: 12000 });
            expect(r.shots).toBeGreaterThan(0);
            const total = Object.values(r.shares).reduce((a, b) => a + b, 0);
            expect(total).toBeCloseTo(1);
            expect(Object.keys(r.shares).length).toBeGreaterThan(1);
            expect(r.maxKindShare).toBeLessThan(1);
            expect(r.shotsPerHour).toBeGreaterThan(0);
        },
        scaleTimeout(120_000),
    );
});
