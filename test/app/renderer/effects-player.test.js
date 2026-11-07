import { describe, expect, it } from 'vitest';
import { createInterpolated, interpolateInto } from '../../../js/app/interpolate.js';
import {
    beginEffects,
    createEffectsPlayer,
    JAW_REACH,
    playEffects,
    STALE_TICKS,
} from '../../../js/app/renderer/effects-player.js';
import { createCameraController } from '../../../js/app/camera.js';
import { BAND } from '../../../js/app/renderer/fx-budget.js';
import { createMateThreadPool } from '../../../js/app/renderer/mate-threads.js';
import { isLive } from '../../../js/app/renderer/fx-pool.js';
import { CURVE } from '../../../js/app/renderer/fx-curves.js';
import { TWEEN } from '../../../js/app/renderer/body-tweens.js';
import { makeSnapshot } from '../helpers/snapshots.js';

const layout = {
    effectKinds: {
        BORN: 1,
        DIED: 2,
        BITE: 3,
        ALARM: 4,
        PACK_CALL: 5,
        SMOKE: 6,
        ESCAPED: 7,
        MATED: 8,
        POLLINATED: 9,
        STAMPEDE: 10,
        STRAIN_EMERGED: 11,
    },
    deathCauses: { STARVED: 0, EATEN: 1, COLLISION: 2, OLD_AGE: 3 },
    bornCauses: { INITIAL: 0, MATE: 1, SPLIT: 2, FLOOR: 3, IMMIGRANT: 4 },
};
const info = { callRadius: 300, callTicks: 40, maxAgents: 8 };

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

/** @returns {{player: any, threads: any, seen: number[]}} a player with a recording sink */
function build() {
    const threads = createMateThreadPool();
    /** @type {number[]} */
    const seen = [];
    const player = createEffectsPlayer({ threads, layout, info, sink: (e) => seen.push(e.kind) });
    return { player, threads, seen };
}

/**
 * @param {any} pool the effect pool
 * @param {number} tick the tick
 * @returns {number} instances drawing at the tick
 */
function liveFx(pool, tick) {
    let n = 0;
    for (let i = 0; i < pool.limit; i++) {
        n += isLive(pool, i, tick) ? 1 : 0;
    }
    return n;
}

