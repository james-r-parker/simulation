// A heard call raises `rallied` on a kin hunter, once per call (docs/designs/status-effects.md, "The social effects").

import { describe, expect, it } from 'vitest';
import { CH_THREAT, OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { ENERGY_SOURCE, addEnergy } from '../../js/sim/energy.js';
import { EFFECT, effectFactor, liveOf } from '../../js/sim/effects.js';
import { HEARD_FROM_STRIDE } from '../../js/sim/agent-arrays.js';
import { FORAGER, PREDATOR } from './helpers/bite-stage.js';
import { hold, pack, stacks, tick } from './helpers/pack-stage.js';
import { addAgent } from './helpers/sense-world.js';

describe('rallied', () => {
    it('gives a kin hunter one stack on the tick it first hears a hunt call, not one for each tick the call lasts', () => {
        const w = pack();
        hold(w, 0, OUTPUT_INDEX.HUNT);
        tick(w);
        expect(stacks(w, 1, 'rallied')).toBe(1);
        w.outputs[0 * OUTPUT_COUNT + OUTPUT_INDEX.HUNT] = 0;
        for (let t = 0; t < 8; t++) {
            tick(w);
        }
        expect(stacks(w, 1, 'rallied')).toBe(1);
        const row = HEARD_FROM_STRIDE + 3;
        expect([...w.heardFrom.subarray(row, row + 3)]).toEqual([0, w.genomeId[0], 0]);
    });

    it('gives a hearer whose body straddles a grid cell edge one stack, not one for each cell it is in', () => {
        const w = pack();
        w.x[1] = 695; // the hash cells are 140 wide, so a body of size 20 at 695 is in the cells either side of 700
        hold(w, 0, OUTPUT_INDEX.HUNT);
        tick(w);
        expect(stacks(w, 1, 'rallied')).toBe(1);
    });

    it('gives a second stack for a second call, and stops at 3', () => {
        const w = pack({ huntCallCost: 0 });
        hold(w, 0, OUTPUT_INDEX.HUNT);
        const seen = [];
        for (let t = 0; t < 50; t++) {
            tick(w);
            seen.push(stacks(w, 1, 'rallied'));
        }
        expect(seen[0]).toBe(1);
        expect(seen[10]).toBe(2);
        expect(seen[20]).toBe(3);
        expect(seen[49]).toBe(3);
    });

    it('gives a hearer in range of two live calls exactly one stack from each, not one a tick', () => {
        const w = pack({ huntCallCost: 0 });
        const second = addAgent(w, 650, 500, 20);
        w.spec[second] = PREDATOR;
        addEnergy(w, second, 100, ENERGY_SOURCE.INITIAL);
        w.parentB[1] = w.genomeId[second];
        hold(w, 0, OUTPUT_INDEX.HUNT);
        hold(w, second, OUTPUT_INDEX.HUNT);
        for (let t = 0; t < 6; t++) {
            tick(w);
            expect(stacks(w, 1, 'rallied'), `tick ${t}`).toBe(2);
        }
    });

    it('costs two hunters that only call at each other the rally burn and no hoarse stack, against two silent hunters', () => {
        const calling = pack({ rallyBurn: 0.5, huntCallCost: 0 });
        calling.parentA[0] = calling.genomeId[1];
        hold(calling, 0, OUTPUT_INDEX.HUNT);
        hold(calling, 1, OUTPUT_INDEX.HUNT);
        const silent = pack({ rallyBurn: 0.5, huntCallCost: 0 });
        for (let t = 0; t < 20; t++) {
            tick(calling);
            tick(silent);
        }
        for (const slot of [0, 1]) {
            expect(stacks(calling, slot, 'hoarse')).toBe(0);
            expect(stacks(calling, slot, 'rallied')).toBeGreaterThan(0);
            expect(liveOf(calling, slot, 'passiveLoss')).toBeGreaterThan(liveOf(silent, slot, 'passiveLoss'));
        }
    });

    it('gives nothing for its own call, to a non-kin, to a non-hunter, or below hearThreshold', () => {
        for (const [name, over, edit] of /** @type {[string, Record<string, any>, (w: any) => void][]} */ ([
            ['non-kin', {}, (w) => (w.parentA[1] = 0)],
            ['non-hunter', {}, (w) => (w.spec[1] = FORAGER)],
            ['far', {}, (w) => (w.x[1] = 790)],
            ['a high threshold', { hearThreshold: 0.99 }, () => {}],
        ])) {
            const w = pack(over);
            edit(w);
            hold(w, 0, OUTPUT_INDEX.HUNT);
            tick(w);
            expect(stacks(w, 1, 'rallied'), name).toBe(0);
            expect(stacks(w, 0, 'rallied'), `${name}: the caller`).toBe(0);
        }
    });

    it('boosts thrust and burns the standing cost by the body nerve', () => {
        const w = pack({ rallyBurn: 0.2 });
        hold(w, 0, OUTPUT_INDEX.HUNT);
        tick(w);
        w.lanes.nerve[1] = 3;
        expect(effectFactor(w, 1, EFFECT.RALLIED, 'maxThrust')).toBeCloseTo(1 + 0.1 * 3, 12);
        expect(effectFactor(w, 1, EFFECT.RALLIED, 'passiveLoss')).toBeCloseTo(1 + 0.2 * 3, 12);
        expect(effectFactor(w, 1, EFFECT.RALLIED, 'temperatureGainMove')).toBeCloseTo(1 + 0.2 * 3, 12);
    });
});

/**
 * @param {Record<string, any>} [over] config overrides
 * @returns {any} a forager that can call an alarm (slot 0, x 500) and a forager 100 away (slot 1), not kin
 */
function herd(over = {}) {
    const w = pack({ alertBoost: 0.2, alertGraze: 0.25, ...over });
    w.spec[0] = FORAGER;
    w.spec[1] = FORAGER;
    w.parentA[1] = 0;
    return w;
}

/**
 * @param {any} w the world
 * @param {boolean} threat whether the caller has a threat on its rays
 * @returns {void}
 */
function alarmWith(w, threat) {
    hold(w, 0, OUTPUT_INDEX.ALARM);
    w.inputs[CH_THREAT] = threat ? 1 : 0;
}

describe('alert', () => {
    it('gives a non-hunter one stack for an alarm with a threat on the caller rays, once per call, kin or not', () => {
        const w = herd();
        alarmWith(w, true);
        tick(w);
        expect(stacks(w, 1, 'alert')).toBe(1);
        w.outputs[OUTPUT_INDEX.ALARM] = 0;
        for (let t = 0; t < 8; t++) {
            tick(w);
        }
        expect(stacks(w, 1, 'alert')).toBe(1);
        expect(stacks(w, 0, 'alert')).toBe(0);
        const row = HEARD_FROM_STRIDE;
        expect([...w.heardFrom.subarray(row, row + 3)]).toEqual([0, w.genomeId[0], 0]);
    });

    it('gives a non-hunter whose body straddles a grid cell edge one stack for an alarm, not one for each cell', () => {
        const w = herd();
        w.x[1] = 695;
        alarmWith(w, true);
        tick(w);
        expect(stacks(w, 1, 'alert')).toBe(1);
    });

    it('gives nothing for an alarm with nothing in view, to a hunter, or below hearThreshold', () => {
        for (const [
            name,
            over,
            threat,
            edit,
        ] of /** @type {[string, Record<string, any>, boolean, (w: any) => void][]} */ ([
            ['no threat', {}, false, () => {}],
            ['a hunter', {}, true, (w) => (w.spec[1] = PREDATOR)],
            ['a high threshold', { hearThreshold: 0.99 }, true, () => {}],
        ])) {
            const w = herd(over);
            edit(w);
            alarmWith(w, threat);
            tick(w);
            expect(stacks(w, 1, 'alert'), name).toBe(0);
        }
    });

    it('stops at 2 stacks, and boosts turn and sprint by the body nerve', () => {
        const w = herd({ alarmCost: 0 });
        alarmWith(w, true);
        for (let t = 0; t < 40; t++) {
            tick(w);
        }
        expect(stacks(w, 1, 'alert')).toBe(2);
        w.lanes.nerve[1] = 2;
        expect(effectFactor(w, 1, EFFECT.ALERT, 'maxTurn')).toBeCloseTo(1 + 0.2 * 2 * 2, 12);
        expect(effectFactor(w, 1, EFFECT.ALERT, 'sprintBoost')).toBeCloseTo(1 + 0.2 * 2 * 2, 12);
    });

    it('costs grazing thrust a stack while the body grazes, and nothing while it does not', () => {
        const w = herd();
        w['effect.alert.stacks'][1] = 2;
        expect(effectFactor(w, 1, EFFECT.ALERT_GRAZING, 'maxThrust')).toBe(1);
        hold(w, 1, OUTPUT_INDEX.BITE);
        expect(effectFactor(w, 1, EFFECT.ALERT_GRAZING, 'maxThrust')).toBeCloseTo(1 - 0.25 * 2, 12);
        w['effect.alert.stacks'][1] = 0;
        expect(effectFactor(w, 1, EFFECT.ALERT_GRAZING, 'maxThrust')).toBe(1);
    });
});

describe('the call bookkeeping at neutral numbers (status-effects T28)', () => {
    const NEUTRAL = { rallyThrust: 0, rallyBurn: 0, answeredBite: 0, hoarseFactor: 1 };

    it('keeps no heardFrom, no rally and no hoarse stack while every number of rallied, answered and hoarse is neutral', () => {
        const alone = pack(NEUTRAL);
        alone.parentA[1] = 0; // an unanswered call: it would earn a hoarse stack
        hold(alone, 0, OUTPUT_INDEX.HUNT);
        tick(alone);
        expect(stacks(alone, 0, 'hoarse')).toBe(0);
        const kin = pack(NEUTRAL);
        hold(kin, 0, OUTPUT_INDEX.HUNT);
        tick(kin);
        expect(stacks(kin, 1, 'rallied')).toBe(0);
        expect([...kin.heardFrom.subarray(HEARD_FROM_STRIDE + 3, HEARD_FROM_STRIDE + 6)]).toEqual([0, 0, 0]);
    });

    it.each([
        ['rallyThrust', 0.1],
        ['rallyBurn', 0.1],
        ['answeredBite', 0.1],
        ['hoarseFactor', 2],
    ])('runs the rally and the settle once %s is %s', (key, value) => {
        const kin = pack({ ...NEUTRAL, [key]: value });
        hold(kin, 0, OUTPUT_INDEX.HUNT);
        tick(kin);
        expect(stacks(kin, 1, 'rallied')).toBe(1);
        const alone = pack({ ...NEUTRAL, [key]: value });
        alone.parentA[1] = 0;
        hold(alone, 0, OUTPUT_INDEX.HUNT);
        tick(alone);
        expect(stacks(alone, 0, 'hoarse')).toBe(1);
    });
});
