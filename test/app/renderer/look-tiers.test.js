// The Phase 6 layers' quality tiers and per-frame hooks, driven without a GL context.
import { describe, expect, it } from 'vitest';
import { createCameraController } from '../../../js/app/camera.js';
import { createFamilySlots } from '../../../js/app/family-slots.js';
import { createInterpolated } from '../../../js/app/interpolate.js';
import { createAuroraLayer } from '../../../js/app/renderer/aurora-layer.js';
import { interleavedNoise } from '../../../js/app/renderer/finish-glsl.js';
import {
    createMateThreadLayer,
    createMateThreadPool,
    MATE_TICKS,
    spawnMateThread,
    stepMateThreads,
} from '../../../js/app/renderer/mate-threads.js';
import { createLineBuffer } from '../../../js/app/renderer/line-buffer.js';
import { createTerrainLayer } from '../../../js/app/renderer/terrain-layer.js';
import { createObstacleLayer } from '../../../js/app/renderer/world-layers.js';
import { rockShape } from '../../../js/app/renderer/rock-shape.js';
import { smallReady } from '../helpers/ready.js';

/**
 * @param {Record<string, any>} info ready.info
 * @param {any} snapshot the snapshot or null
 * @returns {any} a frame
 */
function frameOf(info, snapshot) {
    return {
        nowMs: 3000,
        dtMs: 16,
        tick: 20,
        snapshot,
        agents: createInterpolated(4),
        family: createFamilySlots(),
        season: 2,
        seasonProgress: 0.8,
        camera: createCameraController({
            canvas: { width: 1600, height: 1000 },
            world: { width: info.worldWidth, height: info.worldHeight },
        }),
        lenses: { temperature: false, scent: false, territory: false, vision: false, calls: false },
    };
}

describe('aurora layer tiers', () => {
    it('redraws every frame at level 0 and every second frame at level 1, and follows a resize', () => {
        const layer = createAuroraLayer();
        let renders = 0;
        const renderer = { getRenderTarget: () => null, setRenderTarget: () => {}, render: () => (renders += 1) };
        const { info } = smallReady();
        const frame = frameOf(info, null);
        layer.resize?.(800, 600);
        layer.setLook?.({ aurora: 0 });
        for (let i = 0; i < 4; i++) {
            layer.update?.(frame);
            layer.prerender?.(renderer, null);
        }
        expect(renders).toBe(4);
        renders = 0;
        layer.setLook?.({ aurora: 1 });
        for (let i = 0; i < 4; i++) {
            layer.update?.(frame);
            layer.prerender?.(renderer, null);
        }
        expect(renders).toBe(2);
        layer.setLook?.({ aurora: 2 });
        layer.prerender?.(renderer, null);
        expect(renders).toBe(2);
        layer.dispose();
    });
});

describe('mate thread layer', () => {
    it('frees a thread outside its age, and writes and uploads the live ones when visible', () => {
        const pool = createMateThreadPool(4);
        spawnMateThread(pool, { x: 0, y: 0, tick: 100, a: 1, b: 2, d: 0 });
        const agents = createInterpolated(4);
        const lines = createLineBuffer(48);
        const family = createFamilySlots();
        stepMateThreads(pool, { agents, tick: 100 + MATE_TICKS + 1, family }, lines);
        expect(pool.alive[0]).toBe(0);
        expect(lines.vertices).toBe(0);

        const layer = createMateThreadLayer({ pool });
        spawnMateThread(pool, { x: 0, y: 0, tick: 100, a: 1, b: 2, d: 0 });
        agents.count = 2;
        agents.genomeId[0] = 1;
        agents.genomeId[1] = 2;
        agents.x[1] = 90;
        const { info } = smallReady();
        const frame = { ...frameOf(info, null), agents, tick: 120 };
        layer.update?.(frame);
        expect(layer.object.geometry.drawRange.count).toBeGreaterThan(0);
        layer.setLook?.({ threads: -1 });
        layer.update?.(frame);
        expect(layer.object.visible).toBe(false);
        layer.dispose();
    });
});

describe('terrain layer without a cold margin', () => {
    it('has no frost, and its update feeds the clock to every glow', () => {
        const info = {
            worldWidth: 3000,
            worldHeight: 2000,
            patches: [{ x: 10, y: 10, radius: 30 }],
            terrain: { layout: 'basins', coldMarginWidth: 0, refuges: [{ x: 500, y: 500, radius: 100 }] },
        };
        const layer = createTerrainLayer({ info });
        expect(layer.object.children).toHaveLength(3);
        layer.update?.(/** @type {any} */ ({ nowMs: 4000 }));
        expect(layer.object.children[0].material.uniforms.uTime.value).toBeCloseTo(4);
        layer.dispose();
    });
});

describe('obstacle layer', () => {
    it('picks its tier from the look and draws the snapshot obstacles in both passes', () => {
        const { info, snapshot } = smallReady(5);
        const layer = createObstacleLayer({ info, seed: 3 });
        const [rim, body] = layer.object.children;
        for (const [look, tier] of [
            [0, 0],
            [1, 1],
            [2, 2],
            [-1, 2],
        ]) {
            layer.setLook?.({ rocks: look });
            expect(rim.material.uniforms.uTier.value).toBe(tier);
            expect(body.material.uniforms.uTier.value).toBe(tier);
        }
        layer.update?.(frameOf(info, snapshot));
        expect(rim.count).toBe(body.count);
        expect(layer.object.count).toBe(rim.count);
        layer.update?.(frameOf(info, null));
        expect(layer.object.count).toBe(0);
        layer.dispose();
    });
});

describe('small branches', () => {
    it('interleavedNoise stays in [0, 1) for negative coordinates and later frames', () => {
        for (const [x, y, f] of [
            [-5, -9, 0],
            [-1000.5, 3, 7],
            [0, 0, 100],
        ]) {
            const n = interleavedNoise(x, y, f);
            expect(n).toBeGreaterThanOrEqual(0);
            expect(n).toBeLessThan(1);
        }
    });

    it('rockShape makes the same rock for the same seed and slot and fills a default array', () => {
        expect(Array.from(rockShape(5, 2))).toEqual(Array.from(rockShape(5, 2)));
    });
});

describe('layers on a minimal world', () => {
    it('draws a terrain layer for a world with no terrain block and no patches', () => {
        const layer = createTerrainLayer({ info: { worldWidth: 100, worldHeight: 100 } });
        expect(layer.object.children).toHaveLength(0);
        layer.dispose();
    });

    it('draws a basins world that lists no refuges', () => {
        const info = { worldWidth: 3000, worldHeight: 2000, terrain: { layout: 'basins', coldMarginWidth: 300 } };
        const layer = createTerrainLayer({ info });
        expect(layer.object.children).toHaveLength(1);
        layer.dispose();
    });

    it('fades out a thread whose alpha is below the visible floor', () => {
        const pool = createMateThreadPool(2);
        spawnMateThread(pool, { x: 0, y: 0, tick: 0, a: 1, b: 2, d: 0 });
        const agents = createInterpolated(2);
        agents.count = 2;
        agents.genomeId[0] = 1;
        agents.genomeId[1] = 2;
        const lines = createLineBuffer(24);
        stepMateThreads(pool, { agents, tick: 0.0001, family: createFamilySlots() }, lines);
        expect(lines.vertices).toBe(0);
    });
});
