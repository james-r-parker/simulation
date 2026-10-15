import { describe, expect, it } from 'vitest';
import { LOSS_CAUSE } from '../../js/sim/energy.js';
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
    it.each([
        ['cost', LOSS_CAUSE.COST, DEATH_CAUSE.STARVED, 0],
        ['no loss', LOSS_CAUSE.NONE, DEATH_CAUSE.STARVED, 0],
        ['bite', LOSS_CAUSE.BITE, DEATH_CAUSE.EATEN, 77],
        ['collision', LOSS_CAUSE.COLLISION, DEATH_CAUSE.COLLISION, 0],
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

describe('fillFloor', () => {
    it('adds new lineages up to minAgents and pushes one PopulationFloor', () => {
        const w = lifeWorld({ minAgents: 3 });
        addBlob(w);
        fillFloor(w, recordingPolicy([]));
        expect(w.population).toBe(3);
        expect(w.lineageId[1]).toBe(w.genomeId[1]);
        expect(w.lineageId[1]).not.toBe(w.lineageId[2]);
        expect(types(w)).toEqual([EVENT_TYPE.AGENT_BORN, EVENT_TYPE.AGENT_BORN, EVENT_TYPE.POPULATION_FLOOR]);
        expect(event(w, 0)[8]).toBe(BORN_CAUSE.FLOOR);
        expect(event(w, 2)[2]).toBe(2);
        expect(imbalance(w)).toBeCloseTo(0, 9);
    });

    it('adds nothing at or above the floor', () => {
        const w = lifeWorld({ minAgents: 1 });
        addBlob(w);
        fillFloor(w, recordingPolicy([]));
        expect(w.events.count).toBe(0);
    });

    it('adds an immigrant exactly every immigrationInterval, never at tick 0', () => {
        const w = lifeWorld({ immigrationInterval: 5 });
        const born = [];
        for (let t = 0; t < 16; t++) {
            w.tick = t;
            w.events.count = 0;
            fillFloor(w, recordingPolicy([]));
            if (w.events.count > 0) {
                born.push(t);
                expect(event(w, 0)[8]).toBe(BORN_CAUSE.IMMIGRANT);
            }
        }
        expect(born).toEqual([5, 10, 15]);
        expect(imbalance(w)).toBeCloseTo(0, 9);
    });

    it('adds no immigrant at maxAgents or when immigration is off', () => {
        const full = lifeWorld({ immigrationInterval: 5, maxAgents: 1 });
        addBlob(full);
        full.tick = 5;
        fillFloor(full, recordingPolicy([]));
        expect(full.population).toBe(1);
        const off = lifeWorld({ immigrationInterval: 0 });
        off.tick = 5;
        fillFloor(off, recordingPolicy([]));
        expect(off.population).toBe(0);
    });

    it('counts only floor agents in PopulationFloor when an immigrant arrives too', () => {
        const w = lifeWorld({ immigrationInterval: 5, minAgents: 2 });
        w.tick = 5;
        fillFloor(w, recordingPolicy([]));
        expect(w.population).toBe(3);
        expect(types(w)).toEqual([
            EVENT_TYPE.AGENT_BORN,
            EVENT_TYPE.AGENT_BORN,
            EVENT_TYPE.POPULATION_FLOOR,
            EVENT_TYPE.AGENT_BORN,
        ]);
        expect(event(w, 2)[2]).toBe(2);
    });
});