describe('playEffects', () => {
    it('plays a strain emergence as one wide ring at the first host', () => {
        const { player, seen } = build();
        const q = queueOf([[11, 12, 140, 260, 2, 77, 0, 0]]);
        expect(playEffects(player, q, alive([]), 12)).toBe(1);
        expect(seen).toEqual([11]);
        expect(liveFx(player.fx.pool, 12)).toBe(1);
        expect(player.fx.pool.pose[0]).toBe(140);
        expect(player.fx.pool.pose[1]).toBe(260);
        expect(player.fx.pool.time[2]).toBe(CURVE.ringSlow);
    });

    it('plays a stampede as a ground ring and dust at the herd centre', () => {
        const { player, seen } = build();
        const q = queueOf([[10, 12, 80, 90, 3, 5, 0, 0]]);
        expect(playEffects(player, q, alive([]), 12)).toBe(1);
        expect(seen).toEqual([10]);
        expect(liveFx(player.fx.pool, 12)).toBe(15);
        expect(player.fx.pool.pose[0]).toBe(80);
        expect(player.fx.pool.pose[1]).toBe(90);
    });

    it('plays an effect once, when the playhead reaches its tick, and not before', () => {
        const { player, seen } = build();
        const q = queueOf([[4, 100, 10, 20, 1, 0, 0, 1]]);
        expect(playEffects(player, q, alive([]), 99)).toBe(0);
        expect(q.count).toBe(1);
        expect(playEffects(player, q, alive([]), 100)).toBe(1);
        expect(playEffects(player, q, alive([]), 101)).toBe(0);
        expect(seen).toEqual([4]);
        expect(liveFx(player.fx.pool, 109)).toBe(2);
        expect(player.fx.pool.pose[3]).toBeCloseTo(300 * 1.18);
    });

    it('draws a seeded patch as a dim flora ring and a sprout, only when the flora look is on', () => {
        const { player } = build();
        playEffects(player, queueOf([[9, 10, 20, 30, 4095, 0, 0, 0]]), alive([]), 10);
        expect(liveFx(player.fx.pool, 10)).toBe(2);
        expect(player.fx.pool.pose[0]).toBe(20);
        expect(player.fx.pool.pose[1]).toBe(30);
        player.floraEnabled = false;
        playEffects(player, queueOf([[9, 11, 1, 2, 0, 0, 0, 0]]), alive([]), 11);
        expect(liveFx(player.fx.pool, 11)).toBe(2);
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

    it('a pack call sends a hunt pulse and three arcs ahead and stretches the caller; an alarm two chevron waves', () => {
        const { player } = build();
        const agents = alive([{ slot: 1, genomeId: 3, x: 50, y: 60, angle: 1 }]);
        playEffects(player, queueOf([[5, 1, 0, 0, 3, 0, 0, 0]]), agents, 1);
        const { pool } = player.fx;
        expect(liveFx(pool, 2)).toBe(4);
        expect(pool.time[2]).toBe(CURVE.huntPulse);
        expect(pool.time[6]).toBe(CURVE.arc);
        expect(pool.pose[0]).toBe(50);
        expect(pool.time[5]).toBe(40);
        expect(player.tweens.kind[1]).toBe(TWEEN.HOWL);
        const b = build();
        playEffects(b.player, queueOf([[4, 1, 7, 8, 9, 0, 0, 0]]), alive([]), 1);
        expect(b.player.fx.pool.time[2]).toBe(CURVE.chevron);
        expect(b.player.fx.pool.time[4] - b.player.fx.pool.time[0]).toBe(8);
    });

    it('smoke bursts in puffs at the releaser, with a bite mark when it was bitten', () => {
        const { player } = build();
        playEffects(player, queueOf([[6, 1, 5, 5, 0, 0, 0, 0]]), alive([]), 1);
        expect(liveFx(player.fx.pool, 2)).toBe(8);
        const b = build();
        playEffects(b.player, queueOf([[6, 1, 5, 5, 0, 0, 1 << 8, 0]]), alive([]), 1);
        expect(liveFx(b.player.fx.pool, 2)).toBe(9);
    });

    it('a birth plays by its cause: mating, split, floor and immigrant differ, the founders play nothing', () => {
        /** @type {Record<number, number>} */
        const counts = {};
        for (const cause of [0, 1, 2, 3, 4]) {
            const { player } = build();
            const agents = alive([{ slot: 3, genomeId: 7 }]);
            playEffects(player, queueOf([[1, 5, 1, 2, 7, 3, 1, cause]]), agents, 5);
            counts[cause] = liveFx(player.fx.pool, 6);
            if (cause > 0) {
                expect(player.tweens.kind[3], `cause ${cause}`).toBe(TWEEN.BIRTH_POP);
            }
        }
        expect(counts).toEqual({ 0: 0, 1: 11, 2: 5, 3: 8, 4: 8 });
    });

    it('a mating spirals courtship motes to the midpoint of the pair and bounces both', () => {
        const { player, threads } = build();
        const agents = alive([
            { slot: 1, genomeId: 11, x: 0, y: 0, size: 10 },
            { slot: 2, genomeId: 22, x: 100, y: 0, size: 10 },
        ]);
        playEffects(player, queueOf([[8, 10, 0, 0, 11, 22, 0, 3]]), agents, 10);
        expect(threads.count).toBe(1);
        expect(player.fx.pool.pose[0]).toBeCloseTo(50);
        expect(player.fx.pool.move[0]).toBeCloseTo(50);
        expect(liveFx(player.fx.pool, 11)).toBe(6);
        expect(player.tweens.kind[1]).toBe(TWEEN.COURT);
        expect(player.tweens.kind[2]).toBe(TWEEN.COURT);
    });

    it('a death plays its cause recipe through the effect pool; each cause differs, a pack kill adds two rings', () => {
        /** @type {Record<number, number>} */
        const counts = {};
        for (const cause of [0, 1, 2, 3]) {
            const { player } = build();
            playEffects(player, queueOf([[2, 5, 1, 2, 7, 0, cause << 8, 3]]), alive([]), 5);
            counts[cause] = liveFx(player.fx.pool, 6);
        }
        expect(counts).toEqual({ 0: 9, 1: 8, 2: 3, 3: 7 });
        const pack = build();
        playEffects(pack.player, queueOf([[2, 5, 1, 2, 7, 0, (1 << 8) | 65536, 3]]), alive([]), 5);
        expect(liveFx(pack.player.fx.pool, 6)).toBe(9);
        expect(liveFx(pack.player.fx.pool, 12)).toBe(9);
    });

    it('an eaten death gulps the killer', () => {
        const { player } = build();
        const agents = alive([{ slot: 2, genomeId: 9, x: 100, y: 100 }]);
        playEffects(player, queueOf([[2, 5, 1, 2, 7, 9, 1 << 8, 3]]), agents, 5);
        expect(player.tweens.kind[2]).toBe(TWEEN.GULP);
    });

    it('a bite sprays from the biter jaw (or the effect when the biter is gone), marks the victim, and tweens both', () => {
        const { player } = build();
        const agents = alive([
            { slot: 0, genomeId: 9, x: 100, y: 100, angle: 0, size: 20 },
            { slot: 1, genomeId: 4, x: 160, y: 100, angle: 0, size: 20 },
        ]);
        playEffects(player, queueOf([[3, 5, 400, 400, 9, 4, 0, 0]]), agents, 5);
        const pool = player.fx.pool;
        expect(pool.pose[0]).toBeCloseTo(100 + 20 * JAW_REACH);
        expect(pool.pose[1]).toBeCloseTo(100);
        expect(liveFx(pool, 6)).toBe(7);
        expect(pool.pose[6 * 4]).toBeCloseTo(160 - 20 * 0.75);
        expect(player.tweens.kind[0]).toBe(TWEEN.LUNGE);
        expect(player.tweens.kind[1]).toBe(TWEEN.FLINCH);
        const b = build();
        playEffects(b.player, queueOf([[3, 5, 400, 300, 77, 4, 0, 0]]), alive([]), 5);
        expect(b.player.fx.pool.pose[0]).toBe(400);
        expect(b.player.fx.pool.pose[1]).toBe(300);
        expect(liveFx(b.player.fx.pool, 6)).toBe(6);
    });

    it('tells the sink of every effect it plays', () => {
        const { player, seen } = build();
        playEffects(player, queueOf([[6, 1, 0, 0, 0, 0, 0, 0]]), alive([]), 1);
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

    it('beginEffects takes the view, the zoom band and the playhead rate into the budget', () => {
        const { player } = build();
        const camera = createCameraController({
            canvas: /** @type {any} */ ({ width: 1000, height: 500 }),
            world: { width: 10000, height: 5000 },
        });
        camera.x = 5000;
        camera.y = 2500;
        camera.zoom = 0.1;
        beginEffects(player, { tick: 10, dtMs: 16, nowMs: 100, camera });
        const b = player.fx.budget;
        expect(b.band).toBe(BAND.FAR);
        expect(b.view.left).toBeCloseTo(-200);
        expect(b.view.right).toBeCloseTo(10200);
        beginEffects(player, { tick: 14, dtMs: 16, nowMs: 116, camera });
        expect(b.ticksPerMs).toBeGreaterThan(0);
    });
});
