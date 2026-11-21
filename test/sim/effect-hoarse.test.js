// `hoarse` (docs/designs/status-effects.md, "The social effects"): a wasted call earns a stack, and each stack multiplies the
// cost of the next call by `hoarseFactor`. A call that was heard and had a reason adds nothing.

import { describe, expect, it } from 'vitest';
import { CH_THREAT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { liveOf } from '../../js/sim/effects.js';
import { setSpec } from './helpers/body.js';
import { FORAGER, PREDATOR } from './helpers/bite-stage.js';
import { hold, pack, stacks, tick } from './helpers/pack-stage.js';

/**
 * @param {Record<string, any>} over config overrides
 * @param {{threat: boolean, listener: number}} scene whether the caller has a threat in view, and what slot 1 is (a `SPEC`)
 * @returns {any} a forager that holds ALARM (slot 0) and a body 100 away (slot 1), not yet ticked
 */
function alarmed(over, scene) {
    const w = pack(over);
    w.spec[0] = FORAGER;
    w.spec[1] = scene.listener;
    w.parentA[1] = 0;
    hold(w, 0, OUTPUT_INDEX.ALARM);
    w.inputs[CH_THREAT] = scene.threat ? 1 : 0;
    return w;
}

describe('what earns a stack', () => {
    it('is an alarm nobody heard, even with a threat in view: a hunter does not listen to an alarm', () => {
        const w = alarmed({}, { threat: true, listener: PREDATOR });
        tick(w);
        expect(stacks(w, 0, 'hoarse')).toBe(1);
    });

    it('is an alarm raised with no threat in view, though a forager hears it', () => {
        const w = alarmed({}, { threat: false, listener: FORAGER });
        tick(w);
        expect(stacks(w, 0, 'hoarse')).toBe(1);
        expect(stacks(w, 1, 'alert')).toBe(0);
    });

    it('is not a heard alarm with a threat in view, which takes a stack off instead', () => {
        const w = alarmed({}, { threat: true, listener: FORAGER });
        w['effect.hoarse.stacks'][0] = 1;
        tick(w);
        expect(stacks(w, 1, 'alert')).toBe(1);
        expect(stacks(w, 0, 'hoarse')).toBe(0);
        const fresh = alarmed({}, { threat: true, listener: FORAGER });
        tick(fresh);
        expect(stacks(fresh, 0, 'hoarse')).toBe(0);
    });

    it('is a hunt call no kin hunter answered, and not one that rallied a pack-mate', () => {
        const heard = pack();
        hold(heard, 0, OUTPUT_INDEX.HUNT);
        tick(heard);
        expect(stacks(heard, 1, 'rallied')).toBe(1);
        expect(stacks(heard, 0, 'hoarse')).toBe(0);
        const alone = pack();
        alone.parentA[1] = 0;
        hold(alone, 0, OUTPUT_INDEX.HUNT);
        tick(alone);
        expect(stacks(alone, 0, 'hoarse')).toBe(1);
    });
});

describe('what a stack costs', () => {
    it('multiplies the cost of the next call by hoarseFactor, so spam doubles: 6, 12, 24', () => {
        const w = pack({ huntCallCost: 6, hoarseFactor: 2 });
        w.parentA[1] = 0;
        hold(w, 0, OUTPUT_INDEX.HUNT);
        const paid = [];
        let before = w.energy[0];
        for (let t = 0; t < 21; t++) {
            tick(w);
            if (w.energy[0] < before) {
                paid.push(before - w.energy[0]);
            }
            before = w.energy[0];
        }
        expect(paid).toEqual([6, 12, 24]);
        expect(stacks(w, 0, 'hoarse')).toBe(3);
    });

    it('is the factor to the power of the stacks at every count, against a naive loop, and the base at a factor of 1', () => {
        for (const factor of [1, 1.7, 2]) {
            const w = pack({ huntCallCost: 6, alarmCost: 4, hoarseFactor: factor });
            for (let k = 0; k <= 5; k++) {
                w['effect.hoarse.stacks'][0] = k;
                let naive = 1;
                for (let n = 0; n < k; n++) {
                    naive *= factor;
                }
                expect(liveOf(w, 0, 'huntCallCost'), `${factor}^${k}`).toBe(6 * naive);
                expect(liveOf(w, 0, 'alarmCost')).toBe(4 * naive);
            }
        }
    });

    it('prices the alarm of a scout by its body entry on the lane', () => {
        const w = pack({ specialisations: { scout: { body: { alarmCost: 2 } } } });
        setSpec(w, 0, 3);
        hold(w, 0, OUTPUT_INDEX.ALARM);
        const before = w.energy[0];
        tick(w);
        expect(before - w.energy[0]).toBe(8);
    });

    it('is a body that holds ALARM with no threat in view: it reaches the cap of 5 and pays the geometric cost', () => {
        const w = alarmed({ alarmCost: 1, hoarseFactor: 2 }, { threat: false, listener: FORAGER });
        w.energy[0] = 10000;
        const paid = [];
        let before = w.energy[0];
        for (let t = 0; t < 80; t++) {
            tick(w);
            if (w.energy[0] < before) {
                paid.push(before - w.energy[0]);
            }
            before = w.energy[0];
        }
        expect(stacks(w, 0, 'hoarse')).toBe(5);
        expect(paid.slice(0, 7)).toEqual([1, 2, 4, 8, 16, 32, 32]);
    });
});
