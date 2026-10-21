import { describe, expect, it } from 'vitest';
import { createCameraController } from '../../../js/app/camera.js';
import { createInterpolated } from '../../../js/app/interpolate.js';
import { PALETTE } from '../../../js/app/renderer/colors.js';
import {
    createBorderLayer,
    createFoodLayer,
    createObstacleLayer,
    packBodies,
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
