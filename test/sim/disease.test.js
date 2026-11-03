import { describe, expect, it } from 'vitest';
import {
    advanceInfections,
    assertDisease,
    emergeStrain,
    releaseInfection,
    stepDisease,
    transmit,
} from '../../js/sim/disease.js';
import { DEATH_CAUSE, EVENT_TYPE, readEvents } from '../../js/sim/events.js';
import { SIMILARITY_DIMS } from '../../js/sim/genetics.js';
import { reap } from '../../js/sim/population.js';
import { buildHash } from '../../js/sim/spatial-hash.js';
import { addBlob, lifeWorld, recordingPolicy } from './helpers/life-world.js';

const ON = { diseaseSeedRate: 1, diseaseMinHosts: 1, diseaseTransmission: 1, maxAgents: 8 };

/**
 * @param {Record<string, any>} [over] config overrides
 * @returns {any} a world with the contagion on and certain transmission
 */
function world(over = {}) {
    return lifeWorld({ ...ON, ...over });
}

/**
 * Gives a slot a weight row far from the clones' zero row.
 * @param {any} w the world
 * @param {number} slot the slot
 * @returns {void}
 */
function stranger(w, slot) {
    const n = w.layout.weightCount;
    w.weights.fill(10, slot * n, slot * n + w.layout.traitStart);
}

/**
 * @param {any} w the world
 * @param {number} type an event type
 * @returns {number[]} the offsets of the tick's events of that type
 */
function eventsOf(w, type) {
    const out = [];
    const count = readEvents(w.events);
    for (let i = 0; i < count; i++) {
        if (w.events.data[i * 12] === type) {
            out.push(i * 12);
        }
    }
    return out;
}

/**
 * Emerges a strain on a host at (100, 100), the only agent at that moment, and ages its infection one tick so it can
 * transmit; the neighbours are added after.
 * @param {any} w the world
 * @param {Record<string, number>[]} others the neighbours' fields
 * @returns {number[]} the neighbours' slots
 */
function seeded(w, others) {
    const host = addBlob(w, { x: 100, y: 100 });
    emergeStrain(w);
    w.infectionTicks[host] = w.config.diseaseTicks - 1;
    const slots = others.map((fields) => addBlob(w, fields));
    buildHash(w.hash, w);
    return slots;
}

describe('emergeStrain', () => {
    it('infects one alive host, records its genome sample and lineage, and pushes StrainEmerged and AgentInfected', () => {
        const w = world();
        const host = addBlob(w, { x: 100, y: 100 });
        w.weights[host * w.layout.weightCount] = 0.5;
        expect(emergeStrain(w)).toBe(0);
        expect(w.infection[host]).toBe(1);
        expect(w.strainAlive[0]).toBe(1);
        expect(w.strainInfected[0]).toBe(1);
        expect(w.strainFounderLineage[0]).toBe(w.lineageId[host]);
        expect(w.strainGenotype[0]).toBe(0.5);
        const [emerged] = eventsOf(w, EVENT_TYPE.STRAIN_EMERGED);
        expect(Array.from(w.events.data.slice(emerged + 2, emerged + 6))).toEqual([
            0,
            host,
            w.genomeId[host],
            w.lineageId[host],
        ]);
        expect(eventsOf(w, EVENT_TYPE.AGENT_INFECTED)).toHaveLength(1);
    });

    it('emerges only on a healthy host, never over another strain', () => {
        const w = world();
        const sick = addBlob(w, { x: 100, y: 100 });
        emergeStrain(w);
        const healthy = addBlob(w, { x: 900, y: 900 });
        for (let i = 0; i < 6; i++) {
            emergeStrain(w);
        }
        expect(w.infection[sick]).toBe(1);
        expect(w.infection[healthy]).toBe(2);
        expect(w.strainAlive[2]).toBe(0);
        assertDisease(w);
    });

    it('does not emerge below diseaseMinHosts, with every strain slot taken, or on a failed draw', () => {
        const few = world({ diseaseMinHosts: 3 });
        addBlob(few);
        addBlob(few);
        expect(emergeStrain(few)).toBe(-1);
        const full = world();
        addBlob(full);
        full.strainAlive.fill(1);
        expect(emergeStrain(full)).toBe(-1);
        const rare = world({ diseaseSeedRate: 1e-12 });
        addBlob(rare);
        expect(emergeStrain(rare)).toBe(-1);
    });
});

