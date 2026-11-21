// Raising, setting and dropping stored stacks (docs/designs/status-effects.md, "Appliers"), and the three forms of fade a
// social effect needs beyond today's two: a timer scaled by a lane of the body (`by`), a hand-over to another effect when the
// timer ends (`then`) and a clock the applier keeps itself (`held`).

import v8 from 'node:v8';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { EVENT, EVENT_STRIDE, EVENT_TYPE, clearEvents } from '../../js/sim/events.js';
import { EFFECT, createEffects, fadeEffects, raiseOn } from '../../js/sim/effects.js';
import { dropStack, raiseEffect, setStacks } from '../../js/sim/effect-raise.js';
import { smallWorld } from './helpers/small-world.js';

/**
 * @param {Record<string, any>} over fields of a stored effect
 * @returns {any} the effect
 */
const stored = (over) => ({
    family: 'social',
    maxStacks: 3,
    level: 'stacks',
    fades: { kind: 'ticks', key: 'fixtureTicks' },
    scales: [],
    gates: [],
    drains: [],
    applier: 'fixture',
    visible: false,
    ...over,
});

const AFTER = stored({ name: 'after', maxStacks: 1, fades: { kind: 'ticks', key: 'fixtureTicks', by: 'nerve' } });
const LEAD = stored({ name: 'lead', then: 'after' });
const HELD = stored({ name: 'held', maxStacks: 4, fades: { kind: 'held', key: 'fixtureTicks' } });
const SYSTEM = createEffects([AFTER, LEAD, HELD]);
const [AFTER_I, LEAD_I, HELD_I] = [0, 1, 2];

/** @returns {Record<string, any>} a world with the three effects' rows, a timer of 4 ticks and a nerve of 1.5 in slot 0 */
function world() {
    const w = smallWorld({ maxAgents: 4 });
    w.config = { ...w.config, fixtureTicks: 4 };
    SYSTEM.allocRows(w);
    w.lanes.nerve[0] = 1.5;
    return w;
}

describe('raiseEffect', () => {
    it('sets a timer of its length times the body lane the effect names, and the plain length without one', () => {
        const w = world();
        raiseEffect(SYSTEM, w, 0, { effect: AFTER_I, source: 0 });
        raiseEffect(SYSTEM, w, 0, { effect: LEAD_I, source: 0 });
        expect(w['effect.after.ticks'][0]).toBe(6);
        expect(w['effect.lead.ticks'][0]).toBe(4);
    });

    it('leaves the clock of a held effect to its applier', () => {
        const w = world();
        w['effect.held.ticks'][0] = 7;
        expect(raiseEffect(SYSTEM, w, 0, { effect: HELD_I, source: 0 })).toBe(true);
        expect([w['effect.held.stacks'][0], w['effect.held.ticks'][0]]).toEqual([1, 7]);
    });
});

describe('the fade pass', () => {
    it('leaves a held effect alone', () => {
        const w = world();
        raiseEffect(SYSTEM, w, 0, { effect: HELD_I, source: 0 });
        w['effect.held.ticks'][0] = 2;
        for (let tick = 0; tick < 5; tick++) {
            SYSTEM.fade(w);
        }
        expect([w['effect.held.stacks'][0], w['effect.held.ticks'][0]]).toEqual([1, 2]);
    });

    it('raises the follow-on as the timer ends, for its whole length, and logs it with source 0', () => {
        const w = world();
        raiseEffect(SYSTEM, w, 0, { effect: LEAD_I, source: 5 });
        const seen = [];
        for (let tick = 0; tick < 12; tick++) {
            SYSTEM.fade(w);
            seen.push([w['effect.lead.stacks'][0], w['effect.after.stacks'][0]]);
        }
        // `lead` lasts through the 3rd fade; `after` (4 x 1.5 = 6 ticks) is raised in the 4th and lasts 6 fades after it.
        expect(seen.slice(0, 4)).toEqual([
            [1, 0],
            [1, 0],
            [1, 0],
            [0, 1],
        ]);
        expect(seen.slice(4, 9).every(([, after]) => after === 1)).toBe(true);
        expect(seen[9]).toEqual([0, 0]);
        const { data, count } = w.events;
        expect(count).toBe(2);
        expect(data[EVENT_STRIDE]).toBe(EVENT_TYPE.EFFECT_APPLIED);
        expect(data[EVENT_STRIDE + EVENT.EFFECT_APPLIED.SOURCE]).toBe(0);
    });

    it('refuses a hand-over to an unlisted effect or from an effect that does not use a ticks timer', () => {
        expect(() => createEffects([stored({ name: 'a', then: 'zzz' })])).toThrow(/hands over/);
        expect(() =>
            createEffects([stored({ name: 'a', then: 'b', fades: { kind: 'held', key: 'k' } }), AFTER]),
        ).toThrow(/hands over/);
    });
});

describe('setStacks', () => {
    it('logs one record per stack gained, none for a fall, and caps at maxStacks', () => {
        const w = world();
        setStacks(SYSTEM, w, 0, { effect: HELD_I, count: 2, source: 3 });
        expect(w.events.count).toBe(2);
        expect(w.events.data[EVENT.EFFECT_APPLIED.STACKS]).toBe(1);
        setStacks(SYSTEM, w, 0, { effect: HELD_I, count: 1, source: 3 });
        expect([w['effect.held.stacks'][0], w.events.count]).toEqual([1, 2]);
        setStacks(SYSTEM, w, 0, { effect: HELD_I, count: 99, source: 3 });
        expect([w['effect.held.stacks'][0], w.events.count]).toEqual([4, 5]);
    });
});

describe('dropStack', () => {
    it('takes one stack off, stops the clock with the last, and does nothing at 0', () => {
        const w = world();
        expect(dropStack(SYSTEM, w, 0, LEAD_I)).toBe(false);
        raiseEffect(SYSTEM, w, 0, { effect: LEAD_I, source: 0 });
        raiseEffect(SYSTEM, w, 0, { effect: LEAD_I, source: 0 });
        expect(dropStack(SYSTEM, w, 0, LEAD_I)).toBe(true);
        expect([w['effect.lead.stacks'][0], w['effect.lead.ticks'][0]]).toEqual([1, 4]);
        expect(dropStack(SYSTEM, w, 0, LEAD_I)).toBe(true);
        expect([w['effect.lead.stacks'][0], w['effect.lead.ticks'][0]]).toEqual([0, 0]);
    });

    it('refuses an effect that stores nothing', () => {
        const none = createEffects([{ ...AFTER, name: 'none', level: 'step', read: () => 0 }]);
        expect(() => dropStack(none, world(), 0, 0)).toThrow(/stores no stacks/);
    });
});

describe('a raise, a set and the fade pass', () => {
    it('allocate nothing: the cause, the event record and the fade row are reused', () => {
        v8.setFlagsFromString('--expose-gc');
        const gc = vm.runInNewContext('gc');
        const w = smallWorld({ maxAgents: 8 });
        const passes = 300;
        const run = () => {
            for (let i = 0; i < passes; i++) {
                clearEvents(w.events);
                for (let slot = 0; slot < 8; slot++) {
                    raiseOn(w, slot, EFFECT.PANICKED, 1);
                    raiseOn(w, slot, EFFECT.HOARSE, slot);
                }
                fadeEffects(w);
            }
        };
        run();
        let best = Infinity;
        for (let window = 0; window < 10; window++) {
            gc();
            const before = process.memoryUsage().heapUsed;
            run();
            best = Math.min(best, process.memoryUsage().heapUsed - before);
        }
        expect(best).toBeLessThan(passes * 4);
    });
});
