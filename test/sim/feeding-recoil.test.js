// Recoil (natural-selection T5b): a hunter that tries to bite something the bite rule refuses (kin, or too large) loses
// `recoilEnergy` once that tick; a legal bite, a non-hunter and a hunter that is not biting pay nothing.

import { describe, expect, it } from 'vitest';
import { couldBite, canBite } from '../../js/sim/bite-rule.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { LOSS_CAUSE, updateSize } from '../../js/sim/energy.js';
import { feed } from '../../js/sim/feeding.js';
import { assertInvariants } from '../../js/sim/invariants.js';
import { buildHash, createSpatialHash } from '../../js/sim/spatial-hash.js';
import { freeAgent } from '../../js/sim/world.js';
import { addBlob, imbalance, lifeWorld } from './helpers/life-world.js';

const FORAGER = 0;
const PREDATOR = 1;
const START = 500;
const RECOIL = 20;

/**
 * @param {Record<string, any>} [over] config overrides
 * @returns {any} a world with the cost of a landed bite off, so only the recoil moves a hunter's energy
 */
function recoilWorld(over = {}) {
    return lifeWorld({ biteArc: Math.PI / 4, biteCost: 0, recoilEnergy: RECOIL, predatorKillEnergy: 0, ...over });
}

/**
 * @param {any} w the world
 * @param {number} spec the specialisation
 * @param {number} energy the energy
 * @param {{bite?: boolean, x?: number, angle?: number}} [what] whether it outputs BITE, where it stands and faces
 * @returns {number} the slot
 */
function add(w, spec, energy, { bite = true, x = 100, angle = 0 } = {}) {
    const slot = addBlob(w, { spec, energy, x, y: 100, angle });
    updateSize(w, slot);
    w.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = bite ? 1 : 0;
    return slot;
}

/**
 * Runs the feed phase over the given contact pairs.
 * @param {any} w the world
 * @param {number[][]} pairs the contacts
 * @returns {void}
 */
function run(w, pairs) {
    pairs.forEach(([a, b], c) => {
        w.contacts[2 * c] = a;
        w.contacts[2 * c + 1] = b;
    });
    w.contactCount = pairs.length;
    const hash = createSpatialHash(w.config);
    buildHash(hash, w);
    feed(w, hash);
}

/**
 * @param {any} w the world
 * @param {number} child the slot given a parent
 * @param {number} parent the slot whose genome it names
 * @returns {void}
 */
function makeKin(w, child, parent) {
    w.parentA[child] = w.genomeId[parent];
}

describe('recoilEnergy', () => {
    it('charges a hunter that lunges at kin, as a cost loss', () => {
        const w = recoilWorld();
        const hunter = add(w, PREDATOR, START);
        const kin = add(w, FORAGER, START, { bite: false, x: 110 });
        makeKin(w, kin, hunter);
        run(w, [[hunter, kin]]);
        expect(w.energy[hunter]).toBe(START - RECOIL);
        expect(w.lastLoss[hunter]).toBe(LOSS_CAUSE.COST);
        expect(w.energy[kin]).toBe(START);
        expect(imbalance(w)).toBeCloseTo(0, 9);
        expect(() => assertInvariants(w)).not.toThrow();
    });

    it('charges a hunter that lunges at something too large to bite', () => {
        const w = recoilWorld();
        const hunter = add(w, PREDATOR, START);
        const giant = add(w, FORAGER, 20000, { bite: false, x: 110 });
        expect(couldBite(w, hunter, giant)).toBe(false);
        run(w, [[hunter, giant]]);
        expect(w.energy[hunter]).toBe(START - RECOIL);
    });

    it('charges nothing at recoilEnergy 0', () => {
        const w = recoilWorld({ recoilEnergy: 0 });
        const hunter = add(w, PREDATOR, START);
        const kin = add(w, FORAGER, START, { bite: false, x: 110 });
        makeKin(w, kin, hunter);
        run(w, [[hunter, kin]]);
        expect(w.energy[hunter]).toBe(START);
    });

    it('charges nothing for a legal bite', () => {
        const w = recoilWorld();
        const hunter = add(w, PREDATOR, START);
        const prey = add(w, FORAGER, 100, { bite: false, x: 110 });
        run(w, [[hunter, prey]]);
        expect(w.energy[hunter]).toBe(START + w.biteEnergy[hunter]);
        expect(w.biteEnergy[hunter]).toBeGreaterThan(0);
    });

    it('charges nothing for a hunter that is not outputting BITE', () => {
        const w = recoilWorld();
        const hunter = add(w, PREDATOR, START, { bite: false });
        const kin = add(w, FORAGER, START, { bite: false, x: 110 });
        makeKin(w, kin, hunter);
        run(w, [[hunter, kin]]);
        expect(w.energy[hunter]).toBe(START);
    });

    it('charges nothing for a non-hunter, even outputting BITE against kin', () => {
        const w = recoilWorld();
        const forager = add(w, FORAGER, START);
        const kin = add(w, FORAGER, START, { bite: false, x: 110 });
        makeKin(w, kin, forager);
        run(w, [[forager, kin]]);
        expect(w.energy[forager]).toBe(START);
    });

    it('charges nothing when only the jaws refuse: couldBite still holds and canBite is unchanged', () => {
        const w = recoilWorld();
        const hunter = add(w, PREDATOR, START, { angle: Math.PI });
        const prey = add(w, FORAGER, 100, { bite: false, x: 110 });
        expect(couldBite(w, hunter, prey)).toBe(true);
        expect(canBite(w, hunter, prey)).toBe(false);
        run(w, [[hunter, prey]]);
        expect(w.energy[hunter]).toBe(START);
        expect(couldBite(w, hunter, prey)).toBe(true);
        expect(canBite(w, hunter, prey)).toBe(false);
    });

    it('pays once when two refused contacts land in one tick, and again the next tick', () => {
        const w = recoilWorld();
        const hunter = add(w, PREDATOR, START);
        const kinA = add(w, FORAGER, START, { bite: false, x: 110 });
        const kinB = add(w, FORAGER, START, { bite: false, x: 90 });
        makeKin(w, kinA, hunter);
        makeKin(w, kinB, hunter);
        run(w, [
            [hunter, kinA],
            [hunter, kinB],
        ]);
        expect(w.energy[hunter]).toBe(START - RECOIL);
        w.tick += 1;
        run(w, [[hunter, kinA]]);
        expect(w.energy[hunter]).toBe(START - 2 * RECOIL);
    });

    it('pays on the first tick, tick 0', () => {
        const w = recoilWorld();
        expect(w.tick).toBe(0);
        const hunter = add(w, PREDATOR, START);
        const kin = add(w, FORAGER, START, { bite: false, x: 110 });
        makeKin(w, kin, hunter);
        run(w, [[hunter, kin]]);
        expect(w.energy[hunter]).toBe(START - RECOIL);
    });

    it('clears the stamp when the slot is freed, so a reused slot pays its first recoil', () => {
        const w = recoilWorld();
        const hunter = add(w, PREDATOR, START);
        const kin = add(w, FORAGER, START, { bite: false, x: 110 });
        makeKin(w, kin, hunter);
        run(w, [[hunter, kin]]);
        expect(w.recoilStamp[hunter]).toBe(w.tick + 1);
        freeAgent(w, hunter);
        expect(w.recoilStamp[hunter]).toBe(0);
    });

    it('rejects a negative recoilEnergy', () => {
        expect(() => lifeWorld({ recoilEnergy: -1 })).toThrow(/recoilEnergy/);
    });
});
