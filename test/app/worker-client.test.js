import { describe, expect, it } from 'vitest';
import { createWorkerClient, EFFECT_QUEUE_CAPACITY, LOST_LOG_INTERVAL_MS } from '../../js/app/worker-client.js';
import { HELD, READER, RELEASED, RING_SLOTS } from '../../js/worker/snapshot-ring.js';
import { createRingWorld } from './helpers/ring-world.js';

const EFFECTS_AT = 10;
const WORDS = 8;
const BUFFER_BYTES = (EFFECTS_AT + 2 + 4 * WORDS) * 4;

/** The fake sim worker the tests' client talks to; `setup` makes a new one for each test. */
let world = createRingWorld({ effectsAt: EFFECTS_AT, words: WORDS, slotBytes: BUFFER_BYTES });
/** The `ready` message of the current fake world. */
let READY = world.ready();

/**
 * @returns {{client: ReturnType<typeof createWorkerClient>, posted: Record<string, any>[], events: Record<string, any[]>,
 *   clock: {t: number}}}
 *   a client over a fake port, every listener recording what it got
 */
function setup() {
    world = createRingWorld({ effectsAt: EFFECTS_AT, words: WORDS, slotBytes: BUFFER_BYTES });
    READY = world.ready();
    /** @type {Record<string, any>[]} */
    const posted = [];
    /** @type {Record<string, any[]>} */
    const events = {
        ready: [],
        stats: [],
        ticker: [],
        selection: [],
        archive: [],
        log: [],
        error: [],
        failure: [],
        logged: [],
    };
    const clock = { t: 0 };
    const client = createWorkerClient({
        post: (message) => posted.push(message),
        log: (level, event, fields) => events.logged.push({ level, event, fields }),
        now: () => clock.t,
        listeners: {
            onReady: (m) => events.ready.push(m),
            onStats: (s) => events.stats.push(s),
            onTicker: (i) => events.ticker.push(i),
            onSelection: (m) => events.selection.push(m),
            onArchive: (j) => events.archive.push(j),
            onLog: (r) => events.log.push(r),
            onError: (m) => events.error.push(m),
            onFailure: (e) => events.failure.push(e),
        },
    });
    return { client, posted, events, clock };
}

/**
 * @param {number} tick the snapshot's tick
 * @param {{epoch?: number, effectTicks?: number[]}} [options] the epoch and the tick of each effect to carry
 * @returns {Record<string, any>} a `snapshot` message for a slot the fake worker just published
 */
function snapshot(tick, options = {}) {
    const message = world.publish(tick, options);
    if (message === null) {
        throw new Error('the fake ring is full');
    }
    return message;
}

describe('the policy', () => {
    it('asks for the policy it was created with on init and on reset, and for none by default', () => {
        /** @type {Record<string, any>[]} */
        const posted = [];
        const named = createWorkerClient({ post: (message) => posted.push(message), policy: 'map-elites-v6' });
        named.init(1, {});
        named.reset(2, {});
        const plain = createWorkerClient({ post: (message) => posted.push(message) });
        plain.init(3, {});
        expect(posted.map((m) => m.policy)).toEqual(['map-elites-v6', 'map-elites-v6', undefined]);
        expect('policy' in posted[2]).toBe(false);
    });
});

describe('the commands', () => {
    it('posts each command with its fields', () => {
        const { client, posted } = setup();
        client.init(7, { maxAgents: 10 });
        client.setSpeed(120);
        client.pause();
        client.step(3);
        client.resume();
        client.select(42);
        client.setLenses(true);
        client.exportArchive();
        client.flush();
        expect(posted).toEqual([
            { type: 'init', seed: 7, config: { maxAgents: 10 } },
            { type: 'setSpeed', ticksPerSecond: 120 },
            { type: 'pause' },
            { type: 'step', ticks: 3 },
            { type: 'resume' },
            { type: 'select', genomeId: 42 },
            { type: 'setLenses', rays: true },
            { type: 'exportArchive' },
            { type: 'flush' },
        ]);
    });

    it('sends step only while paused', () => {
        const { client, posted } = setup();
        expect(client.step(2)).toBe(false);
        expect(posted).toEqual([]);
        client.pause();
        expect(client.step(2)).toBe(true);
        expect(posted.at(-1)).toEqual({ type: 'step', ticks: 2 });
    });
});

