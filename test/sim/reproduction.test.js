import { describe, expect, it } from 'vitest';
import { BLOCKED_CAUSE, BORN_CAUSE, EVENT_STRIDE, EVENT_TYPE } from '../../js/sim/events.js';
import { advancePregnancies, mate, splitAll } from '../../js/sim/reproduction.js';
import { nextFloat } from '../../js/sim/rng.js';
import { TIMER_CAP } from '../../js/sim/world.js';
import { LOSS_CAUSE } from '../../js/sim/energy.js';
import { buildHash } from '../../js/sim/spatial-hash.js';
import { addBlob, imbalance, lifeWorld, recordingPolicy } from './helpers/life-world.js';

const MATE = { mateOut: 1, energy: 700 };

/**
 * @param {any} w the world
 * @param {number} i event index
 * @returns {number[]} the record's fields
 */
function event(w, i) {
    return Array.from(w.events.data.subarray(i * EVENT_STRIDE, (i + 1) * EVENT_STRIDE));
}

/**
 * @param {any} w the world
 * @returns {number[]} the lifecycle stream state
 */
function lifecycleState(w) {
    return Array.from(w.rng.lifecycle.s);
}

/**
 * A world with two mating-ready agents.
 * @param {Record<string, any>} [over] config overrides
 * @returns {any}
 */
function pair(over = {}) {
    const w = lifeWorld(over);
    addBlob(w, { ...MATE, spec: 2 });
    addBlob(w, { ...MATE, spec: 2 });
    buildHash(w.hash, w);
    return w;
}

describe('mate', () => {
    it('starts a pregnancy in the lower slot and charges both', () => {
        const w = pair();
        w.weights[w.layout.weightCount] = 7;
        /** @type {string[]} */
        const log = [];
        mate(w, recordingPolicy(log));
        expect(w.pregnancy[0]).toBe(w.config.pregnancyTicks);
        expect(w.pregnancy[1]).toBe(0);
        expect(w.fatherId[0]).toBe(w.genomeId[1]);
        expect(w.fatherLineage[0]).toBe(w.lineageId[1]);
        expect(w.fatherWeights[0]).toBe(7);
        expect(w.energy[0]).toBe(685);
        expect(w.energy[1]).toBe(685);
        expect(w.lastLoss[0]).toBe(LOSS_CAUSE.COST);
        expect(w.cooldown[0]).toBe(150);
        expect(w.cooldown[1]).toBe(150);
        expect(log).toEqual(['mate 0 1']);
        expect(imbalance(w)).toBeCloseTo(0, 9);
    });

    it('works without an onMate hook', () => {
        const w = pair();
        mate(w, { childBrain() {} });
        expect(w.pregnancy[0]).toBe(w.config.pregnancyTicks);
    });

    it('rounds the cooldown down', () => {
        const w = pair({ reproductionCooldown: 301 });
        mate(w, recordingPolicy([]));
        expect(w.cooldown[0]).toBe(150);
    });

    it.each([
        ['an immature agent', (/** @type {any} */ w) => (w.ageTicks[0] = 0), { maturityTicks: 5 }],
        ['a pregnant agent', (/** @type {any} */ w) => (w.pregnancy[1] = 3), {}],
        ['a different specialisation', (/** @type {any} */ w) => (w.spec[1] = 3), {}],
        ['a cooldown', (/** @type {any} */ w) => (w.cooldown[0] = 1), {}],
        ['low energy', (/** @type {any} */ w) => (w.energy[1] = 200), {}],
        ['no wish to mate', (/** @type {any} */ w) => w.outputs.fill(0), {}],
        ['a much bigger partner', (/** @type {any} */ w) => (w.size[1] = 2 * w.size[0] + 1), {}],
        ['a much smaller partner', (/** @type {any} */ w) => (w.size[0] = 2 * w.size[1] + 1), {}],
    ])('does not mate with %s, and draws nothing', (_name, tweak, over) => {
        const w = pair(over);
        w.size[0] = 25;
        w.size[1] = 25;
        tweak(w);
        const before = lifecycleState(w);
        mate(w, recordingPolicy([]));
        expect(w.pregnancy[0]).toBe(0);
        expect(w.energy[0]).toBe(700);
        expect(w.cooldown[1]).toBe(0);
        expect(lifecycleState(w)).toEqual(before);
    });

    it('draws once per eligible pair and mates only when the draw is under the chance', () => {
        const w = pair();
        w.season[0] = 3;
        let unlucky = 0;
        for (let i = 0; i < 40; i++) {
            w.pregnancy[0] = 0;
            w.cooldown[0] = 0;
            w.cooldown[1] = 0;
            w.energy[0] = 700;
            w.energy[1] = 700;
            mate(w, recordingPolicy([]));
            unlucky += w.pregnancy[0] === 0 ? 1 : 0;
        }
        expect(unlucky).toBeGreaterThan(0);
        expect(unlucky).toBeLessThan(40);
    });

    it('draws exactly once for an eligible pair', () => {
        const w = pair();
        const ref = { seed: 0, s: Uint32Array.from(w.rng.lifecycle.s) };
        nextFloat(ref);
        mate(w, recordingPolicy([]));
        expect(lifecycleState(w)).toEqual(Array.from(ref.s));
    });

    it('does not pay or draw when no partner is within mateRange', () => {
        const w = pair({ mateRange: 100 });
        w.x[1] = 500 + w.size[0] + w.size[1] + 101;
        buildHash(w.hash, w);
        const before = lifecycleState(w);
        mate(w, recordingPolicy([]));
        expect(lifecycleState(w)).toEqual(before);
        expect(w.pregnancy[0]).toBe(0);
    });
});

