import { describe, expect, it } from 'vitest';
import { createCameraController } from '../../../js/app/camera.js';
import { createInterpolated } from '../../../js/app/interpolate.js';
import {
    createFollowRing,
    RING_ALPHA,
    RING_GAP_PX,
    RING_SCALE,
    writeRing,
} from '../../../js/app/renderer/follow-ring.js';

/** @returns {any} a frame with one agent (genome 7) at (40, 60), size 5 */
function frame() {
    const agents = createInterpolated(2);
    agents.count = 1;
    agents.genomeId[0] = 7;
    agents.x[0] = 40;
    agents.y[0] = 60;
    agents.size[0] = 5;
    const camera = createCameraController({
        canvas: { width: 100, height: 100 },
        world: { width: 1000, height: 1000 },
    });
    return { agents, camera, followId: 7 };
}

describe('createFollowRing', () => {
    it('draws one ring at the followed body, sized by the body and a pixel gap, and none when nothing is followed', () => {
        const layer = createFollowRing();
        const f = frame();
        layer.update?.(f);
        expect(layer.object.geometry.instanceCount).toBe(1);
        expect(layer.object.visible).toBe(true);
        const row = layer.object.geometry.getAttribute('iRing');
        expect([row.getX(0), row.getY(0)]).toEqual([40, 60]);
        expect(row.getZ(0)).toBeCloseTo(5 * RING_SCALE + RING_GAP_PX / f.camera.zoom, 4);
        expect(row.getW(0)).toBeCloseTo(RING_ALPHA, 6);
        layer.update?.({ ...f, followId: 0 });
        expect(layer.object.geometry.instanceCount).toBe(0);
        expect(layer.object.visible).toBe(false);
        layer.update?.({ ...f, followId: 99 });
        expect(layer.object.visible).toBe(false);
        layer.dispose();
    });
});

describe('writeRing', () => {
    it('scales the display colour by the alpha and puts the gap in screen pixels', () => {
        const arrays = { iRing: new Float32Array(4), iColor: new Float32Array(4) };
        writeRing(arrays, { x: 1, y: 2, size: 10, zoom: 2 });
        expect(arrays.iRing[2]).toBeCloseTo(10 * RING_SCALE + RING_GAP_PX / 2, 5);
        expect(arrays.iColor[3]).toBeCloseTo(RING_ALPHA, 6);
        expect(Math.max(...arrays.iColor.slice(0, 3))).toBeLessThanOrEqual(RING_ALPHA + 1e-6);
        expect(Math.max(...arrays.iColor.slice(0, 3))).toBeGreaterThan(0.3);
    });
});