describe('pause acknowledgement', () => {
    const PAUSED = { type: 'paused', epoch: 1, tick: 12 };

    it('is not settled until the worker acknowledges, so a snapshot in flight cannot move a shown paused tick', () => {
        const { client } = setup();
        client.init(1, {});
        client.handle(READY);
        client.handle(snapshot(10));
        client.pause();
        expect(client.paused).toBe(true);
        expect(client.pausedAck).toBe(false);
        client.handle(snapshot(11));
        client.handle(snapshot(12));
        expect(client.pausedAck).toBe(false);
        client.handle(PAUSED);
        expect(client.pausedAck).toBe(true);
        expect(client.latest?.tick).toBe(12);
    });

    it('ignores an acknowledgement after resume, and waits for the last of several pauses', () => {
        const { client } = setup();
        client.init(1, {});
        client.handle(READY);
        client.pause();
        client.resume();
        client.handle(PAUSED);
        expect(client.pausedAck).toBe(false);
        client.pause();
        client.pause();
        client.handle(PAUSED);
        expect(client.pausedAck).toBe(false);
        client.handle(PAUSED);
        expect(client.pausedAck).toBe(true);
        client.resume();
        expect(client.pausedAck).toBe(false);
    });
});

describe('ready and the epoch', () => {
    it('takes the epoch and layout from ready and calls onReady', () => {
        const { client, events } = setup();
        client.init(1, {});
        client.handle({ ...READY, epoch: 1 });
        expect(client.epoch).toBe(1);
        expect(client.ready.layout.effectsOffset).toBe(EFFECTS_AT);
        expect(events.ready).toHaveLength(1);
    });

    it('drops a snapshot, field and stats of an older epoch and gives the field buffer back', () => {
        const { client, posted, events } = setup();
        client.init(1, {});
        client.handle(READY);
        client.reset(2, {});
        posted.length = 0;
        const old = snapshot(5, { epoch: 1 });
        client.handle(old);
        client.handle({ type: 'field', epoch: 1, tick: 5, buffer: new ArrayBuffer(8) });
        client.handle({ type: 'stats', epoch: 1, stats: { tick: 5, ticksPerSecond: 60 } });
        expect(client.latest).toBeNull();
        expect(client.field).toBeNull();
        expect(events.stats).toEqual([]);
        expect(client.droppedMessages).toBe(3);
        expect(posted.map((m) => m.pool)).toEqual(['field']);
    });

    it('accepts the new world after reset, releasing its hold on the old ring', () => {
        const { client, posted } = setup();
        client.init(1, {});
        client.handle(READY);
        client.handle(snapshot(1));
        client.handle(snapshot(2));
        const oldRing = world.ring;
        expect(Atomics.load(oldRing.header, HELD + READER.MAIN)).toBe(1);
        posted.length = 0;
        client.reset(2, {});
        expect(posted.map((m) => m.type)).toEqual(['reset']);
        expect(Atomics.load(oldRing.header, HELD + READER.MAIN)).toBe(RELEASED);
        expect(client.latest).toBeNull();
        const next = createRingWorld({ effectsAt: EFFECTS_AT, words: WORDS, slotBytes: BUFFER_BYTES });
        client.handle(next.ready(2));
        client.handle(/** @type {any} */ (next.publish(1, { epoch: 2 })));
        expect(client.latest?.epoch).toBe(2);
        expect(client.latest?.u32.buffer).toBe(next.memory);
    });

    it('drops a snapshot that arrives before ready', () => {
        const { client, posted } = setup();
        client.handle(snapshot(1));
        expect(client.latest).toBeNull();
        expect(client.droppedMessages).toBe(1);
        expect(posted).toHaveLength(0);
    });
});

