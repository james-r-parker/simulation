import { describe, expect, it } from 'vitest';
import { createCameraController } from '../../../js/app/camera.js';
import { createInterpolated, interpolateInto } from '../../../js/app/interpolate.js';
import { createAgentsLayer, meshTable, SCENT_DIM, SILHOUETTES } from '../../../js/app/renderer/agents-layer.js';
import { smallReady } from '../helpers/ready.js';

/**
 * @param {Record<string, any>} info ready.info
 * @param {{tick: number, u32: Uint32Array, f32: Float32Array}} snapshot the snapshot
 * @param {Record<string, boolean>} [lenses] lens overrides
 * @returns {any} a frame
 */
function frameOf(info, snapshot, lenses = {}) {
    const agents = createInterpolated(info.maxAgents);
    interpolateInto(null, snapshot, 1, agents);
    return {
        alpha: 1,
        tick: snapshot.tick,
        nowMs: 1500,
        dtMs: 16,
        agents,
        snapshot,
        camera: createCameraController({
            canvas: { width: 1600, height: 1000 },
            world: { width: info.worldWidth, height: info.worldHeight },
        }),
        lenses: { temperature: false, scent: false, territory: false, vision: false, calls: false, ...lenses },
    };
}

describe('SILHOUETTES', () => {
    it('keys the five specialisation names to distinct shapes', () => {
        expect(Object.keys(SILHOUETTES)).toEqual(['predator', 'forager', 'reproducer', 'scout', 'defender']);
        expect(new Set(Object.values(SILHOUETTES)).size).toBe(5);
    });
});

describe('createAgentsLayer', () => {
    it('builds five instanced meshes without a GL context, one per specialisation', () => {
        const { info, layout } = smallReady();
        const layer = createAgentsLayer({ info, flagBits: layout.flags });
        expect(layer.object.children).toHaveLength(5);
        const shapes = layer.object.children.map((/** @type {any} */ m) => m.material.uniforms.uShape.value);
        expect(shapes).toEqual(
            info.specs.map((/** @type {any} */ s) => SILHOUETTES[/** @type {keyof typeof SILHOUETTES} */ (s.name)]),
        );
        expect(layer.object.children.every((/** @type {any} */ m) => m.isInstancedMesh)).toBe(true);
        layer.dispose();
    });

    it('sets each mesh count to the agents of its specialisation and drops empty meshes from the draw', () => {
        const { info, layout, snapshot } = smallReady(20);
        const layer = createAgentsLayer({ info, flagBits: layout.flags });
        const frame = frameOf(info, snapshot);
        layer.update?.(frame);
        const counts = layer.object.children.map((/** @type {any} */ m) => m.count);
        expect(counts.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0)).toBe(frame.agents.count);
        layer.object.children.forEach((/** @type {any} */ m, /** @type {number} */ i) => {
            expect(m.visible).toBe(counts[i] > 0);
            const pose = m.geometry.getAttribute('iPose');
            if (counts[i] > 0) {
                expect(pose.array[3]).toBeGreaterThan(0);
            }
        });
        layer.dispose();
    });

    it('shares one set of uniforms and feeds them from the frame (zoom, time, lenses, view)', () => {
        const { info, layout, snapshot } = smallReady();
        const layer = createAgentsLayer({ info, flagBits: layout.flags });
        const frame = frameOf(info, snapshot, { temperature: true, scent: true });
        layer.update?.(frame);
        const u = layer.object.children.map((/** @type {any} */ m) => m.material.uniforms);
        expect(u.every((/** @type {any} */ x) => x.uZoom === u[0].uZoom)).toBe(true);
        expect(u[0].uZoom.value).toBe(frame.camera.zoom);
        expect(u[0].uTime.value).toBe(1.5);
        expect(u[0].uTempLens.value).toBe(1);
        expect(u[0].uDim.value).toBe(SCENT_DIM);
        expect(u[0].uBiteArc.value).toBe(info.biteArc);
        expect(u[0].uView.value.z).toBeCloseTo(info.worldWidth, 3);
        layer.dispose();
    });

    it('maps specialisation indices to meshes', () => {
        const { info } = smallReady();
        expect(meshTable(info)).toEqual([0, 1, 2, 3, 4]);
        expect(meshTable({ specs: [{ index: 2 }, { index: 0 }] })).toEqual([1, -1, 0]);
    });
});

describe('setSmokeTexture', () => {
    it('points every mesh at the smoke target', () => {
        const { info, layout } = smallReady();
        const layer = createAgentsLayer({ info, flagBits: layout.flags });
        const texture = { id: 'smoke' };
        layer.setSmokeTexture(texture);
        expect(
            layer.object.children.every((/** @type {any} */ m) => m.material.uniforms.uSmoke.value === texture),
        ).toBe(true);
    });
});
