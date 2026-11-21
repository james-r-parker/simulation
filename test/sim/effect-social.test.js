// The social appliers a call site raises (docs/designs/status-effects.md, "The social effects"), staged in the feed phase.

import { describe, expect, it } from 'vitest';
import { OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { EFFECT, effectFactor, fadeEffects } from '../../js/sim/effects.js';
import { EVENT, EVENT_TYPE } from '../../js/sim/events.js';
import { FORAGER, PREDATOR, feedPairs, stage } from './helpers/bite-stage.js';
import { chase, hold, pack, shareKill, stacks, tick } from './helpers/pack-stage.js';

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
        for (let fade = 0; fade < 9; fade++) {
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

describe('answered', () => {
    it('goes to the caller when the hunter it rallied kills prey the caller also bit, and takes a hoarse stack off', () => {
        const { w, caller, killer, prey } = chase();
        shareKill(w, { caller, killer, prey });
        expect(w.energy[prey]).toBe(0);
        expect([stacks(w, caller, 'answered'), stacks(w, caller, 'hoarse')]).toEqual([1, 1]);
        expect([stacks(w, killer, 'answered'), stacks(w, prey, 'answered')]).toEqual([0, 0]);
        expect(effectFactor(w, caller, EFFECT.ANSWERED, 'biteEnergy')).toBe(1.5);
    });

    it('pays nothing for standing by, an unrallied killer, a bite outside rallyTicks, a gone caller or a bite that does not kill', () => {
        for (const [name, over, edit] of /** @type {[string, Record<string, any>, (c: any) => void][]} */ ([
            ['stood by', {}, (c) => (c.skip = true)],
            ['unrallied', {}, (c) => (c.w['effect.rallied.stacks'][c.killer] = 0)],
            ['too late', {}, (c) => (c.gap = c.w.config.rallyTicks + 1)],
            ['caller gone', {}, (c) => (c.w.alive[c.caller] = 0)],
            ['caller replaced', {}, (c) => (c.w.genomeId[c.caller] += 50)],
            ['survives', { biteEnergy: 1 }, () => {}],
        ])) {
            const c = { ...chase(over), gap: 1, skip: false };
            edit(c);
            if (c.skip) {
                feedPairs(c.w, [c.killer, c.prey]);
                c.w.tick += 1;
                feedPairs(c.w, [c.killer, c.prey]);
            } else {
                shareKill(c.w, c, c.gap);
            }
            expect(stacks(c.w, c.caller, 'answered'), name).toBe(0);
            expect(stacks(c.w, c.caller, 'hoarse'), name).toBe(2);
        }
    });

    it('stops at 2 stacks, and two hunters calling at each other with no kill earn none', () => {
        const { w, caller } = chase();
        w['effect.answered.stacks'][caller] = 2;
        shareKill(w, { caller, killer: 1, prey: 2 });
        expect(stacks(w, caller, 'answered')).toBe(2);
        const idle = pack();
        hold(idle, 0, OUTPUT_INDEX.HUNT);
        hold(idle, 1, OUTPUT_INDEX.HUNT);
        for (let t = 0; t < 30; t++) {
            tick(idle);
        }
        expect([stacks(idle, 0, 'answered'), stacks(idle, 1, 'answered')]).toEqual([0, 0]);
    });
});

/**
 * A defender in contact with a hunter, and a prey the hunter touches.
 * @param {Record<string, any>} over config overrides
 * @returns {{w: any, defender: number, hunter: number, prey: number}} the staged world
 */
function shove(over) {
    const { w, slots } = stage({ defenderRepelEnergy: 1, ...over }, [
        { x: 100, spec: 4, energy: 2000, bite: true },
        { x: 110, spec: PREDATOR, energy: 2000 },
        { x: 120, y: 130, spec: FORAGER, energy: 500 },
    ]);
    return { w, defender: slots[0], hunter: slots[1], prey: slots[2] };
}

describe('staggered', () => {
    it('is raised on a hunter a defender shoves, which is logged, slowed and cannot bite while it lasts', () => {
        const { w, defender, hunter, prey } = shove({ staggerThrust: 0.4 });
        feedPairs(w, [defender, hunter]);
        expect(stacks(w, hunter, 'staggered')).toBe(1);
        expect(effectFactor(w, hunter, EFFECT.STAGGERED, 'maxThrust')).toBeCloseTo(0.6, 12);
        const before = w.energy[prey];
        feedPairs(w, [hunter, prey]);
        expect(w.energy[prey]).toBe(before);
        w['effect.staggered.stacks'][hunter] = 0;
        feedPairs(w, [hunter, prey]);
        expect(w.energy[prey]).toBeLessThan(before);
    });

    it('stops at 3 stacks and ends together after staggerTicks', () => {
        const { w, defender, hunter } = shove({ staggerThrust: 0.1, staggerTicks: 2 });
        for (let n = 0; n < 4; n++) {
            feedPairs(w, [defender, hunter]);
        }
        expect(stacks(w, hunter, 'staggered')).toBe(3);
        fadeEffects(w);
        fadeEffects(w);
        expect(stacks(w, hunter, 'staggered')).toBe(0);
    });

    it('raises no stack with staggerThrust at 0, since a stack closes the bite gate, but still logs the shove', () => {
        const { w, defender, hunter, prey } = shove({});
        feedPairs(w, [defender, hunter]);
        expect(stacks(w, hunter, 'staggered')).toBe(0);
        let shoved = 0;
        for (let i = 0; i < w.events.count; i++) {
            shoved += w.events.data[i * 13] === EVENT_TYPE.DEFENDER_SHOVED ? 1 : 0;
        }
        expect(shoved).toBe(1);
        const before = w.energy[prey];
        feedPairs(w, [hunter, prey]);
        expect(w.energy[prey]).toBeLessThan(before);
    });
});
