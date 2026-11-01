import { describe, expect, it } from 'vitest';
import { createInterpolated, interpolateInto } from '../../../js/app/interpolate.js';
import { createEffectsPlayer, JAW_REACH, playEffects, STALE_TICKS } from '../../../js/app/renderer/effects-player.js';
import { createMateThreadPool } from '../../../js/app/renderer/mate-threads.js';
import { createRingPool, RING_CAPACITY } from '../../../js/app/renderer/rings.js';
import { createSparkPool, SPARK_CAPACITY } from '../../../js/app/renderer/sparks.js';
import { makeSnapshot } from '../helpers/snapshots.js';

const layout = {
    effectKinds: { BORN: 1, DIED: 2, BITE: 3, ALARM: 4, PACK_CALL: 5, SMOKE: 6, ESCAPED: 7, MATED: 8, POLLINATED: 9 },
    deathCauses: { STARVED: 0, EATEN: 1, COLLISION: 2, OLD_AGE: 3 },
};
const info = { callRadius: 300, callTicks: 40 };

/**
 * @param {number[][]} records `[kind, tick, x, y, a, b, c, d]` rows
 * @param {number} [capacity] the ring capacity in records
 * @returns {any} a queue as the worker client builds it, the records at the start
 */
function queueOf(records, capacity = 16) {
    const buffer = new ArrayBuffer(capacity * 8 * 4);
    const u32 = new Uint32Array(buffer);
    const f32 = new Float32Array(buffer);
    records.forEach((r, i) => {
        u32.set([r[0], r[1]], i * 8);
        f32.set([r[2], r[3]], i * 8 + 2);
        u32.set(r.slice(4), i * 8 + 4);
    });
    return { u32, f32, words: 8, start: 0, count: records.length, dropped: 0 };
}

const alive = (/** @type {any[]} */ list) => {
    const out = createInterpolated(8);
    interpolateInto(null, makeSnapshot(1, list), 1, out);
    return out;
};

/** @returns {{player: any, rings: any, sparks: any, threads: any, seen: number[]}} a player with a recording sink */
function build() {
    const rings = createRingPool();
    const sparks = createSparkPool(1);
    const threads = createMateThreadPool();
    /** @type {number[]} */
    const seen = [];
    const player = createEffectsPlayer({ rings, sparks, threads, layout, info, sink: (e) => seen.push(e.kind) });
    return { player, rings, sparks, threads, seen };
}

/**
 * @param {any} pool a ring or spark pool
 * @param {number} tick the tick
 * @returns {number} how many entries are alive at the tick
 */
function live(pool, tick) {
    let n = 0;
    for (let i = 0; i < pool.startTick.length; i++) {
        if (tick >= pool.startTick[i] && tick < pool.startTick[i] + pool.lifeTicks[i]) {
            n += 1;
        }
    }
    return n;
}
const liveRings = live;
const liveSparks = live;

