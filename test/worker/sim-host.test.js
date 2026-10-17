import { describe, expect, it } from 'vitest';
import { hashWorld } from '../../js/sim/world-hash.js';
import { createHarness, noisePolicy, SMALL_CONFIG } from './helpers/host-harness.js';

/**
 * @param {Parameters<typeof createHarness>[0]} [options] harness options
 * @returns {import('./helpers/host-harness.js').Harness} a harness that has been sent `init` with the small world
 */
function started(options) {
    const h = createHarness(options);
    h.send({ type: 'init', seed: 5, config: SMALL_CONFIG });
    return h;
}

/**
 * Runs slices of `ms` each until the world reaches `tick`.
 * @param {import('./helpers/host-harness.js').Harness} h the harness
 * @param {number} tick the tick to reach
 * @param {number} [ms] wall time per slice
 * @returns {void}
 */
function runTo(h, tick, ms = 20) {
    for (let i = 0; i < 100000 && h.run().world.tick < tick; i++) {
        h.advance(ms);
    }
}

describe('init', () => {
    it('posts ready with the epoch, hashes, layout, info, labels, policy and seed, and logs WorkerStarted', () => {
        const h = started();
        const [ready] = h.of('ready');
        expect(ready).toMatchObject({ epoch: 1, policy: 'noise', seed: 5 });
        expect(ready.configHash).toMatch(/^[0-9a-f]{16}$/);
        expect(ready.rulesHash).toMatch(/^[0-9a-f]{16}$/);
        expect(ready.info).toMatchObject({ worldWidth: 1600, worldHeight: 1000, maxAgents: 40, ticksPerSecond: 60 });
        expect(ready.info.specs).toHaveLength(5);
        expect(ready.layout).toMatchObject({ agentStride: 12, effectKinds: { BORN: 1 }, flags: { JAW_OPEN: 1024 } });
        expect(ready.labels.outputs).toHaveLength(8);
        expect(h.of('log').map((m) => m.record.event)).toContain('WorkerStarted');
    });

    it('schedules the first slice for when the first tick is due', () => {
        const h = started();
        expect(h.timers.fn).not.toBeNull();
        expect(h.timers.delay).toBeCloseTo(1000 / 60, 6);
    });

    it('rejects a second init and a message before init by stopping with an error', () => {
        const h = createHarness();
        h.send({ type: 'pause' });
        expect(h.of('error')[0].message).toMatch(/no world yet/);
        const g = started();
        g.send({ type: 'init', seed: 1, config: {} });
        expect(g.of('error')[0].message).toMatch(/already initialised/);
    });
});

describe('slices', () => {
    it('runs the ticks due and posts a snapshot of that tick for the current epoch', () => {
        const h = started();
        h.advance(0);
        h.advance(50);
        const snapshots = h.of('snapshot');
        expect(snapshots.length).toBeGreaterThan(0);
        const last = snapshots.at(-1);
        expect(last).toMatchObject({ epoch: 1, tick: h.run().world.tick });
        expect(new Uint32Array(last.buffer)[0]).toBe(last.tick);
        expect(h.run().world.tick).toBe(3);
    });

    it('posts snapshots no closer than 8 ms apart', () => {
        const h = started();
        h.advance(0);
        h.advance(20);
        const count = h.of('snapshot').length;
        h.advance(4);
        h.advance(4);
        expect(h.of('snapshot').length).toBe(count);
        h.advance(8);
        expect(h.of('snapshot').length).toBe(count + 1);
    });

    it('uses different buffers for consecutive snapshots when the main thread keeps two', () => {
        const h = started({ keep: 2 });
        h.advance(0);
        for (let i = 0; i < 5; i++) {
            h.advance(30);
        }
        const buffers = h.of('snapshot').map((m) => m.buffer);
        expect(buffers.length).toBeGreaterThanOrEqual(3);
        expect(buffers[1]).not.toBe(buffers[0]);
        expect(buffers[2]).not.toBe(buffers[1]);
    });

    it('skips snapshots once the pool is dry, logs it once, and resumes after a return', () => {
        const h = started({ keep: Infinity });
        h.advance(0);
        for (let i = 0; i < 12; i++) {
            h.advance(30);
        }
        expect(h.of('snapshot')).toHaveLength(3);
        expect(h.of('log').filter((m) => m.record.event === 'SnapshotSkipped')).toHaveLength(1);
        const tick = h.run().world.tick;
        expect(tick).toBeGreaterThan(8);
        h.send({
            type: 'returnBuffer',
            pool: 'snapshot',
            buffer: new ArrayBuffer(h.of('snapshot')[0].buffer.byteLength),
        });
        h.advance(30);
        expect(h.of('snapshot')).toHaveLength(4);
    });

    it('schedules the next slice by what is owed: at once while ticks are owed, later when not', () => {
        const h = started();
        h.advance(0);
        h.advance(200);
        expect(h.timers.delay).toBe(0);
        h.advance(100);
        h.advance(0);
        expect(h.timers.delay).toBeGreaterThan(0);
    });
});

