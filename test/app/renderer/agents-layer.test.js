import { createFamilySlots } from '../../../js/app/family-slots.js';
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
        family: createFamilySlots(),
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

    it('tells the shader the palette in force and adds the hunter flag only for specialisations that can hunt', () => {
        const { info, layout, snapshot } = smallReady(30);
        const layer = createAgentsLayer({ info, flagBits: layout.flags });
        const frame = frameOf(info, snapshot);
        frame.family.palette = 'high-contrast';
        layer.update?.(frame);
        const meshes = layer.object.children;
        expect(meshes[0].material.uniforms.uPalette.value).toBe(2);
        const hunters = meshes.map((/** @type {any} */ m) => m.material.uniforms.uHunter.value);
        expect(hunters).toEqual(info.specs.map((/** @type {any} */ s) => (s.canHunt ? 1 : 0)));
        layer.dispose();
    });
});

describe('motion cues', () => {
    it('scale the speed cue by the world maxVelocity, not a fixed number', () => {
        const { info, layout, snapshot } = smallReady(20);
        const frame = frameOf(info, snapshot);
        for (let i = 0; i < frame.agents.count; i++) {
            frame.agents.speed[i] = info.maxVelocity / 2;
        }
        const layer = createAgentsLayer({ info, flagBits: layout.flags });
        layer.update?.(frame);
        const bucket = layer.store.buckets.find((/** @type {any} */ b) => b.count > 0);
        if (!bucket) {
            throw new Error('no agents were packed');
        }
        expect(bucket.motion[0]).toBeCloseTo(0.5, 5);
        layer.dispose();
    });
});

describe('setLook', () => {
    it('sets uMotion by quality tier (1 for 0, 0.5 for 1, 0 for off)', () => {
        const { info, layout } = smallReady();
        const layer = createAgentsLayer({ info, flagBits: layout.flags });
        const u = layer.object.children[0].material.uniforms;
        expect(u.uMotion.value).toBe(1);
        layer.setLook?.({ motion: 1 });
        expect(u.uMotion.value).toBe(0.5);
        layer.setLook?.({ motion: 2 });
        expect(u.uMotion.value).toBe(0);
        layer.setLook?.({ motion: 0 });
        expect(u.uMotion.value).toBe(1);
        layer.dispose();
    });

    it('sets the flora, body, weather and courtship uniforms from their tiers, and treats a missing tier as off', () => {
        const { info, layout } = smallReady();
        const layer = createAgentsLayer({ info, flagBits: layout.flags });
        const u = layer.object.children[0].material.uniforms;
        const read = () => [u.uFlora.value, u.uBody.value, u.uWeather.value, u.uCourt.value];
        layer.setLook?.({ motion: 0, flora: 0, body: 0, weather: 0, courtship: 0 });
        expect(read()).toEqual([1, 1, 1, 1]);
        layer.setLook?.({ motion: 0, flora: -1, body: 1, weather: -1, courtship: -1 });
        expect(read()).toEqual([0, 0.5, 0, 0]);
        layer.setLook?.({ motion: 0, flora: 0, body: 2 });
        expect(read()).toEqual([1, 0, 0, 0]);
        layer.dispose();
    });

    it('sets the body, weather, courtship and flora gates from their items', () => {
        const { info, layout } = smallReady();
        const layer = createAgentsLayer({ info, flagBits: layout.flags });
        const u = layer.object.children[0].material.uniforms;
        layer.setLook?.({ body: 0, weather: 0, courtship: 0, flora: 0 });
        expect([u.uBody.value, u.uWeather.value, u.uCourt.value, u.uFlora.value]).toEqual([1, 1, 1, 1]);
        layer.setLook?.({ body: 1, weather: -1, courtship: -1, flora: -1 });
        expect([u.uBody.value, u.uWeather.value, u.uCourt.value, u.uFlora.value]).toEqual([0.5, 0, 0, 0]);
        layer.setLook?.({});
        expect([u.uBody.value, u.uWeather.value, u.uCourt.value]).toEqual([0, 0, 0]);
        layer.dispose();
    });
});
