import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { createRng, fork } from '../../js/sim/rng.js';
import { SPEC } from '../../js/sim/specs.js';
import { RAY_SPACING, forwardRay, heardPlan, lone, preyAt } from '../../js/evo/reflex-roles-stage.js';
import { DEG } from '../../js/evo/reflex-stage.js';

const rng = () => fork(createRng(3), 'roles-stage');

describe('forwardRay', () => {
    it('is one to three ray spacings off the heading, give or take the jitter, on either side', () => {
        const r = rng();
        const draws = Array.from({ length: 200 }, () => forwardRay(r));
        for (const b of draws) {
            const k = Math.round(Math.abs(b) / RAY_SPACING);
            expect(k).toBeGreaterThanOrEqual(1);
            expect(k).toBeLessThanOrEqual(3);
            expect(Math.abs(Math.abs(b) - k * RAY_SPACING)).toBeLessThanOrEqual(3 * DEG + 1e-9);
        }
        expect(draws.some((b) => b < 0) && draws.some((b) => b > 0)).toBe(true);
        expect(RAY_SPACING).toBeCloseTo((2 * Math.PI) / createConfig().rayCount, 12);
    });
});

describe('lone and preyAt', () => {
    it('stage the subject first, then the others, and a forager prey facing along the heading', () => {
        const prey = preyAt(0.5, 0.2, 100);
        expect(prey).toMatchObject({ spec: SPEC.FORAGER, angle: 0.5 });
        const tick = lone(0.5, SPEC.PREDATOR, [prey]);
        expect(tick.agents.map((a) => a.spec)).toEqual([SPEC.PREDATOR, SPEC.FORAGER]);
        expect(lone(0.5, SPEC.SCOUT).agents).toHaveLength(1);
        expect(tick.foods).toEqual([]);
    });
});

describe('heardPlan', () => {
    it('hears the alarm by default and the hunt call when asked, from both sides', () => {
        const alarm = heardPlan(SPEC.DEFENDER)(rng(), 350);
        const hunt = heardPlan(SPEC.PREDATOR, 'hunt')(rng(), 350);
        expect(alarm.map((s) => [s.kind, s.ticks[0].heard?.call])).toEqual([
            ['alarm', 'alarm'],
            ['alarm', 'alarm'],
        ]);
        expect(hunt.map((s) => [s.kind, s.ticks[0].heard?.call])).toEqual([
            ['hunt', 'hunt'],
            ['hunt', 'hunt'],
        ]);
        expect(hunt[1].bearing).toBeCloseTo(-hunt[0].bearing, 12);
    });
});