describe('stats and fields', () => {
    it('posts stats and a field every 250 ms of wall time', () => {
        const h = started();
        runTo(h, 100, 20);
        const stats = h.of('stats');
        expect(stats.length).toBeGreaterThanOrEqual(1);
        expect(stats[0]).toMatchObject({ epoch: 1 });
        expect(stats[0].stats).toMatchObject({ requestedTicksPerSecond: 60, seed: 5, policy: 'noise' });
        expect(h.of('field')).toHaveLength(stats.length);
        const field = h.of('field')[0];
        expect(field.buffer.byteLength).toBe(h.of('ready')[0].layout.fieldBytes);
    });

    it('delivers ten fields in a row, since the client returns each one at once', () => {
        const h = started();
        runTo(h, 600, 25);
        expect(h.of('field').length).toBeGreaterThanOrEqual(10);
        expect(h.of('log').filter((m) => m.record.event === 'FieldSkipped')).toHaveLength(0);
    });
});

describe('errors', () => {
    it('posts error with the seed, tick and configHash, then stops stepping and ignores messages', () => {
        const createPolicy = () => {
            /** @type {Record<string, any>} */
            const policy = { ...noisePolicy(), onEvent: () => undefined };
            let calls = 0;
            policy.afterStep = () => {
                calls += 1;
                if (calls === 4) {
                    throw new Error('boom');
                }
            };
            return policy;
        };
        const h = started({ createPolicy });
        runTo(h, 10);
        const [error] = h.of('error');
        expect(error).toMatchObject({ message: 'boom', seed: 5, tick: 4 });
        expect(error.configHash).toBe(h.of('ready')[0].configHash);
        expect(h.of('log').some((m) => m.record.event === 'WorkerError')).toBe(true);
        const before = h.run().world.tick;
        expect(h.advance(100)).toBe(false);
        h.send({ type: 'resume' });
        h.advance(100);
        expect(h.run().world.tick).toBe(before);
    });

    it('rejects a step while running by erroring on the protocol check', () => {
        const h = started();
        h.send({ type: 'step', ticks: 3 });
        expect(h.of('error')[0].message).toMatch(/only while paused/);
    });

    it('reports a bad config at init as an error', () => {
        const h = createHarness();
        h.send({ type: 'init', seed: 1, config: { maxAgents: -1 } });
        expect(h.of('error')).toHaveLength(1);
        expect(h.of('ready')).toHaveLength(0);
    });
});

describe('pause, resume and step', () => {
    it('schedules nothing while paused and does not pay back the pause on resume', () => {
        const h = started();
        runTo(h, 5);
        h.send({ type: 'pause' });
        h.advance(10);
        expect(h.timers.fn).toBeNull();
        const tick = h.run().world.tick;
        h.clock.t += 60000;
        h.send({ type: 'resume' });
        h.advance(16);
        expect(h.run().world.tick - tick).toBeLessThanOrEqual(2);
    });

    it('acknowledges a pause with the final tick, after a snapshot of that tick, and then runs no more', () => {
        const h = started();
        runTo(h, 5);
        h.send({ type: 'pause' });
        const tick = h.run().world.tick;
        const ack = h.of('paused');
        expect(ack).toEqual([{ type: 'paused', epoch: 1, tick }]);
        expect(h.of('snapshot').at(-1).tick).toBe(tick);
        expect(h.sent.at(-1).type).toBe('paused');
        h.advance(200);
        expect(h.run().world.tick).toBe(tick);
    });

    it('steps the asked ticks while paused and posts a snapshot', () => {
        const h = started();
        runTo(h, 3);
        h.send({ type: 'pause' });
        h.advance(1);
        const before = h.run().world.tick;
        const snapshots = h.of('snapshot').length;
        h.send({ type: 'step', ticks: 4 });
        expect(h.run().world.tick).toBe(before + 4);
        expect(h.of('snapshot')).toHaveLength(snapshots + 1);
        expect(h.of('snapshot').at(-1).tick).toBe(before + 4);
    });

    it('requests a speed with setSpeed', () => {
        const h = started();
        h.send({ type: 'setSpeed', ticksPerSecond: 240 });
        runTo(h, 400, 40);
        expect(h.of('stats').at(-1).stats.requestedTicksPerSecond).toBe(240);
    });
});

