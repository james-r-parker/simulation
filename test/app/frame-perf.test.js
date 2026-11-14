// The frame and draw timing `__perf()` reports, through the real frame loop, frame stats, effects player and budget:
// after N frames at the display rate the frames, the refresh rate and the draw time are non-zero, and the adaptive
// effect budget reads them (a regression on the user's GPU once showed zeros and a budget stuck at its floor).
import { describe, expect, it } from 'vitest';
import { createAppState } from '../../js/app/actions.js';
import { createCameraController } from '../../js/app/camera.js';
import { createFamilySlots } from '../../js/app/family-slots.js';
import { createFrameLoop } from '../../js/app/frame-loop.js';
import { createFrameStats } from '../../js/app/frame-stats.js';
import { buildPerf } from '../../js/app/perf.js';
import { createEffectsPlayer } from '../../js/app/renderer/effects-player.js';
import { smallReady } from './helpers/ready.js';

/**
 * @param {{hidden?: boolean}} [options] whether the tab is hidden
 * @returns {{loop: any, deps: any, player: any}} a real loop over a small world's snapshot, a scene that takes 0.5 ms
 *   of clock to draw and a GPU timer reading 1 ms
 */
function rig({ hidden = false } = {}) {
    const { info, layout, snapshot } = smallReady(40);
    const client = { info, prev: null, latest: snapshot, effects: null, field: null, stats: null, releaseField() {} };
    let clockMs = 0;
    const deps = {
        getClient: () => client,
        scene: { draw: () => ((clockMs += 0.5), true) },
        camera: createCameraController({
            canvas: /** @type {any} */ ({ width: 1920, height: 1080 }),
            world: { width: info.worldWidth, height: info.worldHeight },
        }),
        state: createAppState(),
        slots: createFamilySlots(),
        refs: { haze: null, player: /** @type {any} */ (null) },
        stats: createFrameStats(1024),
        gpuTimer: { begin() {}, end() {}, poll() {}, latest: () => 1 },
        clock: () => clockMs,
        hidden: () => hidden,
    };
    const player = createEffectsPlayer({ layout, info });
    deps.refs.player = player;
    const loop = createFrameLoop(deps);
    loop.reset(info.maxAgents);
    return { loop, deps, player };
}

describe('frame timing through the real loop', () => {
    it('reports frames, the refresh rate and the draw time after N frames at 244 Hz, and the budget scales up', () => {
        const { loop, deps, player } = rig();
        for (let i = 0; i < 600; i++) {
            loop.frame(1000 + i * (1000 / 244));
        }
        const perf = buildPerf({
            stats: deps.stats,
            worker: null,
            gpu: { geometries: 0, textures: 0, programs: 0 },
            gpuSamples: null,
            heapBytes: null,
        });
        expect(perf.frames).toBeGreaterThan(500);
        expect(perf.refreshHz).toBeCloseTo(244, -1);
        expect(perf.drawMs.p50).toBeGreaterThan(0);
        expect(perf.ignoredFrames).toEqual({ hidden: 0, zero: 1, long: 0 });
        expect(player.fx.budget.scale).toBeGreaterThan(1.5);
    });

    it('counts the frames of a hidden tab as ignored, and the budget keeps its scale rather than falling', () => {
        const { loop, deps, player } = rig({ hidden: true });
        for (let i = 0; i < 100; i++) {
            loop.frame(1000 + i * 1000);
        }
        const perf = buildPerf({
            stats: deps.stats,
            worker: null,
            gpu: { geometries: 0, textures: 0, programs: 0 },
            gpuSamples: null,
            heapBytes: null,
        });
        expect(perf.frames).toBe(0);
        expect(perf.ignoredFrames.hidden).toBe(100);
        expect(player.fx.budget.scale).toBe(1);
    });
});
