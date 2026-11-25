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
    { name: 'a short-ranged scout', config: { specialisations: { scout: { body: { callRadius: 0.6 } } } } },
];

const EFFORT_ONE = "at effort 1, the oracle hunter's, the formula and the sim agree on whether the forager is caught";

describe('the scout budget against the scenes', () => {
    it.each(configs)('$name: no reading outside its tolerance', ({ config }) => {
        const { readings } = warnCheck(arenaConfig(config), MODEL_DEFAULTS);
        expect(readings.filter((r) => r.drift).map((r) => r.what)).toEqual([]);
    });

    it('at effort 1 the formula agrees with the sim on whether the forager is caught on every arm, even and stalker included (T15a)', () => {
        for (const { name, config } of configs) {
            const read = warnCheck(arenaConfig(config), MODEL_DEFAULTS).readings.find((r) => r.what === EFFORT_ONE);
            expect(read?.drift, name).toBe(false);
        }
        const caught = (/** @type {string} */ arm) => {
            const { config } = configs.find((c) => c.name === arm) ?? { config: {} };
            return warnCheck(arenaConfig(config), MODEL_DEFAULTS).readings.find((r) => r.what === EFFORT_ONE);
        };
        // true reads the forager escapes the oracle hunter: it does on even (427 px against 313 before) and stalker (311 against
        // 305 before), and not on courser
        expect([caught('even')?.formula, caught('even')?.scene]).toEqual([true, true]);
        expect([caught('stalker')?.formula, caught('stalker')?.scene]).toEqual([true, true]);
        expect([caught('courser')?.formula, caught('courser')?.scene]).toEqual([false, false]);
    });

    it('a forager the budget calls safe is safe on every arm, and the arms differ in whether the hunter closes', () => {
        const status = configs.map(({ config }) => {
            const c = arenaConfig(config);
            const [scout, forager, hunter] = ['scout', 'forager', 'predator'].map((s) => roleParams(c, s));
            return budgetWarn(scout, forager, hunter, MODEL_DEFAULTS).cells.run.status;
        });
        expect(status).toContain('impossible');
        expect(status).toContain('ok');
    });
});
