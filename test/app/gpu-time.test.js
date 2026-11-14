import { describe, expect, it } from 'vitest';
import { createGpuTime, gpuTimeFor } from '../../js/app/gpu-time.js';

/** @returns {{renderer: any, settle: (v: any) => void, calls: () => number}} a renderer whose resolves the test settles */
function fake() {
    /** @type {((v: any) => void)[]} */
    const waiting = [];
    let calls = 0;
    return {
        renderer: {
            resolveTimestampsAsync: () => {
                calls++;
                return new Promise((resolve) => waiting.push(resolve));
            },
        },
        settle: (v) => waiting.shift()?.(v),
        calls: () => calls,
    };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('createGpuTime', () => {
    it('divides the summed time by the frames drawn since the previous resolve', async () => {
        const f = fake();
        const timer = createGpuTime(f.renderer);
        timer.end();
        timer.end();
        timer.end();
        timer.poll();
        f.settle(6);
        await tick();
        expect(timer.latest()).toBe(2);
        expect(Array.from(timer.samples())).toEqual([2]);
    });

    it('keeps one resolve in flight and skips a poll with no frame drawn', async () => {
        const f = fake();
        const timer = createGpuTime(f.renderer);
        timer.poll();
        expect(f.calls()).toBe(0);
        timer.end();
        timer.poll();
        timer.end();
        timer.poll();
        expect(f.calls()).toBe(1);
        f.settle(1);
        await tick();
        timer.poll();
        expect(f.calls()).toBe(2);
    });

    it('records nothing when timestamps are off (undefined) and forgets on reset', async () => {
        const f = fake();
        const timer = createGpuTime(f.renderer);
        timer.end();
        timer.poll();
        f.settle(undefined);
        await tick();
        expect(timer.latest()).toBe(-1);
        expect(timer.samples()).toHaveLength(0);
        timer.end();
        timer.poll();
        f.settle(4);
        await tick();
        timer.reset();
        expect(timer.samples()).toHaveLength(0);
    });
});

describe('gpuTimeFor', () => {
    it('makes a timer for a stage and none before one', () => {
        expect(gpuTimeFor(null)).toBeNull();
        expect(gpuTimeFor({ renderer: fake().renderer })?.latest()).toBe(-1);
    });
});
