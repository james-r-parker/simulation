import { describe, expect, it } from 'vitest';
import { createFamilySlots } from '../../../js/app/family-slots.js';
import { minPxTable } from '../../../js/app/display-size.js';
import { createInterpolated, interpolateInto } from '../../../js/app/interpolate.js';
import { packRequest } from '../../../js/app/pack/pack-host.js';
import {
    createRequest,
    LENS,
    skippedPacks,
    SLOT,
    takeFrame,
    writeRequest,
    readRequest,
} from '../../../js/app/pack/frame-slots.js';
import { PALETTE_NAMES } from '../../../js/app/prefs.js';
import { createPursuits, findPursuits, pursuitRules } from '../../../js/app/pursuit.js';
import { AGENT_ROW_FLOATS, bucketLanes, meshTable, rigContext } from '../../../js/app/renderer/agent-lanes.js';
import { createAgentRig, rigBucket } from '../../../js/app/renderer/agent-rig.js';
import { createAgentStore, packAgents } from '../../../js/app/renderer/agents-pack.js';
import { startTween, TWEEN } from '../../../js/app/renderer/body-tweens.js';
import { temperatureBands } from '../../../js/app/renderer/colors.js';
import { startDent } from '../../../js/app/renderer/dents.js';
import { beginDeath, trackBodies } from '../../../js/app/renderer/dying.js';
import { packDying } from '../../../js/app/renderer/dying-pack.js';
import { easeJaw } from '../../../js/app/renderer/hunt-cues.js';
import { interleaveRows } from '../../../js/app/renderer/interleave.js';
import { HELD, READER, RELEASED, SLOT_SEQ } from '../../../js/worker/snapshot-ring.js';
import { CAUSES, FIRST, FLAGS, info, publishSnapshot, READY, SECOND, world } from '../helpers/pack-world.js';
import { makeSnapshot } from '../helpers/snapshots.js';

/**
 * Gives the effect stores a dent, a tween and a pending dying body, so the rows differ from the plain ones.
 * @param {ReturnType<typeof world>} w the world
 * @returns {void}
 */
function addEffects(w) {
    const { dents, tweens, dying } = w.stores;
    startDent(dents, { slot: 1, genome: 2 }, { angle: 1, depth: 0.3, tick: 9 });
    startTween(tweens, { slot: 0, genome: 1 }, TWEEN.LUNGE, 9);
    const before = createInterpolated(info.maxAgents);
    interpolateInto(null, makeSnapshot(1, FIRST), 1, before);
    trackBodies(dying, before, 50);
    const after = createInterpolated(info.maxAgents);
    interpolateInto(null, makeSnapshot(2, SECOND), 1, after);
    trackBodies(dying, after, 60);
    beginDeath(dying, { genome: 4, cause: 1, nowMs: 70 });
}

/**
 * @param {Partial<import('../../../js/app/pack/frame-slots.js').Request>} fields request fields
 * @returns {import('../../../js/app/pack/frame-slots.js').Request} a request
 */
function requestOf(fields) {
    const request = createRequest();
    request.family.set([7, -1, 9, -1, -1, -1, -1, -1]);
    return Object.assign(request, { seq: 1, alpha: 0.4, tick: 10.4, nowMs: 1000, zoom: 1.5 }, fields);
}

/**
 * Runs the pack functions in one thread on the same snapshots, request and effect stores: the reference.
 * @param {ReturnType<typeof world>} w the world
 * @param {import('../../../js/app/pack/frame-slots.js').Request} request the request
 * @param {{dtMs: number}} step the frame gap the jaws ease over
 * @returns {{agents: ReturnType<typeof createInterpolated>, rows: Float32Array[], counts: number[]}} what a slot
 *   should hold
 */
