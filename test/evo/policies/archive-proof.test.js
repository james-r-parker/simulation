import { describe, expect, it } from 'vitest';
import { occupiedCount } from '../../../js/evo/archive.js';
import { ensureRoom } from '../../../js/evo/growable-log.js';
import { createObserver } from '../../../js/evo/observer.js';
import { VERDICT, createPendingTable, createProofLedger, verdictOf } from '../../../js/evo/policies/archive-proof.js';
import { createMapElitesV1 } from '../../../js/evo/policies/map-elites-v1.js';
import { DEATH_CAUSE, EVENT_TYPE, pushEvent } from '../../../js/sim/events.js';
import { createRng } from '../../../js/sim/rng.js';
import { setup } from '../helpers/map-elites-world.js';

const WEIGHTS = 4;

/**
 * @param {number} id genome id
 * @param {number} fill the genome row's value
 * @returns {Record<string, any>} an offer for a table
 */
function offerOf(id, fill) {
    return {
        spec: 1,
        cell: 7,
        row: new Float32Array(WEIGHTS).fill(fill),
        sigma: 0.1,
        id,
        fitness: 5,
        isClone: false,
        archiveRef: 0,
        refId: 0,
    };
}

describe('verdictOf', () => {
    /**
     * @param {Record<string, number>} fields proof arrays of slot 0
     * @returns {Record<string, any>} a world-like object
     */
    const world = (fields) => ({
        proven: [fields.proven ?? 0],
        established: [fields.established ?? 0],
        unprovenKids: [fields.kids ?? 0],
    });

    it('offers an established genome, holds a proven one with a child to wait for, refuses the rest', () => {
        expect(verdictOf(world({ proven: 1, established: 1 }), 0)).toBe(VERDICT.OFFER);
        expect(verdictOf(world({ proven: 1, kids: 1 }), 0)).toBe(VERDICT.HOLD);
        expect(verdictOf(world({ proven: 1 }), 0)).toBe(VERDICT.REFUSE);
        expect(verdictOf(world({ established: 1, kids: 2 }), 0)).toBe(VERDICT.REFUSE);
    });
});

describe('the pending table', () => {
    it('hands back the held offer once, and drops it when its last child dies', () => {
        const table = createPendingTable(3, WEIGHTS);
        table.hold(offerOf(10, 0.5), { kids: 2 });
        table.hold(offerOf(11, 0.25), { kids: 1 });
        expect(table.childDied(10)).toBe(0);
        expect(table.childDied(10)).toBe(10);
        expect(table.take(10)).toBeUndefined();
        const taken = table.take(11);
        expect(taken).toMatchObject({ id: 11, spec: 1, cell: 7, sigma: 0.1, fitness: 5 });
        expect(Array.from(taken?.row)).toEqual([0.25, 0.25, 0.25, 0.25]);
        expect(table.take(11)).toBeUndefined();
        expect(table.count()).toBe(0);
    });

    it('holds at most its size, evicting the oldest entry', () => {
        const table = createPendingTable(2, WEIGHTS);
        expect(table.hold(offerOf(1, 1), { kids: 1 })).toBe(0);
        expect(table.hold(offerOf(2, 2), { kids: 1 })).toBe(0);
        expect(table.hold(offerOf(3, 3), { kids: 1 })).toBe(1);
        expect([table.has(1), table.has(2), table.has(3)]).toEqual([false, true, true]);
        expect(table.count()).toBe(2);
    });
});

describe('the pending table, evicting repeatedly', () => {
    it('evicts the oldest entry each time, however the entries sit in the table', () => {
        const table = createPendingTable(2, WEIGHTS);
        table.hold(offerOf(1, 1), { kids: 1 });
        table.hold(offerOf(2, 2), { kids: 1 });
        expect(table.hold(offerOf(3, 3), { kids: 1 })).toBe(1);
        expect(table.hold(offerOf(4, 4), { kids: 1 })).toBe(2);
        expect(table.hold(offerOf(5, 5), { kids: 1 })).toBe(3);
        expect([1, 2, 3, 4, 5].map((id) => table.has(id))).toEqual([false, false, false, true, true]);
    });
});

