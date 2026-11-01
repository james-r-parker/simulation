import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { LOSS_CAUSE, applyCosts } from '../../js/sim/energy.js';
import { feed } from '../../js/sim/feeding.js';
import { buildHash, createSpatialHash } from '../../js/sim/spatial-hash.js';
import { BORN_CAUSE, DEATH_CAUSE, EVENT_STRIDE, EVENT_TYPE } from '../../js/sim/events.js';
import { fillFloor, reap } from '../../js/sim/population.js';
import { addBlob, imbalance, lifeWorld, recordingPolicy } from './helpers/life-world.js';

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
 * @returns {number[]} the type of every event
 */
function types(w) {
    return Array.from({ length: w.events.count }, (_v, i) => event(w, i)[0]);
}

describe('reap', () => {
    it('kills a lethally poisoned body with energy and leaves its remains', () => {
        const w = lifeWorld();
        const slot = addBlob(w, { energy: 100, dose: 1, foodEnergy: 200 });
        reap(w, recordingPolicy([]));
        expect(w.alive[slot]).toBe(0);
        expect(event(w, 0)[4]).toBe(DEATH_CAUSE.POISONED);
        expect(w.dose[slot]).toBe(0);
        expect(w.foodCount).toBe(1);
        expect(w.myceliumX[0]).toBe(500);
        expect(w.myceliumTicks[0]).toBe(w.config.myceliumLife);
        expect(imbalance(w)).toBeCloseTo(0, 9);
    });

    it('checks old age before a lethal dose', () => {
        const w = lifeWorld();
        addBlob(w, { energy: 100, dose: 2, ageTicks: w.config.maxAgeTicks });
        reap(w, recordingPolicy([]));
        expect(event(w, 0)[4]).toBe(DEATH_CAUSE.OLD_AGE);
    });

    it.each([
        ['cost', LOSS_CAUSE.COST, DEATH_CAUSE.STARVED, 0],
        ['no loss', LOSS_CAUSE.NONE, DEATH_CAUSE.STARVED, 0],
        ['bite', LOSS_CAUSE.BITE, DEATH_CAUSE.EATEN, 77],
        ['collision', LOSS_CAUSE.COLLISION, DEATH_CAUSE.COLLISION, 0],
        ['trample', LOSS_CAUSE.TRAMPLE, DEATH_CAUSE.TRAMPLED, 77],
    ])('kills an agent at 0 energy after a %s loss', (_n, loss, cause, by) => {
        const w = lifeWorld();
        const s = addBlob(w, {
            energy: 0,
            lastLoss: loss,
            lastBiter: 77,
            spec: 3,
            ageTicks: 42,
            foodEnergy: 5,
            biteEnergy: 6,
        });
        if (loss === LOSS_CAUSE.TRAMPLE) {
            w.lastHerdId[s] = 77;
        }
        const id = w.genomeId[s];
        /** @type {string[]} */
        const log = [];
        w.tick = 8;
        reap(w, recordingPolicy(log));
        expect(w.population).toBe(0);
        expect(w.alive[s]).toBe(0);
        expect(event(w, 0)).toEqual([EVENT_TYPE.AGENT_DIED, 8, s, id, cause, by, 3, id, 42, 5, 6, 0]);
        expect(log).toEqual([`death ${s} ${cause} 1 0`]);
    });

    it('uses the last trample loss when a blob was also bitten that tick', () => {
        const w = lifeWorld();
        const s = addBlob(w, { energy: 0, lastLoss: LOSS_CAUSE.TRAMPLE, lastBiter: 77, lastHerdId: 91 });
        w.tick = 8;
        w.lastBiteTick[s] = w.tick;
        reap(w, recordingPolicy([]));
        expect(event(w, 0).slice(4, 6)).toEqual([DEATH_CAUSE.TRAMPLED, 91]);
    });

    it('lets old age win over starvation', () => {
        const w = lifeWorld({ maxAgeTicks: 10 });
        addBlob(w, { energy: 0, ageTicks: 10, lastLoss: LOSS_CAUSE.BITE, lastBiter: 4 });
        reap(w, recordingPolicy([]));
        expect(event(w, 0).slice(4, 6)).toEqual([DEATH_CAUSE.OLD_AGE, 0]);
    });

    it('moves the remaining energy to the ledger and adds a fertile zone at the body', () => {
        const w = lifeWorld({ maxAgeTicks: 10 });
        const s = addBlob(w, { ageTicks: 10, x: 123, y: 456 });
        const size = w.size[s];
        reap(w, { initBrain() {} });
        expect(imbalance(w)).toBeCloseTo(0, 9);
        expect(w.ledger[1]).toBe(1000);
        expect(w.zoneAlive[0]).toBe(1);
        expect([w.zoneX[0], w.zoneY[0]]).toEqual([123, 456]);
        expect(w.zoneFertility[0]).toBeCloseTo(size * w.config.fertileZoneFertility, 9);
    });

    it('leaves healthy agents alone', () => {
        const w = lifeWorld();
        addBlob(w);
        reap(w, recordingPolicy([]));
        expect(w.population).toBe(1);
        expect(w.events.count).toBe(0);
    });
});

