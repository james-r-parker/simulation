import { describe, expect, it } from 'vitest';
import { stepPatchLife } from '../../js/sim/patch-life.js';
import { regrowPatches } from '../../js/sim/food-patches.js';
import { createConfig } from '../../js/sim/config.js';
import { EVENT_TYPE, clearEvents } from '../../js/sim/events.js';
import { nextFloat } from '../../js/sim/rng.js';
import { assertFlora } from '../../js/sim/flora-state.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { smallWorld } from './helpers/small-world.js';

/** @param {Record<string, any>} [over] config overrides @returns {any} one grass patch and free pool slots */
function garden(over = {}) {
    return smallWorld({
        foodPatchCount: 1,
        floraPatchMax: 3,
        foodPatchRadius: 100,
        patchDieTicks: 3,
        seedBankTicks: 4,
        sproutRate: 0,
        ...over,
    });
}

describe('patch life', () => {
    it('dies only after consecutive near-floor ticks and leaves a bank and one event', () => {
        const w = garden();
        clearEvents(w.events);
        w.patchStock[0] = 0.05;
        expect(stepPatchLife(w, 0)).toBe(true);
        w.patchStock[0] = 0.06;
        stepPatchLife(w, 0);
        expect(w.patchLowTicks[0]).toBe(0);
        w.patchStock[0] = 0.0505;
        stepPatchLife(w, 0);
        stepPatchLife(w, 0);
        expect(w.patchAlive[0]).toBe(1);
        expect(stepPatchLife(w, 0)).toBe(false);
        expect([w.patchAlive[0], w.patchStock[0], w.patchWeight[0], w.patchBank[0]]).toEqual([0, 0, 0, 4]);
        expect(w.events.count).toBe(1);
        expect(Array.from(w.events.data.slice(0, 4))).toEqual([EVENT_TYPE.PATCH_DIED, 0, 0, 0]);
        expect(() => assertFlora(w)).not.toThrow();
    });

    it('expires an unsprouted bank and never restores an extinct patch', () => {
        const w = garden();
        w.patchAlive[0] = 0;
        w.patchStock[0] = w.patchWeight[0] = 0;
        w.patchBank[0] = 2;
        const expected = { seed: w.rng.flora.seed, s: w.rng.flora.s.slice() };
        nextFloat(expected);
        nextFloat(expected);
        regrowPatches(w);
        regrowPatches(w);
        expect(w.patchBank[0]).toBe(0);
        const before = hashWorld(w);
        regrowPatches(w);
        expect(hashWorld(w)).toBe(before);
        expect(w.rng.flora.s).toEqual(expected.s);
        expect(w.patchAlive[0]).toBe(0);
    });

    it('sprouts on the last bank tick with preserved traits and a new serial', () => {
        const w = garden({ sproutRate: 1 });
        w.patchAlive[0] = 0;
        w.patchStock[0] = w.patchWeight[0] = 0;
        w.patchBank[0] = 1;
        const hue = w.patchHue[0];
        expect(stepPatchLife(w, 0)).toBe(true);
        expect([w.patchAlive[0], w.patchBank[0], w.patchSerial[0], w.patchStock[0]]).toEqual([1, 0, 2, 0.3]);
        expect(w.patchHue[0]).toBe(hue);
        expect(() => assertFlora(w)).not.toThrow();
    });

    it('replays bank draws in ascending slot order', () => {
        const a = garden({ sproutRate: 0.4 });
        const b = garden({ sproutRate: 0.4 });
        for (const w of [a, b]) {
            w.patchAlive[0] = 0;
            w.patchStock[0] = w.patchWeight[0] = 0;
            w.patchBank[0] = 4;
            for (let i = 0; i < 3; i++) {
                regrowPatches(w);
            }
        }
        expect(hashWorld(a)).toBe(hashWorld(b));
    });

    for (const [key, value] of [
        ['patchDieTicks', 0],
        ['seedBankTicks', 0],
        ['sproutRate', 2],
        ['seedStock', -1],
    ]) {
        it(`rejects invalid ${key}`, () => {
            expect(() => createConfig({ [key]: value })).toThrow(String(key));
        });
    }

    for (const [field, value] of [
        ['patchEnergy', 0],
        ['patchLife', 0],
        ['patchSpan', 0],
        ['patchRegrow', -1],
        ['patchYield', -1],
        ['patchWeight', -1],
        ['patchStock', -1],
        ['patchStart', 1],
        ['patchSpan', 2],
        ['patchStock', 2],
    ]) {
        it(`rejects invalid occupied ${field}=${value}`, () => {
            const w = garden();
            w[field][0] = value;
            expect(() => assertFlora(w)).toThrow('flora invariant');
        });
    }

    for (const [field, value] of [
        ['patchAlive', 2],
        ['patchBank', -1],
        ['patchBank', 5],
        ['patchLowTicks', -1],
        ['patchLowTicks', 4],
        ['patchBank', 1],
        ['patchSerial', 0],
    ]) {
        it(`rejects invalid living state ${field}=${value}`, () => {
            const w = garden();
            w[field][0] = value;
            expect(() => assertFlora(w)).toThrow('flora invariant');
        });
    }

    it('rejects stock and fruiting weight on dead slots', () => {
        const w = garden();
        w.patchAlive[0] = 0;
        expect(() => assertFlora(w)).toThrow('dead patch holds');
        w.patchStock[0] = 0;
        w.patchWeight[0] = 1;
        expect(() => assertFlora(w)).toThrow('dead patch holds');
    });
});
