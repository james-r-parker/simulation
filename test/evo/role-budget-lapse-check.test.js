import { describe, expect, it } from 'vitest';
import { preStep5Arena } from '../helpers/pre-step5.js';
import { formulaLapse, simLapse } from '../../js/evo/role-budget-lapse-check.js';

describe('formulaLapse and simLapse', () => {
    const config = /** @type {any} */ (preStep5Arena());
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

    it('lapse where a weak sprint is outrun: the formula gives up on the tick the sim does, well before the run ends', () => {
        const weak = /** @type {any} */ (preStep5Arena({ specialisations: { predator: { sprintBoost: 0.2 } } }));
        const at = { hunter: 'predator', prey: 'forager', distance: 200 };
        const sim = simLapse(weak, at);
        const formula = formulaLapse(weak, at);
        expect(sim.killTick).toBeNull();
        expect(sim.lapse).toBeLessThan(250);
        expect(Math.abs(formula.lapse - sim.lapse)).toBeLessThanOrEqual(2);
    });

    it('read a prey that is never closed on as a chase that never opened: the whole run, no give-up seen', () => {
        const weak = /** @type {any} */ (preStep5Arena({ specialisations: { predator: { sprintBoost: 0.2 } } }));
        const at = { hunter: 'predator', prey: 'forager', distance: 900 };
        expect(simLapse(weak, at).lapse).toBe(250);
        expect(formulaLapse(weak, at).lapse).toBe(250);
    });
});
