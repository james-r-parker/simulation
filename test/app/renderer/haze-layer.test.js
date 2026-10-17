import { DataUtils } from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraController } from '../../../js/app/camera.js';
import {
    createHazeLayer,
    fadeAt,
    FADE_MS,
    HAZE_CAP,
    HAZE_CAP_LENS,
    packField,
    SATURATION_RATE,
} from '../../../js/app/renderer/haze-layer.js';
import { PALETTE } from '../../../js/app/renderer/colors.js';
import { smallReady } from '../helpers/ready.js';

const grid = { cols: 3, rows: 2, pheromoneMax: 10 };

describe('packField', () => {
    it('maps each grid to a channel through 1 - exp(-1.6 x value / max)', () => {
        const cells = 6;
        const field = new Float32Array(cells * 3);
        field[1] = 10;
        field[cells + 4] = 5;
        field[2 * cells + 0] = 20;
        const out = packField(field, grid, new Uint16Array(cells * 4));
        const at = (/** @type {number} */ i) => DataUtils.fromHalfFloat(out[i]);
        expect(at(1 * 4 + 0)).toBeCloseTo(1 - Math.exp(-SATURATION_RATE), 3);
        expect(at(4 * 4 + 1)).toBeCloseTo(1 - Math.exp(-SATURATION_RATE / 2), 3);
        expect(at(0 * 4 + 2)).toBeCloseTo(1 - Math.exp(-SATURATION_RATE * 2), 3);
        expect(at(0)).toBe(0);
        expect(at(3)).toBe(1);
    });

    it('uses the injected half-float converter and keeps empty fields at zero', () => {
        const out = packField(new Float32Array(18), grid, new Uint16Array(24), (v) => Math.round(v * 100));
        expect(Array.from(out.slice(0, 4))).toEqual([0, 0, 0, 100]);
    });
});

describe('fadeAt', () => {
    it('runs 0 to 1 over 250 ms and clamps', () => {
        expect(FADE_MS).toBe(250);
        expect(fadeAt(1000, 1000)).toBe(0);
        expect(fadeAt(1000, 1125)).toBe(0.5);
        expect(fadeAt(1000, 5000)).toBe(1);
        expect(fadeAt(-Infinity, 5000)).toBe(1);
        expect(fadeAt(1000, 900)).toBe(0);
    });
});

describe('createHazeLayer', () => {
    it('swaps textures on each pushed field and cross-fades from the push time', () => {
        const { info } = smallReady();
        const layer = createHazeLayer({ info });
        const u = layer.object.material.uniforms;
        const first = u.uNext.value;
        layer.pushField(new Float32Array(info.cols * info.rows * 3).fill(5), 1000);
        expect(u.uNext.value).not.toBe(first);
        expect(u.uPrev.value).toBe(first);
        const frame = {
            nowMs: 1125,
            camera: createCameraController({ canvas: { width: 100, height: 100 }, world: { width: 100, height: 100 } }),
            lenses: { scent: false },
        };
        layer.update?.(/** @type {any} */ (frame));
        expect(u.uMix.value).toBe(0.5);
        expect(u.uCap.value).toBe(HAZE_CAP);
        layer.update?.(/** @type {any} */ ({ ...frame, lenses: { scent: true } }));
        expect(u.uCap.value).toBe(HAZE_CAP_LENS);
        const packed = u.uNext.value.image.data;
        expect(packed[3]).toBe(DataUtils.toHalfFloat(1));
        layer.dispose();
    });

    it('keeps a fully saturated field a faint veil on the black background', () => {
        const scentColours = [PALETTE.dangerScent, PALETTE.attackScent, PALETTE.huntScent];
        const peak = Math.max(...scentColours.flat());
        const srgb = (/** @type {number} */ linear) => 1.055 * linear ** (1 / 2.4) - 0.055;
        expect(srgb(HAZE_CAP * peak)).toBeLessThanOrEqual(0.15);
        expect(srgb(HAZE_CAP_LENS * peak)).toBeLessThanOrEqual(0.3);
        const one = { cols: 1, rows: 1, pheromoneMax: 10 };
        const out = packField(new Float32Array([1e9, 1e9, 1e9]), one, new Uint16Array(4), (v) => v);
        expect(Array.from(out.slice(0, 3))).toEqual([1, 1, 1]);
    });

    it('keeps danger a cold red, not magenta, and hunt a warm gold', () => {
        const [dr, dg, db] = PALETTE.dangerScent;
        expect(dr).toBeGreaterThan(4 * Math.max(dg, db));
        const [hr, hg, hb] = PALETTE.huntScent;
        expect(hg / hr).toBeGreaterThan(0.6);
        expect(hg / hr).toBeLessThan(0.8);
        expect(hb).toBeLessThan(0.3);
    });
});