function reference(w, request, { dtMs }) {
    const agents = createInterpolated(info.maxAgents);
    const at = (/** @type {number} */ seq) => w.ring.slots[w.ring.header.indexOf(seq, SLOT_SEQ) - SLOT_SEQ];
    interpolateInto(request.prevSeq > 0 ? at(request.prevSeq) : null, at(request.latestSeq), request.alpha, agents);
    const store = createAgentStore(info.maxAgents, info.specs.length, meshTable(info), minPxTable(info));
    Object.assign(store, { ...w.stores, fleeing: new Uint8Array(info.maxAgents) });
    const pursuits = findPursuits(agents, pursuitRules(info), createPursuits());
    for (let k = 0; k < pursuits.count; k++) {
        /** @type {Uint8Array} */ (store.fleeing)[pursuits.prey[k]] = 1;
    }
    const family = createFamilySlots(PALETTE_NAMES[request.palette]);
    family.ids.set(request.family);
    packAgents(agents, store, FLAGS, {
        dtMs,
        zoom: request.zoom,
        slots: family,
        maxVelocity: info.maxVelocity,
        tick: request.tick,
    });
    packDying(w.stores.dying, store, { slots: family, zoom: request.zoom, causeNames: CAUSES, nowMs: request.nowMs });
    const rig = createAgentRig(info.maxAgents, info.specs.length);
    const ctx = rigContext(info, FLAGS, READY.layout.stateBits);
    Object.assign(ctx, {
        timeSec: request.nowMs / 1000,
        tick: request.tick,
        palette: family.palette,
        dents: w.stores.dents,
        temperatureLens: (request.lens & LENS.TEMPERATURE) !== 0 ? temperatureBands(info) : null,
    });
    const rows = [];
    const counts = [];
    for (let b = 0; b < info.specs.length; b++) {
        ctx.hunter = info.specs[b].canHunt;
        rigBucket(/** @type {any} */ (store.buckets[b]), agents, { rig, out: rig.arrays[b], ctx });
        rows.push(new Float32Array(info.maxAgents * AGENT_ROW_FLOATS));
        interleaveRows(bucketLanes(store.buckets[b], rig.arrays[b]), rows[b], store.buckets[b].count);
        counts.push(store.buckets[b].count);
    }
    return { agents, rows, counts };
}

/**
 * @param {ReturnType<typeof world>} w the world
 * @param {{agents: any, rows: Float32Array[], counts: number[]}} want the reference
 * @returns {void}
 */
function expectSlotEquals(w, want) {
    const agents = takeFrame(w.slots);
    expect(agents?.count).toBe(want.agents.count);
    const slot = /** @type {NonNullable<typeof w.slots.current>} */ (w.slots.current);
    const lanes = /** @type {string[]} */ ([
        ...['x', 'y', 'angle', 'size', 'energy', 'temperature', 'speed', 'turn', 'spec', 'lineageId'],
        ...['genomeId', 'slot', 'flags', 'state'],
    ]);
    for (const lane of lanes) {
        const got = /** @type {any} */ (slot.agents)[lane];
        const expected = /** @type {any} */ (want.agents)[lane];
        expect(Array.from(got.subarray(0, want.agents.count))).toEqual(
            Array.from(expected.subarray(0, want.agents.count)),
        );
    }
    for (let b = 0; b < info.specs.length; b++) {
        expect(slot.head[SLOT.BUCKETS + b]).toBe(want.counts[b]);
        const n = want.counts[b] * AGENT_ROW_FLOATS;
        expect(Array.from(slot.rows[b].subarray(0, n))).toEqual(Array.from(want.rows[b].subarray(0, n)));
    }
}

