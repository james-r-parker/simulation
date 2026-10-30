// Birth sources: births by cause, from known counts.

import { describe, expect, it } from 'vitest';
import { BORN_CAUSE } from '../../js/sim/events.js';
import { computeMetrics } from '../../js/evo/metrics.js';
import { BIRTH_SOURCES } from '../../js/evo/scene-births.js';
import { observed } from './helpers/observer-world.js';

const read = (/** @type {any} */ r, /** @type {string} */ name) =>
    computeMetrics(r.observer, r.world)[`eval.birth_source_share.${name}`];

describe('eval.birth_source_share.*', () => {
    it('are the shares of births after burn-in by cause', () => {
        const r = observed();
        const after = r.observer.birthsAfterBurnIn;
        after[BORN_CAUSE.SPLIT] = 10;
        after[BORN_CAUSE.MATE] = 20;
        after[BORN_CAUSE.FLOOR] = 5;
        after[BORN_CAUSE.IMMIGRANT] = 15;
        const expected = { split: 0.2, mate: 0.4, floor: 0.1, immigrant: 0.3 };
        for (const name of BIRTH_SOURCES) {
            expect(read(r, name).value, name).toBeCloseTo(expected[/** @type {keyof typeof expected} */ (name)], 12);
        }
    });

    it('sum to 1 over the four sources', () => {
        const r = observed();
        r.observer.birthsAfterBurnIn[BORN_CAUSE.MATE] = 3;
        r.observer.birthsAfterBurnIn[BORN_CAUSE.FLOOR] = 2;
        const sum = BIRTH_SOURCES.reduce((total, name) => total + (read(r, name).value ?? 0), 0);
        expect(sum).toBeCloseTo(1, 12);
    });

    it('are null with a reason before any birth after burn-in', () => {
        const r = observed();
        for (const name of BIRTH_SOURCES) {
            expect(read(r, name)).toEqual({ value: null, reason: 'no birth after burn-in' });
        }
    });
});
