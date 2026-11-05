// Parental provisioning (hunter-learning.md T4): a hunter that stores energy from a bite hands a share to its young in range,
// and only to them; the giver pays what the young store; identity is by genome id, so a split child is fed once and a recycled
// slot is not its predecessor's offspring.

import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { updateSize } from '../../js/sim/energy.js';
import { feed } from '../../js/sim/feeding.js';
import { assertInvariants } from '../../js/sim/invariants.js';
import { createSimLog, drainEvents } from '../../js/sim/log.js';
import { buildHash, createSpatialHash } from '../../js/sim/spatial-hash.js';
import { INDEPENDENT_TICKS, isDependentKiller } from '../../js/sim/provision.js';
import { freeAgent } from '../../js/sim/world.js';
import { addBlob, imbalance, lifeWorld } from './helpers/life-world.js';

const FORAGER = 0;
const PREDATOR = 1;
const START = 500;
const SHARE = 0.5;

/**
 * @param {Record<string, any>} [over] config overrides
 * @returns {any} a world with provisioning on, the kick of a bite off and half of each meal given away
 */
function provisionWorld(over = {}) {
    return lifeWorld({
        provisionEnabled: true,
        provisionShare: SHARE,
        provisionRange: 120,
        juvenileTicks: 3000,
        biteArc: Math.PI / 4,
        biteCost: 0,
        recoilEnergy: 0,
        ...over,
    });
}

/**
 * @param {any} w the world
 * @param {number} spec the specialisation
 * @param {{energy?: number, x?: number, y?: number, bite?: boolean}} [what] the energy, where it stands, whether it bites
 * @returns {number} the slot
 */
function add(w, spec, { energy = START, x = 100, y = 100, bite = false } = {}) {
    const slot = addBlob(w, { spec, energy, x, y, angle: 0 });
    updateSize(w, slot);
    w.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = bite ? 1 : 0;
    return slot;
}

/**
 * Adds a young hunter of `parent` at the given place, with the given age.
 * @param {any} w the world
 * @param {number} parent the parent's slot
 * @param {{x?: number, y?: number, age?: number, energy?: number, spec?: number}} [what] where it stands, its age, energy and spec
 * @returns {number} the slot
 */
function addYoung(w, parent, { x = 150, y = 100, age = 100, energy = 100, spec = PREDATOR } = {}) {
    const slot = add(w, spec, { energy, x, y });
    w.parentA[slot] = w.genomeId[parent];
    w.parentB[slot] = w.genomeId[parent];
    w.ageTicks[slot] = age;
    return slot;
}

/**
 * Builds the hash and runs the feed phase over the given contact pairs.
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
 * A hunter beside a prey it bites on the next feed phase.
 * @param {any} w the world
 * @returns {{hunter: number, prey: number}} the two slots
 */
function bitePair(w) {
    const hunter = add(w, PREDATOR, { bite: true });
    const prey = add(w, FORAGER, { energy: 100, x: 110 });
    return { hunter, prey };
}

