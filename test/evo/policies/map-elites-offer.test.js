import { describe, expect, it } from 'vitest';
import { ELITE, occupiedCount, placeCount, placeOf } from '../../../js/evo/archive.js';
import { ensureRoom } from '../../../js/evo/growable-log.js';
import { createObserver } from '../../../js/evo/observer.js';
import { createMapElitesV1 } from '../../../js/evo/policies/map-elites-v1.js';
import { DEATH_CAUSE, EVENT_TYPE, pushEvent } from '../../../js/sim/events.js';
import { createRng } from '../../../js/sim/rng.js';
import { setup, fill } from '../helpers/map-elites-world.js';

describe('offers', () => {
    /**
     * Kills a mature agent in `slot` by hand: the death hook, the observer's death-log row, the event record, and
     * then a newborn in the same slot before the policy sees the record.
     * @param {Record<string, any>} ctx `{ policy, world, observer }`
     * @param {{slot: number, genomeId: number, fitness: number, samples?: number}} agent the dying agent
     * @returns {void}
     */
    function killAndReuse({ policy, world, observer }, { slot, genomeId, fitness, samples = 2 }) {
        world.alive[slot] = 1;
        world.genomeId[slot] = genomeId;
        world.ageTicks[slot] = world.config.maturityTicks + 10;
        world.spec[slot] = 0;
        policy.brain.onDeath(world, slot, DEATH_CAUSE.STARVED);
        const row = observer.deathCount++;
        ensureRoom(observer.deaths, row);
        observer.deaths.genomeId[row] = genomeId;
        observer.deaths.fitness[row] = fitness;
        observer.deaths.samples[row] = samples;
        observer.deaths.speedSum[row] = 1.2;
        const o = pushEvent(world.events, EVENT_TYPE.AGENT_DIED, 900);
        const d = world.events.data;
        d[o + 2] = slot;
        d[o + 3] = genomeId;
        d[o + 6] = 0;
        d[o + 8] = world.ageTicks[slot];
        world.genomeId[slot] = genomeId + 1000;
        policy.isClone[slot] = 0;
        world.weights.fill(9, slot * world.layout.weightCount, (slot + 1) * world.layout.weightCount);
        policy.onEvent(world, o);
    }

    it('adds a clone death to the archived genome even when its slot was reused', () => {
        const { world } = setup();
        const observer = createObserver(world.config, createRng(1));
        const ctx = { policy: createMapElitesV1({ config: world.config, observer }), world, observer };
        fill(ctx.policy, { spec: 0, count: 1 });
        const { archive } = ctx.policy;
        const place = placeOf(0, 0, ELITE);
        expect(placeCount(archive, place)).toBe(1);
        ctx.policy.isClone[2] = 1;
        ctx.policy.archiveRef[2] = 0;
        ctx.policy.refId[2] = 1;
        killAndReuse(ctx, { slot: 2, genomeId: 500, fitness: 40 });
        expect(placeCount(archive, place)).toBe(2);
        expect(occupiedCount(archive)).toBe(1);
    });

    it('offers a mature non-clone death to the cell of its descriptors', () => {
        const { world } = setup();
        const observer = createObserver(world.config, createRng(1));
        const policy = createMapElitesV1({ config: world.config, observer });
        killAndReuse({ policy, world, observer }, { slot: 3, genomeId: 600, fitness: 40 });
        // speedMean 1.2 / 2 = 0.6 -> x 6, crowding 0 -> y 0
        expect(policy.archive.occupied[placeOf(0, 6, ELITE)]).toBe(1);
        expect(policy.archive.ids[placeOf(0, 6, ELITE)]).toBe(600);
        // The row offered is the dying agent's, not the newborn's that reused the slot.
        expect(policy.archive.rows[placeOf(0, 6, ELITE) * world.layout.weightCount]).not.toBe(9);
    });

    it('offers nothing without an observer', () => {
        const { policy, world } = setup();
        world.alive[0] = 1;
        world.ageTicks[0] = 9999;
        policy.brain.onDeath(world, 0, DEATH_CAUSE.STARVED);
        const o = pushEvent(world.events, EVENT_TYPE.AGENT_DIED, 5);
        policy.onEvent(world, o);
        expect(occupiedCount(policy.archive)).toBe(0);
    });

    it('throws when the death log does not match the record, or no row was saved', () => {
        const { world } = setup();
        const observer = createObserver(world.config, createRng(1));
        const policy = createMapElitesV1({ config: world.config, observer });
        const o = pushEvent(world.events, EVENT_TYPE.AGENT_DIED, 5);
        world.events.data[o + 3] = 42;
        world.events.data[o + 8] = 9999;
        expect(() => policy.onEvent(world, o)).toThrow(/death log row 0/);
        observer.deaths.genomeId[1] = 42;
        observer.deaths.fitness[1] = 3;
        expect(() => policy.onEvent(world, o)).toThrow(/no pending row for genome 42/);
    });

    it('puts an agent with no speed samples in speed column 0', () => {
        const { world } = setup();
        const observer = createObserver(world.config, createRng(1));
        const policy = createMapElitesV1({ config: world.config, observer });
        killAndReuse({ policy, world, observer }, { slot: 1, genomeId: 700, fitness: 5, samples: 0 });
        expect(policy.archive.ids[placeOf(0, 0, ELITE)]).toBe(700);
    });

    it('finds its death-log rows again after the host drains the log', () => {
        const { world } = setup();
        const observer = createObserver(world.config, createRng(1));
        const policy = createMapElitesV1({ config: world.config, observer });
        const ctx = { policy, world, observer };
        killAndReuse(ctx, { slot: 1, genomeId: 800, fitness: 40 });
        observer.deathsDrained += observer.deathCount;
        observer.deathCount = 0;
        // Without the drain offset the row would be 1 and the check against the log would throw.
        expect(() => killAndReuse(ctx, { slot: 2, genomeId: 801, fitness: 41 })).not.toThrow();
        expect(observer.deathsDrained).toBe(1);
        expect(policy.archive.ids[placeOf(0, 6, ELITE)]).toBe(800);
    });
});
