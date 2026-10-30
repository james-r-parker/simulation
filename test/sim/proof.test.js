import { describe, expect, it } from 'vitest';
import { EVENT_STRIDE, EVENT_TYPE, readEvents } from '../../js/sim/events.js';
import { creditIntake } from '../../js/sim/merit.js';
import { isEstablished, splitBraked, UNPROVEN_KIDS_BRAKE } from '../../js/sim/proof.js';
import { reap } from '../../js/sim/population.js';
import { advancePregnancies, splitAll, splitGateOpen } from '../../js/sim/reproduction.js';
import { freeAgent } from '../../js/sim/world.js';
import { addBlob, lifeWorld, recordingPolicy } from './helpers/life-world.js';

const CONFIG = { splitDeliberateMin: 100, splitDeliberateShareMin: 0.5, splitMinEnergy: 200, maxAgents: 16 };

/**
 * @param {any} w the world
 * @param {number} slot the eater
 * @param {boolean} deliberate whether the meal is deliberate
 * @returns {void}
 */
function meal(w, slot, deliberate) {
    creditIntake(w, slot, 100, deliberate);
}

/**
 * @param {any} w the world
 * @returns {{type: number, fields: number[]}[]} the `LINE_PROVEN` records
 */
function provenEvents(w) {
    const found = [];
    for (let i = 0; i < readEvents(w.events); i++) {
        const o = i * EVENT_STRIDE;
        if (w.events.data[o] === EVENT_TYPE.LINE_PROVEN) {
            found.push({ type: w.events.data[o], fields: Array.from(w.events.data.subarray(o + 2, o + 7)) });
        }
    }
    return found;
}

/**
 * Splits `parent` once and returns the child's slot.
 * @param {any} w the world
 * @param {number} parent the splitter
 * @returns {number} the child
 */
function splitOnce(w, parent) {
    w.cooldown[parent] = 0;
    w.energy[parent] = 1000;
    const before = w.alive.slice();
    splitAll(w, recordingPolicy([]));
    return w.alive.findIndex((/** @type {number} */ alive, /** @type {number} */ s) => alive === 1 && before[s] === 0);
}

describe('proven', () => {
    it('needs the split gate on its own intake and meal share, evaluated when a meal is credited', () => {
        const w = lifeWorld(CONFIG);
        const slot = addBlob(w);
        meal(w, slot, false);
        meal(w, slot, false);
        meal(w, slot, true);
        expect(w.proven[slot]).toBe(0);
        meal(w, slot, true);
        meal(w, slot, true);
        expect(w.proven[slot]).toBe(1);
    });

    it('is not counted for the per-life split cap', () => {
        const w = lifeWorld({ ...CONFIG, splitMaxPerLife: 1 });
        const slot = addBlob(w);
        w.splitsDone[slot] = 5;
        meal(w, slot, true);
        expect(w.proven[slot]).toBe(1);
    });
});

