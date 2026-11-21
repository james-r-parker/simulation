import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { LEVEL_EFFECTS, checkEffects, lanesWithEffects } from '../../js/evo/role-budget-effects.js';
import { roleParams } from '../../js/evo/role-budget-params.js';
import { laneBases } from '../../js/sim/body-lanes.js';
import { SPEC_NAMES } from '../../js/sim/specs.js';

const planted = arenaConfig({ rallyThrust: 0.2, rallyBurn: 0.1, woundThrust: 0.1 });
const offEverything = Object.fromEntries(LEVEL_EFFECTS.map((name) => [name, 0]));

describe('checkEffects', () => {
    it('lists the effects that store stacks, the social ones among them', () => {
        expect(LEVEL_EFFECTS).toEqual(expect.arrayContaining(['rallied', 'answered', 'hoarse', 'alert', 'wounded']));
    });

    it('refuses a name that is not an effect with stacks, a fraction, a negative level and a level above the cap', () => {
        expect(() => checkEffects({ nonsense: 1 })).toThrow(/"nonsense" is not an effect with stacks/);
        expect(() => checkEffects({ coldBand: 1 })).toThrow(/is not an effect with stacks/);
        expect(() => checkEffects({ rallied: 0.5 })).toThrow(/whole number from 0 to 3/);
        expect(() => checkEffects({ rallied: -1 })).toThrow(/whole number from 0 to 3/);
        expect(() => checkEffects({ rallied: 4 })).toThrow(/whole number from 0 to 3/);
        expect(() => checkEffects({ rallied: 3, wounded: 0 })).not.toThrow();
    });

    it('is checked by roleParams', () => {
        expect(() => roleParams(planted, 'predator', {}, { effects: { nonsense: 1 } })).toThrow(/not an effect/);
    });
});

describe('lanesWithEffects', () => {
    const lane = laneBases(planted, 'predator');

    it('returns the lanes themselves with no level above 0', () => {
        expect(lanesWithEffects(planted, lane, undefined)).toBe(lane);
        expect(lanesWithEffects(planted, lane, offEverything)).toBe(lane);
    });

    it('multiplies a lane by 1 + perStack x level x nerve, as the sim does', () => {
        const live = lanesWithEffects(planted, lane, { rallied: 2 });
        expect(live.maxThrust).toBeCloseTo(lane.maxThrust * (1 + 0.2 * 2 * lane.nerve), 12);
        expect(live.sprintBoost).toBeCloseTo(lane.sprintBoost * (1 + 0.2 * 2 * lane.nerve), 12);
        expect(live.passiveLoss).toBeCloseTo(lane.passiveLoss * (1 + 0.1 * 2 * lane.nerve), 12);
        expect(live.biteEnergy).toBe(lane.biteEnergy);
    });

    it('composes two effects on one lane in registry order, each reading its own level', () => {
        const live = lanesWithEffects(planted, lane, { rallied: 1, wounded: 3 });
        const want = lane.maxThrust * (1 + 0.2 * lane.nerve) * (1 - 0.1 * 3);
        expect(live.maxThrust).toBeCloseTo(want, 12);
    });

    it('leaves the lanes alone at a strength of 0, the neutral numbers', () => {
        const neutral = arenaConfig({});
        expect(lanesWithEffects(neutral, lane, { rallied: 3 })).toEqual(lane);
    });
});

describe('roleParams with effects', () => {
    it('with every level at 0 equals the record without effects, for every spec, age and the planted numbers', () => {
        for (const config of [arenaConfig({}), planted]) {
            for (const name of SPEC_NAMES) {
                for (const age of /** @type {const} */ (['adult', 'juvenile'])) {
                    expect(roleParams(config, name, {}, { age, effects: offEverything })).toEqual(
                        roleParams(config, name, {}, { age }),
                    );
                }
                expect(roleParams(config, name, {}, { effects: {} })).toEqual(roleParams(config, name));
            }
        }
    });

    it('a rallied hunter is faster and burns more, and the other bodies of the record follow the lanes', () => {
        const base = roleParams(planted, 'predator');
        const rallied = roleParams(planted, 'predator', {}, { effects: { rallied: 1 } });
        expect(rallied.thrust.cruise).toBeGreaterThan(base.thrust.cruise);
        expect(rallied.thrust.gain).toBeGreaterThan(base.thrust.gain);
        expect(rallied.cap.sprint).toBeGreaterThan(base.cap.sprint);
        expect(rallied.cost.passive).toBeGreaterThan(base.cost.passive);
        expect(rallied.heat.gainMove).toBeGreaterThan(base.heat.gainMove);
        expect(rallied.bite).toEqual(base.bite);
        expect(rallied.view).toEqual(base.view);
    });

    it('reads the trait ratios first, then the effects on the lanes they gave', () => {
        const base = roleParams(planted, 'predator', { nerve: 2 });
        const rallied = roleParams(planted, 'predator', { nerve: 2 }, { effects: { rallied: 1 } });
        const plain = roleParams(planted, 'predator', {}, { effects: { rallied: 1 } });
        expect(rallied.thrust.cruise / base.thrust.cruise).toBeGreaterThan(plain.thrust.cruise / base.thrust.cruise);
    });
});
