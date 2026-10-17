import { describe, expect, it } from 'vitest';
import { FOOD_KIND, leaveCarcass } from '../../js/sim/carcass.js';
import { feed } from '../../js/sim/feeding.js';
import { ageFood } from '../../js/sim/food.js';
import { assertInvariants } from '../../js/sim/invariants.js';
import { reap } from '../../js/sim/population.js';
import { createSnapshotViews, snapshotLayout, writeSnapshot } from '../../js/sim/snapshot.js';
import { buildHash, createSpatialHash } from '../../js/sim/spatial-hash.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { addBlob, lifeWorld, recordingPolicy } from './helpers/life-world.js';
import { createConfig } from '../../js/sim/config.js';
import { validateConfig } from '../../js/sim/config-validate.js';

const PREDATOR = 1;
const ON = { carcassesEnabled: true, carcassTicks: 5, carcassShare: 0.5, maxAgeTicks: 10 };

/**
 * Kills one old agent holding `energy` and returns the carcass slot (or -1 when none).
 * @param {any} w the world
 * @param {number} energy the agent's energy at death
 * @returns {number} the alive food slot, or -1
 */
function killOld(w, energy) {
    addBlob(w, { energy, ageTicks: 10, x: 300, y: 400, size: 12 });
    reap(w, recordingPolicy([]));
    return w.foodAlive.indexOf(1);
}

describe('carcass config', () => {
    it('is off by default, with 300 ticks, a 0.5 share and meat values per specialisation', () => {
        const c = createConfig({});
        expect(c.carcassesEnabled).toBe(false);
        expect([c.carcassTicks, c.carcassShare]).toEqual([300, 0.5]);
        expect(Object.values(c.specialisations).map((s) => s.meatFoodValue)).toEqual([0.3, 1, 0.3, 0.3, 0.3]);
    });

    it.each([
        ['carcassesEnabled', 1],
        ['carcassTicks', 0],
        ['carcassTicks', 1.5],
        ['carcassShare', -0.1],
        ['carcassShare', 1.1],
    ])('rejects %s = %s', (key, value) => {
        expect(() => createConfig({ [key]: value })).toThrow(key);
    });

    it.each([-0.1, 1.1, 'x'])('rejects a meatFoodValue of %s', (value) => {
        const specialisations = structuredClone(createConfig({}).specialisations);
        specialisations.scout.meatFoodValue = value;
        expect(() => validateConfig({ ...createConfig({}), specialisations })).toThrow(
            'specialisations.scout.meatFoodValue',
        );
    });
});

describe('leaveCarcass', () => {
    it('leaves a meat item at the body holding carcassShare of its energy', () => {
        const w = lifeWorld(ON);
        const food = killOld(w, 80);
        expect(food).toBeGreaterThanOrEqual(0);
        expect(w.foodKind[food]).toBe(FOOD_KIND.MEAT);
        expect([w.foodX[food], w.foodY[food]]).toEqual([300, 400]);
        expect(w.foodValue[food]).toBe(40);
        expect(w.foodAge[food]).toBe(0);
        expect(w.foodCount).toBe(1);
    });

    it('leaves nothing when carcasses are off', () => {
        const w = lifeWorld({ ...ON, carcassesEnabled: false });
        expect(killOld(w, 80)).toBe(-1);
        expect(w.foodCount).toBe(0);
    });

    it('leaves nothing for an agent with no energy left', () => {
        const w = lifeWorld(ON);
        expect(killOld(w, 0)).toBe(-1);
    });

    it('counts toward maxFood: with every food slot taken, no carcass appears', () => {
        const w = lifeWorld({ ...ON, maxFood: 1 });
        w.foodAlive[0] = 1;
        w.foodCount = 1;
        const slot = addBlob(w, { energy: 50 });
        leaveCarcass(w, slot);
        expect(w.foodCount).toBe(1);
        expect(w.foodKind[0]).toBe(FOOD_KIND.PLANT);
    });

    it('draws from no RNG stream', () => {
        const w = lifeWorld(ON);
        const before = Object.values(w.rng).map((r) => Array.from(r.s));
        killOld(w, 80);
        expect(Object.values(w.rng).map((r) => Array.from(r.s))).toEqual(before);
    });

    it('still leaves the remaining energy of an agent that was eaten', () => {
        const w = lifeWorld(ON);
        const slot = addBlob(w, { energy: 20 });
        w.lastBiter[slot] = 9;
        leaveCarcass(w, slot);
        expect(w.foodValue[w.foodAlive.indexOf(1)]).toBe(10);
    });
});

