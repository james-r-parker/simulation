import { describe, expect, it } from 'vitest';
import { createCameraController } from '../../../js/app/camera.js';
import { createInterpolated } from '../../../js/app/interpolate.js';
import { PALETTE } from '../../../js/app/renderer/colors.js';
import {
    carcassLook,
    createBorderLayer,
    createFoodLayer,
    createObstacleLayer,
    packBodies,
    packFoodAges,
    packFoodLook,
} from '../../../js/app/renderer/world-layers.js';
import { smallReady } from '../helpers/ready.js';

/**
 * @param {Record<string, any>} info ready.info
 * @param {any} snapshot the snapshot
 * @returns {any} a frame
 */
function frameOf(info, snapshot) {
    return {
        nowMs: 3000,
        dtMs: 16,
        snapshot,
        agents: createInterpolated(1),
        camera: createCameraController({
            canvas: { width: 1600, height: 1000 },
            world: { width: info.worldWidth, height: info.worldHeight },
        }),
        lenses: { temperature: false, scent: false, territory: false, vision: false, calls: false },
    };
}

describe('packBodies', () => {
    it('writes x, y, radius and a position-based phase, capped at the capacity', () => {
        const f32 = Float32Array.from([10, 20, 3, 30, 40, 4, 50, 60, 5]);
        const out = new Float32Array(2 * 4);
        expect(packBodies(f32, { start: 0, count: 3 }, out)).toBe(2);
        expect(Array.from(out.slice(0, 3))).toEqual([10, 20, 3]);
        expect(out[3]).toBeCloseTo(10 * 0.013 + 20 * 0.007);
        expect(out[7]).not.toBe(out[3]);
    });

    it('handles both 3-word and 4-word strides', () => {
        const f32_3 = Float32Array.from([10, 20, 3, 30, 40, 4]);
        const out3 = new Float32Array(2 * 4);
        expect(packBodies(f32_3, { start: 0, count: 2 }, out3, 3)).toBe(2);
        expect(Array.from(out3.slice(0, 3))).toEqual([10, 20, 3]);
        expect(Array.from(out3.slice(4, 7))).toEqual([30, 40, 4]);

        const f32_4 = Float32Array.from([10, 20, 3, 0.1, 30, 40, 4, 0.8]);
        const out4 = new Float32Array(2 * 4);
        expect(packBodies(f32_4, { start: 0, count: 2 }, out4, 4)).toBe(2);
        expect(Array.from(out4.slice(0, 3))).toEqual([10, 20, 3]);
        expect(Array.from(out4.slice(4, 7))).toEqual([30, 40, 4]);
    });
});

describe('meat in the food records', () => {
    it('keeps the negative radius that marks meat, so the shader sizes by abs and colours by sign', () => {
        const f32 = Float32Array.from([10, 20, 3, 30, 40, -4]);
        const out = new Float32Array(2 * 4);
        packBodies(f32, { start: 0, count: 2 }, out);
        expect(out[2]).toBe(3);
        expect(out[6]).toBe(-4);
    });

    it('is a colour distinct from plant food', () => {
        expect(PALETTE.meat).not.toEqual(PALETTE.food);
    });
});

describe('food and obstacle layers', () => {
    it('draw exactly the food and obstacles in the snapshot', () => {
        const { info, snapshot } = smallReady(10);
        const food = createFoodLayer({ info });
        const obstacles = createObstacleLayer({ info });
        const frame = frameOf(info, snapshot);
        food.update?.(frame);
        obstacles.update?.(frame);
        expect(food.object.count).toBe(snapshot.u32[2]);
        expect(obstacles.object.count).toBe(snapshot.u32[3]);
        expect(food.object.visible).toBe(true);
        expect(food.object.geometry.getAttribute('iBody').array[2]).toBeGreaterThan(0);
        food.dispose();
        obstacles.dispose();
    });

    it('feed the zoom and time to their shaders and use the palette', () => {
        const { info, snapshot } = smallReady();
        const food = createFoodLayer({ info });
        const obstacles = createObstacleLayer({ info });
        const frame = frameOf(info, snapshot);
        food.update?.(frame);
        obstacles.update?.(frame);
        expect(food.object.material.uniforms.uZoom.value).toBe(frame.camera.zoom);
        expect(food.object.material.uniforms.uTime.value).toBe(3);
        expect(food.object.material.uniforms.uColor.value).toEqual(PALETTE.food);
        expect(food.object.material.uniforms.uMeatColor.value).toEqual(PALETTE.meat);
        expect(obstacles.object.material.uniforms.uRim.value).toEqual(PALETTE.obstacleRim);
    });

    it('draws obstacles as two passes: rim and body', () => {
        const { info } = smallReady();
        const obstacles = createObstacleLayer({ info });
        expect(obstacles.object.children.length).toBe(2);
        const [rimMesh, bodyMesh] = obstacles.object.children;
        expect(rimMesh.material.uniforms.uPass.value).toBe(0);
        expect(bodyMesh.material.uniforms.uPass.value).toBe(1);
        expect(rimMesh.geometry.getAttribute('iShape')).toBeDefined();
        obstacles.setLook?.({ rocks: 1 });
        expect(rimMesh.material.uniforms.uTier.value).toBe(1);
        expect(bodyMesh.material.uniforms.uTier.value).toBe(1);
        obstacles.setLook?.({ rocks: -1 });
        expect(rimMesh.material.uniforms.uTier.value).toBe(2);
        obstacles.dispose();
    });

    it('draw nothing before a snapshot', () => {
        const { info } = smallReady();
        const food = createFoodLayer({ info });
        const frame = frameOf(info, null);
        food.update?.(frame);
        const obstacles = createObstacleLayer({ info });
        obstacles.update?.(frame);
        expect(food.object.count).toBe(0);
        expect(obstacles.object.count).toBe(0);
    });
});

