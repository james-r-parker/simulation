// eat-choice (docs/designs/eat-choice.md): G1, a non-hunter eats only while it bites; G4, a strike at nothing costs.
import { allocBody } from './helpers/body.js';
import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { FOOD_KIND } from '../../js/sim/carcass.js';
import { feed } from '../../js/sim/feeding.js';
import { ENERGY_SOURCE, LOSS_CAUSE, addEnergy } from '../../js/sim/energy.js';
import { buildHash, createSpatialHash } from '../../js/sim/spatial-hash.js';
import { smallWorld } from './helpers/small-world.js';

const FORAGER = 0;
const PREDATOR = 1;

/**
 * @param {ReturnType<typeof smallWorld>} w the world
 * @param {{ spec: number, bite: number, energy?: number }} a the agent
 * @returns {number} the slot, at (100, 100)
 */
function eater(w, a) {
    const slot = allocBody(w);
    w.x[slot] = 100;
    w.y[slot] = 100;
    w.spec[slot] = a.spec;
    w.genomeId[slot] = slot + 1;
    addEnergy(w, slot, a.energy ?? 20, ENERGY_SOURCE.INITIAL);
    w.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = a.bite;
    w.ateTimer[slot] = 30;
    return slot;
}

/**
 * @param {ReturnType<typeof smallWorld>} w the world
 * @param {{ kind?: number, tox?: number, dx?: number }} [f] the item, on the eater unless moved
 * @returns {number} the food slot
 */
function item(w, f = {}) {
    const slot = w.foodAlive.indexOf(0);
    w.foodAlive[slot] = 1;
    w.foodX[slot] = 100 + (f.dx ?? 0);
    w.foodY[slot] = 100;
    w.foodRadius[slot] = 5;
    w.foodValue[slot] = 10;
    w.foodKind[slot] = f.kind ?? FOOD_KIND.PLANT;
    w.foodTox[slot] = f.tox ?? 0;
    w.foodCount++;
    return slot;
}

/** @param {ReturnType<typeof smallWorld>} w the world */
function run(w) {
    const hash = createSpatialHash(w.config);
    buildHash(hash, w);
    feed(w, hash);
}

describe('feed: a non-hunter eats only while it bites (eat-choice G1)', () => {
    it('leaves food in contact uneaten while the forager does not bite', () => {
        for (const bite of [0, -0.5]) {
            const w = smallWorld();
            const a = eater(w, { spec: FORAGER, bite });
            const f = item(w);
            run(w);
            expect(w.foodAlive[f]).toBe(1);
            expect(w.energy[a]).toBe(20);
        }
    });

    it('eats food in contact while the forager bites', () => {
        const w = smallWorld();
        const a = eater(w, { spec: FORAGER, bite: 0.01 });
        const f = item(w);
        run(w);
        expect(w.foodAlive[f]).toBe(0);
        expect(w.energy[a]).toBeGreaterThan(20);
    });

    it("leaves a hunter's carcass meal unchanged whether it bites or not", () => {
        const gains = [0, 1].map((bite) => {
            const w = smallWorld();
            const a = eater(w, { spec: PREDATOR, bite });
            const f = item(w, { kind: FOOD_KIND.MEAT });
            run(w);
            expect(w.foodAlive[f]).toBe(0);
            return w.energy[a];
        });
        expect(gains[0]).toBe(30);
        expect(gains[1]).toBe(30);
    });

    it('chooses per tick, not per item: a biting forager eats a toxic item beside a clean one', () => {
        const w = smallWorld();
        const a = eater(w, { spec: FORAGER, bite: 1, energy: 100 });
        const clean = item(w, { dx: -3 });
        const toxic = item(w, { dx: 3, tox: 0.5 });
        run(w);
        expect(w.foodAlive[clean]).toBe(0);
        expect(w.foodAlive[toxic]).toBe(0);
        expect(w.dose[a]).toBeGreaterThan(0);
    });

    it('declines a toxic item only by not biting', () => {
        const w = smallWorld();
        const a = eater(w, { spec: FORAGER, bite: 0, energy: 100 });
        const toxic = item(w, { tox: 0.5 });
        run(w);
        expect(w.foodAlive[toxic]).toBe(1);
        expect(w.dose[a]).toBe(0);
    });
});