describe('fillFloor, the extinction guard', () => {
    it('restarts the world to minAgents when fewer than floorTrigger are alive, and pushes one PopulationFloor', () => {
        const w = lifeWorld({ minAgents: 6, floorTrigger: 4 });
        addBlob(w);
        fillFloor(w, recordingPolicy([]));
        expect(w.population).toBe(6);
        expect(w.lineageId[1]).toBe(w.genomeId[1]);
        expect(w.lineageId[1]).not.toBe(w.lineageId[2]);
        const floor = types(w).indexOf(EVENT_TYPE.POPULATION_FLOOR);
        expect(types(w).filter((t) => t === EVENT_TYPE.POPULATION_FLOOR)).toHaveLength(1);
        expect(event(w, 0)[8]).toBe(BORN_CAUSE.FLOOR);
        // The record carries the agents added and the population before the refill.
        expect([event(w, floor)[2], event(w, floor)[3]]).toEqual([5, 1]);
        expect(imbalance(w)).toBeCloseTo(0, 9);
    });

    it('does nothing while the population is at or above floorTrigger, even far below minAgents', () => {
        const w = lifeWorld({ minAgents: 6, floorTrigger: 2 });
        addBlob(w);
        addBlob(w);
        fillFloor(w, recordingPolicy([]));
        expect(w.population).toBe(2);
        expect(w.events.count).toBe(0);
    });

    it('lets a basin reach 0 and stay 0 while the world is above the trigger', () => {
        const w = lifeWorld({ minAgents: 6, floorTrigger: 3 });
        for (let i = 0; i < 4; i++) {
            addBlob(w);
        }
        for (let tick = 0; tick < 5; tick++) {
            w.tick = tick;
            fillFloor(w, recordingPolicy([]));
        }
        expect(w.population).toBe(4);
        expect(w.events.count).toBe(0);
    });

    it('acts when the world is empty, the only source of entrants without immigration or rescue', () => {
        const w = lifeWorld({ minAgents: 3, floorTrigger: 2 });
        for (let tick = 1; tick <= 12; tick++) {
            w.tick = tick;
            fillFloor(w, recordingPolicy([]));
        }
        expect(w.population).toBe(3);
        const born = Array.from({ length: w.events.count }, (_v, i) => event(w, i)).filter(
            (e) => e[0] === EVENT_TYPE.AGENT_BORN,
        );
        expect(born.every((e) => e[8] === BORN_CAUSE.FLOOR)).toBe(true);
    });

    it('is off at floorTrigger 0 and when minAgents is 0', () => {
        const off = lifeWorld({ minAgents: 5, floorTrigger: 0 });
        fillFloor(off, recordingPolicy([]));
        expect(off.population).toBe(0);
        const none = lifeWorld({ minAgents: 0, floorTrigger: 8 });
        fillFloor(none, recordingPolicy([]));
        expect(none.population).toBe(0);
    });
});

