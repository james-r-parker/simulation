import { describe, expect, it } from 'vitest';
import { feed } from '../../js/sim/feeding.js';
import { ENERGY_SOURCE, LOSS_CAUSE, addEnergy } from '../../js/sim/energy.js';
import { allocAgent } from '../../js/sim/world.js';
import { buildHash, createSpatialHash } from '../../js/sim/spatial-hash.js';
import { smallWorld } from './helpers/small-world.js';

const FORAGER = 0;
const PREDATOR = 1;
const DEFENDER = 4;
const BITE = 4;

/**
 * @param {ReturnType<typeof smallWorld>} w
 * @param {{x: number, y: number, energy: number, spec?: number, bite?: boolean, genomeId?: number}} a
 * @returns {number} the slot
 */
function agent(w, a) {
    const slot = allocAgent(w);
    w.x[slot] = a.x;
    w.y[slot] = a.y;
    w.spec[slot] = a.spec ?? FORAGER;
    w.genomeId[slot] = a.genomeId ?? slot + 1;
    addEnergy(w, slot, a.energy, ENERGY_SOURCE.INITIAL);
    w.outputs[slot * 5 + BITE] = a.bite ? 1 : 0;
    w.ateTimer[slot] = 30;
    w.bittenTimer[slot] = 30;
    return slot;
}

/**
 * @param {ReturnType<typeof smallWorld>} w
 * @param {number} x
 * @param {number} y
 * @param {number} value
 * @returns {number} the food slot
 */
function food(w, x, y, value) {
    let slot = 0;
    while (w.foodAlive[slot] === 1) {
        slot++;
    }
    w.foodAlive[slot] = 1;
    w.foodX[slot] = x;
    w.foodY[slot] = y;
    w.foodRadius[slot] = 5;
    w.foodValue[slot] = value;
    w.foodCount++;
    return slot;
}

/**
 * @param {ReturnType<typeof smallWorld>} w
 * @param {number[]} [pairs] contact pairs, flattened
 * @returns {void}
 */
function run(w, pairs = []) {
    pairs.forEach((v, i) => {
        w.contacts[i] = v;
    });
    w.contactCount = pairs.length / 2;
    const hash = createSpatialHash(w.config);
    buildHash(hash, w);
    feed(w, hash);
}

describe('feed: eating', () => {
    it('eats an overlapped food, stores its value and resets ateTimer', () => {
        const w = smallWorld();
        const a = agent(w, { x: 100, y: 100, energy: 20 });
        const f = food(w, 100 + w.size[a], 100, 7);
        run(w);
        expect(w.foodAlive[f]).toBe(0);
        expect(w.foodCount).toBe(0);
        expect(w.energy[a]).toBe(27);
        expect(w.foodEnergy[a]).toBe(7);
        expect(w.ateTimer[a]).toBe(0);
    });

    it('leaves food that only touches or is out of reach', () => {
        const w = smallWorld();
        const a = agent(w, { x: 100, y: 100, energy: 20 });
        const f = food(w, 100 + w.size[a] + 5, 100, 7);
        run(w);
        expect(w.foodAlive[f]).toBe(1);
        expect(w.ateTimer[a]).toBe(30);
    });

    it('eats several overlapping foods', () => {
        const w = smallWorld();
        const a = agent(w, { x: 100, y: 100, energy: 20 });
        food(w, 100, 100, 3);
        food(w, 105, 100, 4);
        run(w);
        expect(w.foodCount).toBe(0);
        expect(w.energy[a]).toBe(27);
    });

    it('eats a food that spans several cells only once', () => {
        const w = smallWorld({ hashCellSize: 130 });
        const a = agent(w, { x: 130, y: 130, energy: 20 });
        food(w, 130, 130, 6);
        run(w);
        expect(w.energy[a]).toBe(26);
        expect(w.foodEnergy[a]).toBe(6);
    });

    it('gives food two agents overlap to the lower slot', () => {
        const w = smallWorld();
        const a = agent(w, { x: 100, y: 100, energy: 20 });
        const b = agent(w, { x: 105, y: 100, energy: 20 });
        food(w, 102, 100, 6);
        run(w);
        expect(w.energy[a]).toBe(26);
        expect(w.energy[b]).toBe(20);
    });

    it('records only the stored energy when the eater is full, and still removes the food', () => {
        const w = smallWorld();
        const a = agent(w, { x: 100, y: 100, energy: w.config.maxEnergy - 2 });
        const f = food(w, 100, 100, 9);
        run(w);
        expect(w.energy[a]).toBe(w.config.maxEnergy);
        expect(w.foodEnergy[a]).toBe(2);
        expect(w.foodAlive[f]).toBe(0);
    });
});