describe('playEffects', () => {
    it('plays an effect once, when the playhead reaches its tick, and not before', () => {
        const { player, rings, seen } = build();
        const q = queueOf([[4, 100, 10, 20, 1, 0, 0, 1]]);
        expect(playEffects(player, q, alive([]), 99)).toBe(0);
        expect(q.count).toBe(1);
        expect(playEffects(player, q, alive([]), 100)).toBe(1);
        expect(playEffects(player, q, alive([]), 101)).toBe(0);
        expect(seen).toEqual([4]);
        expect(liveRings(rings, 105)).toBe(1);
        expect(rings.radius[0]).toBe(300);
    });

    it('draws seeded patch effects as dim flora rings only when the flora look is on', () => {
        const { player, rings } = build();
        playEffects(player, queueOf([[9, 10, 20, 30, 4095, 0, 0, 0]]), alive([]), 10);
        expect(liveRings(rings, 10)).toBe(1);
        expect(rings.x[0]).toBe(20);
        expect(rings.y[0]).toBe(30);
        player.floraEnabled = false;
        playEffects(player, queueOf([[9, 11, 1, 2, 0, 0, 0, 0]]), alive([]), 11);
        expect(liveRings(rings, 11)).toBe(1);
    });

    it('keeps order, stopping at the first effect still ahead of the playhead', () => {
        const { player, seen } = build();
        const q = queueOf([
            [4, 100, 0, 0, 0, 0, 0, 0],
            [5, 105, 0, 0, 0, 0, 0, 0],
            [4, 110, 0, 0, 0, 0, 0, 0],
        ]);
        playEffects(player, q, alive([]), 106);
        expect(seen).toEqual([4, 5]);
        expect(q.count).toBe(1);
        expect(q.start).toBe(2);
    });

    it('plays nothing while the playhead is paused, and plays the rest when it moves', () => {
        const { player, seen } = build();
        const q = queueOf([[4, 100, 0, 0, 0, 0, 0, 0]]);
        for (let i = 0; i < 5; i++) {
            playEffects(player, q, alive([]), 90);
        }
        expect(seen).toEqual([]);
        playEffects(player, q, alive([]), 100);
        expect(seen).toEqual([4]);
    });

    it('wraps the ring and drops stale effects unplayed', () => {
        const { player, seen } = build();
        const q = queueOf(
            [
                [4, 10, 0, 0, 0, 0, 0, 0],
                [4, 1000, 0, 0, 0, 0, 0, 0],
            ],
            2,
        );
        q.start = 1;
        q.count = 2;
        q.u32.set([4, 10, 0, 0, 0, 0, 0, 0], 8);
        q.u32.set([4, 1000, 0, 0, 0, 0, 0, 0], 0);
        playEffects(player, q, alive([]), 1000);
        expect(q.start).toBe(1);
        expect(seen).toEqual([4]);
        expect(STALE_TICKS).toBeGreaterThan(40);
    });

    it('a pack call spawns a hunt ring, an alarm an alarm ring', () => {
        const { player, rings } = build();
        playEffects(
            player,
            queueOf([
                [5, 1, 0, 0, 0, 0, 0, 0],
                [4, 1, 0, 0, 0, 0, 0, 0],
            ]),
            alive([]),
            1,
        );
        expect(Array.from(rings.kind.slice(0, 2))).toEqual([1, 0]);
    });

    it('a birth spawns a ring and 6 motes in the lineage colour; a death 10 motes, and a flash when eaten', () => {
        const { player, rings, sparks } = build();
        playEffects(player, queueOf([[1, 5, 1, 2, 7, 3, 1, 0]]), alive([]), 5);
        expect(liveRings(rings, 6)).toBe(1);
        expect(liveSparks(sparks, 6)).toBe(6);
        const b = build();
        playEffects(b.player, queueOf([[2, 5, 1, 2, 7, 0, 1 | (1 << 8), 3]]), alive([]), 5);
        expect(liveSparks(b.sparks, 6)).toBe(11);
        const c = build();
        playEffects(c.player, queueOf([[2, 5, 1, 2, 7, 0, 1, 3]]), alive([]), 5);
        expect(liveSparks(c.sparks, 6)).toBe(10);
        expect(RING_CAPACITY + SPARK_CAPACITY).toBeGreaterThan(0);
    });

    it('a bite starts at the biter jaw, or at the victim when the biter is gone', () => {
        const { player, sparks } = build();
        const agents = alive([{ slot: 0, genomeId: 9, x: 100, y: 100, angle: 0, size: 20 }]);
        playEffects(player, queueOf([[3, 5, 400, 400, 9, 4, 0, 0]]), agents, 5);
        expect(sparks.x[0]).toBeCloseTo(100 + 20 * JAW_REACH);
        expect(sparks.y[0]).toBeCloseTo(100);
        const b = build();
        playEffects(b.player, queueOf([[3, 5, 400, 300, 77, 4, 0, 0]]), agents, 5);
        expect(b.sparks.x[0]).toBe(400);
        expect(b.sparks.y[0]).toBe(300);
    });

    it('ignores smoke effects but still tells the sink', () => {
        const { player, rings, seen } = build();
        playEffects(player, queueOf([[6, 1, 0, 0, 0, 0, 0, 0]]), alive([]), 1);
        expect(liveRings(rings, 2)).toBe(0);
        expect(seen).toEqual([6]);
    });

    it('spawns a courtship thread when MATED plays', () => {
        const { player, threads, seen } = build();
        playEffects(player, queueOf([[8, 10, 50, 60, 11, 22, 0, 3]]), alive([]), 10);
        expect(threads.count).toBe(1);
        expect(threads.motherGenome[0]).toBe(11);
        expect(threads.fatherGenome[0]).toBe(22);
        expect(seen).toEqual([8]);
    });
});
