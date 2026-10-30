// The economy and spec-budget defaults of the big bang (natural-selection Phase 2 switch rows).

import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { yearTicks } from '../../js/sim/eras.js';

describe('the economy defaults', () => {
    const c = createConfig({});
    const { scout, defender, forager, reproducer, predator } = c.specialisations;

    it('keeps a small energy store, a loud alarm and two seasons of life', () => {
        expect([c.maxEnergy, c.alarmCost, c.maxAgeTicks]).toEqual([2000, 5, 72000]);
        expect(c.maxAgeTicks).toBe(2 * c.eraSeasonTicks);
        expect(yearTicks(c)).toBe(4 * c.eraSeasonTicks);
    });

    it('makes the scout pay for far sight', () => {
        expect([scout.moveCostMultiplier, scout.passiveLossMultiplier, scout.biteTakenMultiplier]).toEqual([
            1, 1.3, 1.5,
        ]);
    });

    it('makes the defender costly to be, and its bites costly to deliver', () => {
        expect([defender.moveCostMultiplier, defender.biteTakenMultiplier, defender.kickMultiplier]).toEqual([
            1.2, 0.5, 2,
        ]);
    });

    it('leaves the forager, reproducer and predator budgets alone', () => {
        for (const spec of [forager, reproducer, predator]) {
            expect([spec.moveCostMultiplier, spec.biteTakenMultiplier, spec.kickMultiplier]).toEqual([1, 1, 1]);
        }
        expect([
            forager.passiveLossMultiplier,
            reproducer.passiveLossMultiplier,
            predator.passiveLossMultiplier,
        ]).toEqual([1, 1, 0.6]);
    });
});