describe('feed: biting', () => {
    const pair = [0, 1];

    /**
     * @param {Record<string, any>} [over] overrides for the biter
     * @returns {ReturnType<typeof smallWorld>}
     */
    function duel(over = {}) {
        const w = smallWorld();
        agent(w, { x: 100, y: 100, energy: 2000, spec: PREDATOR, bite: true, ...over });
        agent(w, { x: 110, y: 100, energy: 50 });
        return w;
    }

    it('moves biteEnergy from the victim to the biter and records the bite', () => {
        const w = duel();
        run(w, pair);
        const { biteEnergy } = w.config;
        expect(w.energy[1]).toBe(50 - biteEnergy);
        expect(w.energy[0]).toBe(2000 + biteEnergy);
        expect(w.biteEnergy[0]).toBe(biteEnergy);
        expect(w.lastLoss[1]).toBe(LOSS_CAUSE.BITE);
        expect(w.lastBiter[1]).toBe(w.genomeId[0]);
        expect(w.bittenTimer[1]).toBe(0);
        expect(w.bittenTimer[0]).toBe(30);
    });

    it('deposits attack at the biter and danger at the victim', () => {
        const w = duel();
        run(w, pair);
        const sum = (/** @type {Float32Array} */ g) => g.reduce((p, c) => p + c, 0);
        expect(sum(w.attack)).toBe(w.config.pheromoneDeposit);
        expect(sum(w.danger)).toBe(w.config.pheromoneDeposit);
    });

    it('does not bite when the biter cannot hunt', () => {
        const w = duel({ spec: FORAGER });
        run(w, pair);
        expect(w.energy[1]).toBe(50);
    });

    it('does not bite when the bite output is not positive', () => {
        const w = duel({ bite: false });
        run(w, pair);
        expect(w.energy[1]).toBe(50);
    });

    it('does not bite kin', () => {
        const w = duel();
        w.parentA[1] = w.genomeId[0];
        run(w, pair);
        expect(w.energy[1]).toBe(50);
    });

    it('does not bite a victim that is not small enough', () => {
        const w = duel({ energy: 52 });
        run(w, pair);
        expect(w.energy[1]).toBe(50);
    });

    it('takes biteTakenMultiplier of the bite from a defender', () => {
        const w = duel();
        w.spec[1] = DEFENDER;
        run(w, pair);
        expect(w.energy[1]).toBe(50 - w.config.biteEnergy * 0.5);
    });

    it('lets the biter gain only what fits under maxEnergy', () => {
        const w = duel({ energy: 0 });
        addEnergy(w, 0, w.config.maxEnergy, ENERGY_SOURCE.INITIAL);
        run(w, pair);
        expect(w.energy[0]).toBe(w.config.maxEnergy);
        expect(w.biteEnergy[0]).toBe(0);
        expect(w.energy[1]).toBe(50 - w.config.biteEnergy);
    });

    it('resolves the second direction of a pair too', () => {
        const w = smallWorld();
        agent(w, { x: 100, y: 100, energy: 50 });
        agent(w, { x: 110, y: 100, energy: 2000, spec: PREDATOR, bite: true });
        run(w, pair);
        expect(w.lastBiter[0]).toBe(w.genomeId[1]);
        expect(w.lastBiter[1]).toBe(0);
    });

    it('throws on a specialisation index that does not exist', () => {
        const w = duel();
        w.spec[0] = 9;
        expect(() => run(w, pair)).toThrow(/no specialisation has index 9/);
    });

    it('keeps the energy ledger balanced', () => {
        const w = duel({ energy: 2000 });
        food(w, 100, 100, 5);
        run(w, pair);
        const total = w.energy[0] + w.energy[1];
        expect(w.ledger[0] - w.ledger[1]).toBeCloseTo(total, 9);
    });
});