describe('advancePregnancies', () => {
    it('counts down and then gives exactly one child with the mother ids, spec and energy', () => {
        const w = pair();
        /** @type {string[]} */
        const log = [];
        const policy = recordingPolicy(log);
        mate(w, policy);
        w.tick = 9;
        const motherId = w.genomeId[0];
        for (let i = 0; i < w.config.pregnancyTicks - 1; i++) {
            advancePregnancies(w, policy);
        }
        expect(w.population).toBe(2);
        expect(w.pregnancy[0]).toBe(1);
        advancePregnancies(w, policy);
        expect(w.population).toBe(3);
        const c = 2;
        expect(w.genomeId[c]).toBe(3);
        expect(w.lineageId[c]).toBe(w.lineageId[0]);
        expect(w.parentA[c]).toBe(motherId);
        expect(w.parentB[c]).toBe(w.genomeId[1]);
        expect(w.spec[c]).toBe(2);
        expect(w.energy[c]).toBeCloseTo(685 * w.config.childEnergyShare, 9);
        expect(w.energy[0]).toBeCloseTo(685 * (1 - w.config.childEnergyShare), 9);
        expect([w.vx[c], w.vy[c]]).toEqual([0, 0]);
        expect([w.ateTimer[c], w.bittenTimer[c]]).toEqual([TIMER_CAP, TIMER_CAP]);
        expect(w.temperature[c]).toBe(w.config.temperatureStart);
        const dist = Math.hypot(w.x[c] - w.x[0], w.y[c] - w.y[0]);
        expect(dist).toBeCloseTo(w.size[0] + w.size[c], 3);
        expect(w.angle[c]).toBeGreaterThanOrEqual(-Math.PI);
        expect(w.angle[c]).toBeLessThan(Math.PI);
        expect(log).toEqual(['mate 0 1', `brain 2 0 ${BORN_CAUSE.MATE} true ${motherId} 2`]);
        expect(w.events.count).toBe(1);
        expect(event(w, 0)).toEqual([
            EVENT_TYPE.AGENT_BORN,
            9,
            2,
            3,
            w.lineageId[0],
            2,
            motherId,
            w.genomeId[1],
            1,
            0,
            0,
            0,
        ]);
        expect(imbalance(w)).toBeCloseTo(0, 9);
    });

    it('clamps a child placed beyond the wall', () => {
        for (const seed of [1, 2, 3, 4, 5, 6]) {
            const w = lifeWorld({ seed });
            const mother = addBlob(w, { x: 1, y: 1, pregnancy: 1, energy: 900 });
            advancePregnancies(w, recordingPolicy([]));
            const c = w.alive.indexOf(1, mother + 1);
            expect(w.x[c]).toBeGreaterThanOrEqual(w.size[c]);
            expect(w.y[c]).toBeGreaterThanOrEqual(w.size[c]);
        }
    });

    it('blocks a birth when the world is full and keeps the mother energy', () => {
        const w = lifeWorld({ maxAgents: 2 });
        const a = addBlob(w, { pregnancy: 1, energy: 900 });
        addBlob(w);
        advancePregnancies(w, recordingPolicy([]));
        expect(w.population).toBe(2);
        expect(w.energy[a]).toBe(900);
        expect(w.pregnancy[a]).toBe(0);
        expect(event(w, 0).slice(0, 4)).toEqual([EVENT_TYPE.BIRTH_BLOCKED, 0, a, BLOCKED_CAUSE.CAPACITY]);
    });

    it('blocks a birth when the mother has too little energy', () => {
        const w = lifeWorld();
        const a = addBlob(w, { pregnancy: 1, energy: 399 });
        advancePregnancies(w, recordingPolicy([]));
        expect(w.population).toBe(1);
        expect(w.energy[a]).toBe(399);
        expect(event(w, 0).slice(0, 4)).toEqual([EVENT_TYPE.BIRTH_BLOCKED, 0, a, BLOCKED_CAUSE.ENERGY]);
    });

    it('gives birth when the gift is exactly childEnergyMin', () => {
        const w = lifeWorld();
        const a = addBlob(w, { pregnancy: 1, energy: 400 });
        advancePregnancies(w, recordingPolicy([]));
        expect(w.population).toBe(2);
        expect(w.energy[1]).toBe(200);
        expect(w.energy[a]).toBe(200);
        expect(imbalance(w)).toBeCloseTo(0, 9);
    });

    it('ignores agents that are not pregnant', () => {
        const w = lifeWorld();
        addBlob(w);
        advancePregnancies(w, recordingPolicy([]));
        expect(w.events.count).toBe(0);
        expect(w.population).toBe(1);
    });
});

