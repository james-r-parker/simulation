import { describe, expect, it } from 'vitest';
import {
    createCameraController,
    fitZoom,
    homeZoom,
    moveCameraTo,
    pinchAt,
    resizeCamera,
    updateCamera,
    zoomAt,
} from '../../js/app/camera.js';

const WORLD = { width: 14400, height: 8100 };
const PHONE_UP = { width: 780, height: 1688 };
const PHONE_SIDE = { width: 1688, height: 780 };

describe('homeZoom', () => {
    it('is the fit on a landscape or square canvas', () => {
        expect(homeZoom({ width: 3840, height: 2160 }, WORLD)).toBe(fitZoom({ width: 3840, height: 2160 }, WORLD));
        expect(homeZoom({ width: 1000, height: 1000 }, WORLD)).toBe(fitZoom({ width: 1000, height: 1000 }, WORLD));
        expect(homeZoom(PHONE_SIDE, WORLD)).toBe(fitZoom(PHONE_SIDE, WORLD));
    });

    it('fills the height of a portrait canvas', () => {
        expect(homeZoom(PHONE_UP, WORLD)).toBeCloseTo(PHONE_UP.height / WORLD.height, 12);
        expect(homeZoom(PHONE_UP, WORLD)).toBeGreaterThan(fitZoom(PHONE_UP, WORLD) * 3);
    });

    it('is never below the fit, even for a world taller than wide', () => {
        const tall = { width: 1000, height: 5000 };
        expect(homeZoom(PHONE_UP, tall)).toBe(fitZoom(PHONE_UP, tall));
    });
});

describe('the camera on a phone', () => {
    it('starts at home in portrait, and can still zoom out to the whole world', () => {
        const c = createCameraController({ canvas: PHONE_UP, world: WORLD });
        expect(c.zoom).toBe(homeZoom(PHONE_UP, WORLD));
        zoomAt(c, 1e-9, { x: 0, y: 0 });
        expect(c.targetZoom).toBeLessThan(fitZoom(PHONE_UP, WORLD));
    });

    it('stays at home and keeps its centre when the phone turns, both ways', () => {
        const c = createCameraController({ canvas: PHONE_SIDE, world: WORLD });
        moveCameraTo(c, { x: 5000, y: 4000, zoom: 0 }, true);
        resizeCamera(c, PHONE_UP);
        expect(c.zoom).toBeCloseTo(homeZoom(PHONE_UP, WORLD), 12);
        expect(c.targetZoom).toBeCloseTo(homeZoom(PHONE_UP, WORLD), 12);
        expect([c.targetX, c.targetY]).toEqual([5000, 4000]);
        resizeCamera(c, PHONE_SIDE);
        expect(c.zoom).toBeCloseTo(fitZoom(PHONE_SIDE, WORLD), 12);
    });

    it('keeps a zoomed-in view zoomed in by the same ratio to home when the phone turns', () => {
        const c = createCameraController({ canvas: PHONE_SIDE, world: WORLD });
        zoomAt(c, 3, { x: 844, y: 390 });
        updateCamera(c, 100000);
        resizeCamera(c, PHONE_UP);
        expect(c.targetZoom / homeZoom(PHONE_UP, WORLD)).toBeCloseTo(3, 6);
    });

    it('Home in portrait returns to the height fill', () => {
        const c = createCameraController({ canvas: PHONE_UP, world: WORLD });
        zoomAt(c, 4, { x: 100, y: 100 });
        moveCameraTo(c, { x: 7200, y: 4050, zoom: 0 });
        expect(c.targetZoom).toBe(homeZoom(PHONE_UP, WORLD));
    });
});

describe('pinchAt', () => {
    it('zooms by the factor and moves the world point under the old midpoint to the new one', () => {
        const c = createCameraController({ canvas: { width: 3840, height: 2160 }, world: WORLD });
        const under = (/** @type {{x: number, y: number}} */ p) => ({
            x: c.targetX + (p.x - 1920) / c.targetZoom,
            y: c.targetY - (p.y - 1080) / c.targetZoom,
        });
        const world = under({ x: 1000, y: 800 });
        pinchAt(c, 2, { x: 1000, y: 800 }, { x: 1200, y: 900 });
        expect(c.targetZoom).toBeCloseTo(fitZoom(c.canvas, WORLD) * 2, 12);
        expect(under({ x: 1200, y: 900 }).x).toBeCloseTo(world.x, 6);
        expect(under({ x: 1200, y: 900 }).y).toBeCloseTo(world.y, 6);
    });

    it('releases a follow and respects the zoom limits', () => {
        const c = createCameraController({ canvas: { width: 3840, height: 2160 }, world: WORLD });
        c.following = true;
        pinchAt(c, 1e6, { x: 1920, y: 1080 }, { x: 1920, y: 1080 });
        expect(c.following).toBe(false);
        expect(c.targetZoom).toBe(c.maxZoom);
    });
});