describe('established', () => {
    it('needs the child: a proven genome with no proven child is not established', () => {
        const w = lifeWorld(CONFIG);
        const parent = addBlob(w);
        meal(w, parent, true);
        expect(w.proven[parent]).toBe(1);
        expect(isEstablished(w, parent)).toBe(false);
        const child = splitOnce(w, parent);
        expect(isEstablished(w, parent)).toBe(false);
        meal(w, child, true);
        expect(w.proven[child]).toBe(1);
        expect(isEstablished(w, parent)).toBe(true);
    });

    it('pushes LINE_PROVEN with the child and its parents once, when the child proves', () => {
        const w = lifeWorld(CONFIG);
        const parent = addBlob(w);
        meal(w, parent, true);
        const child = splitOnce(w, parent);
        w.events.count = 0;
        meal(w, child, true);
        meal(w, child, true);
        expect(provenEvents(w)).toEqual([
            {
                type: EVENT_TYPE.LINE_PROVEN,
                fields: [child, w.genomeId[child], w.genomeId[parent], w.genomeId[parent], w.lineageId[child]],
            },
        ]);
    });

    it('does not push LINE_PROVEN for an agent with no parent', () => {
        const w = lifeWorld(CONFIG);
        const slot = addBlob(w);
        meal(w, slot, true);
        expect(w.proven[slot]).toBe(1);
        expect(provenEvents(w)).toEqual([]);
    });

    it('counts a mating child for both parents', () => {
        const w = lifeWorld(CONFIG);
        const mother = addBlob(w, { energy: 1000 });
        const father = addBlob(w, { energy: 1000 });
        meal(w, mother, true);
        meal(w, father, true);
        w.fatherId[mother] = w.genomeId[father];
        w.pregnancy[mother] = 1;
        advancePregnancies(w, recordingPolicy([]));
        const child = w.alive.indexOf(1, father + 1);
        expect([w.unprovenKids[mother], w.unprovenKids[father]]).toEqual([1, 1]);
        meal(w, child, true);
        expect([isEstablished(w, mother), isEstablished(w, father)]).toEqual([true, true]);
        expect([w.unprovenKids[mother], w.unprovenKids[father]]).toEqual([0, 0]);
    });

    it('leaves a dead parent to the policy: the event names it, and no live slot is marked', () => {
        const w = lifeWorld(CONFIG);
        const parent = addBlob(w);
        meal(w, parent, true);
        const child = splitOnce(w, parent);
        const parentId = w.genomeId[parent];
        w.energy[parent] = 0;
        reap(w, recordingPolicy([]));
        expect(w.alive[parent]).toBe(0);
        w.events.count = 0;
        meal(w, child, true);
        expect(provenEvents(w)[0].fields.slice(2, 4)).toEqual([parentId, parentId]);
    });

    it('does not credit a new occupant of a dead parent slot', () => {
        const w = lifeWorld(CONFIG);
        const parent = addBlob(w);
        meal(w, parent, true);
        const child = splitOnce(w, parent);
        freeAgent(w, parent);
        const stranger = addBlob(w);
        expect(stranger).toBe(parent);
        meal(w, child, true);
        expect([w.established[stranger], w.unprovenKids[stranger]]).toEqual([0, 0]);
    });
});

describe('the split brake', () => {
    it('lets a proven parent split once more with one unproven child, and holds it at two', () => {
        const w = lifeWorld(CONFIG);
        const parent = addBlob(w);
        meal(w, parent, true);
        expect(splitGateOpen(w, parent)).toBe(true);
        splitOnce(w, parent);
        expect([w.unprovenKids[parent], splitBraked(w, parent)]).toEqual([1, false]);
        expect(splitGateOpen(w, parent)).toBe(true);
        splitOnce(w, parent);
        expect(w.unprovenKids[parent]).toBe(UNPROVEN_KIDS_BRAKE);
        expect(splitGateOpen(w, parent)).toBe(false);
    });

    it('releases the parent when an unproven child dies', () => {
        const w = lifeWorld(CONFIG);
        const parent = addBlob(w);
        meal(w, parent, true);
        splitOnce(w, parent);
        const second = splitOnce(w, parent);
        w.energy[second] = 0;
        reap(w, recordingPolicy([]));
        expect(w.unprovenKids[parent]).toBe(1);
        expect(splitGateOpen(w, parent)).toBe(true);
    });

    it('releases the parent when a child proves, and a proven child that dies releases nothing twice', () => {
        const w = lifeWorld(CONFIG);
        const parent = addBlob(w);
        meal(w, parent, true);
        const first = splitOnce(w, parent);
        splitOnce(w, parent);
        meal(w, first, true);
        expect(w.unprovenKids[parent]).toBe(1);
        w.energy[first] = 0;
        reap(w, recordingPolicy([]));
        expect(w.unprovenKids[parent]).toBe(1);
    });

    it('never blocks mating', () => {
        const w = lifeWorld(CONFIG);
        const parent = addBlob(w, { energy: 1000 });
        meal(w, parent, true);
        splitOnce(w, parent);
        splitOnce(w, parent);
        expect(splitBraked(w, parent)).toBe(true);
        const before = w.population;
        w.pregnancy[parent] = 1;
        w.fatherId[parent] = 0;
        advancePregnancies(w, recordingPolicy([]));
        expect(w.population).toBe(before + 1);
    });
});

describe('the arrays', () => {
    it('start at 0 in a child and in a reused slot', () => {
        const w = lifeWorld(CONFIG);
        const parent = addBlob(w);
        meal(w, parent, true);
        const child = splitOnce(w, parent);
        expect([w.proven[child], w.established[child], w.unprovenKids[child]]).toEqual([0, 0, 0]);
        freeAgent(w, parent);
        expect([w.proven[parent], w.established[parent], w.unprovenKids[parent]]).toEqual([0, 0, 0]);
    });
});
