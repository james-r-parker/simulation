// reads: evals/fair-chase/courser.json
// The cross-check of a failed chase's length (docs/designs/role-budget.md, "A hunter's living"): the formula's give-up tick beside
// the sim's, within the plan's tick tolerance, and the energy spent by then within its net tolerance.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { TOLERANCE } from '../../js/evo/role-budget-check.js';
import { formulaLapse, simLapse } from '../../js/evo/role-budget-lapse-check.js';

const courser = JSON.parse(readFileSync('evals/fair-chase/courser.json', 'utf8'));
const configs = [
    ['defaults', arenaConfig()],
    ['courser', arenaConfig(courser)],
];
const scenes = ['forager', 'scout'].flatMap((prey) => [200, 300, 400].map((distance) => ({ prey, distance })));
const TIMEOUT = scaleTimeout(120000);

describe('a failed chase against the sim', () => {
    it.each(configs)(
        '%s: the formula lapses within the tick tolerance of the sim, and the energy spent is within the net tolerance',
        (_, config) => {
            for (const scene of scenes) {
                const at = { hunter: 'predator', ...scene };
                const sim = simLapse(/** @type {any} */ (config), at);
                const formula = formulaLapse(/** @type {any} */ (config), at);
                expect(Math.abs(formula.lapse - sim.lapse), JSON.stringify(scene)).toBeLessThanOrEqual(
                    TOLERANCE.contactTicks,
                );
                expect(
                    Math.abs(formula.spent - sim.spent) / Math.max(sim.spent, 1),
                    JSON.stringify(scene),
                ).toBeLessThanOrEqual(TOLERANCE.killNet);
                expect(formula.killTick === null, JSON.stringify(scene)).toBe(sim.killTick === null);
            }
        },
        TIMEOUT,
    );

    it(
        'does not lapse at the defaults: the scripted hunter keeps closing on a sighted prey for the 250 ticks',
        () => {
            const sim = simLapse(/** @type {any} */ (configs[0][1]), {
                hunter: 'predator',
                prey: 'forager',
                distance: 300,
            });
            expect(sim.killTick).toBeNull();
            expect(sim.lapse).toBe(250);
        },
        TIMEOUT,
    );
});
