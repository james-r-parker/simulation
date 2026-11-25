import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { preStep5Arena } from '../helpers/pre-step5.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import { roleParams } from '../../js/evo/role-budget-params.js';
import { burstTicks } from '../../js/evo/role-budget-kinematics.js';
import { TIERS, fitForRung as typedFit, learnSlope, tierMargins } from '../../js/evo/role-budget-tiers.js';
import { chaseTimeline } from '../../js/evo/role-budget-timeline.js';

const arm = (/** @type {any} */ name) => JSON.parse(readFileSync(`evals/fair-chase/${name}.json`, 'utf8'));
const pair = (/** @type {any} */ overrides, prey = 'forager') => {
    const config = preStep5Arena(overrides);
    return { hunter: roleParams(config, 'predator'), prey: roleParams(config, prey) };
};
const model = MODEL_DEFAULTS;
/** @type {any} */
const fitForRung = typedFit;

describe('tierMargins', () => {
    it('orders the tiers perfect over reactive over naive on the straight bound of the courser arm', () => {
        const { hunter, prey } = pair(arm('courser'));
        const m = tierMargins(hunter, prey, model);
        expect(TIERS).toEqual(['perfect', 'reactive', 'naive']);
        expect(m.perfect.straight).toBeGreaterThan(m.reactive.straight);
        expect(m.reactive.straight).toBeGreaterThan(m.naive.straight);
    });

    it('gives a naive hunter at the defaults no contact: it is slower than the prey it holds back for', () => {
        const { hunter, prey } = pair({});
        expect(tierMargins(hunter, prey, model).naive.straight).toBeLessThan(0);
    });
});

describe('the perfect tier is an upper bound on the other two', () => {
    const specs = ['forager', 'reproducer', 'scout', 'defender'];
    it.each(['courser', 'even'])('is at least the reactive and the naive margin on every row of the %s arm', (name) => {
        for (const spec of specs) {
            const { hunter, prey } = pair(arm(name), spec);
            const m = tierMargins(hunter, prey, model);
            for (const bound of /** @type {const} */ (['straight', 'broken'])) {
                expect(m.perfect[bound], `${name} ${spec} ${bound} vs naive`).toBeGreaterThanOrEqual(m.naive[bound]);
                expect(m.perfect[bound], `${name} ${spec} ${bound} vs reactive`).toBeGreaterThanOrEqual(
                    m.reactive[bound],
                );
            }
        }
    });
});

describe('a naive hunter at effort 1 burns out as E255 saw: about tick 140 on the courser arm', () => {
    it('holds a full factor for 140 ticks, then falls under the floor and the speed with it', () => {
        const { hunter, prey } = pair(arm('courser'));
        expect(burstTicks(hunter.store)).toBeCloseTo(140, 9);
        const at = (/** @type {any} */ ticks) =>
            chaseTimeline(hunter, prey, {
                gap: 3000,
                maxTicks: ticks,
                hunter: { sprint: 'always', effort: 1 },
                prey: { sprint: 'never', jink: 0, awareGap: 0 },
            });
        expect(at(140).hunterLevel).toBeCloseTo(0.3, 9);
        expect(at(139).hunterLevel).toBeGreaterThan(0.3);
        expect(at(141).hunterLevel).toBeLessThan(0.3);
        expect(at(200).speed).toBeLessThan(at(139).speed);
    });
});

describe('learnSlope', () => {
    it('is ok for the courser arm against the scout: the naive tier touches the prey at the drill gap and the margins rise', () => {
        const { hunter, prey } = pair(arm('courser'), 'scout');
        const m = tierMargins(hunter, prey, model);
        expect(learnSlope(m, hunter, prey, model)).toBe('ok');
        expect(fitForRung(m, 'ok')).toBe(m.reactive.broken >= 0);
    });

    it('names the reactive tier for the courser arm against the forager: the sprinting hunter overshoots the break', () => {
        const { hunter, prey } = pair(arm('courser'));
        const m = tierMargins(hunter, prey, model);
        expect(m.reactive.broken).toBeLessThan(m.naive.broken);
        expect(learnSlope(m, hunter, prey, model)).toBe('reactive');
    });

    it('names the naive tier when the beginner never touches the prey at the drill gap (the defaults)', () => {
        const { hunter, prey } = pair({});
        expect(learnSlope(tierMargins(hunter, prey, model), hunter, prey, model)).toBe('naive');
    });

    it('names the tier whose margin does not rise, on planted margins', () => {
        const { hunter, prey } = pair(arm('courser'));
        const planted = (/** @type {any} */ perfect, /** @type {any} */ reactive, /** @type {any} */ naive) => ({
            perfect: { straight: 0, broken: perfect },
            reactive: { straight: 0, broken: reactive },
            naive: { straight: 0, broken: naive },
        });
        expect(learnSlope(planted(300, 200, 100), hunter, prey, model)).toBe('ok');
        expect(learnSlope(planted(300, 100, 200), hunter, prey, model)).toBe('reactive');
        expect(learnSlope(planted(150, 200, 100), hunter, prey, model)).toBe('perfect');
        expect(learnSlope(planted(300, 100, 100), hunter, prey, model)).toBe('reactive');
    });
});

describe('fitForRung', () => {
    it('needs the reactive tier to close the broken bound and the slope to be ok', () => {
        const m = (/** @type {any} */ reactive) => ({ reactive: { broken: reactive } });
        expect(fitForRung(m(0), 'ok')).toBe(true);
        expect(fitForRung(m(-1), 'ok')).toBe(false);
        expect(fitForRung(m(50), 'naive')).toBe(false);
    });
});
