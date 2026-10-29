import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { LOSS_CAUSE } from '../../js/sim/energy.js';
import { BLOCKED_CAUSE, BORN_CAUSE, EVENT_STRIDE, EVENT_TYPE } from '../../js/sim/events.js';
import { canMatePair, motherOf } from '../../js/sim/mate-eligibility.js';
import { advancePregnancies, mate, splitAll } from '../../js/sim/reproduction.js';
import { buildHash } from '../../js/sim/spatial-hash.js';
import { addBlob, imbalance, lifeWorld, recordingPolicy } from './helpers/life-world.js';

const MATE = { mateOut: 1, energy: 700, spec: 2 };
const FEMALE = 0;
const MALE = 1;

/**
 * @param {Record<string, any>} [over] config overrides
 * @returns {any} a sexes-on world
 */
function sexWorld(over = {}) {
    return lifeWorld(over);
}

/**
 * @param {any} w the world
 * @param {number} slot the agent
 * @param {number} value the SPLIT output
 * @returns {void}
 */
function setSplit(w, slot, value) {
    w.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.SPLIT] = value;
}

describe('mating with sexes', () => {
    it('makes the female the mother even when she has the higher slot', () => {
        const w = sexWorld();
        addBlob(w, { ...MATE, sex: MALE });
        addBlob(w, { ...MATE, sex: FEMALE });
        w.weights[0] = 9;
        buildHash(w.hash, w);
        /** @type {string[]} */
        const log = [];
        mate(w, recordingPolicy(log));
        expect(w.pregnancy[1]).toBe(w.config.pregnancyTicks);
        expect(w.pregnancy[0]).toBe(0);
        expect(w.fatherId[1]).toBe(w.genomeId[0]);
        expect(w.fatherWeights[w.layout.weightCount]).toBe(9);
        expect(log).toEqual(['mate 1 0']);
        expect(imbalance(w)).toBeCloseTo(0, 9);
    });

    it('charges the male mateCost and puts him on cooldown', () => {
        const w = sexWorld();
        addBlob(w, { ...MATE, sex: FEMALE });
        addBlob(w, { ...MATE, sex: MALE });
        buildHash(w.hash, w);
        mate(w, recordingPolicy([]));
        expect(w.energy[1]).toBe(700 - w.config.mateCost);
        expect(w.lastLoss[1]).toBe(LOSS_CAUSE.COST);
        expect(w.cooldown[1]).toBeGreaterThan(0);
    });

    it('lets a male father only one child per cooldown: the second female finds him resting', () => {
        const w = sexWorld();
        addBlob(w, { ...MATE, sex: FEMALE });
        addBlob(w, { ...MATE, sex: FEMALE });
        addBlob(w, { ...MATE, sex: MALE });
        buildHash(w.hash, w);
        mate(w, recordingPolicy([]));
        expect(w.pregnancy[0]).toBeGreaterThan(0);
        expect(w.pregnancy[1]).toBe(0);
    });

    it('starts nothing between two females, two males ', () => {
        for (const sexes of [
            [FEMALE, FEMALE],
            [MALE, MALE],
        ]) {
            const w = sexWorld();
            for (const sex of sexes) {
                addBlob(w, { ...MATE, sex });
            }
            buildHash(w.hash, w);
            mate(w, recordingPolicy([]));
            expect(Array.from(w.pregnancy.subarray(0, 2))).toEqual([0, 0]);
            expect(w.events.count).toBe(0);
        }
    });

    it('lets a lone female with no male mate with nobody and draws nothing', () => {
        const w = sexWorld();
        addBlob(w, { ...MATE, sex: FEMALE });
        buildHash(w.hash, w);
        const before = Array.from(w.rng.lifecycle.s);
        mate(w, recordingPolicy([]));
        expect(Array.from(w.rng.lifecycle.s)).toEqual(before);
    });

    it('keys the mother energy check in canMatePair on sex', () => {
        const w = sexWorld();
        addBlob(w, { ...MATE, sex: MALE, energy: 900 });
        addBlob(w, { ...MATE, sex: FEMALE, energy: 250 });
        expect(motherOf(w, 0, 1)).toBe(1);
        expect(motherOf(w, 1, 0)).toBe(1);
        expect(canMatePair(w, 0, 1)).toBe(false);
        w.ledger[0] += 300;
        w.energy[1] = 550;
        expect(canMatePair(w, 0, 1)).toBe(true);
        expect(canMatePair(w, 1, 0)).toBe(true);
    });

    it('refuses a same-sex pair in canMatePair', () => {
        for (const sex of [FEMALE, MALE]) {
            const w = sexWorld();
            addBlob(w, { ...MATE, sex });
            addBlob(w, { ...MATE, sex });
            expect(canMatePair(w, 0, 1)).toBe(false);
        }
        const off = lifeWorld();
        addBlob(off, MATE);
        addBlob(off, MATE);
        expect(canMatePair(off, 0, 1)).toBe(true);
    });
});

