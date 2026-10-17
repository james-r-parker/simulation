import { describe, expect, it } from 'vitest';
import { createSimLog } from '../../js/sim/log.js';
import { createBufferPool } from '../../js/worker/buffer-pool.js';
import { emitSnapshot, emitStats, warnLimited, WARN_INTERVAL_MS } from '../../js/worker/host-output.js';
import { buildRun, tickOnce } from '../../js/worker/host-world.js';
import { createPacer, markSnapshot } from '../../js/worker/pacing.js';
import { noisePolicy, SMALL_CONFIG } from './helpers/host-harness.js';

/**
 * @returns {{host: Record<string, any>, sent: Record<string, any>[]}} a host state over a run at tick 0, a snapshot
 *   pool of 2 and a field pool of 1, with a clock the test sets through `host.clock`
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
        snapshotPool: createBufferPool({ count: 2, bytes: run.layout.bytes }),
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
    it('sends the epoch, tick and a transferred buffer, then holds the next until the gap has passed', () => {
        const { host, sent } = setup();
        expect(emitSnapshot(host, false)).toBe(true);
        expect(sent[0]).toMatchObject({ type: 'snapshot', epoch: 4, tick: 0 });
        expect(emitSnapshot(host, false)).toBe(false);
        expect(emitSnapshot(host, true)).toBe(true);
    });

    it('sends nothing when no buffer is held, and warns', () => {
        const { host, sent } = setup();
        emitSnapshot(host, true);
        emitSnapshot(host, true);
        expect(emitSnapshot(host, true)).toBe(false);
        expect(sent.filter((m) => m.type === 'snapshot')).toHaveLength(2);
        expect(sent.some((m) => m.record?.event === 'SnapshotSkipped')).toBe(true);
    });

    it('writes the ray part only when the lens is on', () => {
        const { host, sent } = setup();
        emitSnapshot(host, true);
        host.rays = true;
        emitSnapshot(host, true);
        const words = sent.filter((m) => m.type === 'snapshot').map((m) => new Uint32Array(m.buffer)[5]);
        expect(words).toEqual([0, 8]);
    });

    it('warns once about dropped effects and writes the count in the effects header', () => {
        const { host, sent } = setup();
        host.run.effects.dropped = 7;
        emitSnapshot(host, true);
        expect(sent.filter((m) => m.record?.event === 'EffectsDropped')).toHaveLength(1);
        const u32 = new Uint32Array(/** @type {any} */ (sent.find((m) => m.type === 'snapshot')).buffer);
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
