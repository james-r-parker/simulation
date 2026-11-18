import { describe, expect, it } from 'vitest';
import { createSimLog } from '../../js/sim/log.js';
import { createBufferPool } from '../../js/worker/buffer-pool.js';
import {
    createRingViews,
    holdFrom,
    PUBLISHED,
    READER,
    releaseAll,
    ringBytes,
    SLOT_TICK,
} from '../../js/worker/snapshot-ring.js';
import { emitSnapshot, emitStats, warnLimited, WARN_INTERVAL_MS } from '../../js/worker/host-output.js';
import { buildRun, tickOnce } from '../../js/worker/host-world.js';
import { createPacer, markSnapshot } from '../../js/worker/pacing.js';
import { noisePolicy, SMALL_CONFIG } from './helpers/host-harness.js';

/**
 * @param {number} slotBytes the bytes of one snapshot
 * @returns {import('../../js/worker/snapshot-ring.js').Ring} a ring nobody holds
 */
function freshRing(slotBytes) {
    const ring = createRingViews(new SharedArrayBuffer(ringBytes(slotBytes)), slotBytes);
    releaseAll(ring);
    return ring;
}

/**
 * @returns {{host: Record<string, any>, sent: Record<string, any>[]}} a host state over a run at tick 0, a snapshot
 *   ring of the run's slot size and a field pool of 1, with a clock the test sets through `host.clock`
 */
function setup() {
    /** @type {Record<string, any>[]} */
    const sent = [];
    const clock = { t: 1000 };
    const log = createSimLog((record) => sent.push({ type: 'log', record }), { level: 'info' });
    const run = buildRun({ seed: 2, overrides: SMALL_CONFIG, createPolicy: noisePolicy, log });
    const host = {
        clock,
        now: () => clock.t,
        post: (/** @type {any} */ message) => sent.push(message),
        log,
        run,
        epoch: 4,
        rays: false,
        selection: null,
        ticksPerSecond: 60,
        pacer: createPacer(),
        ring: freshRing(run.layout.bytes),
        fieldPool: createBufferPool({ count: 1, bytes: run.layout.fieldBytes ?? 16 * 10 * 3 * 4 }),
        window: { startAt: 0, ticks: 0, workMs: 0 },
        lastWarn: new Map(),
    };
    return { host, sent };
}

describe('warnLimited', () => {
    it('logs an event once per 10 s and again after', () => {
        const { host, sent } = setup();
        expect(warnLimited(host, 'FieldSkipped', { tick: 1 })).toBe(true);
        host.clock.t += WARN_INTERVAL_MS - 1;
        expect(warnLimited(host, 'FieldSkipped', { tick: 2 })).toBe(false);
        expect(warnLimited(host, 'SnapshotSkipped', { tick: 2 })).toBe(true);
        host.clock.t += 1;
        expect(warnLimited(host, 'FieldSkipped', { tick: 3 })).toBe(true);
        expect(sent.filter((m) => m.record.event === 'FieldSkipped')).toHaveLength(2);
    });
});

