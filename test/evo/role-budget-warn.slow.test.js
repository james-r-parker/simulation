// The Phase 3 cross-check of docs/designs/role-budget.md ("Cross-check against the sim"): the scout budget against the scripted
// warning of the real sim, at the defaults and on each arm of evals/fair-chase/, where the hunter does and does not close on
// the warned forager.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import { budgetWarn } from '../../js/evo/role-budget-warn.js';
import { warnCheck } from '../../js/evo/role-budget-warn-check.js';
import { roleParams } from '../../js/evo/role-budget-params.js';

vi.setConfig({ testTimeout: 300_000 });

const ARMS = ['control', 'courser', 'even', 'long', 'stalker'];
const configs = [
    { name: 'defaults', config: {} },
    ...ARMS.map((name) => ({ name, config: JSON.parse(readFileSync(`evals/fair-chase/${name}.json`, 'utf8')) })),
    { name: 'a short-ranged scout', config: { scoutCallRadiusMultiplier: 0.6 } },
];

const EFFORT_ONE = "at effort 1, the oracle hunter's, the formula and the sim agree on whether the forager is caught";

/**
 * The known gap of the formula (docs/designs/role-budget.md, "As built"), found by the two-sided reading at effort 1: on these
 * arms the formula says the warned forager is caught and the oracle forager escapes (even: it closes from 427 px against 313;
 * stalker: from 311 against 305). The formula holds the forager still while it turns and starts its flight from rest, where the
 * sim's forager has gained about 25 px and is moving. Every other reading is inside its tolerance on every arm.
 */
const KNOWN_GAP = new Map([
    ['even', [EFFORT_ONE]],
    ['stalker', [EFFORT_ONE]],
]);

describe('the scout budget against the scenes', () => {
    it.each(configs)('$name: no reading outside its tolerance but the known gap', ({ name, config }) => {
        const { readings } = warnCheck(arenaConfig(config), MODEL_DEFAULTS);
        expect(readings.filter((r) => r.drift).map((r) => r.what)).toEqual(KNOWN_GAP.get(name) ?? []);
    });

    it('at effort 1 the formula agrees with the sim on whether the forager is caught on every arm but even and stalker', () => {
        for (const { name, config } of configs) {
            const read = warnCheck(arenaConfig(config), MODEL_DEFAULTS).readings.find((r) => r.what === EFFORT_ONE);
            expect(read?.drift, name).toBe(KNOWN_GAP.has(name));
        }
    });

    it('a forager the budget calls safe is safe on every arm, and the arms differ in whether the hunter closes', () => {
        const status = configs.map(({ config }) => {
            const c = arenaConfig(config);
            const [scout, forager, hunter] = ['scout', 'forager', 'predator'].map((s) => roleParams(c, s));
            return budgetWarn(scout, forager, hunter, MODEL_DEFAULTS).cells.run.status;
        });
        expect(status).toContain('impossible');
        expect(status).toContain('tight');
    });
});