describe('select and setLenses', () => {
    it('track the agent, add the ray part, and post a fresh snapshot while paused, without changing the world', () => {
        const a = started();
        const b = started();
        runTo(a, 6);
        runTo(b, 6);
        for (const h of [a, b]) {
            h.send({ type: 'pause' });
            h.advance(1);
        }
        const genomeId = b.run().world.genomeId[b.run().world.alive.indexOf(1)];
        const hashBefore = hashWorld(b.run().world);
        const snapshots = b.of('snapshot').length;
        b.send({ type: 'select', genomeId });
        expect(b.of('selection').at(-1)).toMatchObject({ genomeId, state: 'tracking' });
        expect(b.of('snapshot')).toHaveLength(snapshots + 1);
        const inspectAt = b.of('ready')[0].layout.inspectOffset;
        expect(new Uint32Array(b.of('snapshot').at(-1).buffer)[inspectAt + 2]).toBe(1);
        b.send({ type: 'setLenses', rays: true });
        expect(b.of('snapshot')).toHaveLength(snapshots + 2);
        expect(new Uint32Array(b.of('snapshot').at(-1).buffer)[5]).toBe(8);
        expect(hashWorld(b.run().world)).toBe(hashBefore);
        expect(hashWorld(b.run().world)).toBe(hashWorld(a.run().world));
    });

    it('says gone for an unknown genome and for a selected agent that dies, and clears with 0', () => {
        const h = started();
        runTo(h, 3);
        h.send({ type: 'select', genomeId: 999999 });
        expect(h.of('selection').at(-1)).toMatchObject({ genomeId: 999999, state: 'gone' });
        const { world } = h.run();
        const slot = world.alive.indexOf(1);
        const genomeId = world.genomeId[slot];
        h.send({ type: 'select', genomeId });
        world.energy[slot] = 0;
        runTo(h, world.tick + 2);
        expect(h.of('selection').at(-1)).toMatchObject({ genomeId, state: 'gone' });
        const count = h.of('selection').length;
        h.send({ type: 'select', genomeId: 0 });
        expect(h.of('selection')).toHaveLength(count);
    });
});

describe('reset', () => {
    it('bumps the epoch, replaces the world and reuses the buffers when the sizes are unchanged', () => {
        const h = started({ keep: 1 });
        runTo(h, 10);
        const firstBuffer = h.of('snapshot')[0].buffer;
        h.send({ type: 'reset', seed: 6, config: SMALL_CONFIG });
        expect(h.of('ready')).toHaveLength(2);
        expect(h.of('ready')[1]).toMatchObject({ epoch: 2, seed: 6 });
        expect(h.run().world.tick).toBe(0);
        runTo(h, 5);
        expect(h.of('snapshot').at(-1).epoch).toBe(2);
        expect(h.of('snapshot').at(-1).buffer.byteLength).toBe(firstBuffer.byteLength);
        expect(h.of('error')).toHaveLength(0);
    });

    it('reallocates the buffers for a larger maxAgents and ignores a buffer of the old size coming back', () => {
        const h = started({ keep: Infinity });
        runTo(h, 10);
        const oldBytes = h.of('snapshot')[0].buffer.byteLength;
        h.send({ type: 'reset', seed: 6, config: { ...SMALL_CONFIG, maxAgents: 80 } });
        h.send({ type: 'returnBuffer', pool: 'snapshot', buffer: new ArrayBuffer(oldBytes) });
        runTo(h, 5);
        const newest = h.of('snapshot').at(-1);
        expect(newest.epoch).toBe(2);
        expect(newest.buffer.byteLength).toBeGreaterThan(oldBytes);
        expect(h.of('error')).toHaveLength(0);
    });

    it('posts selection gone for the old selection', () => {
        const h = started();
        runTo(h, 3);
        const { world } = h.run();
        const genomeId = world.genomeId[world.alive.indexOf(1)];
        h.send({ type: 'select', genomeId });
        h.send({ type: 'reset', seed: 7, config: SMALL_CONFIG });
        expect(h.of('selection').at(-1)).toMatchObject({ genomeId, state: 'gone' });
    });
});

describe('exportArchive and flush', () => {
    it('warns for a policy without an archive and accepts flush', () => {
        const h = started();
        h.send({ type: 'exportArchive' });
        h.send({ type: 'flush' });
        expect(h.of('archive')).toHaveLength(0);
        expect(h.of('log').some((m) => m.record.event === 'ArchiveExportSkipped')).toBe(true);
        expect(h.of('error')).toHaveLength(0);
    });

    it('posts the archive json for a policy that has one', async () => {
        const { createMapElitesV1 } = await import('../../js/evo/policies/map-elites-v1.js');
        const h = started({ createPolicy: (/** @type {any} */ options) => createMapElitesV1(options) });
        h.send({ type: 'exportArchive' });
        expect(h.of('archive')).toHaveLength(1);
        expect(JSON.parse(h.of('archive')[0].json)).toMatchObject({ version: 1 });
    });
});