describe('feed: strikeMissCost (eat-choice G4)', () => {
    /**
     * A hunter at (100, 100) facing +x, holding BITE as given, and optionally a small forager touching it.
     * @param {{ cost: number, bite?: number, spec?: number, body?: number }} c the case: `body` is the forager's x
     *   offset (ahead in the jaws at +, behind at -), none when undefined
     * @returns {{ w: any, hunter: number }} the world after one feed phase
     */
    function strike({ cost, bite = 1, spec = PREDATOR, body }) {
        const w = smallWorld({ strikeMissCost: cost, biteArc: Math.PI / 4, biteCost: 0, recoilEnergy: 0 });
        const hunter = eater(w, { spec, bite, energy: 500 });
        if (body !== undefined) {
            const prey = eater(w, { spec: FORAGER, bite: 0, energy: 50 });
            w.x[prey] = 100 + body;
            w.size[prey] = w.size[hunter] / 2;
            w.contacts[0] = hunter;
            w.contacts[1] = prey;
            w.contactCount = 1;
        }
        run(w);
        return { w, hunter };
    }

    it('charges nothing at 0', () => {
        expect(strike({ cost: 0 }).w.energy[0]).toBe(500);
    });

    it('charges a biting hunter with nothing in its jaws, as a bite cost', () => {
        const { w, hunter } = strike({ cost: 5 });
        expect(w.energy[hunter]).toBe(495);
        expect(w.ledgerBiteCost[hunter]).toBe(5);
        expect(w.lastLoss[hunter]).toBe(LOSS_CAUSE.COST);
    });

    it('charges a biting hunter whose only contact is behind it, outside the jaws', () => {
        expect(strike({ cost: 5, body: -10 }).w.energy[0]).toBe(495);
    });

    it('charges nothing to a hunter with a body in its jaws', () => {
        const charged = strike({ cost: 5, body: 10 });
        const free = strike({ cost: 0, body: 10 });
        expect(charged.w.energy[charged.hunter]).toBe(free.w.energy[free.hunter]);
        expect(free.w.energy[free.hunter]).toBeGreaterThan(500);
    });

    it('charges nothing to a hunter that does not bite, or to a biting forager', () => {
        expect(strike({ cost: 5, bite: 0 }).w.energy[0]).toBe(500);
        expect(strike({ cost: 5, spec: FORAGER }).w.energy[0]).toBe(500);
    });

    it('refuses a negative strikeMissCost', () => {
        expect(() => smallWorld({ strikeMissCost: -1 })).toThrow('strikeMissCost');
        expect(smallWorld().config.strikeMissCost).toBe(0);
    });
});

describe('feed: grazeMissCost (eat-choice G4b)', () => {
    /**
     * A forager at (100, 100) holding BITE as given, with food `dx` away when `dx` is set.
     * @param {{ cost: number, bite?: number, dx?: number, spec?: number, full?: boolean }} c the case
     * @returns {{ w: any, slot: number }} the world after one feed phase
     */
    function graze({ cost, bite = 1, dx, spec = FORAGER, full = false }) {
        const w = smallWorld({ grazeMissCost: cost, satiationShare: 0.95 });
        const slot = eater(w, { spec, bite, energy: full ? w.maxEnergyBySpec[spec] : 20 });
        if (dx !== undefined) {
            item(w, { dx });
        }
        run(w);
        return { w, slot };
    }

    it('charges nothing at 0', () => {
        expect(graze({ cost: 0 }).w.energy[0]).toBe(20);
    });

    it('charges a biting forager with no food in contact, as a bite cost', () => {
        const { w, slot } = graze({ cost: 3 });
        expect(w.energy[slot]).toBe(17);
        expect(w.ledgerBiteCost[slot]).toBe(3);
        expect(w.lastLoss[slot]).toBe(LOSS_CAUSE.COST);
        expect(graze({ cost: 3, dx: 200 }).w.energy[0]).toBe(17);
    });

    it('charges nothing to a biting forager with edible food in contact', () => {
        const { w, slot } = graze({ cost: 3, dx: 0 });
        expect(w.energy[slot]).toBeGreaterThan(20);
    });

    it('charges nothing when edible food is in contact but the forager is too full to eat it', () => {
        const { w, slot } = graze({ cost: 3, dx: 0, full: true });
        expect(w.energy[slot]).toBe(w.maxEnergyBySpec[FORAGER]);
        expect(Array.from(w.foodAlive).includes(1)).toBe(true);
    });

    it('charges nothing to a forager that does not bite, or to a hunter', () => {
        expect(graze({ cost: 3, bite: 0 }).w.energy[0]).toBe(20);
        expect(graze({ cost: 3, spec: PREDATOR }).w.energy[0]).toBe(20);
    });

    it('refuses a negative grazeMissCost', () => {
        expect(() => smallWorld({ grazeMissCost: -1 })).toThrow('grazeMissCost');
        expect(smallWorld().config.grazeMissCost).toBe(0);
    });
});