describe('provisionYoung', () => {
    it('gives a share of the bite to its young and charges the giver exactly what they store', () => {
        const w = provisionWorld();
        const { hunter, prey } = bitePair(w);
        const young = addYoung(w, hunter);
        run(w, [[hunter, prey]]);
        const gained = w.biteEnergy[hunter];
        expect(gained).toBeGreaterThan(0);
        expect(w.energy[young]).toBeCloseTo(100 + SHARE * gained, 9);
        expect(w.energy[hunter]).toBeCloseTo(START + gained - SHARE * gained, 9);
        expect(w.provisionTotals[0]).toBeCloseTo(SHARE * gained, 9);
        expect(w.provisionTotals[1]).toBe(w.provisionTotals[0]);
        expect(w.provisionedTick[young]).toBe(w.tick + 1);
        expect(imbalance(w)).toBeCloseTo(0, 9);
        expect(() => assertInvariants(w)).not.toThrow();
    });

    it('does nothing at provisionEnabled false', () => {
        const w = provisionWorld({ provisionEnabled: false });
        const { hunter, prey } = bitePair(w);
        const young = addYoung(w, hunter);
        run(w, [[hunter, prey]]);
        expect(w.energy[young]).toBe(100);
        expect(Array.from(w.provisionTotals)).toEqual([0, 0]);
        expect(w.provisionedTick[young]).toBe(0);
    });

    it('feeds the giver own offspring only: not a stranger, not a non-hunter child', () => {
        const w = provisionWorld();
        const { hunter, prey } = bitePair(w);
        const other = add(w, PREDATOR, { x: 60, energy: START });
        const stranger = addYoung(w, other);
        const forager = addYoung(w, hunter, { x: 120, spec: FORAGER });
        const young = addYoung(w, hunter);
        run(w, [[hunter, prey]]);
        expect(w.energy[stranger]).toBe(100);
        expect(w.energy[forager]).toBe(100);
        expect(w.energy[young]).toBeGreaterThan(100);
    });

    it('feeds only a young below juvenileTicks, and only within provisionRange', () => {
        const w = provisionWorld({ juvenileTicks: 3000, provisionRange: 120 });
        const { hunter, prey } = bitePair(w);
        const grown = addYoung(w, hunter, { age: 3000 });
        const far = addYoung(w, hunter, { x: 100 + 121 });
        const edge = addYoung(w, hunter, { x: 100 + 120 });
        run(w, [[hunter, prey]]);
        expect(w.energy[grown]).toBe(100);
        expect(w.energy[far]).toBe(100);
        expect(w.energy[edge]).toBeGreaterThan(100);
    });

    it('splits the share equally among the young in range', () => {
        const w = provisionWorld();
        const { hunter, prey } = bitePair(w);
        const a = addYoung(w, hunter);
        const b = addYoung(w, hunter, { x: 50, y: 150 });
        const c = addYoung(w, hunter, { x: 100, y: 190 });
        run(w, [[hunter, prey]]);
        const each = (SHARE * w.biteEnergy[hunter]) / 3;
        for (const young of [a, b, c]) {
            expect(w.energy[young]).toBeCloseTo(100 + each, 9);
        }
    });

    it('caps each part by the young headroom and the giver pays only what is stored', () => {
        const w = provisionWorld();
        const { hunter, prey } = bitePair(w);
        const full = addYoung(w, hunter, { energy: w.maxEnergyBySpec[PREDATOR] - 1 });
        run(w, [[hunter, prey]]);
        const gained = w.biteEnergy[hunter];
        expect(w.energy[full]).toBeCloseTo(w.maxEnergyBySpec[PREDATOR], 9);
        expect(w.energy[hunter]).toBeCloseTo(START + gained - 1, 9);
        expect(w.provisionTotals[0]).toBeCloseTo(1, 9);
        expect(w.provisionTotals[1]).toBe(w.provisionTotals[0]);
    });

    it('moves nothing and logs nothing when the hunter has no young in range', () => {
        const w = provisionWorld();
        const { hunter, prey } = bitePair(w);
        addYoung(w, hunter, { x: 100 + 500 });
        run(w, [[hunter, prey]]);
        expect(Array.from(w.provisionTotals)).toEqual([0, 0]);
        expect(w.energy[hunter]).toBeCloseTo(START + w.biteEnergy[hunter], 9);
    });

    it('feeds a young that stands in several hash cells once', () => {
        const w = provisionWorld({ hashCellSize: 50, provisionRange: 300 });
        const { hunter, prey } = bitePair(w);
        const young = addYoung(w, hunter, { x: 200, y: 100 });
        expect(w.size[young]).toBeGreaterThan(0);
        run(w, [[hunter, prey]]);
        expect(w.energy[young]).toBeCloseTo(100 + SHARE * w.biteEnergy[hunter], 9);
    });

    it('feeds a hunter that eats a carcass', () => {
        const w = provisionWorld({ maxFood: 4 });
        const hunter = add(w, PREDATOR, { x: 100, y: 100 });
        const young = addYoung(w, hunter);
        const food = w.foodAlive.indexOf(0);
        w.foodAlive[food] = 1;
        w.foodKind[food] = 1;
        w.foodX[food] = 100;
        w.foodY[food] = 100;
        w.foodRadius[food] = 5;
        w.foodValue[food] = 200;
        w.foodCount += 1;
        w.ledger[0] += 200;
        run(w, []);
        const taken = w.foodEnergy[hunter];
        expect(taken).toBeGreaterThan(0);
        expect(w.energy[young]).toBeCloseTo(100 + SHARE * taken, 9);
        expect(w.provisionTotals[1]).toBeCloseTo(SHARE * taken, 9);
    });
});