describe('temperature of a newborn', () => {
    it('starts a mating child and a split child at temperatureStart, in a slot holding a stale value', () => {
        const w = pair({ temperatureStart: 55 });
        const policy = recordingPolicy([]);
        mate(w, policy);
        w.temperature[2] = 3;
        for (let i = 0; i < w.config.pregnancyTicks; i++) {
            advancePregnancies(w, policy);
        }
        expect(w.population).toBe(3);
        expect(w.temperature[2]).toBe(55);
        const s = lifeWorld({ temperatureStart: 55 });
        addBlob(s, { energy: 1700, spec: 2 });
        s.temperature[1] = 3;
        splitAll(s, policy);
        expect(s.temperature[1]).toBe(55);
    });
});

describe('splitAll', () => {
    it('gives one child half the energy, both parents the splitter, and a longer cooldown', () => {
        const w = lifeWorld();
        const a = addBlob(w, { energy: 1700, spec: 2 });
        const id = w.genomeId[a];
        /** @type {string[]} */
        const log = [];
        splitAll(w, recordingPolicy(log));
        expect(w.population).toBe(2);
        expect(w.energy[a]).toBe(850);
        expect(w.energy[1]).toBe(850);
        expect([w.parentA[1], w.parentB[1]]).toEqual([id, id]);
        expect(w.lineageId[1]).toBe(w.lineageId[a]);
        expect(w.spec[1]).toBe(2);
        expect(w.cooldown[a]).toBe(225);
        expect(log).toEqual([`brain 1 0 ${BORN_CAUSE.SPLIT} true ${id} 2`]);
        expect(event(w, 0)[8]).toBe(BORN_CAUSE.SPLIT);
        expect(imbalance(w)).toBeCloseTo(0, 9);
    });

    it('does nothing for a pregnant, tired, young or poor agent', () => {
        const w = lifeWorld({ maturityTicks: 10 });
        addBlob(w, { energy: 2000, ageTicks: 10, pregnancy: 4 });
        addBlob(w, { energy: 2000, ageTicks: 10, cooldown: 2 });
        addBlob(w, { energy: 2000, ageTicks: 9 });
        addBlob(w, { energy: 900, ageTicks: 10 });
        splitAll(w, recordingPolicy([]));
        expect(w.population).toBe(4);
        expect(w.events.count).toBe(0);
    });

    it('blocks a split with no free slot and starts no cooldown', () => {
        const w = lifeWorld({ maxAgents: 1 });
        const a = addBlob(w, { energy: 2000 });
        splitAll(w, recordingPolicy([]));
        expect(w.population).toBe(1);
        expect(w.energy[a]).toBe(2000);
        expect(w.cooldown[a]).toBe(0);
        expect(event(w, 0).slice(0, 4)).toEqual([EVENT_TYPE.BIRTH_BLOCKED, 0, a, BLOCKED_CAUSE.CAPACITY]);
    });
});
