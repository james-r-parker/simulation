import { describe, expect, it } from 'vitest';
import { agePollen, carryPollen, seedPatch, assertPollen, SEED_REFUSED } from '../../js/sim/pollination.js';
import { EVENT_STRIDE, EVENT_TYPE, clearEvents } from '../../js/sim/events.js';
import { nextFloat, nextGaussian } from '../../js/sim/rng.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { feed } from '../../js/sim/feeding.js';
import { buildHash } from '../../js/sim/spatial-hash.js';
import { freeAgent, removeFood } from '../../js/sim/world.js';
import { FOOD_KIND } from '../../js/sim/carcass.js';
import { assertFlora } from '../../js/sim/flora-state.js';
import { floraGarden, patchMeal } from './helpers/flora-garden.js';

/** @param {any} w the world @param {number} type event code @returns {number[][]} matching records */
function events(w, type) {
    const records = [];
    for (let at = 0; at < w.events.count * EVENT_STRIDE; at += EVENT_STRIDE) {
        if (w.events.data[at] === type) {
            records.push(Array.from(w.events.data.slice(at, at + EVENT_STRIDE)));
        }
    }
    return records;
}

/** @param {any} w the world @param {number} patch source patch @returns {void} */
function visit(w, patch) {
    const food = patchMeal(w, patch);
    carryPollen(w, 0, food);
    removeFood(w, food);
}

