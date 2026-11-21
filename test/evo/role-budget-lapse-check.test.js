import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { formulaLapse, simLapse } from '../../js/evo/role-budget-lapse-check.js';

describe('formulaLapse and simLapse', () => {
    const config = /** @type {any} */ (arenaConfig());
    const scene = { hunter: 'predator', prey: 'forager', distance: 300 };

    it('read a chase that does not kill as its whole run, with the energy spent in it', () => {
        const formula = formulaLapse(config, scene);
        expect(formula.killTick).toBeNull();
        expect(formula.lapse).toBe(250);
        expect(formula.spent).toBeGreaterThan(500);
    });

    it('agree on whether a close start kills, and stay inside the run', () => {
        const near = { hunter: 'predator', prey: 'forager', distance: 60 };
        const formula = formulaLapse(config, near);
        const sim = simLapse(config, near);
        expect(formula.killTick === null).toBe(sim.killTick === null);
        expect(formula.lapse).toBeLessThanOrEqual(250);
        expect(sim.lapse).toBeLessThanOrEqual(250);
    });
});
