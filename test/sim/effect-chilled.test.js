// The `chilled` clock (docs/designs/status-effects.md, "The social effects"): one stack every `coldStackTicks` ticks under
// the optimal band, one off every `coldRecoverTicks` ticks back in it, capped at 10, counted only while `coldStackRate` is
// above 0 (at 0 a stack changes nothing, so the clock is skipped).

import { describe, expect, it } from 'vitest';
import { stepChilled } from '../../js/sim/effect-chilled.js';
import { EFFECT, effectFactor, fadeEffects } from '../../js/sim/effects.js';
import { allocBody } from './helpers/body.js';
import { smallWorld } from './helpers/small-world.js';

/**
 * @param {Record<string, any>} [over] config overrides
 * @returns {{w: any, slot: number, min: number}} a world with one body, and its band's lower edge
 */
function body(over = {}) {
    const w = smallWorld({ coldStackTicks: 4, coldRecoverTicks: 2, coldStackRate: 0.1, ...over });
    const slot = allocBody(w, 0);
    w.alive[slot] = 1;
    return { w, slot, min: w.lanes.temperatureOptimalMin[slot] };
}

/**
 * @param {any} w the world
 * @param {number} slot the slot
 * @param {number} ticks how many ticks to run
 * @returns {number[]} the stacks after each tick
 */
function run(w, slot, ticks) {
    const seen = [];
    for (let t = 0; t < ticks; t++) {
        stepChilled(w, slot);
        seen.push(w.effectStacks[0][slot]);
    }
    return seen;
}

describe('stepChilled', () => {
    it('adds one stack every coldStackTicks ticks under the band', () => {
        const { w, slot, min } = body();
        w.temperature[slot] = min - 1;
        expect(run(w, slot, 9)).toEqual([0, 0, 0, 1, 1, 1, 1, 2, 2]);
    });

    it('keeps no clock and adds no stack at the default rate of 0, where a stack would change nothing', () => {
        const { w, slot, min } = body({ coldStackRate: 0 });
        w.temperature[slot] = min - 1;
        expect(run(w, slot, 9)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
        expect([w.effectTicks[0][slot], w.events.count]).toEqual([0, 0]);
        expect(effectFactor(w, slot, EFFECT.CHILLED, 'passiveLoss')).toBe(1);
    });

    it('takes one stack off every coldRecoverTicks ticks at or above the band, and stops at 0', () => {
        const { w, slot, min } = body();
        w.temperature[slot] = min - 1;
        run(w, slot, 8);
        w.temperature[slot] = min;
        expect(run(w, slot, 6)).toEqual([2, 1, 1, 0, 0, 0]);
        expect(w.effectTicks[0][slot]).toBe(0);
    });

    it('restarts both clocks where the body crosses the edge', () => {
        const { w, slot, min } = body();
        w.temperature[slot] = min - 1;
        run(w, slot, 3);
        w.temperature[slot] = min + 1;
        run(w, slot, 1);
        w.temperature[slot] = min - 1;
        expect(run(w, slot, 4)).toEqual([0, 0, 0, 1]);
        w.temperature[slot] = min + 1;
        run(w, slot, 1);
        w.temperature[slot] = min - 1;
        run(w, slot, 1);
        w.temperature[slot] = min + 1;
        expect(run(w, slot, 2)).toEqual([1, 0]);
    });

    it('scales the standing cost by coldStackRate a stack once the rate is above 0', () => {
        const { w, slot, min } = body({ coldStackRate: 0.1 });
        w.temperature[slot] = min - 1;
        run(w, slot, 8);
        expect(effectFactor(w, slot, EFFECT.CHILLED, 'passiveLoss')).toBe(1 + 0.1 * 2);
    });

    it('stops at the cap of 10 stacks and logs the stack it drops', () => {
        const { w, slot, min } = body({ coldStackTicks: 1 });
        w.temperature[slot] = min - 1;
        run(w, slot, 12);
        expect(w.effectStacks[0][slot]).toBe(10);
        expect(w.events.count).toBe(12);
        expect(w['effect.chilled.stacks'][slot]).toBe(10);
    });

    it('is not touched by the fade pass', () => {
        const { w, slot, min } = body();
        w.temperature[slot] = min - 1;
        run(w, slot, 4);
        for (let t = 0; t < 400; t++) {
            fadeEffects(w);
        }
        expect(w.effectStacks[0][slot]).toBe(1);
    });
});
