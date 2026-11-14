import { describe, expect, it } from 'vitest';
import { clearLines, createLineBuffer, pushVertex, setLineColor } from '../../../js/app/renderer/line-buffer.js';
import { createBorderLines, createLineMesh, packSegments } from '../../../js/app/renderer/line-draw.js';

describe('packSegments', () => {
    it('turns vertex pairs into segments with the display colour scaled by alpha', () => {
        const lines = createLineBuffer(4);
        setLineColor(lines, [0.2, 0.05, 0], 0.5);
        pushVertex(lines, 0, 0);
        pushVertex(lines, 10, 0);
        pushVertex(lines, 3, 3);
        const out = { seg: new Float32Array(16), color: new Float32Array(16) };
        expect(packSegments(lines, out, [0, 0, 0])).toBe(1);
        expect(Array.from(out.seg.slice(0, 4))).toEqual([0, 0, 10, 0]);
        expect(out.color[3]).toBe(0.5);
        expect(out.color[0]).toBeGreaterThan(out.color[1]);
        expect(Math.max(out.color[0], out.color[1], out.color[2])).toBeLessThanOrEqual(0.5);
    });
});

describe('createLineMesh', () => {
    it('draws one instance per segment and nothing for an empty buffer', () => {
        const lines = createLineBuffer(3);
        const mesh = createLineMesh(lines, { widthPx: 2 });
        pushVertex(lines, 0, 0);
        pushVertex(lines, 1, 1);
        mesh.upload();
        expect(mesh.object.geometry.instanceCount).toBe(1);
        clearLines(lines);
        mesh.upload();
        expect(mesh.object.geometry.instanceCount).toBe(0);
        expect(mesh.object.material.blending).toBe(2);
        mesh.dispose();
    });
});

describe('createBorderLines', () => {
    it('draws the four world edges', () => {
        const layer = createBorderLines({ info: { worldWidth: 100, worldHeight: 50 } });
        expect(layer.object.geometry.instanceCount).toBe(4);
        expect(Array.from(layer.object.geometry.attributes.iSeg.data.array.slice(8, 12))).toEqual([100, 0, 100, 50]);
        layer.dispose();
    });
});
