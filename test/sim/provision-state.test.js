// The provisioning state (realistic-keepers.md T3): it exists only while the switch is on, and the invariant on the totals.

import { describe, expect, it } from 'vitest';
import { assertProvision } from '../../js/sim/provision-state.js';
import { lifeWorld } from './helpers/life-world.js';

describe('provisioning state', () => {
    /** @type {(slot: number, value: number, detail: string) => Error} */
    const fail = (slot, value, detail) => new Error(`${slot} ${value} ${detail}`);

    it('allocates the totals and the young list only when provisionEnabled is on', () => {
        const on = lifeWorld({ provisionEnabled: true });
        expect(Array.from(on.provisionTotals)).toEqual([0, 0]);
        expect(on.provisionYoung.slots.length).toBe(on.config.maxAgents);
        const off = lifeWorld({});
        expect(off.provisionTotals).toBeUndefined();
        expect(off.provisionYoung).toBeUndefined();
    });

    it('passes equal totals and throws on unequal ones', () => {
        const w = lifeWorld({ provisionEnabled: true });
        expect(() => assertProvision(w, fail)).not.toThrow();
        w.provisionTotals[0] = 5;
        expect(() => assertProvision(w, fail)).toThrow(/differ/);
        w.provisionTotals[1] = 5;
        expect(() => assertProvision(w, fail)).not.toThrow();
    });

    it('checks nothing while the switch is off', () => {
        expect(() => assertProvision(lifeWorld({}), fail)).not.toThrow();
    });
});