describe('packRequest', () => {
    it('publishes the slot a one-thread run of the same functions makes, dying body and effects included', () => {
        const w = world();
        const prevSeq = publishSnapshot(w, makeSnapshot(10, FIRST));
        const latestSeq = publishSnapshot(w, makeSnapshot(11, SECOND));
        addEffects(w);
        const request = requestOf({
            prevSeq,
            latestSeq,
            lens: LENS.TEMPERATURE,
            palette: 1,
        });
        expect(packRequest(w.host, request)).toBe(true);
        const want = reference(w, request, { dtMs: 0 });
        expect(want.agents.count).toBe(3);
        expect(want.counts.reduce((a, b) => a + b, 0)).toBe(4);
        expect(/** @type {Uint8Array} */ (w.host.store.fleeing)[1]).toBe(1);
        expectSlotEquals(w, want);
        expect(w.slots.taken).toMatchObject({ seq: 1, prevSeq, latestSeq, alpha: 0.4, tick: 10.4, nowMs: 1000 });
    });

    it('packs one snapshot alone and answers a request read back from the request block', () => {
        const w = world();
        const latestSeq = publishSnapshot(w, makeSnapshot(10, FIRST));
        writeRequest(w.slots, requestOf({ latestSeq, prevSeq: 0, alpha: 1 }));
        const request = createRequest();
        readRequest(w.slots, request);
        expect(packRequest(w.host, request)).toBe(true);
        expectSlotEquals(w, reference(w, request, { dtMs: 0 }));
    });

    it('holds the ring from the older snapshot while it packs and releases it after', () => {
        const w = world();
        const prevSeq = publishSnapshot(w, makeSnapshot(10, FIRST));
        const latestSeq = publishSnapshot(w, makeSnapshot(11, SECOND));
        const real = Atomics.store;
        let heldDuring = 0;
        Atomics.store = /** @type {any} */ (
            (/** @type {Int32Array} */ a, /** @type {number} */ i, /** @type {number} */ v) => {
                if (a === w.slots.slots[0].head || a === w.slots.slots[1].head || a === w.slots.slots[2].head) {
                    heldDuring ||= Atomics.load(w.ring.header, HELD + READER.PACK);
                }
                return real(a, i, v);
            }
        );
        try {
            packRequest(w.host, requestOf({ prevSeq, latestSeq }));
        } finally {
            Atomics.store = real;
        }
        expect(heldDuring).toBe(prevSeq);
        expect(Atomics.load(w.ring.header, HELD + READER.PACK)).toBe(RELEASED);
    });

    it('falls back to the default palette for an index it does not know', () => {
        const w = world();
        const latestSeq = publishSnapshot(w, makeSnapshot(10, FIRST));
        packRequest(w.host, requestOf({ latestSeq, prevSeq: 0, palette: 99 }));
        expect(w.host.family.palette).toBe('default');
    });

    it('does nothing for a request with no snapshot yet', () => {
        const w = world();
        expect(packRequest(w.host, requestOf({ latestSeq: 0 }))).toBe(false);
        expect(skippedPacks(w.slots)).toBe(0);
        expect(takeFrame(w.slots)).toBeNull();
    });

    it('skips a request whose snapshot slot is already gone, counts it and publishes nothing', () => {
        const w = world();
        const latestSeq = publishSnapshot(w, makeSnapshot(10, FIRST));
        expect(packRequest(w.host, requestOf({ latestSeq, prevSeq: 99 }))).toBe(false);
        expect(packRequest(w.host, requestOf({ latestSeq: 98, prevSeq: 0 }))).toBe(false);
        expect(skippedPacks(w.slots)).toBe(2);
        expect(takeFrame(w.slots)).toBeNull();
        expect(Atomics.load(w.ring.header, HELD + READER.PACK)).toBe(RELEASED);
    });

    it('skips a request whose snapshot slot is overwritten while it packs, and the next request packs cleanly', () => {
        const w = world();
        const prevSeq = publishSnapshot(w, makeSnapshot(10, FIRST));
        const latestSeq = publishSnapshot(w, makeSnapshot(11, SECOND));
        const real = Atomics.store;
        let done = false;
        Atomics.store = /** @type {any} */ (
            (/** @type {Int32Array} */ a, /** @type {number} */ i, /** @type {number} */ v) => {
                const out = real(a, i, v);
                if (!done && a === w.slots.slots[0].head && v === 0) {
                    done = true;
                    // the sim claims the slot of the newer snapshot and starts writing it
                    for (let k = 0; k < 6; k++) {
                        if (Atomics.load(w.ring.header, SLOT_SEQ + k) === latestSeq) {
                            real(w.ring.header, SLOT_SEQ + k, 0);
                        }
                    }
                }
                return out;
            }
        );
        try {
            expect(packRequest(w.host, requestOf({ prevSeq, latestSeq }))).toBe(false);
        } finally {
            Atomics.store = real;
        }
        expect(skippedPacks(w.slots)).toBe(1);
        expect(takeFrame(w.slots)).toBeNull();
        const next = publishSnapshot(w, makeSnapshot(12, SECOND));
        expect(packRequest(w.host, requestOf({ prevSeq, latestSeq: next, seq: 2 }))).toBe(true);
        expect(takeFrame(w.slots)?.count).toBe(3);
    });

    it('eases the jaws over the gap between the requests it packs, not over a skipped one', () => {
        const w = world();
        const prevSeq = publishSnapshot(w, makeSnapshot(10, FIRST));
        const latestSeq = publishSnapshot(w, makeSnapshot(11, SECOND));
        packRequest(w.host, requestOf({ prevSeq, latestSeq, nowMs: 1000 }));
        const afterFirst = w.host.store.jaw[0];
        expect(afterFirst).toBe(0);
        packRequest(w.host, requestOf({ prevSeq: 99, latestSeq: 99, nowMs: 1010 }));
        packRequest(w.host, requestOf({ prevSeq, latestSeq, nowMs: 1040, seq: 3 }));
        expect(w.host.store.jaw[0]).toBeCloseTo(easeJaw(0, { target: 1, dtMs: 40 }), 6);
        packRequest(w.host, requestOf({ prevSeq, latestSeq, nowMs: 5000, seq: 4 }));
        expect(w.host.store.jaw[0]).toBeCloseTo(
            easeJaw(easeJaw(0, { target: 1, dtMs: 40 }), { target: 1, dtMs: 100 }),
            6,
        );
    });
});