describe('snapshots', () => {
    it('holds the two newest, follows the published sequence and holds the ring from prev', () => {
        const { client, posted } = setup();
        client.init(1, {});
        client.handle(READY);
        expect(Atomics.load(world.ring.header, HELD + READER.MAIN)).toBe(1);
        const held = () => Atomics.load(world.ring.header, HELD + READER.MAIN);
        client.handle(snapshot(1));
        expect(client.prev).toBeNull();
        expect(held()).toBe(1);
        client.handle(snapshot(2));
        expect([client.prev?.seq, client.latest?.seq, held()]).toEqual([1, 2, 1]);
        client.handle(snapshot(3));
        expect([client.prev?.tick, client.latest?.tick, held()]).toEqual([2, 3, 2]);
        client.handle(snapshot(4));
        expect([client.prev?.tick, client.latest?.tick, held()]).toEqual([3, 4, 3]);
        expect(posted.filter((m) => m.type === 'returnBuffer')).toHaveLength(0);
    });

    it('never lets the writer overwrite the held pair, however many snapshots it publishes', () => {
        const { client } = setup();
        client.init(1, {});
        client.handle(READY);
        for (let tick = 1; tick <= 40; tick++) {
            const message = world.publish(tick);
            if (message !== null) {
                client.handle(message);
            }
            expect(client.latest?.u32[0]).toBe(client.latest?.tick);
            if (client.prev !== null) {
                expect(client.prev.u32[0]).toBe(client.prev.tick);
            }
        }
        expect(client.latest?.tick).toBeGreaterThan(30);
    });

    it('reuses one Snapshot object per slot and sets seq, epoch and tick on each publish', () => {
        const { client } = setup();
        client.init(1, {});
        client.handle(READY);
        /** @type {any[]} */
        const seen = [];
        for (let tick = 1; tick <= RING_SLOTS + 2; tick++) {
            client.handle(snapshot(tick));
            seen.push(client.latest);
        }
        expect(client.latest?.seq).toBe(RING_SLOTS + 2);
        expect(seen[0]).toBe(seen[RING_SLOTS]);
        expect(seen[0].seq).toBe(RING_SLOTS + 1);
        expect(client.latest).not.toBe(client.prev);
    });

    it('reads the tick and gives views over the shared ring', () => {
        const { client } = setup();
        client.init(1, {});
        client.handle(READY);
        client.handle(snapshot(9));
        expect(client.latest?.u32[0]).toBe(9);
        expect(client.latest?.f32.buffer).toBe(world.memory);
        expect(client.latest?.seq).toBe(1);
    });

    it('logs SnapshotLost once per 5 s and drops a snapshot whose slot is gone', () => {
        const { client, events, clock } = setup();
        client.init(1, {});
        client.handle(READY);
        const stale = snapshot(1);
        for (let tick = 2; tick <= RING_SLOTS + 4; tick++) {
            // The writer reuses slots at will: it sees no hold once the client has released it.
            Atomics.store(world.ring.header, HELD + READER.MAIN, RELEASED);
            snapshot(tick);
        }
        client.handle(stale);
        expect(client.latest).toBeNull();
        expect(events.logged).toEqual([{ level: 'warn', event: 'SnapshotLost', fields: { seq: 1, tick: 1 } }]);
        clock.t += LOST_LOG_INTERVAL_MS - 1;
        client.handle(stale);
        expect(events.logged).toHaveLength(1);
        clock.t += 1;
        client.handle(stale);
        expect(events.logged).toHaveLength(2);
        expect(events.failure).toEqual([]);
    });

    it('drops a lost snapshot quietly when no log is wired', () => {
        const client = createWorkerClient({ post: () => {} });
        world = createRingWorld({ effectsAt: EFFECTS_AT, words: WORDS, slotBytes: BUFFER_BYTES });
        client.init(1, {});
        client.handle(world.ready());
        client.handle({ type: 'snapshot', epoch: 1, seq: 9, slot: 0, tick: 9 });
        expect(client.latest).toBeNull();
    });

    it('queues the effects of three snapshots that arrive between frames once each, in tick order', () => {
        const { client } = setup();
        client.init(1, {});
        client.handle(READY);
        client.handle(snapshot(10, { effectTicks: [8, 9] }));
        client.handle(snapshot(12, { effectTicks: [10, 11] }));
        client.handle(snapshot(14, { effectTicks: [12] }));
        const queue = client.effects;
        expect(queue?.count).toBe(5);
        const ticks = Array.from(
            { length: queue?.count ?? 0 },
            (_, i) => queue?.u32[((queue.start + i) % EFFECT_QUEUE_CAPACITY) * WORDS + 1],
        );
        expect(ticks).toEqual([8, 9, 10, 11, 12]);
    });

    it('drops the oldest effects when the queue is full and counts them', () => {
        const { client } = setup();
        client.init(1, {});
        const records = EFFECT_QUEUE_CAPACITY + 3;
        const big = createRingWorld({ effectsAt: 4, words: 2, slotBytes: (4 + 2 + records * 2) * 4 });
        client.handle(big.ready());
        const effectTicks = Array.from({ length: records }, (_, i) => i);
        client.handle(/** @type {any} */ (big.publish(1, { effectTicks })));
        const queue = /** @type {any} */ (client.effects);
        expect(queue.count).toBe(EFFECT_QUEUE_CAPACITY);
        expect(queue.dropped).toBe(3);
        expect(queue.u32[queue.start * 2 + 1]).toBe(3);
    });
});

