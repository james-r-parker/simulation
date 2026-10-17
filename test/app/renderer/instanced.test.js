import { describe, expect, it } from 'vitest';
import { createQuadGeometry, createQuadMesh, uploadInstances, VEC4 } from '../../../js/app/renderer/instanced.js';

describe('instanced quads', () => {
    it('builds a unit quad with one empty vec4 attribute per name', () => {
        const g = createQuadGeometry(8, ['iA', 'iB']);
        expect(g.getAttribute('corner').count).toBe(4);
        expect(g.index.count).toBe(6);
        expect(g.getAttribute('iA').array).toHaveLength(8 * VEC4);
        expect(g.getAttribute('iB').meshPerAttribute).toBe(1);
    });

    it('uploads only the used part and sets the count and visibility', () => {
        const g = createQuadGeometry(8, ['iA']);
        const mesh = createQuadMesh(g, undefined, 8);
        expect(mesh.count).toBe(0);
        expect(mesh.visible).toBe(false);
        const src = new Float32Array(8 * VEC4).map((_, i) => i + 1);
        uploadInstances(mesh, { iA: src }, 3);
        const attr = g.getAttribute('iA');
        expect(Array.from(attr.array.slice(0, 12))).toEqual(Array.from(src.slice(0, 12)));
        expect(attr.array[12]).toBe(0);
        expect(attr.updateRanges).toEqual([{ start: 0, count: 12 }]);
        expect(mesh.count).toBe(3);
        expect(mesh.visible).toBe(true);
        uploadInstances(mesh, { iA: src }, 0);
        expect(mesh.visible).toBe(false);
        expect(g.getAttribute('iA').updateRanges).toEqual([{ start: 0, count: 0 }]);
    });
});