describe('provisioning identity', () => {
    it('feeds a split child, which names its mother twice, once', () => {
        const w = provisionWorld();
        const { hunter, prey } = bitePair(w);
        const child = addYoung(w, hunter);
        expect(w.parentA[child]).toBe(w.parentB[child]);
        run(w, [[hunter, prey]]);
        expect(w.energy[child]).toBeCloseTo(100 + SHARE * w.biteEnergy[hunter], 9);
    });

    it('never counts a founder, whose parents are 0, as anyone offspring', () => {
        const w = provisionWorld();
        const { hunter, prey } = bitePair(w);
        const founder = addYoung(w, hunter);
        w.parentA[founder] = 0;
        w.parentB[founder] = 0;
        run(w, [[hunter, prey]]);
        expect(w.energy[founder]).toBe(100);
    });

    it('lets a child with a dead father be fed by its mother, and matches nothing for the dead father', () => {
        const w = provisionWorld();
        const mother = add(w, PREDATOR, { bite: true });
        const prey = add(w, FORAGER, { energy: 100, x: 110 });
        const father = add(w, PREDATOR, { x: 700, y: 700 });
        const child = addYoung(w, mother);
        w.parentB[child] = w.genomeId[father];
        const fatherId = w.genomeId[father];
        freeAgent(w, father);
        expect(w.genomeId[father]).toBe(0);
        run(w, [[mother, prey]]);
        expect(w.energy[child]).toBeCloseTo(100 + SHARE * w.biteEnergy[mother], 9);
        expect(w.genomeId.includes(fatherId)).toBe(false);
    });

    it('does not feed the child of a dead parent from the new agent that took its slot', () => {
        const w = provisionWorld();
        const old = add(w, PREDATOR, { x: 700, y: 700 });
        const child = addYoung(w, old);
        freeAgent(w, old);
        const hunter = add(w, PREDATOR, { bite: true });
        const prey = add(w, FORAGER, { energy: 100, x: 110 });
        expect(hunter).toBe(old);
        run(w, [[hunter, prey]]);
        expect(w.energy[child]).toBe(100);
    });

    it('does not feed a new agent in a freed child slot as the old child', () => {
        const w = provisionWorld();
        const { hunter, prey } = bitePair(w);
        const child = addYoung(w, hunter);
        w.provisionedTick[child] = 5;
        freeAgent(w, child);
        expect(w.provisionedTick[child]).toBe(0);
        const fresh = add(w, PREDATOR, { x: 150 });
        expect(fresh).toBe(child);
        run(w, [[hunter, prey]]);
        expect(w.energy[fresh]).toBe(START);
    });
});

describe('the Provisioned event', () => {
    it('logs the giver, the energy handed away and the young fed, once per transfer', () => {
        const w = provisionWorld();
        const { hunter, prey } = bitePair(w);
        const genomeId = w.genomeId[hunter];
        addYoung(w, hunter);
        addYoung(w, hunter, { x: 50, y: 150 });
        run(w, [[hunter, prey]]);
        /** @type {Record<string, any>[]} */
        const records = [];
        drainEvents(
            w,
            createSimLog((r) => records.push(r), { level: 'debug' }),
        );
        const given = records.filter((r) => r.event === 'Provisioned');
        expect(given).toHaveLength(1);
        expect(given[0]).toMatchObject({ genomeId, young: 2 });
        expect(given[0].energy).toBeCloseTo(SHARE * w.biteEnergy[hunter], 9);
    });
});

describe('isDependentKiller', () => {
    it('is true within INDEPENDENT_TICKS of a provisioning, false after', () => {
        const w = provisionWorld();
        const hunter = add(w, PREDATOR);
        w.tick = 5000;
        w.provisionedTick[hunter] = 5000 - INDEPENDENT_TICKS + 1;
        expect(isDependentKiller(w, hunter)).toBe(true);
        w.provisionedTick[hunter] = 5000 - INDEPENDENT_TICKS;
        expect(isDependentKiller(w, hunter)).toBe(false);
        w.provisionedTick[hunter] = 0;
        expect(isDependentKiller(w, hunter)).toBe(false);
    });

    it('is true while either parent is alive within provisionRange, false when it is far or dead', () => {
        const w = provisionWorld({ provisionRange: 120 });
        const mother = add(w, PREDATOR, { x: 100 });
        const father = add(w, PREDATOR, { x: 600, y: 600 });
        const child = addYoung(w, mother, { x: 200 });
        w.parentB[child] = w.genomeId[father];
        expect(isDependentKiller(w, child)).toBe(true);
        w.x[mother] = 400;
        expect(isDependentKiller(w, child)).toBe(false);
        w.x[father] = 250;
        w.y[father] = 100;
        expect(isDependentKiller(w, child)).toBe(true);
        freeAgent(w, father);
        freeAgent(w, mother);
        expect(isDependentKiller(w, child)).toBe(false);
    });

    it('is false for a founder with no parents and no provisioning', () => {
        const w = provisionWorld();
        const founder = add(w, PREDATOR);
        expect(isDependentKiller(w, founder)).toBe(false);
    });
});
