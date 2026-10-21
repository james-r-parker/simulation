import { describe, expect, it } from 'vitest';
import { LOSS_CAUSE, applyCosts } from '../../js/sim/energy.js';
import { childSpec } from '../../js/sim/heritable-spec.js';
import { splitAll } from '../../js/sim/reproduction.js';
import { addBlob, lifeWorld, recordingPolicy } from './helpers/life-world.js';

/**
 * @param {any} w the world
 * @returns {Record<string, number[]>} every stream's state
 */
function streams(w) {
    return Object.fromEntries(
        Object.entries(w.rng).map(([name, rng]) => [name, Array.from(/** @type {any} */ (rng).s)]),
    );
}

describe('childSpec', () => {
    it('keeps the mother specialisation and draws nothing with specMutationRate 0', () => {
        const w = lifeWorld();
        const mother = addBlob(w, { spec: 3 });
        const before = streams(w);
        expect(childSpec(w, mother)).toBe(3);
        expect(streams(w)).toEqual(before);
    });

    it('takes another specialisation every time with specMutationRate 1, covering all four others', () => {
        const w = lifeWorld({ specMutationRate: 1 });
        const mother = addBlob(w, { spec: 2 });
        const seen = new Set();
        for (let i = 0; i < 200; i++) {
            seen.add(childSpec(w, mother));
        }
        expect([...seen].sort()).toEqual([0, 1, 3, 4]);
    });

    it('draws from the mutation stream only', () => {
        const w = lifeWorld({ specMutationRate: 0.5 });
        const mother = addBlob(w, { spec: 0 });
        const before = streams(w);
        childSpec(w, mother);
        const after = streams(w);
        expect(after.mutation).not.toEqual(before.mutation);
        expect({ ...after, mutation: 0 }).toEqual({ ...before, mutation: 0 });
    });

    it('mutates about the configured share of children', () => {
        const w = lifeWorld({ specMutationRate: 0.25 });
        const mother = addBlob(w, { spec: 4 });
        let changed = 0;
        for (let i = 0; i < 4000; i++) {
            changed += childSpec(w, mother) === 4 ? 0 : 1;
        }
        expect(changed / 4000).toBeGreaterThan(0.2);
        expect(changed / 4000).toBeLessThan(0.3);
    });

    it('sets the specialisation of a split child, with the birth event reporting it', () => {
        const w = lifeWorld({ specMutationRate: 1 });
        const mother = addBlob(w, { energy: 1700, spec: 2 });
        splitAll(w, recordingPolicy([]));
        expect(w.population).toBe(2);
        expect(w.spec[1]).not.toBe(w.spec[mother]);
        expect(w.events.data[5]).toBe(w.spec[1]);
    });

    it('leaves a split child with its mother specialisation when off', () => {
        const w = lifeWorld();
        addBlob(w, { energy: 1700, spec: 2 });
        splitAll(w, recordingPolicy([]));
        expect(w.spec[1]).toBe(2);
    });
});

describe('huntUpkeep', () => {
    /**
     * @param {Record<string, any>} over config overrides
     * @returns {number[]} the energy each specialisation loses in one tick
     */
    function lossBySpec(over) {
        const w = lifeWorld(over);
        for (let spec = 0; spec < 5; spec++) {
            addBlob(w, { spec, energy: 500 });
        }
        applyCosts(w);
        return Array.from({ length: 5 }, (_, i) => 500 - w.energy[i]);
    }

    it('charges only canHunt agents, on top of the passive loss, when specMutationRate is above 0', () => {
        const off = lossBySpec({});
        const on = lossBySpec({ specMutationRate: 0.002 });
        const cfg = lifeWorld({ specMutationRate: 0.002 }).config;
        const hunters = Object.values(cfg.specialisations).filter((s) => /** @type {any} */ (s).canHunt);
        expect(hunters.length).toBeGreaterThan(0);
        for (const s of Object.values(cfg.specialisations)) {
            const i = /** @type {any} */ (s).index;
            const extra = /** @type {any} */ (s).canHunt ? cfg.huntUpkeep : 0;
            expect(on[i] - off[i]).toBeCloseTo(extra, 6);
        }
    });

    it('is free while specMutationRate is 0 whatever huntUpkeep says', () => {
        expect(lossBySpec({ huntUpkeep: 5 })).toEqual(lossBySpec({ huntUpkeep: 0 }));
    });

    it('books the upkeep as a cost loss', () => {
        const w = lifeWorld({ specMutationRate: 0.002 });
        const predator = addBlob(w, { spec: w.config.specialisations.predator.index, energy: 500 });
        applyCosts(w);
        expect(w.lastLoss[predator]).toBe(LOSS_CAUSE.COST);
    });
});