describe('emitSnapshot', () => {
    it('writes a ring slot and sends the epoch, sequence, slot and tick, then holds the next until the gap has passed', () => {
        const { host, sent } = setup();
        expect(emitSnapshot(host, false)).toBe(true);
        expect(sent[0]).toEqual({ type: 'snapshot', epoch: 4, seq: 1, slot: expect.any(Number), tick: 0 });
        expect(sent[0]).not.toHaveProperty('buffer');
        expect(host.ring.header[PUBLISHED]).toBe(1);
        expect(host.ring.header[SLOT_TICK + sent[0].slot]).toBe(0);
        expect(emitSnapshot(host, false)).toBe(false);
        expect(emitSnapshot(host, true)).toBe(true);
        expect(sent.filter((m) => m.type === 'snapshot').map((m) => m.seq)).toEqual([1, 2]);
    });

    it('writes the world into the slot it names', () => {
        const { host, sent } = setup();
        for (let t = 0; t < 3; t++) {
            tickOnce(host.run);
        }
        emitSnapshot(host, true);
        expect(host.ring.slots[sent[0].slot].u32[0]).toBe(3);
    });

    it('sends nothing when every slot is held, and warns', () => {
        const { host, sent } = setup();
        holdFrom(host.ring, READER.MAIN, 1);
        for (let i = 0; i < 6; i++) {
            expect(emitSnapshot(host, true)).toBe(true);
        }
        expect(emitSnapshot(host, true)).toBe(false);
        expect(sent.filter((m) => m.type === 'snapshot')).toHaveLength(6);
        expect(sent.filter((m) => m.record?.event === 'SnapshotSkipped')).toHaveLength(1);
        holdFrom(host.ring, READER.MAIN, 4);
        expect(emitSnapshot(host, true)).toBe(true);
    });

    it('keeps the effects in the log for the next snapshot when a snapshot is skipped', () => {
        const { host, sent } = setup();
        holdFrom(host.ring, READER.MAIN, 1);
        for (let i = 0; i < 6; i++) {
            emitSnapshot(host, true);
        }
        host.run.effects.count = 2;
        expect(emitSnapshot(host, true)).toBe(false);
        expect(host.run.effects.count).toBe(2);
        holdFrom(host.ring, READER.MAIN, 5);
        expect(emitSnapshot(host, true)).toBe(true);
        const last = /** @type {any} */ (sent.filter((m) => m.type === 'snapshot').at(-1));
        expect(host.ring.slots[last.slot].u32[host.run.layout.effectsOffset]).toBe(2);
        expect(host.run.effects.count).toBe(0);
    });

    it('writes the ray part only when the lens is on', () => {
        const { host, sent } = setup();
        emitSnapshot(host, true);
        host.rays = true;
        emitSnapshot(host, true);
        const words = sent.filter((m) => m.type === 'snapshot').map((m) => host.ring.slots[m.slot].u32[5]);
        expect(words).toEqual([0, 8]);
    });

    it('warns once about dropped effects and writes the count in the effects header', () => {
        const { host, sent } = setup();
        host.run.effects.dropped = 7;
        emitSnapshot(host, true);
        expect(sent.filter((m) => m.record?.event === 'EffectsDropped')).toHaveLength(1);
        const { u32 } = host.ring.slots[/** @type {any} */ (sent.find((m) => m.type === 'snapshot')).slot];
        expect(u32[host.run.layout.effectsOffset + 1]).toBe(7);
    });
});

describe('emitStats', () => {
    it('posts stats and a field, empties the observer logs and starts a new window', () => {
        const { host, sent } = setup();
        for (let t = 0; t < 30; t++) {
            tickOnce(host.run);
        }
        host.window = { startAt: 1000 - 500, ticks: 30, workMs: 15 };
        host.run.observer.deathCount = 3;
        emitStats(host);
        const stats = /** @type {any} */ (sent.find((m) => m.type === 'stats'));
        expect(stats.stats).toMatchObject({
            tick: 30,
            ticksPerSecond: 60,
            workerMsPerTick: 0.5,
            requestedTicksPerSecond: 60,
        });
        expect(sent.some((m) => m.type === 'field' && m.tick === 30)).toBe(true);
        expect(host.run.observer.deathCount).toBe(0);
        expect(host.window).toEqual({ startAt: 1000, ticks: 0, workMs: 0 });
    });

    it('posts a ticker message only when there are items, and skips the field when none is free', () => {
        const { host, sent } = setup();
        emitStats(host);
        emitStats(host);
        expect(sent.filter((m) => m.type === 'ticker')).toHaveLength(0);
        expect(sent.filter((m) => m.type === 'field')).toHaveLength(1);
        expect(sent.some((m) => m.record?.event === 'FieldSkipped')).toBe(true);
        markSnapshot(host.pacer, 0);
    });
});