describe('carcass expiry', () => {
    it('lasts carcassTicks ticks while plant food keeps lasting foodMaxAge', () => {
        const w = lifeWorld({ ...ON, foodMaxAge: 100 });
        const meat = killOld(w, 80);
        const plant = w.foodAlive.indexOf(0);
        w.foodAlive[plant] = 1;
        w.foodCount += 1;
        for (let i = 0; i < 5; i++) {
            ageFood(w);
        }
        expect(w.foodAlive[meat]).toBe(1);
        ageFood(w);
        expect(w.foodAlive[meat]).toBe(0);
        expect(w.foodAlive[plant]).toBe(1);
        expect(w.foodCount).toBe(1);
        expect(w.foodKind[meat]).toBe(FOOD_KIND.PLANT);
    });
});

describe('eating meat', () => {
    /**
     * @param {number} spec the eater's specialisation
     * @returns {{w: any, eater: number}} the world after one feed phase over a 40 energy carcass
     */
    function eatCarcass(spec) {
        const w = lifeWorld({ ...ON, maxEnergy: 1000 });
        killOld(w, 80);
        const eater = addBlob(w, { energy: 100, spec, x: 300, y: 400 });
        w.ateTimer[eater] = 30;
        const hash = createSpatialHash(w.config);
        buildHash(hash, w);
        feed(w, hash);
        return { w, eater };
    }

    it('gives a predator the full value', () => {
        const { w, eater } = eatCarcass(PREDATOR);
        expect(w.energy[eater]).toBeCloseTo(140, 9);
        expect(w.foodCount).toBe(0);
    });

    it('gives a forager 0.3 of the value', () => {
        const { w, eater } = eatCarcass(0);
        expect(w.energy[eater]).toBeCloseTo(112, 9);
        expect(w.foodCount).toBe(0);
    });

    it('leaves the meat to an eater whose meatFoodValue is 0', () => {
        const w = lifeWorld({ ...ON, specialisations: { forager: { meatFoodValue: 0 } } });
        killOld(w, 80);
        const eater = addBlob(w, { energy: 100, spec: 0, x: 300, y: 400 });
        w.ateTimer[eater] = 30;
        const hash = createSpatialHash(w.config);
        buildHash(hash, w);
        feed(w, hash);
        expect(w.foodCount).toBe(1);
        expect(w.energy[eater]).toBe(100);
    });

    it('keeps the energy ledger balanced through a death and a meal', () => {
        const { w } = eatCarcass(0);
        expect(() => assertInvariants(w)).not.toThrow();
    });
});

describe('carcass snapshot and hash', () => {
    it('marks meat with a negative radius and leaves plant food positive', () => {
        const w = lifeWorld(ON);
        const meat = killOld(w, 80);
        const plant = w.foodAlive.indexOf(0);
        w.foodAlive[plant] = 1;
        w.foodRadius[plant] = 7;
        w.foodCount += 1;
        const buffer = new ArrayBuffer(snapshotLayout(w.config).bytes);
        const views = createSnapshotViews(buffer);
        writeSnapshot(w, views);
        const start = 6;
        const radii = [views.f32[start + 2], views.f32[start + 5]];
        expect(views.u32[2]).toBe(2);
        expect(radii[plant < meat ? 0 : 1]).toBe(7);
        expect(radii[plant < meat ? 1 : 0]).toBe(-w.foodRadius[meat]);
    });

    it('hashes the item kind only when carcassesEnabled', () => {
        const mark = (/** @type {boolean} */ on) => {
            const w = lifeWorld({ ...ON, carcassesEnabled: on });
            w.foodAlive[0] = 1;
            w.foodCount = 1;
            const before = hashWorld(w);
            w.foodKind[0] = FOOD_KIND.MEAT;
            return [before, hashWorld(w)];
        };
        const off = mark(false);
        const on = mark(true);
        expect(off[1]).toBe(off[0]);
        expect(on[1]).not.toBe(on[0]);
    });
});