describe('border layer', () => {
    it('is a closed loop around the world in 6% white', () => {
        const { info } = smallReady();
        const border = createBorderLayer({ info });
        const p = border.object.geometry.getAttribute('position');
        expect(p.count).toBe(4);
        expect(Array.from(p.array.slice(3, 6))).toEqual([info.worldWidth, 0, 0]);
        expect(border.object.material.color.r).toBeCloseTo(0.06);
        border.dispose();
    });
});

describe('carcassLook', () => {
    it('is exact at 0, 0.1, 0.5 and 1, and monotone in between', () => {
        const at0 = carcassLook(0);
        expect(at0.dim).toBe(1);
        expect(at0.scale).toBe(1);

        const at01 = carcassLook(0.1);
        expect(at01.dim).toBe(1);
        expect(at01.scale).toBeCloseTo(0.96, 4);

        const at05 = carcassLook(0.5);
        expect(at05.dim).toBeCloseTo(0.7289, 3);
        expect(at05.scale).toBeCloseTo(0.8, 4);

        const at1 = carcassLook(1);
        expect(at1.dim).toBeCloseTo(0.35, 4);
        expect(at1.scale).toBeCloseTo(0.6, 4);

        let prevDim = 1;
        let prevScale = 1;
        for (let t = 0; t <= 1.001; t += 0.05) {
            const cur = carcassLook(t);
            expect(cur.dim).toBeLessThanOrEqual(prevDim + 1e-6);
            expect(cur.scale).toBeLessThanOrEqual(prevScale + 1e-6);
            prevDim = cur.dim;
            prevScale = cur.scale;
        }
    });
});

describe('packFoodAges', () => {
    it('packs the fourth word of each food record into the age array', () => {
        const f32 = Float32Array.from([10, 20, 3, 0.25, 0, 0, 30, 40, -4, 0.75, 0, 0]);
        const out = new Float32Array(2);
        expect(packFoodAges(f32, { start: 0, count: 2 }, out)).toBe(2);
        expect(out[0]).toBeCloseTo(0.25, 4);
        expect(out[1]).toBeCloseTo(0.75, 4);
    });
});

describe('packFoodLook', () => {
    it('copies independent species and signed hue records without allocating', () => {
        const records = Float32Array.from([1, 2, 3, 0.2, 4, -0.5, 4, 5, 6, 0.3, 5, 0.75]);
        const out = new Float32Array(4);
        expect(packFoodLook(records, { start: 0, count: 2 }, out)).toBe(2);
        expect(Array.from(out)).toEqual([4, -0.5, 5, 0.75]);
    });
});

describe('decay look toggle', () => {
    it('toggles uDecay uniform on food layer', () => {
        const { info } = smallReady();
        const food = createFoodLayer({ info });
        expect(food.object.geometry.getAttribute('iAge')).toBeDefined();
        expect(food.object.geometry.getAttribute('iAge').itemSize).toBe(1);
        food.setLook?.({ decay: -1 });
        expect(food.object.material.uniforms.uDecay.value).toBe(0);
        food.setLook?.({ decay: 0 });
        expect(food.object.material.uniforms.uDecay.value).toBe(1);
        food.dispose();
    });
});
