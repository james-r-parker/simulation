import { describe, expect, it } from 'vitest';
import { createInterpolated } from '../../../js/app/interpolate.js';
import { createFamilySlots } from '../../../js/app/family-slots.js';
import { createLineBuffer } from '../../../js/app/renderer/line-buffer.js';
import {
    createMateThreadLayer,
    createMateThreadPool,
    MATE_FADE_TICKS,
    MATE_POOL_CAPACITY,
    MATE_SEGMENTS,
    MATE_TICKS,
    spawnMateThread,
    stepMateThreads,
    threadAt,
    threadCurve,
} from '../../../js/app/renderer/mate-threads.js';

describe('threadAt', () => {
    it('is 0 at age 0 and 1, rises and falls monotonically, and peaks at 1', () => {
        expect(threadAt(0)).toBe(0);
        expect(threadAt(1)).toBe(0);
        expect(threadAt(-0.1)).toBe(0);
        expect(threadAt(1.1)).toBe(0);

        let prev = 0;
        for (let a = 0.01; a <= 0.15; a += 0.01) {
            const val = threadAt(a);
            expect(val).toBeGreaterThan(prev);
            prev = val;
        }

        expect(threadAt(0.15)).toBeCloseTo(1, 5);
        expect(threadAt(0.3)).toBeCloseTo(1, 5);
        expect(threadAt(0.6)).toBeCloseTo(1, 5);

        prev = 1;
        for (let a = 0.61; a <= 1.0; a += 0.02) {
            const val = threadAt(a);
            expect(val).toBeLessThan(prev);
            prev = val;
        }
    });
});

describe('threadCurve', () => {
    it('hits both endpoints exactly, bulges perpendicular, and is finite for two agents at one point', () => {
        const ax = 10;
        const ay = 20;
        const bx = 110;
        const by = 20;
        const out = [0, 0];

        threadCurve(ax, ay, bx, by, 0, out);
        expect(out[0]).toBeCloseTo(ax, 5);
        expect(out[1]).toBeCloseTo(ay, 5);

        threadCurve(ax, ay, bx, by, 1, out);
        expect(out[0]).toBeCloseTo(bx, 5);
        expect(out[1]).toBeCloseTo(by, 5);

        threadCurve(ax, ay, bx, by, 0.5, out, 1);
        const mx = (ax + bx) * 0.5;
        const my = (ay + by) * 0.5;
        const vx = out[0] - mx;
        const vy = out[1] - my;
        const dx = bx - ax;
        const dy = by - ay;
        expect(vx * dx + vy * dy).toBeCloseTo(0, 5);
        expect(Math.hypot(vx, vy)).toBeCloseTo(0.5 * 0.18 * 100, 5);

        threadCurve(50, 50, 50, 50, 0.5, out);
        expect(out[0]).toBe(50);
        expect(out[1]).toBe(50);
        expect(Number.isFinite(out[0])).toBe(true);
        expect(Number.isFinite(out[1])).toBe(true);
    });
});

describe('createMateThreadPool & spawnMateThread', () => {
    it('recycles the oldest at 33', () => {
        const pool = createMateThreadPool(MATE_POOL_CAPACITY);
        for (let i = 0; i < 32; i++) {
            spawnMateThread(pool, { x: i, y: i, tick: i, a: i + 1, b: i + 2, d: 1 });
        }
        expect(pool.count).toBe(32);
        expect(pool.next).toBe(0);
        expect(pool.motherGenome[0]).toBe(1);

        spawnMateThread(pool, { x: 999, y: 999, tick: 33, a: 333, b: 444, d: 2 });
        expect(pool.count).toBe(32);
        expect(pool.next).toBe(1);
        expect(pool.motherGenome[0]).toBe(333);
    });
});

describe('stepMateThreads', () => {
    it('writes 12 segments into lines and fades over last 6 ticks when one agent is gone', () => {
        const pool = createMateThreadPool(4);
        spawnMateThread(pool, { x: 10, y: 10, tick: 100, a: 1, b: 2, d: 0 });

        const agents = createInterpolated(4);
        agents.count = 2;
        agents.genomeId[0] = 1;
        agents.x[0] = 10;
        agents.y[0] = 10;
        agents.genomeId[1] = 2;
        agents.x[1] = 50;
        agents.y[1] = 50;

        const lines = createLineBuffer(4 * MATE_SEGMENTS);
        const slots = createFamilySlots();

        stepMateThreads(pool, { agents, tick: 100 + MATE_TICKS * 0.3, family: slots }, lines);
        expect(lines.vertices).toBe(MATE_SEGMENTS * 2);
        expect(lines.color[3]).toBeCloseTo(1.0, 3);

        agents.count = 1;
        stepMateThreads(pool, { agents, tick: 100 + MATE_TICKS * 0.3, family: slots }, lines);
        expect(lines.color[3]).toBeCloseTo(1.0, 3);

        stepMateThreads(pool, { agents, tick: 100 + MATE_TICKS * 0.3 + 3, family: slots }, lines);
        expect(lines.vertices).toBe(MATE_SEGMENTS * 2);
        expect(lines.color[3]).toBeCloseTo(0.5, 2);

        stepMateThreads(pool, { agents, tick: 100 + MATE_TICKS * 0.3 + MATE_FADE_TICKS + 1, family: slots }, lines);
        expect(lines.vertices).toBe(0);
    });
});

describe('createMateThreadLayer', () => {
    it('toggles visibility with setLook', () => {
        const pool = createMateThreadPool(4);
        const layer = createMateThreadLayer({ pool });

        expect(layer.object.visible).toBe(true);
        layer.setLook?.({ threads: 2 });
        expect(layer.object.visible).toBe(false);
        layer.setLook?.({ threads: 0 });
        expect(layer.object.visible).toBe(true);
        layer.dispose();
    });
});