describe('the proof ledger', () => {
    /**
     * @param {number} slots table size
     * @returns {{ledger: any, world: any, records: any[]}} a ledger that logs, and a world of proven parents
     */
    function build(slots) {
        /** @type {any[]} */
        const records = [];
        const log = {
            level: 'debug',
            log: (/** @type {any} */ _l, /** @type {string} */ event, /** @type {any} */ f) =>
                records.push({ event, ...f }),
        };
        const world = {
            tick: 50,
            proven: Uint8Array.of(1, 1, 0),
            established: Uint8Array.of(0, 0, 0),
            unprovenKids: Uint8Array.of(2, 1, 0),
            parentA: Float64Array.of(0, 0, 100),
            parentB: Float64Array.of(0, 0, 100),
            genomeId: Float64Array.of(100, 101, 200),
        };
        return {
            ledger: createProofLedger({ slots, weightCount: WEIGHTS, log: /** @type {any} */ (log) }),
            world,
            records,
        };
    }

    it('keeps a held parent waiting for the other child when one dies in the tick the parent dies', () => {
        const { ledger, world, records } = build(4);
        ledger.died(world, { slot: 0, mature: true });
        ledger.died(world, { slot: 2, mature: false });
        const offered = ledger.settle(0, { tick: 50, item: offerOf(100, 1) });
        expect(offered).toBe(false);
        expect(ledger.table.has(100)).toBe(true);
        expect(records).toEqual([{ event: 'ArchivePending', tick: 50, genomeId: 100, spec: 1, kids: 1 }]);
        expect(ledger.table.childDied(100)).toBe(100);
    });

    it('says which parent was pushed out of a full table, and why', () => {
        const { ledger, world, records } = build(2);
        // Slots 0 and 1 die holding parents 100 and 101; the table is full. Slot 0 is reused and its next occupant, 102, dies too.
        for (const [slot, id] of [
            [0, 100],
            [1, 101],
            [0, 102],
        ]) {
            ledger.died(world, { slot, mature: true });
            ledger.settle(slot, { tick: 60 + id, item: offerOf(id, 1) });
        }
        expect([100, 101, 102].map((id) => ledger.table.has(id))).toEqual([false, true, true]);
        expect(records.at(-1)).toEqual({ event: 'ArchiveRefused', tick: 162, genomeId: 100, reason: 'pending-full' });
    });
});

