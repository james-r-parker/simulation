import { describe, expect, it, vi } from 'vitest';
import { exposeApp } from '../../js/app/expose.js';
import { createFrameStats } from '../../js/app/frame-stats.js';

/** @returns {any} a live app over fakes */
function app(reel = true) {
    return {
        params: { reel },
        stats: createFrameStats(8),
        supervisor: { tick: () => 42, client: () => null },
        deps: { scene: null, refs: { player: null }, gpuTimer: { reset: vi.fn(), samples: () => null } },
        pack: { slots: () => null },
        loop: { lateFrames: () => 0 },
        iface: { reel: { reel: { clips: () => [], pending: () => null }, recorder: { running: () => true } } },
    };
}

describe('exposeApp', () => {
    it('exposes the liveness counters always, the reel with reel=1, and the perf reader in development', () => {
        const target = /** @type {any} */ ({});
        exposeApp({ app: app(), target, production: false, frames: 8 });
        expect(target.__blob.tick).toBe(42);
        expect(target.__blob.frames).toBe(0);
        target.__blob.resetFrames();
        expect(typeof target.__perf).toBe('function');
        expect(target.__perf().app).toBe('v6');
        target.__perf.reset();
        expect(target.__reel.recording()).toBe(true);
        expect(target.__reel.clips()).toEqual([]);
    });

    it('exposes no perf reader in a production build', () => {
        const target = /** @type {any} */ ({});
        exposeApp({ app: app(), target, production: true, frames: 8 });
        expect(target.__blob.tick).toBe(42);
        expect(target.__perf).toBeUndefined();
        expect(target.__reel.recording()).toBe(true);
    });

    it('installs no window.__reel without reel=1', () => {
        const target = /** @type {any} */ ({});
        exposeApp({ app: app(false), target, production: false, frames: 8 });
        expect(target.__blob.tick).toBe(42);
        expect(target.__reel).toBeUndefined();
    });

    it('resets the GPU timer with the frames when perf is reset', () => {
        const target = /** @type {any} */ ({});
        const live = app();
        exposeApp({ app: live, target, production: false, frames: 8 });
        target.__perf.reset();
        expect(live.deps.gpuTimer.reset).toHaveBeenCalledOnce();
    });
});