describe('fields', () => {
    it('holds the newest field and gives the unread one back when a new one arrives', () => {
        const { client, posted } = setup();
        client.init(1, {});
        client.handle(READY);
        posted.length = 0;
        const first = new ArrayBuffer(16);
        const second = new ArrayBuffer(16);
        client.handle({ type: 'field', epoch: 1, tick: 1, buffer: first });
        client.handle({ type: 'field', epoch: 1, tick: 2, buffer: second });
        expect(posted).toEqual([{ type: 'returnBuffer', pool: 'field', buffer: first }]);
        expect(client.field?.tick).toBe(2);
    });

    it('gives the field back on releaseField and cycles ten in a row', () => {
        const { client, posted } = setup();
        client.init(1, {});
        client.handle(READY);
        posted.length = 0;
        for (let i = 0; i < 10; i++) {
            client.handle({ type: 'field', epoch: 1, tick: i, buffer: new ArrayBuffer(16) });
            client.releaseField();
        }
        expect(client.field).toBeNull();
        expect(posted.filter((m) => m.pool === 'field')).toHaveLength(10);
        client.releaseField();
        expect(posted).toHaveLength(10);
    });
});

describe('the other messages', () => {
    it('routes stats, ticker, selection, archive, log and error to their listeners', () => {
        const { client, events } = setup();
        client.init(1, {});
        client.handle(READY);
        client.handle({ type: 'stats', epoch: 1, stats: { tick: 3, ticksPerSecond: 60 } });
        client.handle({ type: 'ticker', items: [{ tick: 1, kind: 'elite', text: 't' }] });
        client.handle({ type: 'selection', genomeId: 4, state: 'gone' });
        client.handle({ type: 'archive', json: '{}' });
        client.handle({ type: 'log', record: { event: 'x' } });
        client.handle({ type: 'error', message: 'm', stack: 's', seed: 1, tick: 2, configHash: 'h' });
        expect(events.stats).toEqual([{ tick: 3, ticksPerSecond: 60 }]);
        expect(client.stats).toEqual({ tick: 3, ticksPerSecond: 60 });
        expect(events.ticker[0]).toHaveLength(1);
        expect(events.selection[0]).toMatchObject({ genomeId: 4 });
        expect(events.archive).toEqual(['{}']);
        expect(events.log).toEqual([{ event: 'x' }]);
        expect(events.error[0]).toMatchObject({ message: 'm' });
        expect(events.failure).toEqual([]);
    });

    it('sends a message that fails validation to onFailure instead of throwing', () => {
        const { client, events } = setup();
        expect(() => client.handle({ type: 'snapshot', epoch: 1, tick: 1 })).not.toThrow();
        expect(() => client.handle({ type: 'pause' })).not.toThrow();
        expect(events.failure.map((e) => e.message)).toEqual([
            expect.stringContaining('snapshot.seq'),
            expect.stringContaining('toWorker message'),
        ]);
    });

    it('wraps a listener that throws a non-Error value before telling onFailure', () => {
        /** @type {Error[]} */
        const failures = [];
        const client = createWorkerClient({
            post: () => {},
            listeners: {
                onArchive: () => {
                    throw 'plain text';
                },
                onFailure: (e) => failures.push(e),
            },
        });
        client.handle({ type: 'archive', json: '{}' });
        expect(failures).toHaveLength(1);
        expect(failures[0]).toBeInstanceOf(Error);
        expect(failures[0].message).toBe('plain text');
    });
});