describe('the policy and the proof rule', () => {
    /**
     * @returns {{policy: any, world: any, observer: any, records: any[]}} a map-elites policy with an observer
     */
    function build() {
        const { world, records } = setup();
        const observer = createObserver(world.config, createRng(1));
        const log = {
            level: 'debug',
            log: (/** @type {any} */ _l, /** @type {any} */ event, /** @type {any} */ f) =>
                records.push({ event, ...f }),
        };
        const policy = createMapElitesV1({ config: world.config, observer, log });
        return { policy, world, observer, records };
    }

    /**
     * Kills a mature agent by hand: the proof arrays, the death hook, the death-log row and the record.
     * @param {Record<string, any>} ctx the policy, world and observer
     * @param {Record<string, number>} agent `{ slot, genomeId, proven, established, kids, parent }`
     * @returns {void}
     */
    function die(ctx, agent) {
        hook(ctx, agent);
        record(ctx, agent);
    }

    /**
     * The death hook alone, as `reap` calls it.
     * @param {Record<string, any>} ctx the policy, world and observer
     * @param {Record<string, number>} agent the dying agent
     * @returns {void}
     */
    function hook({ policy, world }, agent) {
        const { slot, genomeId } = agent;
        world.alive[slot] = 1;
        world.genomeId[slot] = genomeId;
        world.ageTicks[slot] = world.config.maturityTicks + 10;
        world.spec[slot] = 0;
        world.proven[slot] = agent.proven ?? 0;
        world.established[slot] = agent.established ?? 0;
        world.unprovenKids[slot] = agent.kids ?? 0;
        world.parentA[slot] = agent.parent ?? 0;
        world.parentB[slot] = agent.parent ?? 0;
        policy.brain.onDeath(world, slot, DEATH_CAUSE.STARVED);
    }

    /**
     * The death-log row and the `AgentDied` record, as the policy reads them after the step.
     * @param {Record<string, any>} ctx the policy, world and observer
     * @param {Record<string, number>} agent the dying agent
     * @returns {void}
     */
    function record({ policy, world, observer }, agent) {
        const { slot, genomeId } = agent;
        const row = observer.deathCount++;
        ensureRoom(observer.deaths, row);
        observer.deaths.genomeId[row] = genomeId;
        observer.deaths.fitness[row] = 30;
        observer.deaths.samples[row] = 2;
        const o = pushEvent(world.events, EVENT_TYPE.AGENT_DIED, 900);
        world.events.data[o + 2] = slot;
        world.events.data[o + 3] = genomeId;
        world.events.data[o + 8] = world.ageTicks[slot];
        world.alive[slot] = 0;
        policy.onEvent(world, o);
    }

    /**
     * @param {Record<string, any>} ctx the policy and world
     * @param {{genomeId: number, parentA: number, parentB: number}} child the child that proved
     * @returns {void}
     */
    function proves({ policy, world }, child) {
        const o = pushEvent(world.events, EVENT_TYPE.LINE_PROVEN, 950);
        world.events.data[o + 3] = child.genomeId;
        world.events.data[o + 4] = child.parentA;
        world.events.data[o + 5] = child.parentB;
        policy.onEvent(world, o);
    }

    it('refuses an unproven death and a proven one with no child, and says why', () => {
        const ctx = build();
        die(ctx, { slot: 1, genomeId: 100 });
        die(ctx, { slot: 2, genomeId: 101, proven: 1 });
        expect(occupiedCount(ctx.policy.archive)).toBe(0);
        const refused = ctx.records.filter((r) => r.event === 'ArchiveRefused');
        expect(refused.map((r) => [r.genomeId, r.reason])).toEqual([
            [100, 'unproven'],
            [101, 'no-proven-child'],
        ]);
    });

    it('offers an established death now', () => {
        const ctx = build();
        die(ctx, { slot: 1, genomeId: 100, proven: 1, established: 1 });
        expect(occupiedCount(ctx.policy.archive)).toBe(1);
    });

    it('archives a parent that dies first when its child proves, and not before', () => {
        const ctx = build();
        die(ctx, { slot: 1, genomeId: 100, proven: 1, kids: 1 });
        expect(occupiedCount(ctx.policy.archive)).toBe(0);
        expect(ctx.records.filter((r) => r.event === 'ArchivePending').map((r) => [r.genomeId, r.kids])).toEqual([
            [100, 1],
        ]);
        proves(ctx, { genomeId: 200, parentA: 100, parentB: 100 });
        expect(occupiedCount(ctx.policy.archive)).toBe(1);
        proves(ctx, { genomeId: 201, parentA: 100, parentB: 100 });
        expect(occupiedCount(ctx.policy.archive)).toBe(1);
    });

    it('drops a held parent when its child dies unproven', () => {
        const ctx = build();
        die(ctx, { slot: 1, genomeId: 100, proven: 1, kids: 1 });
        die(ctx, { slot: 2, genomeId: 200, parent: 100 });
        expect(ctx.records.filter((r) => r.event === 'ArchiveRefused' && r.genomeId === 100)).toHaveLength(1);
        proves(ctx, { genomeId: 201, parentA: 100, parentB: 100 });
        expect(occupiedCount(ctx.policy.archive)).toBe(0);
    });

    it('refuses a parent whose last child died unproven in the tick the parent died', () => {
        const ctx = build();
        const parent = { slot: 1, genomeId: 100, proven: 1, kids: 1 };
        const child = { slot: 2, genomeId: 200, parent: 100 };
        hook(ctx, parent);
        hook(ctx, child);
        record(ctx, parent);
        record(ctx, child);
        expect(occupiedCount(ctx.policy.archive)).toBe(0);
        expect(ctx.records.some((r) => r.event === 'ArchivePending')).toBe(false);
        expect(ctx.records.filter((r) => r.genomeId === 100 && r.event === 'ArchiveRefused')).toHaveLength(1);
    });

    it('counts a mating child for both of its parents', () => {
        const ctx = build();
        die(ctx, { slot: 1, genomeId: 100, proven: 1, kids: 1 });
        die(ctx, { slot: 2, genomeId: 101, proven: 1, kids: 1 });
        proves(ctx, { genomeId: 300, parentA: 100, parentB: 101 });
        expect(occupiedCount(ctx.policy.archive)).toBe(1);
        expect(ctx.policy.archive.ids.filter((/** @type {number} */ id) => id === 100 || id === 101)).toHaveLength(2);
    });
});
