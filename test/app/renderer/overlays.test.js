import { describe, expect, it } from 'vitest';
import { createCameraController } from '../../../js/app/camera.js';
import { createInterpolated, interpolateInto } from '../../../js/app/interpolate.js';
import { createLineBuffer } from '../../../js/app/renderer/line-buffer.js';
import { createOverlays, findAgent, pushRays, trackedIds } from '../../../js/app/renderer/overlays.js';
import { smallReady } from '../helpers/ready.js';
import { makeSnapshot } from '../helpers/snapshots.js';

const list = [
    { slot: 0, genomeId: 1, lineageId: 5, x: 10, y: 10, angle: 0, size: 20, spec: 0 },
    { slot: 1, genomeId: 2, lineageId: 6, x: 50, y: 10, angle: 0, size: 20, spec: 1 },
    { slot: 2, genomeId: 3, lineageId: 5, x: 90, y: 10, angle: 0, size: 20, spec: 0 },
];

/** @returns {ReturnType<typeof createInterpolated>} the three agents */
function agents() {
    const out = createInterpolated(8);
    interpolateInto(null, makeSnapshot(1, list), 1, out);
    return out;
}

describe('findAgent and trackedIds', () => {
    it('finds by genome id, and 0 is never found', () => {
        expect(findAgent(agents(), 2)).toBe(1);
        expect(findAgent(agents(), 9)).toBe(-1);
        expect(findAgent(agents(), 0)).toBe(-1);
    });

    it('lists the selected agent first, then the leading lineage, up to the capacity', () => {
        const out = new Uint32Array(8);
        expect(trackedIds(agents(), { selectedId: 2, leadLineageId: 5 }, out)).toBe(3);
        expect(Array.from(out.slice(0, 3))).toEqual([2, 1, 3]);
        expect(trackedIds(agents(), { selectedId: 1, leadLineageId: 5 }, out)).toBe(2);
        expect(trackedIds(agents(), { selectedId: 0, leadLineageId: 0 }, out)).toBe(0);
        expect(trackedIds(agents(), { selectedId: 2, leadLineageId: 5 }, new Uint32Array(2))).toBe(2);
    });
});

describe('pushRays', () => {
    it('reaches the vision range for a miss and shortens with proximity, spaced round the heading', () => {
        const lines = createLineBuffer(8);
        const f32 = Float32Array.from([0, 0.5, 1, 0]);
        pushRays(lines, { x: 0, y: 0, angle: 0, vision: 100 }, { f32, start: 0, count: 4 });
        expect(lines.vertices).toBe(8);
        expect(lines.position[3]).toBeCloseTo(100);
        expect(Math.hypot(lines.position[9], lines.position[10])).toBeCloseTo(50);
        expect(Math.hypot(lines.position[15], lines.position[16])).toBeCloseTo(0);
        expect(lines.position[16]).toBeCloseTo(0);
        expect(lines.position[10]).toBeCloseTo(50);
        expect(lines.color[3]).toBeCloseTo(0.12);
    });
});

describe('createOverlays', () => {
    it('draws nothing for no selection, and rays, antennae, range ring and marker for a selection', () => {
        const { info } = smallReady();
        const layer = createOverlays({ info: { ...info, rayCount: 4 } });
        const camera = createCameraController({
            canvas: { width: 100, height: 100 },
            world: { width: 1000, height: 1000 },
        });
        const snapshot = makeSnapshot(1, list);
        snapshot.u32[5] = 4;
        const frame = {
            agents: agents(),
            snapshot,
            camera,
            selectedId: 0,
            followId: 0,
            leadLineageId: 0,
            lenses: {},
        };
        layer.update?.(/** @type {any} */ (frame));
        expect(layer.object.geometry.drawRange.count).toBe(0);
        const picked = { ...frame, selectedId: 2 };
        layer.update?.(/** @type {any} */ (picked));
        expect(layer.object.geometry.drawRange.count).toBe(4 * 2 + 2 * 2 + 48 * 2 + 32 * 2);
        layer.dispose();
    });

    it('adds trails as ticks pass and a follow marker', () => {
        const { info } = smallReady();
        const layer = createOverlays({ info });
        const camera = createCameraController({
            canvas: { width: 100, height: 100 },
            world: { width: 1000, height: 1000 },
        });
        let count = 0;
        for (let tick = 1; tick <= 3; tick++) {
            const snapshot = makeSnapshot(tick, list);
            layer.update?.(
                /** @type {any} */ ({
                    agents: agents(),
                    snapshot,
                    camera,
                    selectedId: 0,
                    followId: 1,
                    leadLineageId: 5,
                    lenses: {},
                }),
            );
            count = layer.object.geometry.drawRange.count;
        }
        expect(count).toBe(2 * 2 * 2 + 32 * 2);
    });
});
