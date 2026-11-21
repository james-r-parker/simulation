import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { budgetFirstMeal, nearestEdge } from '../../js/evo/role-budget-first-meal.js';
import { contextOf } from '../../js/evo/role-budget-forage.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import { roleParams } from '../../js/evo/role-budget-params.js';
import { createRng, nextFloat } from '../../js/sim/rng.js';

/** @param {Record<string, any>} overrides @param {string} [spec] @returns {ReturnType<typeof budgetFirstMeal>} */
function firstMeal(overrides, spec = 'forager') {
    const config = createConfig(overrides);
    const p = roleParams(config, spec, {}, { age: 'juvenile' });
    return budgetFirstMeal(contextOf(config, spec, p), { model: MODEL_DEFAULTS });
}

describe('nearestEdge', () => {
    it('matches the nearest of 16 random centres over 10000 seeded points, on a torus (no wall) the size of the world', () => {
        const [w, h, n, draws] = [14400, 8100, 16, 10000];
        const rng = createRng(7);
        let sum = 0;
        let within = 0;
        for (let i = 0; i < draws; i++) {
            let nearest = Infinity;
            for (let k = 0; k < n; k++) {
                const dx = Math.abs(nextFloat(rng) * w - w / 2);
                const dy = Math.abs(nextFloat(rng) * h - h / 2);
                nearest = Math.min(nearest, Math.hypot(dx, dy));
            }
            sum += nearest;
            within += nearest < 1000 ? 1 : 0;
        }
        const edge = nearestEdge({ n, rho: 0, area: w * h });
        expect(Math.abs(sum / draws / edge.mean - 1)).toBeLessThan(0.04);
        // the share inside 1000 px is 1 - exp(-a r^2), within the sampling error of 10000 draws
        expect(Math.abs(within / draws - (1 - Math.exp(-edge.a * 1000 ** 2)))).toBeLessThan(0.03);
    });

    it('subtracts the radius: the mean edge distance falls by about the radius, and the p90 by exactly it', () => {
        const base = nearestEdge({ n: 16, rho: 0, area: 14400 * 8100 });
        const big = nearestEdge({ n: 16, rho: 400, area: 14400 * 8100 });
        expect(big.mean).toBeLessThan(base.mean - 350);
        expect(big.p90).toBeCloseTo(base.p90 - 400, 6);
    });

    it('is 1350 px to a centre and 959 to the edge at the defaults', () => {
        expect(nearestEdge({ n: 16, rho: 0, area: 14400 * 8100 }).mean).toBeCloseTo(1349.6, 0);
        expect(nearestEdge({ n: 16, rho: 400, area: 14400 * 8100 }).mean).toBeCloseTo(959, 0);
    });
});

describe('the first meal of a forager at the defaults', () => {
    const b = firstMeal({});

    it('reads each birth rule: a founder 800, an entrant 200, a child half the gate', () => {
        expect(b.rules.founder.energy).toBe(800);
        expect(b.rules.entrant.energy).toBe(200);
        expect(b.rules.child.energy).toBe(450);
    });

    it('finds the patch blind after about 5200 px, farther than a 200-energy body walks, so find is red and binds', () => {
        expect(b.rules.entrant.find.path).toBeCloseTo((14400 * 8100) / (16 * 2 * 700), 6);
        expect(b.rules.entrant.range).toBeLessThan(b.rules.entrant.find.path);
        expect(b.cells.find.status).toBe('impossible');
        expect(b.row.binding).toBe('find');
    });

    it('reaches the nearest patch edge from the entrant start with room to spare when it knows the way', () => {
        expect(b.rules.entrant.reach.share).toBeGreaterThan(0.95);
        expect(b.cells.reach.status).toBe('ok');
        expect(b.rules.entrant.reach.p90).toBeGreaterThan(b.rules.entrant.reach.mean);
    });

    it('a child is born inside a patch: nothing to reach or find', () => {
        expect(b.rules.child.reach.mean).toBe(0);
        expect(b.rules.child.find.path).toBe(0);
        expect(b.rules.child.eat.meals).toBe(0);
    });

    it('a richer birth walks further, so the founder meets a patch where the entrant does not', () => {
        expect(b.rules.founder.range).toBeGreaterThan(b.rules.entrant.range);
        expect(b.rules.founder.find.share).toBeGreaterThan(b.rules.entrant.find.share);
    });

    it('the eat step needs less than one meal to climb back to the birth energy, from a patch of 220', () => {
        expect(b.rules.entrant.eat.meals).toBeLessThan(1);
        expect(b.source.holds).toBeCloseTo((3528 / (16 * Math.PI * 400 ** 2)) * Math.PI * 400 ** 2, 6);
        expect(b.cells.eat.status).toBe('ok');
    });
});

describe('the first meal where the numbers move', () => {
    it('is ok when the entrant is born with energy for the blind walk', () => {
        const b = firstMeal({ entrantEnergy: 800, initialEnergy: 800 });
        expect(b.rules.entrant.range).toBeGreaterThan(b.rules.entrant.find.path);
        expect(b.cells.find.status).toBe('ok');
        expect(b.row.status).toBe('ok');
    });

    it('is red on reach and find when the patches are few', () => {
        const b = firstMeal({ foodPatchCount: 1, foodPatchRadius: 100 });
        expect(b.cells.reach.status).toBe('impossible');
    });

    it('a hunter hunts prey: the source is the prey alive, with its size, and the eat step is its net per chase', () => {
        const config = createConfig({});
        const p = roleParams(config, 'predator', {}, { age: 'juvenile' });
        const b = budgetFirstMeal(contextOf(config, 'predator', p), {
            model: MODEL_DEFAULTS,
            hunting: { preySize: 29, net: 400, ticks: 60 },
        });
        expect(b.source.n).toBe(450);
        expect(b.source.rho).toBe(29);
        expect(b.rules.entrant.eat.meals).toBeGreaterThanOrEqual(0);
        expect(b.row.name).toBe('predator:first-meal');
    });

    it('a hunter that loses energy on every chase has no way to climb back: eat is impossible', () => {
        const config = createConfig({});
        const p = roleParams(config, 'predator', {}, { age: 'juvenile' });
        const b = budgetFirstMeal(contextOf(config, 'predator', p), {
            model: MODEL_DEFAULTS,
            hunting: { preySize: 29, net: -10, ticks: 60 },
        });
        expect(b.cells.eat.status).toBe('impossible');
    });
});
