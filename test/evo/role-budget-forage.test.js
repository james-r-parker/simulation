import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import {
    bestRangeSpeed,
    contextOf,
    eatingSpeeds,
    forageCycle,
    gaitCost,
    heatFactor,
    lifeOf,
    patchFoodDensity,
    splitGate,
} from '../../js/evo/role-budget-forage.js';
import { roleParams } from '../../js/evo/role-budget-params.js';

/** @param {Record<string, any>} overrides @param {string} spec @returns {ReturnType<typeof contextOf>} */
function ctxOf(overrides, spec = 'forager') {
    const config = createConfig(overrides);
    return contextOf(config, spec, roleParams(config, spec));
}

describe('the world numbers', () => {
    it('reads the patch density from the cap, the background share and the patches', () => {
        const { world } = ctxOf({});
        expect(patchFoodDensity(world)).toBeCloseTo((3600 * 0.98) / (16 * Math.PI * 400 ** 2), 12);
        expect(world.area).toBe(14400 * 8100);
    });

    it('splits at the larger of the spec gate and what leaves the birth reserve', () => {
        expect(splitGate(ctxOf({}).p)).toBe(900);
        expect(splitGate(ctxOf({}, 'predator').p)).toBe(600);
        expect(splitGate(ctxOf({ birthReserve: 600 }).p)).toBe(1200);
    });
});

describe('the cost of a gait', () => {
    it('is the standing terms plus the movement term, on the size the energy gives', () => {
        const ctx = ctxOf({});
        const expected = 0.06 + 0.00025 * ctx.p.size + 0.015 * 36;
        expect(gaitCost(ctx, { speed: 6, energy: 1000 })).toBeCloseTo(expected, 9);
    });

    it('rises with the heat factor and the cold stack only where the passive terms do', () => {
        const ctx = ctxOf({});
        const still = gaitCost(ctx, { speed: 0, energy: 1000 });
        expect(gaitCost(ctx, { speed: 0, energy: 1000, heat: 2 })).toBeCloseTo(2 * still, 9);
        expect(gaitCost(ctx, { speed: 0, energy: 1000, stacks: 5 })).toBeCloseTo(still, 9);
        const cold = { ...ctx, cold: { ...ctx.cold, rate: 0.1 } };
        expect(gaitCost(cold, { speed: 0, energy: 1000, stacks: 5 })).toBeCloseTo(1.5 * still, 9);
    });

    it('reads the heat factor through the sim: 1 in the band, 2 at temperature 0', () => {
        const ctx = ctxOf({});
        expect(heatFactor(ctx, 50)).toBe(1);
        expect(heatFactor(ctx, 0)).toBe(2);
        expect(heatFactor(ctx, 20)).toBeCloseTo(1.5, 9);
    });
});

describe('bestRangeSpeed', () => {
    it('is the speed that costs least per px, found by a scan', () => {
        const ctx = ctxOf({});
        const per = (/** @type {number} */ v) => gaitCost(ctx, { speed: v, energy: 200 }) / v;
        const best = bestRangeSpeed(ctx, 200);
        for (let v = 0.2; v <= 8; v += 0.2) {
            expect(per(best)).toBeLessThanOrEqual(per(v) + 1e-12);
        }
        expect(best).toBeLessThan(8);
    });

    it('is capped at the cruise speed when the standing cost dominates', () => {
        expect(bestRangeSpeed(ctxOf({ passiveLoss: 5 }), 200)).toBe(8);
    });
});

