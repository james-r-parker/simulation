// A heard call raises `rallied` on a kin hunter, once per call (docs/designs/status-effects.md, "The social effects").

import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { EFFECT, effectFactor } from '../../js/sim/effects.js';
import { HEARD_FROM_STRIDE } from '../../js/sim/agent-arrays.js';
import { FORAGER } from './helpers/bite-stage.js';
import { hold, pack, stacks, tick } from './helpers/pack-stage.js';

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
