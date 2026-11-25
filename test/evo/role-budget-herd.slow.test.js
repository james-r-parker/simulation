// The Phase 5 cross-check of docs/designs/role-budget.md ("Cross-check against the sim"): the herd rows against the scripted stampede of the
// real sim, at the defaults and where the herd's numbers move.
import { describe, expect, it } from 'vitest';
import { createPreStep5Config } from '../helpers/pre-step5.js';
import { herdCheck } from '../../js/evo/role-budget-herd-check.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import { measureStampede } from '../../js/evo/role-scenes-herd.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

const LIMIT = scaleTimeout(120_000);

describe('the herd rows against the stampede of the sim', () => {
    it.each([
        ['defaults', {}],
        ['a slower herd', { herdRunSpeed: 4 }],
        ['a larger herd (ring inside 4 radii)', { herdSize: 10 }],
        ['a ruder herd', { trampleDamage: 800 }],
    ])(
        '%s: no reading outside its tolerance for any spec the scene reads',
        (_name, overrides) => {
            const check = herdCheck(createPreStep5Config(overrides), MODEL_DEFAULTS);
            expect(check.readings.filter((r) => r.drift)).toEqual([]);
        },
        LIMIT,
    );

    it(
        'a stampede travels about 2227 px in 360 ticks and its half-width stays near the ring (the centroid follows the herd)',
        () => {
            const m = measureStampede(createPreStep5Config({}));
            expect(m.centroid).toBeGreaterThan(2200);
            expect(m.centroid).toBeLessThan(2250);
            expect(m.halfWidth.end).toBeLessThan(m.halfWidth.start * 1.1);
        },
        LIMIT,
    );
});
