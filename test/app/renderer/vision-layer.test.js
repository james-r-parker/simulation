import { describe, expect, it } from 'vitest';
import { createInterpolated, interpolateInto } from '../../../js/app/interpolate.js';
import { createLineBuffer } from '../../../js/app/renderer/line-buffer.js';
import { createVisionLayer, FAN_ALPHA, pushFans } from '../../../js/app/renderer/vision-layer.js';
import { smallReady } from '../helpers/ready.js';
import { makeSnapshot } from '../helpers/snapshots.js';

const INFO = { rayCount: 4, maxAgents: 8, specs: [{ visionRange: 100 }, { visionRange: 200 }] };
const LIST = [
    { slot: 0, genomeId: 1, x: 10, y: 10, angle: 0, spec: 0 },
    { slot: 1, genomeId: 2, x: 50, y: 10, angle: 0, spec: 1 },
];

/**
 * @param {number} rayCount rays written, 0 for none
 * @returns {{agents: ReturnType<typeof createInterpolated>, snapshot: any}} two agents and a snapshot with rays
 */
function source(rayCount) {
    const snapshot = makeSnapshot(1, LIST);
    snapshot.u32[5] = rayCount;
    const rays = new Float32Array(snapshot.buffer.byteLength / 4 + 2 * rayCount);
    rays.set(snapshot.f32);
    const u32 = new Uint32Array(rays.buffer);
    const start = snapshot.f32.length;
    rays.set([0, 0, 0, 0, 0.25, 0.25, 0.25, 0.25].slice(0, 2 * rayCount), start);
    const agents = createInterpolated(8);
    interpolateInto(null, snapshot, 1, agents);
    return { agents, snapshot: { tick: 1, u32, f32: rays } };
}

describe('pushFans', () => {
    it('draws every ray of every agent at the fan alpha, each agent from its own vision range', () => {
        const lines = createLineBuffer(8);
        pushFans(lines, source(4), INFO);
        expect(lines.vertices).toBe(2 * 4 * 2);
        expect(lines.color[3]).toBeCloseTo(FAN_ALPHA);
        const reach = (/** @type {number} */ v) =>
            Math.hypot(
                lines.position[v * 3 + 3] - lines.position[v * 3],
                lines.position[v * 3 + 4] - lines.position[v * 3 + 1],
            );
        expect(reach(0)).toBeCloseTo(100);
        expect(reach(8)).toBeCloseTo(150);
    });

    it('draws nothing when the snapshot has no ray part', () => {
        const lines = createLineBuffer(8);
        pushFans(lines, source(0), INFO);
        expect(lines.vertices).toBe(0);
    });
});

describe('createVisionLayer', () => {
    const { info } = smallReady();

    it('is hidden while the lens is off or there is no snapshot, and draws the fans when on', () => {
        const layer = createVisionLayer({ info: { ...INFO, ...info, rayCount: 4, specs: INFO.specs } });
        const { agents, snapshot } = source(4);
        layer.update?.(/** @type {any} */ ({ lenses: { vision: false }, snapshot, agents }));
        expect(layer.object.visible).toBe(false);
        layer.update?.(/** @type {any} */ ({ lenses: { vision: true }, snapshot: null, agents }));
        expect(layer.object.visible).toBe(false);
        layer.update?.(/** @type {any} */ ({ lenses: { vision: true }, snapshot, agents }));
        expect(layer.object.visible).toBe(true);
        expect(layer.object.geometry.drawRange.count).toBe(16);
        layer.dispose();
    });
});
