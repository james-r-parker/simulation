import { describe, expect, it, vi } from 'vitest';
import { applyFrame, createAgentDraw, SCENT_DIM } from '../../../js/app/renderer/agent-draw.js';
import { AGENT_LANES, AGENT_ROW_FLOATS } from '../../../js/app/renderer/agent-lanes.js';
import { createFamilySlots } from '../../../js/app/family-slots.js';
import { SLOT } from '../../../js/app/pack/frame-slots.js';
import { packRig } from '../helpers/pack-rig.js';
import { smallReady } from '../helpers/ready.js';

/**
 * @param {any} layer the agent layer
 * @returns {number} the instances its meshes draw
 */
function drawnCount(layer) {
    return layer.object.children.reduce(
        (/** @type {number} */ n, /** @type {any} */ m) => n + m.geometry.instanceCount,
        0,
    );
}

describe('createAgentDraw', () => {
    it('draws one mesh per spec and puts every agent in exactly one, from the rows the pack worker made', () => {
        const ready = smallReady(20);
        const layer = createAgentDraw({ info: ready.info });
        expect(layer.object.children).toHaveLength(ready.info.specs.length);
        const frame = packRig(ready).produce();
        layer.update?.(frame);
        expect(frame.agents.count).toBeGreaterThan(0);
        expect(drawnCount(layer)).toBe(frame.agents.count);
        layer.dispose();
    });

    it('copies each bucket rows into its own buffer, not the shared slot', () => {
        const ready = smallReady(20);
        const layer = createAgentDraw({ info: ready.info });
        const frame = packRig(ready).produce();
        layer.update?.(frame);
        const meshes = layer.object.children;
        frame.packed.rows.forEach((/** @type {Float32Array} */ rows, /** @type {number} */ b) => {
            const n = frame.packed.head[SLOT.BUCKETS + b];
            const data = meshes[b].geometry.attributes.iPose.data.array;
            expect(data.buffer).not.toBeInstanceOf(SharedArrayBuffer);
            expect(Array.from(data.slice(0, n * AGENT_ROW_FLOATS))).toEqual(
                Array.from(rows.slice(0, n * AGENT_ROW_FLOATS)),
            );
            expect(meshes[b].geometry.instanceCount).toBe(n);
        });
        expect(Object.keys(meshes[0].geometry.attributes)).toEqual(['position', ...AGENT_LANES]);
        layer.dispose();
    });

    it('uploads once per new slot: the same slot again marks nothing, a new one does, and no slot hides the meshes', () => {
        const ready = smallReady(20);
        const layer = createAgentDraw({ info: ready.info });
        const rig = packRig(ready);
        const frame = rig.produce();
        layer.update?.(frame);
        const versions = layer.object.children.map((/** @type {any} */ m) => m.geometry.attributes.iPose.data.version);
        layer.update?.({ ...frame });
        expect(layer.object.children.map((/** @type {any} */ m) => m.geometry.attributes.iPose.data.version)).toEqual(
            versions,
        );
        const next = rig.produce({ nowMs: 1016 });
        layer.update?.(next);
        expect(next.packedSeq).toBeGreaterThan(frame.packedSeq);
        const busy = layer.object.children.findIndex((/** @type {any} */ m) => m.geometry.instanceCount > 0);
        expect(layer.object.children[busy].geometry.attributes.iPose.data.version).toBeGreaterThan(versions[busy]);
        layer.update?.({ ...next, packed: null, packedSeq: 0 });
        expect(drawnCount(layer)).toBe(0);
        expect(layer.object.children.every((/** @type {any} */ m) => !m.visible)).toBe(true);
        layer.update?.({ ...next, packed: null, packedSeq: 0 });
        layer.update?.(next);
        expect(drawnCount(layer)).toBe(next.agents.count);
        layer.dispose();
    });

    it('draws nothing before the pack worker published a frame', () => {
        const ready = smallReady();
        const layer = createAgentDraw({ info: ready.info });
        layer.update?.({ ...packRig(ready).frameOf(), packed: null, packedSeq: 0 });
        expect(drawnCount(layer)).toBe(0);
        layer.dispose();
    });

    it('dims the agents under the scent lens', () => {
        const ready = smallReady();
        const layer = createAgentDraw({ info: ready.info });
        layer.update?.(packRig(ready).produce({}, { lenses: { temperature: false, scent: true } }));
        const material = layer.object.children[0].material;
        expect(material.colorNode.isNode).toBe(true);
        expect(SCENT_DIM).toBeLessThan(1);
    });
});

describe('createAgentDraw fallbacks', () => {
    it('draws an unknown spec with the forager model, logs it, and handles the cvd-safe palette and the calls lens', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const ready = smallReady();
        const info = {
            ...ready.info,
            specs: ready.info.specs.map((/** @type {any} */ s, /** @type {number} */ i) =>
                i === 0 ? { ...s, name: 'mystery' } : s,
            ),
        };
        const layer = createAgentDraw({ info });
        expect(warn.mock.calls.some(([r]) => r.event === 'ModelMissing' && r.spec === 'mystery')).toBe(true);
        layer.update?.(
            packRig(ready).produce(
                {},
                {
                    family: createFamilySlots('cvd-safe'),
                    lenses: { temperature: true, scent: false, calls: true },
                },
            ),
        );
        expect(layer.object.children.length).toBe(info.specs.length);
        warn.mockRestore();
    });
});

describe('createAgentDraw on WebGPU', () => {
    it('binds no mesh to more than the 8 vertex buffers WebGPU allows by default', async () => {
        const { vertexBufferCount } = await import('../../../js/app/renderer/instances.js');
        const ready = smallReady();
        const layer = createAgentDraw({ info: ready.info });
        for (const mesh of layer.object.children) {
            expect(vertexBufferCount(mesh.geometry)).toBeLessThanOrEqual(8);
            expect(Object.keys(mesh.geometry.attributes).length).toBeLessThanOrEqual(16);
        }
        layer.dispose();
    });
});

describe('applyFrame', () => {
    const uniforms = () => ({ rimPx: { value: 0 }, dim: { value: 0 }, ringFloor: { value: 0 } });
    const frameOf = (/** @type {boolean} */ tv) =>
        /** @type {any} */ ({ family: { palette: 'default' }, lenses: { scent: false, calls: false }, tv });

    it('draws the rim 2.25 px wide in TV mode and 1.5 px otherwise', () => {
        const u = uniforms();
        applyFrame(frameOf(false), u);
        expect(u.rimPx.value).toBe(1.5);
        applyFrame(frameOf(true), u);
        expect(u.rimPx.value).toBe(2.25);
    });
});
