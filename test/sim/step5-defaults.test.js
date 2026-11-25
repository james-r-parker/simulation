// The step 5 adoption (body-genes T18, status-effects T18): the defaults are the numbers of evals/role-budget/step5-e.json,
// and the fat-only block stays at 0 (body-genes T18b).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';

const arm = JSON.parse(readFileSync('evals/role-budget/step5-e.json', 'utf8'));

describe('the step 5 defaults', () => {
    it('are every key of step5-e.json', () => {
        const config = /** @type {Record<string, any>} */ (createConfig());
        for (const [key, value] of Object.entries(arm)) {
            if (key === 'specialisations') {
                expect(config.specialisations.predator.sprintDrainMultiplier).toBe(
                    value.predator.sprintDrainMultiplier,
                );
            } else {
                expect(config[key], key).toBe(value);
            }
        }
    });

    it('leave the fat-only block (the new trait spans, fatSlow, sizeTurn, burnThrust) at 0', () => {
        const config = /** @type {Record<string, any>} */ (createConfig());
        expect([config.fatSlow, config.sizeTurn, config.burnThrust]).toEqual([0, 0, 0]);
    });
});
