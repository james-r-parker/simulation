import { describe, expect, it } from 'vitest';
import { SPECIALISATION_FIELDS, SPEC_FIELD_RULES } from '../../js/sim/config-spec-rules.js';

describe('SPEC_FIELD_RULES', () => {
    it('has a rule for every field after index, and none for index', () => {
        expect(Object.keys(SPEC_FIELD_RULES).sort()).toEqual(SPECIALISATION_FIELDS.slice(1).sort());
    });

    it('bounds the T15f multipliers: loss above 0 to 2, split threshold 0.25 to 2', () => {
        expect(SPEC_FIELD_RULES.passiveLossMultiplier).toEqual({ type: 'num', gt: 0, max: 2 });
        expect(SPEC_FIELD_RULES.splitMinEnergyMultiplier).toMatchObject({ type: 'num', min: 0.25, max: 2 });
    });
});
