import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import {
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
        expect(o.hunter).toEqual({ wait: 3, runAt: 5, slowTicks: 4 });
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

describe('maxCatchableGap', () => {
    it('is the first gap past which the kill fails when the hunter kills at the awareness gap: it kills at the gap and not 1 px beyond', () => {
        const frame = { model, bound: 'straight' };
        const gap = maxCatchableGap(courser.hunter, courser.prey, frame);
        expect(gap).toBeGreaterThan(gapAtAwareness(courser.hunter, courser.prey));
        expect(playFrame(courser.hunter, courser.prey, gap, frame).killTick).not.toBeNull();
        expect(playFrame(courser.hunter, courser.prey, gap + 1, frame).killTick).toBeNull();
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
});