describe('splitting with sexes', () => {
    const SPLITTER = { energy: 1200 };

    it('splits a female and a male alike, whatever the SPLIT output says', () => {
        for (const sex of [FEMALE, MALE]) {
            for (const split of [-1, 0, 1]) {
                const w = sexWorld();
                addBlob(w, { ...SPLITTER, sex });
                setSplit(w, 0, split);
                splitAll(w, recordingPolicy([]));
                expect(w.population).toBe(2);
            }
        }
    });

    it('needs only energy above splitMinEnergy, with no cost', () => {
        const w = sexWorld();
        addBlob(w, { ...SPLITTER, energy: 900 });
        splitAll(w, recordingPolicy([]));
        expect(w.population).toBe(1);
        w.ledger[0] += 1;
        w.energy[0] = 901;
        splitAll(w, recordingPolicy([]));
        expect(w.population).toBe(2);
        expect(w.ledger[1]).toBe(0);
        expect(w.lastLoss[0]).not.toBe(LOSS_CAUSE.COST);
    });

    it('reports a split blocked by a full world', () => {
        const w = sexWorld({ maxAgents: 1 });
        addBlob(w, SPLITTER);
        splitAll(w, recordingPolicy([]));
        expect(w.energy[0]).toBe(1200);
        expect(w.events.data[0]).toBe(EVENT_TYPE.BIRTH_BLOCKED);
        expect(w.events.data[3]).toBe(BLOCKED_CAUSE.CAPACITY);
    });

    it('stops splitting any sex within splitCapMargin of maxAgents when births are capped', () => {
        const w = sexWorld({ maxAgents: 60, capBirthsEnabled: true, splitCapMargin: 50 });
        for (let i = 0; i < 12; i++) {
            addBlob(w, { ...SPLITTER, sex: i % 2 });
        }
        splitAll(w, recordingPolicy([]));
        expect(w.population).toBe(12);
    });

    it('spends the birth budget on splits by either sex', () => {
        const w = sexWorld({ maxBirthsPerWindow: 1, birthWindowTicks: 3000 });
        addBlob(w, { ...SPLITTER, sex: MALE });
        splitAll(w, recordingPolicy([]));
        expect(w.population).toBe(2);
        w.cooldown[0] = 0;
        splitAll(w, recordingPolicy([]));
        expect(w.population).toBe(2);
    });
});

describe('the sex of a child and AGENT_BORN field 9', () => {
    /**
     * @param {any} w the world
     * @param {number} i event index
     * @returns {number[]} the record's fields
     */
    function event(w, i) {
        return Array.from(w.events.data.subarray(i * EVENT_STRIDE, (i + 1) * EVENT_STRIDE));
    }

    it('draws a fresh sex for a mating child and a split child and reports it', () => {
        const w = sexWorld({ maxAgents: 64 });
        for (let i = 0; i < 24; i++) {
            addBlob(w, { energy: 1500, sex: FEMALE });
        }
        splitAll(w, recordingPolicy([]));
        const children = [];
        for (let i = 0; i < w.events.count; i++) {
            const e = event(w, i);
            expect(e[0]).toBe(EVENT_TYPE.AGENT_BORN);
            expect(e[8]).toBe(BORN_CAUSE.SPLIT);
            expect(e[9]).toBe(w.sex[e[2]]);
            children.push(e[9]);
        }
        expect(children.length).toBe(24);
        expect(children).toContain(MALE);
        expect(children).toContain(FEMALE);
    });

    it('reports the sex of a mating child', () => {
        const w = sexWorld();
        addBlob(w, { ...MATE, energy: 900, sex: FEMALE, pregnancy: 1 });
        advancePregnancies(w, recordingPolicy([]));
        const e = event(w, 0);
        expect(e[8]).toBe(BORN_CAUSE.MATE);
        expect(e[9]).toBe(w.sex[e[2]]);
    });
});