describe('transmit', () => {
    it('spreads through clones within diseaseRadius and not past it', () => {
        const w = world({ diseaseRadius: 60 });
        const [near, far] = seeded(w, [
            { x: 150, y: 100 },
            { x: 300, y: 100 },
        ]);
        transmit(w);
        expect(w.infection[near]).toBe(1);
        expect(w.infection[far]).toBe(0);
    });

    it('never infects an agent at or past diseaseSpecificity, and records the distance of each infection', () => {
        const w = world();
        const [kin, alien] = seeded(w, [
            { x: 120, y: 100 },
            { x: 100, y: 120 },
        ]);
        stranger(w, alien);
        transmit(w);
        expect(w.infection[kin]).toBe(1);
        expect(w.infection[alien]).toBe(0);
        const infected = eventsOf(w, EVENT_TYPE.AGENT_INFECTED);
        expect(w.events.data[infected[infected.length - 1] + 5]).toBe(0);
    });

    it('never reinfects an agent immune to the strain, and a newly infected agent waits a tick to transmit', () => {
        const w = world();
        const [immune, chainA, chainB] = seeded(w, [
            { x: 120, y: 100 },
            { x: 80, y: 100 },
            { x: 30, y: 100 },
        ]);
        w.immuneMask[immune] = 1;
        transmit(w);
        expect(w.infection[immune]).toBe(0);
        expect(w.infection[chainA]).toBe(1);
        expect(w.infection[chainB]).toBe(0);
    });
});

describe('advanceInfections', () => {
    it('drains diseaseDrain per tick for diseaseTicks, then leaves the agent immune and frees the strain', () => {
        const w = world({ diseaseTicks: 5, diseaseDrain: 2 });
        const host = addBlob(w, { x: 100, y: 100 });
        emergeStrain(w);
        const before = w.energy[host];
        for (let t = 0; t < 5; t++) {
            advanceInfections(w);
        }
        expect(before - w.energy[host]).toBeCloseTo(10);
        expect(w.infection[host]).toBe(0);
        expect(w.strainAlive[0]).toBe(0);
        expect(eventsOf(w, EVENT_TYPE.STRAIN_EXTINCT)).toHaveLength(1);
        expect(w.immuneMask[host]).toBe(0);
    });

    it('keeps the immunity bit while the strain still has a host', () => {
        const w = world({ diseaseTicks: 2 });
        const [kin] = seeded(w, [{ x: 120, y: 100 }]);
        const host = 0;
        transmit(w);
        advanceInfections(w);
        expect(w.infection[host]).toBe(0);
        expect(w.immuneMask[host]).toBe(1);
        expect(w.infection[kin]).toBe(1);
        assertDisease(w);
    });
});

describe('deaths and the strain pool', () => {
    it('names a death while infected and drained to zero as disease, and releases the strain', () => {
        const w = world();
        const host = addBlob(w, { x: 100, y: 100, energy: 0.1 });
        emergeStrain(w);
        advanceInfections(w);
        const log = /** @type {string[]} */ ([]);
        reap(w, recordingPolicy(log));
        expect(log).toEqual([`death ${host} ${DEATH_CAUSE.DISEASE} 1 0`]);
        expect(w.strainAlive[0]).toBe(0);
        expect(w.infection[host]).toBe(0);
    });

    it('releaseInfection is a no-op for a healthy agent', () => {
        const w = world();
        const slot = addBlob(w);
        releaseInfection(w, slot);
        expect(w.infection[slot]).toBe(0);
    });

    it('clears a freed strain genotype', () => {
        const w = world({ diseaseTicks: 1 });
        const host = addBlob(w, { x: 100, y: 100 });
        w.weights[host * w.layout.weightCount] = 0.5;
        emergeStrain(w);
        advanceInfections(w);
        expect(Array.from(w.strainGenotype.subarray(0, SIMILARITY_DIMS)).every((v) => v === 0)).toBe(true);
    });
});

describe('stepDisease', () => {
    it('draws nothing from the disease stream while diseaseSeedRate is 0', () => {
        const w = world({ diseaseSeedRate: 0 });
        addBlob(w, { x: 100, y: 100 });
        const state = Array.from(w.rng.disease.s);
        for (let t = 0; t < 1000; t++) {
            stepDisease(w);
        }
        expect(Array.from(w.rng.disease.s)).toEqual(state);
        expect(w.infection[0]).toBe(0);
    });

    it('emerges, transmits and advances in one tick', () => {
        const w = world();
        addBlob(w, { x: 100, y: 100 });
        buildHash(w.hash, w);
        stepDisease(w);
        expect(w.strainAlive[0]).toBe(1);
        expect(w.infectionTicks[0]).toBe(w.config.diseaseTicks - 1);
    });
});

describe('assertDisease', () => {
    it('throws on a dead strain, a wrong host count, and infected-and-immune', () => {
        const dead = world();
        const a = addBlob(dead);
        dead.infection[a] = 1;
        expect(() => assertDisease(dead)).toThrow(/not alive/);
        const count = world();
        addBlob(count, { x: 100, y: 100 });
        emergeStrain(count);
        count.strainInfected[0] = 2;
        expect(() => assertDisease(count)).toThrow(/counts 2 hosts, found 1/);
        const both = world();
        const b = addBlob(both, { x: 100, y: 100 });
        emergeStrain(both);
        both.immuneMask[b] = 1;
        expect(() => assertDisease(both)).toThrow(/infected with and immune/);
    });
});
