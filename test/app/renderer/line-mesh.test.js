import { describe, expect, it } from 'vitest';
import { createLineBuffer, pushVertex } from '../../../js/app/renderer/line-buffer.js';
import { createLineMesh } from '../../../js/app/renderer/line-mesh.js';

describe('createLineMesh', () => {
    it('uses the buffer arrays as its attributes and draws only what was written', () => {
        const lines = createLineBuffer(4);
        const mesh = createLineMesh(lines);
        const geometry = mesh.object.geometry;
        expect(geometry.getAttribute('position').array).toBe(lines.position);
        expect(geometry.getAttribute('color').array).toBe(lines.color);
        pushVertex(lines, 1, 2);
        pushVertex(lines, 3, 4);
        mesh.upload();
        expect(geometry.drawRange.count).toBe(2);
        mesh.dispose();
    });

    it('is additive, never culled and blind to depth', () => {
        const mesh = createLineMesh(createLineBuffer(1));
        expect(mesh.object.frustumCulled).toBe(false);
        expect(mesh.object.material.depthTest).toBe(false);
        expect(mesh.object.material.transparent).toBe(true);
        mesh.dispose();
    });
});
