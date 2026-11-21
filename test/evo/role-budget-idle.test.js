import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { contextOf, lifeOf } from '../../js/evo/role-budget-forage.js';
import { TIGHT_RATIO, birthEnergies, budgetIdle, idleLine } from '../../js/evo/role-budget-idle.js';
import { roleParams } from '../../js/evo/role-budget-params.js';

/** @param {Record<string, any>} overrides @param {string} [spec] @returns {ReturnType<typeof contextOf>} */
function ctxOf(overrides, spec = 'forager') {
    const config = createConfig(overrides);
    return contextOf(config, spec, roleParams(config, spec, {}, { age: 'juvenile' }));
}

describe('birthEnergies', () => {
    it('are the founder, the entrant and the half of the gate a child is given', () => {
        expect(birthEnergies(ctxOf({}).p)).toEqual({ founder: 800, entrant: 200, child: 450 });
        expect(birthEnergies(ctxOf({}, 'predator').p).child).toBe(300);
    });
});

describe('idleLine', () => {
    it('a sitter outlives a searcher: its life is read from the temperature recurrence, the ratio is the two lives', () => {
        const line = idleLine(ctxOf({}), 200);
        expect(line.idleLife).toBe(lifeOf(ctxOf({}), { energy: 200, speed: 0 }).ticks);
        expect(line.ratio).toBeCloseTo(line.idleLife / line.activeLife, 12);
        expect(line.ratio).toBeGreaterThan(1);
        expect(line.coldest).toBeGreaterThan(0);
    });

    it('a body that cools at once and pays double for it (a cold world) loses the sitter its extra life', () => {
        const mild = idleLine(ctxOf({}), 200);
        const cold = idleLine(ctxOf({ temperatureStart: 41, temperatureLossPassive: 0.05 }), 200);
        expect(cold.ratio).toBeLessThan(mild.ratio);
        expect(cold.coldest).toBe(0);
    });
});

describe('budgetIdle', () => {
    it('is tight at the defaults, binding on the entrant (the poorest) and reading the largest ratio', () => {
        const b = budgetIdle(ctxOf({}));
        expect(b.row.name).toBe('forager:idle');
        expect(b.cells.sit.status).toBe('tight');
        expect(b.ratio).toBeGreaterThan(1);
        expect(b.ratio).toBeLessThanOrEqual(TIGHT_RATIO);
        expect(b.ratio).toBe(Math.max(...Object.values(b.rules).map((r) => r.ratio)));
        expect(/** @type {number} */ (b.cells.sit.margin)).toBeLessThan(0);
        expect(b.row.binding).toBe('sit');
    });

    it('is ok when searching outlives sitting, impossible when sitting outlives it more than twice over', () => {
        // movement costs nothing and heat is kept by moving: a walker lives longer than a sitter in the cold
        const ok = budgetIdle(ctxOf({ movementCost: 0.0001, temperatureGainMove: 0.02, temperatureLossPassive: 0.02 }));
        expect(ok.cells.sit.status).toBe('ok');
        // a walker pays for every px and a sitter does not: sitting lives more than twice as long
        const red = budgetIdle(ctxOf({ movementCost: 0.2, temperaturePassiveLossFactor: 1 }));
        expect(red.cells.sit.status).toBe('impossible');
        expect(red.cells.sit.margin).toBeNull();
        expect(red.ratio).toBeGreaterThan(TIGHT_RATIO);
    });

    it('the cold stack of chilled shortens the sitter and so lowers the ratio', () => {
        const off = ctxOf({});
        const on = { ...off, cold: { rate: 0.2, max: 10, ticks: 60, recover: 15 } };
        expect(budgetIdle(on).ratio).toBeLessThan(budgetIdle(off).ratio);
    });

    it('reads every spec: the scout, which pays more to stand, sits for less', () => {
        expect(budgetIdle(ctxOf({}, 'scout')).rules.entrant.idleLife).toBeLessThan(
            budgetIdle(ctxOf({})).rules.entrant.idleLife,
        );
    });
});