describe('pollen carriage and seeding', () => {
    it('loads one source identity and delivers a blended local seedling to a different patch', () => {
        const w = floraGarden();
        clearEvents(w.events);
        w.patchHue.set([0.6, 1]);
        visit(w, 0);
        expect([w.pollenPatch[0], w.pollenSerial[0], w.pollenTicks[0]]).toEqual([1, 1, 3000]);
        const expected = { seed: w.rng.flora.seed, s: w.rng.flora.s.slice() };
        nextFloat(expected);
        nextFloat(expected);
        for (let i = 0; i < 5; i++) {
            nextGaussian(expected);
        }
        visit(w, 1);
        expect(w.patchAlive[2]).toBe(1);
        expect(w.patchSerial[2]).toBe(1);
        expect(w.patchStock[2]).toBe(0.3);
        expect(w.patchHue[2]).toBeCloseTo(0.8);
        expect(w.patchX[2]).toBeLessThan(1000);
        expect(w.pollenPatch[0]).toBe(0);
        expect(w.patchSeedTick[1]).toBe(0);
        expect(w.rng.flora.s).toEqual(expected.s);
        expect(events(w, EVENT_TYPE.PATCH_SEEDED)[0].slice(2, 6)).toEqual([3, 2, 0, 1]);
        expect(() => assertFlora(w)).not.toThrow();
    });

    it('refreshes same-patch pollen without seeding and ages it to complete expiry', () => {
        const w = floraGarden({ pollenTicks: 2 });
        visit(w, 0);
        visit(w, 0);
        expect(events(w, EVENT_TYPE.PATCH_SEEDED)).toHaveLength(0);
        agePollen(w);
        expect(w.pollenTicks[0]).toBe(1);
        agePollen(w);
        expect([w.pollenPatch[0], w.pollenSerial[0], w.pollenTicks[0]]).toEqual([0, 0, 0]);
    });

    it('voids pollen when its source dies or the same-species slot is reused', () => {
        const w = floraGarden();
        visit(w, 0);
        w.patchAlive[0] = 0;
        w.patchBank[0] = 10;
        agePollen(w);
        expect(w.pollenPatch[0]).toBe(0);
        w.patchAlive[0] = 1;
        visit(w, 0);
        w.patchSerial[0]++;
        agePollen(w);
        expect(w.pollenPatch[0]).toBe(0);
    });

    it('does not load stale items after same-species source-slot reuse, or mismatched/background items', () => {
        const w = floraGarden();
        const food = patchMeal(w, 0);
        const before = w.rng.flora.s.slice();
        w.patchSerial[0]++;
        carryPollen(w, 0, food);
        expect(w.pollenPatch[0]).toBe(0);
        w.foodPatchSerial[food] = w.patchSerial[0];
        w.foodSpecies[food] = 0;
        carryPollen(w, 0, food);
        w.foodPatch[food] = -1;
        carryPollen(w, 0, food);
        expect(w.rng.flora.s).toEqual(before);
    });

    it('ignores unpollinated species and permits a missed pollen chance', () => {
        const w = floraGarden({ flora: { flower: { pollenChance: 0 } } });
        const before = w.rng.flora.s.slice();
        visit(w, 0);
        expect(w.rng.flora.s).toEqual(before);
        const low = floraGarden({ flora: { flower: { pollenChance: Number.MIN_VALUE } } });
        visit(low, 0);
        expect(low.pollenPatch[0]).toBe(0);
    });

    it('retains pollen on cooldown, and consumes/stamps it when the pool is full or banked', () => {
        const w = floraGarden();
        w.patchAlive[2] = w.patchAlive[3] = 0;
        w.patchBank[2] = w.patchBank[3] = 10;
        visit(w, 0);
        w.patchSeedTick[1] = 0;
        visit(w, 1);
        expect(w.pollenPatch[0]).toBe(1);
        expect(events(w, EVENT_TYPE.SEEDING_REFUSED)[0][3]).toBe(SEED_REFUSED.COOLDOWN);
        w.tick = 6000;
        visit(w, 1);
        expect(w.pollenPatch[0]).toBe(0);
        expect(w.patchSeedTick[1]).toBe(6000);
        expect(events(w, EVENT_TYPE.SEEDING_REFUSED).at(-1)?.[3]).toBe(SEED_REFUSED.POOL);
    });

    it('refuses blocked local placement, consumes pollen and never seeds globally', () => {
        const w = floraGarden({ placementTries: 2 });
        visit(w, 0);
        const food = patchMeal(w, 1);
        w.obsX[0] = w.obsY[0] = 500;
        w.obsRadius[0] = 1000;
        carryPollen(w, 0, food);
        expect(w.patchAlive[2]).toBe(0);
        expect(w.pollenPatch[0]).toBe(0);
        expect(events(w, EVENT_TYPE.SEEDING_REFUSED)[0][3]).toBe(SEED_REFUSED.PLACEMENT);
    });

    it('keeps the first refusal reason per agent/tick without suppressing a later seeding decision', () => {
        const w = floraGarden({ foodPatchCount: 3, floraPatchMax: 5 });
        w.patchX[2] = 600;
        w.patchY[2] = 500;
        visit(w, 0);
        w.patchSeedTick[1] = 0;
        visit(w, 1);
        visit(w, 2);
        expect(w.patchAlive[3]).toBe(1);
        visit(w, 0);
        visit(w, 1);
        expect(events(w, EVENT_TYPE.SEEDING_REFUSED)).toHaveLength(1);
        expect(events(w, EVENT_TYPE.SEEDING_REFUSED)[0][3]).toBe(SEED_REFUSED.COOLDOWN);
        expect(events(w, EVENT_TYPE.PATCH_SEEDED)).toHaveLength(1);
        expect(w.pollenPatch[0]).toBe(1);
    });

    it('does not cross-pollinate different species and replaces carried pollen instead', () => {
        const w = floraGarden();
        visit(w, 0);
        w.patchSpecies[1] = 1;
        const food = patchMeal(w, 1);
        w.rng.flora.s.set([0, 0, 0, 0]);
        carryPollen(w, 0, food);
        expect(w.pollenPatch[0]).toBe(2);
        expect(events(w, EVENT_TYPE.PATCH_SEEDED)).toHaveLength(0);
    });

    it('loads slot255 as encoded value256, and hashes/resets persistent pollen but not refusal scratch', () => {
        const w = floraGarden({ foodPatchCount: 256, floraPatchMax: 256 });
        visit(w, 255);
        expect(w.pollenPatch[0]).toBe(256);
        const hash = hashWorld(w);
        w.pollenRefusalTick[0] = 100;
        expect(hashWorld(w)).toBe(hash);
        for (const field of ['pollenPatch', 'pollenSerial', 'pollenTicks']) {
            const before = hashWorld(w);
            w[field][0]--;
            expect(hashWorld(w), field).not.toBe(before);
            w[field][0]++;
        }
        freeAgent(w, 0);
        expect([w.pollenPatch[0], w.pollenSerial[0], w.pollenTicks[0], w.pollenRefusalTick[0]]).toEqual([0, 0, 0, 0]);
    });

    it('runs from accepted plant meals before clearing the source record, but not from meat', () => {
        const w = floraGarden();
        const food = patchMeal(w, 0);
        buildHash(w.hash, w);
        feed(w, w.hash);
        expect(w.foodAlive[food]).toBe(0);
        expect(w.foodPatchSerial[food]).toBe(0);
        expect(w.pollenPatch[0]).toBe(1);
        w.pollenPatch[0] = w.pollenSerial[0] = w.pollenTicks[0] = 0;
        const meat = patchMeal(w, 0);
        w.foodKind[meat] = FOOD_KIND.MEAT;
        buildHash(w.hash, w);
        feed(w, w.hash);
        expect(w.pollenPatch[0]).toBe(0);
    });

    it('replays seeding including inherited traits and flora draws', () => {
        const a = floraGarden();
        const b = floraGarden();
        for (const w of [a, b]) {
            visit(w, 0);
            seedPatch(w, 0, 0, 1);
        }
        expect(hashWorld(a)).toBe(hashWorld(b));
    });
    it('allows a source that died this field phase until aging clears its carrier', () => {
        const w = floraGarden();
        visit(w, 0);
        w.patchAlive[0] = 0;
        expect(() => assertPollen(w)).not.toThrow();
        agePollen(w);
        expect(() => assertPollen(w)).not.toThrow();
        expect(w.pollenPatch[0]).toBe(0);
    });

    for (const [field, value] of [
        ['pollenPatch', 5],
        ['pollenTicks', -1],
        ['pollenTicks', 3001],
        ['pollenSerial', 1],
        ['pollenTicks', 1],
    ]) {
        it(`rejects an invalid empty carrier ${field}=${value}`, () => {
            const w = floraGarden();
            w[field][0] = value;
            expect(() => assertPollen(w)).toThrow('pollen');
        });
    }

    for (const field of ['pollenSerial', 'pollenTicks', 'alive']) {
        it(`rejects an invalid occupied carrier with zero ${field}`, () => {
            const w = floraGarden();
            visit(w, 0);
            w[field][0] = 0;
            expect(() => assertPollen(w)).toThrow('pollen');
        });
    }
});
