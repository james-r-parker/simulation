// The social appliers a call site raises (docs/designs/status-effects.md, "The social effects"), staged in the feed phase.

import { describe, expect, it } from 'vitest';
import { EFFECT, effectFactor, fadeEffects } from '../../js/sim/effects.js';
import { EVENT, EVENT_TYPE } from '../../js/sim/events.js';
import { FORAGER, PREDATOR, feedPairs, stage } from './helpers/bite-stage.js';

/** The two numbers that make a bite leave a body wounded and panicked. */
const ON = {
    woundThrust: 0.1,
    panicThrust: 0.5,
    panicBurn: 0.2,
    shakenThrust: 0.3,
    woundTicks: 3,
    panicTicks: 2,
    shakenTicks: 4,
};

/**
 * @param {Record<string, any>} over config overrides
 * @param {number} victimEnergy the prey's energy
 * @returns {{w: any, biter: number, victim: number}} a hunter in contact with a forager
 */
function pair(over, victimEnergy = 500) {
    const { w, slots } = stage(over, [
        { x: 100, spec: PREDATOR, energy: 2000 },
        { x: 110, spec: FORAGER, energy: victimEnergy },
    ]);
    return { w, biter: slots[0], victim: slots[1] };
}

/**
 * @param {any} w the world
 * @param {number} slot the slot
 * @param {string} name an effect's name
 * @returns {number} the stacks it holds
 */
const stacks = (w, slot, name) => w[`effect.${name}.stacks`][slot];

describe('a bite that leaves its victim alive', () => {
    it('gives it one wounded and one panicked stack, sourced at the biter, with every number at 0 too', () => {
        const { w, biter, victim } = pair({});
        feedPairs(w, [biter, victim]);
        expect([stacks(w, victim, 'wounded'), stacks(w, victim, 'panicked')]).toEqual([1, 1]);
        expect([stacks(w, biter, 'wounded'), stacks(w, biter, 'panicked')]).toEqual([0, 0]);
        expect(w.events.data[EVENT.EFFECT_APPLIED.SOURCE]).toBe(biter);
        expect(effectFactor(w, victim, EFFECT.WOUNDED, 'maxThrust')).toBe(1);
        expect(effectFactor(w, victim, EFFECT.PANICKED, 'maxThrust')).toBe(1);
    });

    it('gives a killed body nothing', () => {
        const { w, biter, victim } = pair({}, 3);
        feedPairs(w, [biter, victim]);
        expect(w.energy[victim]).toBe(0);
        expect([stacks(w, victim, 'wounded'), stacks(w, victim, 'panicked')]).toEqual([0, 0]);
    });

    it('caps wounded at 5 and panicked at 2, and logs each stack it drops', () => {
        const { w, biter, victim } = pair({}, 600);
        for (let bite = 0; bite < 6; bite++) {
            feedPairs(w, [biter, victim]);
        }
        expect([stacks(w, victim, 'wounded'), stacks(w, victim, 'panicked')]).toEqual([5, 2]);
        const { data, count } = w.events;
        let capped = 0;
        for (let i = 0; i < count; i++) {
            capped += data[i * 13] === EVENT_TYPE.EFFECT_CAPPED ? 1 : 0;
        }
        expect(capped).toBe(1 + 4);
    });

    it('slows by woundThrust a stack, and boosts and burns by nerve while panicked', () => {
        const { w, biter, victim } = pair(ON);
        feedPairs(w, [biter, victim]);
        w.lanes.nerve[victim] = 2;
        expect(effectFactor(w, victim, EFFECT.WOUNDED, 'maxThrust')).toBeCloseTo(0.9, 12);
        expect(effectFactor(w, victim, EFFECT.PANICKED, 'maxThrust')).toBeCloseTo(1 + 0.5 * 2, 12);
        expect(effectFactor(w, victim, EFFECT.PANICKED, 'passiveLoss')).toBeCloseTo(1 + 0.2 * 2, 12);
        expect(effectFactor(w, victim, EFFECT.PANICKED, 'temperatureGainMove')).toBeCloseTo(1 + 0.2 * 2, 12);
        expect(effectFactor(w, victim, EFFECT.PANICKED, 'sprintBoost')).toBeCloseTo(1 + 0.5 * 2, 12);
    });

    it('fades wounded a stack at a time, and hands a ended panic over to shaken for shakenTicks times nerve', () => {
        const { w, biter, victim } = pair(ON);
        w.lanes.nerve[victim] = 1.5;
        feedPairs(w, [biter, victim]);
        const seen = [];
        for (let tick = 0; tick < 9; tick++) {
            fadeEffects(w);
            seen.push([stacks(w, victim, 'wounded'), stacks(w, victim, 'panicked'), stacks(w, victim, 'shaken')]);
        }
        // panicked: 2 fades; shaken: 4 x 1.5 = 6 fades from the 2nd; wounded: 3 fades.
        expect(seen).toEqual([
            [1, 1, 0],
            [1, 0, 1],
            [0, 0, 1],
            [0, 0, 1],
            [0, 0, 1],
            [0, 0, 1],
            [0, 0, 1],
            [0, 0, 0],
            [0, 0, 0],
        ]);
        expect(effectFactor(w, victim, EFFECT.SHAKEN, 'maxThrust')).toBe(1);
    });

    it('slows a shaken body by shakenThrust', () => {
        const { w, victim } = pair(ON);
        w['effect.shaken.stacks'][victim] = 1;
        expect(effectFactor(w, victim, EFFECT.SHAKEN, 'maxThrust')).toBeCloseTo(0.7, 12);
    });
});