describe('reap AgentDied field 11 (prevBiter)', () => {
    /**
     * @param {Record<string, number>} fields extra slot values for an eaten agent
     * @param {number} tick the death tick
     * @returns {number} field 11 of the AgentDied record
     */
    function prevBiterField(fields, tick) {
        const w = lifeWorld({ packWindow: 120 });
        addBlob(w, { energy: 0, lastLoss: LOSS_CAUSE.BITE, lastBiter: 77, ...fields });
        w.tick = tick;
        reap(w, recordingPolicy([]));
        return event(w, 0)[11];
    }

    it('names the previous biter when it bit at most packWindow ticks before the death', () => {
        expect(prevBiterField({ prevBiter: 55, prevBiteTick: 80 }, 200)).toBe(55);
    });

    it('is 0 when the previous bite is older than packWindow ticks', () => {
        expect(prevBiterField({ prevBiter: 55, prevBiteTick: 79 }, 200)).toBe(0);
    });

    it('is 0 when there was no previous biter', () => {
        expect(prevBiterField({ prevBiter: 0, prevBiteTick: 199 }, 200)).toBe(0);
    });

    it('is 0 for a death that was not eaten', () => {
        const w = lifeWorld();
        addBlob(w, { energy: 0, lastLoss: LOSS_CAUSE.COST, prevBiter: 55, prevBiteTick: 10 });
        w.tick = 12;
        reap(w, recordingPolicy([]));
        expect(event(w, 0)[11]).toBe(0);
    });
});

describe('reap event fields for a later slot', () => {
    it('records the dying slot and its ids when the slot is not 0', () => {
        const w = lifeWorld();
        addBlob(w, { energy: 100 });
        const s = addBlob(w, { energy: 0, spec: 2, ageTicks: 7 });
        const id = w.genomeId[s];
        w.tick = 3;
        reap(w, recordingPolicy([]));
        expect(event(w, 0).slice(0, 5)).toEqual([EVENT_TYPE.AGENT_DIED, 3, s, id, DEATH_CAUSE.STARVED]);
        expect(w.alive[0]).toBe(1);
        expect(w.events.count).toBe(1);
    });
});

describe('reap after a bite in the same tick', () => {
    it.each([
        ['leaves a sliver of energy that the tick costs then remove', 5.0001],
        ['takes all the energy', 3],
    ])('records eaten when the bite %s', (_n, victimEnergy) => {
        const w = lifeWorld();
        w.tick = 9;
        const hunter = addBlob(w, { spec: 1, energy: 500, x: 100, y: 100, bittenTimer: 30, ateTimer: 30 });
        const prey = addBlob(w, { spec: 0, energy: victimEnergy, x: 101, y: 100 });
        w.size[hunter] = 20;
        w.size[prey] = 5;
        w.outputs[hunter * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = 1;
        w.contacts[0] = hunter;
        w.contacts[1] = prey;
        w.contactCount = 1;
        const hash = createSpatialHash(w.config);
        buildHash(hash, w);
        const preyId = w.genomeId[prey];
        feed(w, hash);
        applyCosts(w);
        reap(w, recordingPolicy([]));
        expect(w.alive[prey]).toBe(0);
        const died = Array.from({ length: w.events.count }, (_v, i) => event(w, i)).find(
            (e) => e[0] === EVENT_TYPE.AGENT_DIED && e[3] === preyId,
        );
        expect(died?.[4]).toBe(DEATH_CAUSE.EATEN);
        expect(died?.[5]).toBe(w.genomeId[hunter]);
    });
});