describe('lifeOf', () => {
    it('counts the ticks a sitter lasts from a hand loop, the temperature falling out of the band', () => {
        const ctx = ctxOf({});
        let t = 50;
        let e = 200;
        let n = 0;
        while (e > 0) {
            t = Math.max(0, t - 0.0075 * 1.15);
            e -= gaitCost(ctx, { speed: 0, energy: e, heat: heatFactor(ctx, t) });
            n += 1;
        }
        expect(lifeOf(ctx, { energy: 200, speed: 0 }).ticks).toBe(n);
    });

    it('is capped at the limit and tracks the lowest temperature', () => {
        const ctx = ctxOf({});
        expect(lifeOf(ctx, { energy: 1e9, speed: 0, limit: 100 }).ticks).toBe(100);
        expect(lifeOf(ctx, { energy: 1e9, speed: 0, limit: 100 }).heat).toBeCloseTo(50 - 100 * 0.0075 * 1.15, 9);
    });

    it('a walk warms the body, so it stays in the band longer than a sitter', () => {
        const ctx = ctxOf({});
        expect(lifeOf(ctx, { energy: 1e9, speed: 8, limit: 500 }).heat).toBeGreaterThan(
            lifeOf(ctx, { energy: 1e9, speed: 0, limit: 500 }).heat,
        );
    });

    it('the cold stack raises the passive cost once the body is under the band, so the sitter dies sooner', () => {
        const off = ctxOf({});
        const on = { ...off, cold: { rate: 0.2, max: 10, ticks: 60, recover: 15 } };
        expect(lifeOf(on, { energy: 200, speed: 0 }).ticks).toBeLessThan(lifeOf(off, { energy: 200, speed: 0 }).ticks);
    });
});

describe('forageCycle', () => {
    it('walks the path one new item takes at the handling gait, then the grazing speed, and nets the income less both costs', () => {
        const ctx = ctxOf({});
        const speeds = eatingSpeeds(ctx.p);
        expect(speeds.graze).toBeCloseTo(5.985, 9);
        expect(speeds.handling).toBeCloseTo(0.105 * 0.6 * 19, 9);
        const density = patchFoodDensity(ctx.world);
        const c = forageCycle(ctx, { density, energy: 200 });
        const sweep = 2 * (ctx.p.sizing.base + 200 / ctx.p.sizing.perEnergy + 20);
        expect(c.pathPerMeal).toBeCloseTo(1 / (density * sweep), 9);
        const slow = speeds.handling * 20;
        const ticks =
            c.pathPerMeal <= slow ? c.pathPerMeal / speeds.handling : 20 + (c.pathPerMeal - slow) / speeds.graze;
        expect(c.cycleTicks).toBeCloseTo(Math.max(10, ticks), 9);
        const handle = Math.min(c.cycleTicks, 20);
        const spent =
            handle * gaitCost(ctx, { speed: speeds.handling, energy: 200 }) +
            (c.cycleTicks - handle) * gaitCost(ctx, { speed: speeds.graze, energy: 200 });
        expect(c.netPerMeal).toBeCloseTo(100 - spent, 9);
        expect(c.net).toBeCloseTo((100 - spent) / c.cycleTicks, 9);
        expect(c.find).toBeCloseTo(density * sweep * speeds.graze, 12);
    });

    it('is held to a meal every digestTicks when food is so dense a meal needs no walking', () => {
        const dense = forageCycle(ctxOf({}), { density: 1 });
        expect(dense.cycleTicks).toBe(10);
        expect(dense.searchTicks).toBe(0);
        expect(forageCycle(ctxOf({ digestTicks: 25 }), { density: 1 }).cycleTicks).toBe(25);
    });

    it('overlaps the digest window with the handling window: the longer one is at the handling gait', () => {
        expect(forageCycle(ctxOf({ digestTicks: 30, handlingTicks: 20 }), { density: 1 }).handleTicks).toBe(30);
        expect(forageCycle(ctxOf({}), { density: 1e-3 }).handleTicks).toBeLessThanOrEqual(20);
    });

    it('a thinner patch means a longer walk per meal and a lower rate', () => {
        const ctx = ctxOf({});
        const thin = forageCycle(ctx, { density: 1e-5 });
        const thick = forageCycle(ctx, { density: 1e-3 });
        expect(thin.net).toBeLessThan(thick.net);
        expect(thin.grazeTicks).toBeGreaterThan(0);
    });
});
