import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import {
    EFFORTS,
    bestEffort as typedBestEffort,
    frameOptions as typedFrameOptions,
    gapAtAwareness,
    gapAtSight,
    maxCatchableGap as typedMaxCatchableGap,
    playFrame as typedPlayFrame,
} from '../../js/evo/role-budget-frame.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import { roleParams } from '../../js/evo/role-budget-params.js';

const courserConfig = arenaConfig(JSON.parse(readFileSync('evals/fair-chase/courser.json', 'utf8')));
const bodies = (/** @type {any} */ config) => ({
    hunter: roleParams(config, 'predator'),
    prey: roleParams(config, 'forager'),
});
const courser = bodies(courserConfig);
const defaults = bodies(arenaConfig());
const model = MODEL_DEFAULTS;
/** @type {any} the frame functions with their options left untyped for the asserts */
const frameOptions = typedFrameOptions;
/** @type {any} */
const bestEffort = /** @type {any} */ (typedBestEffort);
const maxCatchableGap = typedMaxCatchableGap;
/** @type {any} */
const playFrame = typedPlayFrame;

describe('the gaps of awareness and sight', () => {
    it('is 345 for a forager seen from behind (300 and the hunter 45) and 429 for the hunter seeing it (400 and 29)', () => {
        expect(gapAtAwareness(defaults.hunter, defaults.prey)).toBe(345);
        expect(gapAtSight(defaults.hunter, defaults.prey)).toBe(429);
    });

    it('is the rear reach for a prey with a narrow rear eye', () => {
        const hunter = roleParams(arenaConfig(), 'predator');
        const prey = roleParams(arenaConfig(), 'defender');
        expect(gapAtAwareness(hunter, prey)).toBeCloseTo(240 + 45, 9);
        expect(gapAtAwareness(prey, hunter)).toBeCloseTo(160 + 29, 9);
    });
});

describe('frameOptions', () => {
    it('starts the perfect hunter creeping at the awareness gap, with the delays as its play', () => {
        const o = frameOptions(defaults.hunter, defaults.prey, 345, {
            model,
            bearing: 1,
            delays: { see: 3, turn: 4, run: 5 },
        });
        expect(o).toMatchObject({ gap: 345, bearing: 1, hunterStart: 'cruise' });
        expect(o.hunter).toEqual({ wait: 3, runAt: 5, slowTicks: 4, seeGap: Infinity, effort: 1 });
        expect(frameOptions(defaults.hunter, defaults.prey, 345, { model, effort: 0.4 }).hunter.effort).toBe(0.4);
        expect(o.prey).toMatchObject({ sprint: 'rationed', jink: 120 });
    });

    it('starts a reactive hunter at rest where it sees the prey, late by the reaction, the prey still until aware', () => {
        const o = frameOptions(defaults.hunter, defaults.prey, 345, { model, tier: 'reactive' });
        expect(o).toMatchObject({ gap: 429, hunterStart: 'rest' });
        expect(o.hunter).toMatchObject({ wait: 2, effort: 1 });
        expect(o.prey.awareGap).toBe(345);
    });

    it('holds the naive effort from tick 0, and starts at the awareness gap when that is further than the sight', () => {
        const o = frameOptions(defaults.hunter, defaults.prey, 500, { model, tier: 'naive' });
        expect(o.hunter).toMatchObject({ wait: 0, effort: model.naiveEffort });
        expect(o.gap).toBe(500);
    });

    it('plays the straight bound with no break and the always bound with a held sprint', () => {
        const straight = frameOptions(defaults.hunter, defaults.prey, 345, { model, bound: 'straight' });
        expect(straight.prey.jink).toBe(0);
        const always = frameOptions(defaults.hunter, defaults.prey, 345, { model: { ...model, preySprint: 'always' } });
        expect(always.prey.sprint).toBe('always');
    });
});

describe('reliableSight', () => {
    const reliable = { ...model, reliableSight: true };

    it('has the hunter act inside reliableView of the prey: 148.65 for a size 29 forager', () => {
        const o = frameOptions(defaults.hunter, defaults.prey, 345, { model: reliable });
        expect(o.hunter.seeGap).toBeCloseTo(148.65, 2);
        expect(gapAtSight(defaults.hunter, defaults.prey, true)).toBeCloseTo(148.65, 2);
        expect(gapAtSight(defaults.hunter, defaults.prey)).toBe(429);
    });

    it('starts a reactive hunter at the awareness gap when that is further than where it reliably sees', () => {
        const o = frameOptions(defaults.hunter, defaults.prey, 345, { model: reliable, tier: 'reactive' });
        expect(o.gap).toBe(345);
    });

    it('leaves a hunter that sees the prey only at 148 px with less margin than one that acts at once', () => {
        const at = (/** @type {any} */ m) =>
            maxCatchableGap(courser.hunter, courser.prey, { model: m, bound: 'straight' });
        expect(at(reliable)).toBeLessThan(at(model));
    });
});

