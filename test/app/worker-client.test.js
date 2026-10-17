import { describe, expect, it } from 'vitest';
import { createWorkerClient, EFFECT_QUEUE_CAPACITY } from '../../js/app/worker-client.js';

const EFFECTS_AT = 10;
const WORDS = 8;
const BUFFER_BYTES = (EFFECTS_AT + 2 + 4 * WORDS) * 4;

const READY = {
    type: 'ready',
    epoch: 1,
    configHash: 'c',
    rulesHash: 'r',
    layout: { effectsOffset: EFFECTS_AT, effectWords: WORDS },
    info: {},
    labels: {},
    policy: 'p',
    seed: 1,
};

/**
 * @returns {{client: ReturnType<typeof createWorkerClient>, posted: Record<string, any>[], events: Record<string, any[]>}}
 *   a client over a fake port, every listener recording what it got
 */
function setup() {
    /** @type {Record<string, any>[]} */
    const posted = [];
    /** @type {Record<string, any[]>} */
    const events = { ready: [], stats: [], ticker: [], selection: [], archive: [], log: [], error: [], failure: [] };
    const client = createWorkerClient({
        post: (message) => posted.push(message),
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
    return { client, posted, events };
}

/**
 * @param {number} tick the snapshot's tick
 * @param {{epoch?: number, effectTicks?: number[]}} [options] the epoch and the tick of each effect to carry
 * @returns {Record<string, any>} a `snapshot` message
 */
function snapshot(tick, { epoch = 1, effectTicks = [] } = {}) {
    const buffer = new ArrayBuffer(BUFFER_BYTES);
    const u32 = new Uint32Array(buffer);
    u32[0] = tick;
    u32[EFFECTS_AT] = effectTicks.length;
    effectTicks.forEach((effectTick, i) => {
        u32[EFFECTS_AT + 2 + i * WORDS] = 1;
        u32[EFFECTS_AT + 2 + i * WORDS + 1] = effectTick;
    });
    return { type: 'snapshot', epoch, buffer, tick };
}

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

describe('ready and the epoch', () => {
    it('takes the epoch and layout from ready and calls onReady', () => {
        const { client, events } = setup();
        client.init(1, {});
        client.handle({ ...READY, epoch: 1 });
        expect(client.epoch).toBe(1);
        expect(client.ready.layout.effectsOffset).toBe(EFFECTS_AT);
        expect(events.ready).toHaveLength(1);
    });

    it('drops a snapshot, field and stats of an older epoch and gives the buffers back', () => {
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
        expect(posted.map((m) => m.pool)).toEqual(['snapshot', 'field']);
    });

    it('accepts the new world after reset and gives back the old held buffers at the reset', () => {
        const { client, posted } = setup();
        client.init(1, {});
        client.handle(READY);
        client.handle(snapshot(1));
        client.handle(snapshot(2));
        posted.length = 0;
        client.reset(2, {});
        expect(posted.map((m) => m.type)).toEqual(['returnBuffer', 'returnBuffer', 'reset']);
        client.handle({ ...READY, epoch: 2 });
        client.handle(snapshot(1, { epoch: 2 }));
        expect(client.latest?.epoch).toBe(2);
    });

    it('drops a snapshot that arrives before ready', () => {
        const { client, posted } = setup();
        client.handle(snapshot(1));
        expect(client.latest).toBeNull();
        expect(posted).toHaveLength(1);
    });
});

describe('snapshots', () => {
    it('holds the two newest and returns the older buffer at once on each new one', () => {
        const { client, posted } = setup();
        client.init(1, {});
        client.handle(READY);
        const [a, b, c, d] = [snapshot(1), snapshot(2), snapshot(3), snapshot(4)];
        client.handle(a);
        client.handle(b);
        expect(posted.filter((m) => m.type === 'returnBuffer')).toHaveLength(0);
        client.handle(c);
        expect(posted.at(-1)).toMatchObject({ type: 'returnBuffer', pool: 'snapshot', buffer: a.buffer });
        client.handle(d);
        expect(posted.at(-1)).toMatchObject({ pool: 'snapshot', buffer: b.buffer });
        expect(client.prev?.tick).toBe(3);
        expect(client.latest?.tick).toBe(4);
    });

    it('reads the tick and gives views over the held buffer', () => {
        const { client } = setup();
        client.init(1, {});
        client.handle(READY);
        client.handle(snapshot(9));
        expect(client.latest?.u32[0]).toBe(9);
        expect(client.latest?.f32.buffer).toBe(client.latest?.buffer);
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
        client.handle(READY);
        const big = { ...READY, layout: { effectsOffset: 4, effectWords: 2 } };
        client.handle(big);
        const records = EFFECT_QUEUE_CAPACITY + 3;
        const buffer = new ArrayBuffer((4 + 2 + records * 2) * 4);
        const u32 = new Uint32Array(buffer);
        u32[4] = records;
        for (let i = 0; i < records; i++) {
            u32[6 + i * 2 + 1] = i;
        }
        client.handle({ type: 'snapshot', epoch: 1, buffer, tick: 1 });
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
            expect.stringContaining('snapshot.buffer'),
            expect.stringContaining('toWorker message'),
        ]);
    });
});
