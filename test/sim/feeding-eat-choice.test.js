// eat-choice (docs/designs/eat-choice.md): G1, a non-hunter eats only while it bites.
import { allocBody } from './helpers/body.js';
import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { FOOD_KIND } from '../../js/sim/carcass.js';
import { feed } from '../../js/sim/feeding.js';
import { ENERGY_SOURCE, addEnergy } from '../../js/sim/energy.js';
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