describe('maxCatchableGap', () => {
    it('is the first gap past which the kill fails when the hunter kills at the awareness gap: it kills at the gap and not 1 px beyond', () => {
        const base = { model, bound: /** @type {const} */ ('straight') };
        const { effort, gap } = bestEffort(courser.hunter, courser.prey, base);
        const frame = { ...base, effort };
        expect(maxCatchableGap(courser.hunter, courser.prey, base)).toBe(gap);
        expect(gap).toBeGreaterThan(gapAtAwareness(courser.hunter, courser.prey));
        expect(playFrame(courser.hunter, courser.prey, gap, frame).killTick).not.toBeNull();
        expect(playFrame(courser.hunter, courser.prey, gap + 1, frame).killTick).toBeNull();
    });

    it.each([
        ['courser', 'broken'],
        ['courser', 'straight'],
        ['defaults', 'broken'],
    ])('reads the best of the sprint-effort sweep for a perfect hunter on %s, %s', (set, bound) => {
        const { hunter, prey } = set === 'courser' ? courser : defaults;
        const base = { model, bound: /** @type {'straight' | 'broken'} */ (bound) };
        const best = bestEffort(hunter, prey, base);
        const at = (/** @type {number} */ effort) => maxCatchableGap(hunter, prey, { ...base, effort });
        expect(maxCatchableGap(hunter, prey, base)).toBe(best.gap);
        expect(at(best.effort)).toBe(best.gap);
        // the first pass: no effort of the 0.05 grid reaches further
        expect(best.gap).toBe(Math.max(best.gap, ...EFFORTS.map(at)));
        // the second pass: none of the 0.01 efforts within 0.04 of the best reaches further
        for (let k = -4; k <= 4; k++) {
            const effort = Math.min(1, Math.max(0, Math.round((best.effort + k * 0.01) * 100) / 100));
            expect(best.gap).toBeGreaterThanOrEqual(at(effort));
        }
        expect(EFFORTS).toContain(model.naiveEffort);
        expect(EFFORTS[0]).toBe(1);
    });

    it('is the nearest gap inside the awareness gap that kills when it does not kill at the awareness gap', () => {
        const frame = { model };
        const aware = gapAtAwareness(defaults.hunter, defaults.prey);
        expect(playFrame(defaults.hunter, defaults.prey, aware, frame).killTick).toBeNull();
        const gap = maxCatchableGap(defaults.hunter, defaults.prey, frame);
        expect(gap).toBeLessThan(aware);
        if (gap > 0) {
            expect(playFrame(defaults.hunter, defaults.prey, gap, frame).killTick).not.toBeNull();
        }
    });

    it('is 0 when no gap down to the bodies touching kills: a hunter that cannot bite', () => {
        const small = roleParams(arenaConfig({ huntSizeRatio: 3 }), 'predator');
        expect(maxCatchableGap(small, defaults.prey, { model })).toBe(0);
    });

    it('is a margin that is ordered by the tiers on the courser arm: perfect over reactive over naive on the straight bound', () => {
        const at = (/** @type {any} */ tier) =>
            maxCatchableGap(courser.hunter, courser.prey, { model, tier, bound: 'straight' });
        expect(at('perfect')).toBeGreaterThan(at('reactive'));
        expect(at('reactive')).toBeGreaterThan(at('naive'));
    });

    it('falls to the limit for a hunter nothing outruns', () => {
        const fast = bodies(arenaConfig({ sprintStoreEnabled: false, maxVelocity: 12, maxThrust: 1.2 }));
        const gap = maxCatchableGap(fast.hunter, fast.prey, { model, bound: 'straight' });
        expect(gap).toBeGreaterThan(1000);
    });

    it('reads a prey that starts at rest and facing away as it always did when no start is given (T15a)', () => {
        const base = maxCatchableGap(defaults.hunter, defaults.prey, { model, effort: 1 });
        const rest = maxCatchableGap(defaults.hunter, defaults.prey, {
            model,
            effort: 1,
            preyStart: { speed: 0, offset: 0 },
        });
        expect(rest).toBe(base);
        expect(base).toBeCloseTo(242.7, 1);
        expect(maxCatchableGap(courser.hunter, courser.prey, { model, effort: 1 })).toBeCloseTo(945.6, 1);
    });

    it('reaches less far for a prey that is already flying than for one that is standing (T15a)', () => {
        const flying = { speed: 5, offset: 0 };
        const at = (/** @type {any} */ preyStart) =>
            maxCatchableGap(courser.hunter, courser.prey, { model, effort: 1, preyStart });
        expect(at(flying)).toBeLessThan(at(undefined));
    });

    it('the oracle hunter, which sprints only with the prey in view, reaches less far than the one that sprints from tick 0 (T15a)', () => {
        const even = bodies(arenaConfig(JSON.parse(readFileSync('evals/fair-chase/even.json', 'utf8'))));
        const at = (/** @type {any} */ sprint) => maxCatchableGap(even.hunter, even.prey, { model, effort: 1, sprint });
        expect(at('view')).toBeLessThan(at('always'));
        expect(at(undefined)).toBe(at('always'));
    });

    it('passes the start and the sprint play to the chase, and keeps the sweep of one start apart from another', () => {
        const aware = gapAtAwareness(defaults.hunter, defaults.prey);
        const opts = frameOptions(defaults.hunter, defaults.prey, aware, {
            model,
            sprint: 'view',
            preyStart: { speed: 4, offset: 0.1 },
        });
        expect(opts.preyStart).toEqual({ speed: 4, offset: 0.1 });
        expect(opts.hunter.sprint).toBe('view');
        const a = bestEffort(defaults.hunter, defaults.prey, { model });
        const b = bestEffort(defaults.hunter, defaults.prey, { model, preyStart: { speed: 5, offset: 0 } });
        expect(b.gap).toBeLessThan(a.gap);
    });
});
