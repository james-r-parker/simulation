import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFrameStats } from '../../js/app/frame-stats.js';
import { createFrameSlots, frameSlotBytes, noteSkipped } from '../../js/app/pack/frame-slots.js';
import { createAppLiveness, readAppPerf, startReporting } from '../../js/app/liveness.js';

const info = { maxAgents: 4, specs: [{}] };

afterEach(() => vi.unstubAllGlobals());

describe('readAppPerf', () => {
    it('reports empty counters before the world and renderer are ready', () => {
        const app = {
            stats: createFrameStats(),
            supervisor: { client: () => null },
            deps: { refs: { player: null } },
            loop: { lateFrames: () => 0 },
            pack: { slots: () => null },
        };
        expect(readAppPerf(app)).toMatchObject({
            lateFrames: 0,
            skippedPacks: 0,
            worker: null,
            gpu: { geometries: 0, textures: 0, programs: 0 },
            gpuSamples: null,
            fx: null,
            drawCalls: null,
        });
    });

    it('reads worker, renderer, timer, heap and app draw counters when available', () => {
        vi.stubGlobal('performance', { memory: { usedJSHeapSize: 1234 } });
        const worker = { tick: 7 };
        const gpuSamples = new Float64Array([1, 2]);
        const frameSlots = createFrameSlots(new SharedArrayBuffer(frameSlotBytes(info)), info);
        noteSkipped(frameSlots);
        noteSkipped(frameSlots);
        const slots = () => frameSlots;
        const app = {
            stats: createFrameStats(),
            supervisor: { client: () => ({ stats: worker }) },
            loop: { lateFrames: () => 3 },
            pack: { slots },
            deps: {
                refs: { player: null },
                scene: {
                    renderer: {
                        info: {
                            memory: { geometries: 3, textures: 4 },
                            programs: [{}],
                            render: { calls: 9000, drawCalls: 5 },
                        },
                    },
                },
                gpuTimer: { samples: () => gpuSamples },
            },
        };

        expect(readAppPerf(app)).toMatchObject({
            worker,
            gpu: { geometries: 3, textures: 4, programs: 1 },
            gpuSamples,
            heapBytes: 1234,
            lateFrames: 3,
            skippedPacks: 2,
            fx: null,
            drawCalls: 5,
        });
    });
});

describe('createAppLiveness', () => {
    it('reads the current app frame count and worker tick without exposing mutable values', () => {
        let frames = 12;
        let tick = 34;
        const resetFrames = vi.fn();
        const liveness = createAppLiveness({
            readFrames: () => frames,
            readTick: () => tick,
            resetFrames,
        });

        expect(liveness.frames).toBe(12);
        expect(liveness.tick).toBe(34);
        frames = 20;
        tick = 50;
        expect(liveness.frames).toBe(20);
        expect(liveness.tick).toBe(50);
        liveness.resetFrames();
        expect(resetFrames).toHaveBeenCalledOnce();
        expect(Object.isFrozen(liveness)).toBe(true);
    });

    it('only installs performance reporting in non-production builds', () => {
        const dev = /** @type {Record<string, any>} */ ({});
        const production = /** @type {Record<string, any>} */ ({});
        const read = () => ({
            stats: createFrameStats(),
            worker: null,
            gpu: { geometries: 0, textures: 0, programs: 0 },
            gpuSamples: null,
            heapBytes: null,
        });
        startReporting({ target: dev, production: false, read, reset: () => {} });
        startReporting({ target: production, production: true, read, reset: () => {} });

        expect(dev.__perf()).toHaveProperty('app', 'v6');
        expect(production).not.toHaveProperty('__perf');
    });
});
