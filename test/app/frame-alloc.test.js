import { describe, expect, it, vi } from 'vitest';
import { createCameraController } from '../../js/app/camera.js';
import { createInterpolated, interpolateInto } from '../../js/app/interpolate.js';
import { smallReady } from './helpers/ready.js';
import { makeSnapshot } from './helpers/snapshots.js';

// Per-frame code reuses scratch objects instead of allocating. Asserted by object identity at the spies, never by heap
// measurements.
const seen = vi.hoisted(() => ({
    circles: /** @type {object[]} */ ([]),
    fx: /** @type {object[]} */ ([]),
    clips: /** @type {object[]} */ ([]),
}));

vi.mock('../../js/app/renderer/clip-sampler.js', async (importOriginal) => {
    const real = /** @type {any} */ (await importOriginal());
    return {
        ...real,
        applyClip: (
            /** @type {any} */ table,
            /** @type {number} */ id,
            /** @type {number} */ t,
            /** @type {object} */ into,
        ) => {
            seen.clips.push(into);
            real.applyClip(table, id, t, into);
        },
    };
});

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

vi.mock('../../js/app/renderer/fx-ring.js', async (importOriginal) => {
    const real = /** @type {any} */ (await importOriginal());
    return {
        ...real,
        spawnFx: (/** @type {any} */ pool, /** @type {object} */ rec) => {
            seen.fx.push(rec);
            return real.spawnFx(pool, rec);
        },
    };
});

const { createOverlays } = await import('../../js/app/renderer/overlays.js');
const { createEffectsPlayer, playEffects } = await import('../../js/app/renderer/effects-player.js');

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

    it('the effects player reuses one effect-pool record for every effect', () => {
        const layout = {
            effectKinds: { BORN: 1, DIED: 2, BITE: 3, ALARM: 4, PACK_CALL: 5, SMOKE: 6 },
            deathCauses: { EATEN: 1 },
        };
        const player = createEffectsPlayer({
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
        seen.fx.length = 0;
        expect(playEffects(player, queue, agents, 1)).toBe(kinds.length);
        expect(seen.fx.length).toBeGreaterThan(10);
        expect(new Set(seen.fx).size).toBe(1);
    });
});

describe('per-frame scratch reuse in the crisp layers', () => {
    it('the agent rig and the herd pack hand applyClip one scratch per module, frame after frame', async () => {
        const { createAgentDraw } = await import('../../js/app/renderer/agent-draw.js');
        const { createHerdDraw } = await import('../../js/app/renderer/herd-draw.js');
        const { createFamilySlots } = await import('../../js/app/family-slots.js');
        const ready = smallReady(20);
        const agents = createInterpolated(ready.info.maxAgents);
        interpolateInto(null, ready.snapshot, 1, agents);
        const camera = createCameraController({
            canvas: { width: 800, height: 600 },
            world: { width: ready.info.worldWidth, height: ready.info.worldHeight },
        });
        const frame = /** @type {any} */ ({
            agents,
            camera,
            family: createFamilySlots(),
            lenses: {},
            nowMs: 0,
            dtMs: 16,
            tick: 1,
            alpha: 1,
        });
        const layer = createAgentDraw({
            info: ready.info,
            flagBits: ready.layout.flags,
            stateBits: ready.layout.stateBits,
        });
        seen.clips.length = 0;
        layer.update?.(frame);
        frame.nowMs = 16;
        layer.update?.(frame);
        expect(seen.clips.length).toBeGreaterThan(agents.count);
        expect(new Set(seen.clips).size).toBe(1);
        const herds = createHerdDraw({ info: { herdMax: 4, herdRadius: 80, herdRunSpeed: 6 } });
        seen.clips.length = 0;
        const snapshot = makeSnapshot(1, [], {
            herds: [
                [0, 0, 0, 0, 0, 0],
                [9, 9, 1, 0.9, 0, 0],
            ],
        });
        herds.update?.(/** @type {any} */ ({ snapshot, alpha: 1, nowMs: 0 }));
        herds.update?.(/** @type {any} */ ({ snapshot, alpha: 1, nowMs: 16 }));
        expect(seen.clips).toHaveLength(4);
        expect(new Set(seen.clips).size).toBe(1);
    });

    it('motionAt returns one scratch and the upload reuses its lanes and interleaved buffer', async () => {
        const { motionAt } = await import('../../js/app/renderer/fx-pack.js');
        const { createInstances, uploadInstances } = await import('../../js/app/renderer/instances.js');
        const at = { t: 0.5, angle: 0, reach: 1, seed: 0 };
        expect(motionAt(1, at)).toBe(motionAt(5, at));
        const inst = createInstances(2, ['iPose', 'iNeon']);
        const lanes = inst.lanes;
        const data = inst.data;
        uploadInstances(inst, 1);
        uploadInstances(inst, 2);
        expect(inst.lanes).toBe(lanes);
        expect(inst.data).toBe(data);
    });
});
