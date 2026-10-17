import { describe, expect, it, vi } from 'vitest';
import { createCameraController } from '../../js/app/camera.js';
import { createInterpolated, interpolateInto } from '../../js/app/interpolate.js';
import { smallReady } from './helpers/ready.js';
import { makeSnapshot } from './helpers/snapshots.js';

// Per-frame code reuses scratch objects instead of allocating. Asserted by object identity at the spies, never by heap
// measurements.
const seen = vi.hoisted(() => ({
    circles: /** @type {object[]} */ ([]),
    rings: /** @type {object[]} */ ([]),
    bursts: /** @type {object[]} */ ([]),
}));

vi.mock('../../js/app/renderer/line-buffer.js', async (importOriginal) => {
    const real = /** @type {any} */ (await importOriginal());
    return {
        ...real,
        pushCircle: (/** @type {any} */ buffer, /** @type {object} */ circle) => {
            seen.circles.push(circle);
            real.pushCircle(buffer, circle);
        },
    };
});
vi.mock('../../js/app/renderer/rings.js', async (importOriginal) => {
    const real = /** @type {any} */ (await importOriginal());
    return {
        ...real,
        spawnRing: (/** @type {any} */ pool, /** @type {object} */ ring) => {
            seen.rings.push(ring);
            real.spawnRing(pool, ring);
        },
    };
});
vi.mock('../../js/app/renderer/sparks.js', async (importOriginal) => {
    const real = /** @type {any} */ (await importOriginal());
    return {
        ...real,
        spawnBurst: (/** @type {any} */ pool, /** @type {object} */ burst) => {
            seen.bursts.push(burst);
            return real.spawnBurst(pool, burst);
        },
    };
});

const { createOverlays } = await import('../../js/app/renderer/overlays.js');
const { createEffectsPlayer, playEffects } = await import('../../js/app/renderer/effects-player.js');
const { createRingPool } = await import('../../js/app/renderer/rings.js');
const { createSparkPool } = await import('../../js/app/renderer/sparks.js');

const list = [
    { slot: 0, genomeId: 1, lineageId: 5, x: 10, y: 10, angle: 0, size: 20, spec: 0 },
    { slot: 1, genomeId: 2, lineageId: 6, x: 50, y: 10, angle: 0, size: 20, spec: 1 },
];

describe('per-frame scratch reuse', () => {
    it('overlays pass the same circle options to pushCircle on every frame', () => {
        const { info } = smallReady();
        const layer = createOverlays({ info });
        const camera = createCameraController({
            canvas: { width: 100, height: 100 },
            world: { width: 1000, height: 1000 },
        });
        const agents = createInterpolated(8);
        seen.circles.length = 0;
        for (let tick = 1; tick <= 20; tick++) {
            const snapshot = makeSnapshot(tick, list);
            interpolateInto(null, snapshot, 1, agents);
            const frame = { agents, snapshot, camera, selectedId: 1, followId: 2, leadLineageId: 5, lenses: {} };
            layer.update?.(/** @type {any} */ (frame));
        }
        expect(seen.circles.length).toBe(20 * 3);
        expect(new Set(seen.circles).size).toBe(1);
        layer.dispose();
    });

    it('the effects player reuses one burst and one ring record for every effect', () => {
        const layout = {
            effectKinds: { BORN: 1, DIED: 2, BITE: 3, ALARM: 4, PACK_CALL: 5, SMOKE: 6 },
            deathCauses: { EATEN: 1 },
        };
        const player = createEffectsPlayer({
            rings: createRingPool(),
            sparks: createSparkPool(1),
            layout,
            info: { callRadius: 300, callTicks: 40 },
        });
        const buffer = new ArrayBuffer(16 * 8 * 4);
        const u32 = new Uint32Array(buffer);
        const kinds = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5];
        kinds.forEach((kind, i) => {
            u32[i * 8] = kind;
            u32[i * 8 + 1] = 1;
        });
        const queue = { u32, f32: new Float32Array(buffer), words: 8, start: 0, count: kinds.length, dropped: 0 };
        const agents = createInterpolated(8);
        seen.rings.length = 0;
        seen.bursts.length = 0;
        expect(playEffects(player, queue, agents, 1)).toBe(kinds.length);
        expect(seen.rings.length).toBe(6);
        expect(seen.bursts.length).toBe(6);
        expect(new Set(seen.rings).size).toBe(1);
        expect(new Set(seen.bursts).size).toBe(1);
    });
});
