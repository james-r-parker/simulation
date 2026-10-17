import { describe, expect, it } from 'vitest';
import {
    createCameraController,
    fitZoom,
    followStep,
    moveCameraTo,
    panByPixels,
    resizeCamera,
    screenToWorld,
    snapZoom,
    springStep,
    updateCamera,
    viewBounds,
    wheelFactor,
    zoomAt,
} from '../../js/app/camera.js';

const WORLDS = [
    { width: 7680, height: 4320 },
    { width: 11520, height: 6480 },
    { width: 14400, height: 8100 },
];
const CANVASES = [
    { width: 3840, height: 2160 },
    { width: 2560, height: 1440 },
];

describe('fitZoom', () => {
    it('fills a 16:9 canvas exactly for every world size, with no letterbox', () => {
        for (const world of WORLDS) {
            for (const canvas of CANVASES) {
                const z = fitZoom(canvas, world);
                expect(world.width * z).toBeCloseTo(canvas.width, 6);
                expect(world.height * z).toBeCloseTo(canvas.height, 6);
            }
        }
    });

    it('letterboxes the longer side when the aspect differs', () => {
        const z = fitZoom({ width: 1000, height: 1000 }, { width: 2000, height: 1000 });
        expect(z).toBe(0.5);
    });
});

describe('snapZoom', () => {
    it('moves a zoom within 2% of 1/k or k onto it', () => {
        expect(snapZoom(0.5 * 1.01)).toBe(0.5);
        expect(snapZoom(1 / 3 - 0.004)).toBeCloseTo(1 / 3, 12);
        expect(snapZoom(2.03)).toBe(2);
        expect(snapZoom(0.9921)).toBe(1);
    });

    it('keeps the exact fit when it is not near a whole-pixel ratio', () => {
        expect(snapZoom(0.4)).toBe(0.4);
        expect(snapZoom(1.5)).toBe(1.5);
        expect(snapZoom(0.5 * 1.05)).toBe(0.525);
    });
});

describe('springStep', () => {
    it('converges to the target and does not overshoot', () => {
        let v = 0;
        for (let i = 0; i < 600; i++) {
            v = springStep(v, 10, 3, 16);
            expect(v).toBeLessThanOrEqual(10);
        }
        expect(v).toBeCloseTo(10, 3);
    });

    it('gives the same result at 30, 60 and 240 Hz over the same second', () => {
        const at = (/** @type {number} */ hz) => {
            let v = 0;
            for (let i = 0; i < hz; i++) {
                v = springStep(v, 100, 3.08, 1000 / hz);
            }
            return v;
        };
        expect(at(30)).toBeCloseTo(at(240), 6);
        expect(at(60)).toBeCloseTo(at(240), 6);
    });

    it('holds still when already at the target or with no time passed', () => {
        expect(springStep(5, 5, 3, 16)).toBe(5);
        expect(springStep(1, 9, 3, 0)).toBe(1);
    });
});

describe('camera controller', () => {
    const size = { canvas: { width: 3840, height: 2160 }, world: { width: 7680, height: 4320 } };

    it('starts centred on the whole world', () => {
        const c = createCameraController(size);
        expect([c.x, c.y, c.zoom]).toEqual([3840, 2160, 0.5]);
    });

    it('followStep converges on a moving point independent of frame rate', () => {
        const run = (/** @type {number} */ hz) => {
            const c = createCameraController(size);
            for (let i = 0; i < 2 * hz; i++) {
                followStep(c, 1000, 900, 1000 / hz);
            }
            return c;
        };
        const a = run(30);
        const b = run(240);
        expect(a.x).toBeCloseTo(b.x, 3);
        expect(b.x).toBeLessThan(3840);
        expect(b.following).toBe(true);
        const long = createCameraController(size);
        for (let i = 0; i < 2000; i++) {
            followStep(long, 1000, 900, 16);
        }
        expect(long.x).toBeCloseTo(1000, 3);
        expect(long.y).toBeCloseTo(900, 3);
    });

    it('pans against the drag, flips y, and releases a follow', () => {
        const c = createCameraController(size);
        followStep(c, 100, 100, 16);
        panByPixels(c, 50, 20);
        expect(c.following).toBe(false);
        expect(c.targetX).toBeCloseTo(100 - 100, 6);
        expect(c.targetY).toBeCloseTo(100 + 40, 6);
    });

    it('zooms about the cursor so the world point under it stays put', () => {
        const c = createCameraController(size);
        const out = { x: 0, y: 0 };
        const cursor = { x: 3000, y: 500 };
        const before = { x: 0, y: 0 };
        screenToWorld(c, cursor, before);
        zoomAt(c, 4, cursor);
        for (let i = 0; i < 2000; i++) {
            updateCamera(c, 16);
        }
        screenToWorld(c, cursor, out);
        expect(out.x).toBeCloseTo(before.x, 1);
        expect(out.y).toBeCloseTo(before.y, 1);
        expect(c.zoom).toBeCloseTo(2, 3);
    });

    it('limits the zoom and keeps the centre inside the world', () => {
        const c = createCameraController(size);
        zoomAt(c, 1e6, { x: 0, y: 0 });
        expect(c.targetZoom).toBe(c.maxZoom);
        zoomAt(c, 1e-9, { x: 0, y: 0 });
        expect(c.targetZoom).toBe(c.minZoom);
        panByPixels(c, 1e9, -1e9);
        expect(c.targetX).toBe(0);
        expect(c.targetY).toBe(0);
    });

    it('keeps its zoom relative to the fit when the canvas resizes', () => {
        const c = createCameraController(size);
        zoomAt(c, 2, { x: 1920, y: 1080 });
        updateCamera(c, 100000);
        resizeCamera(c, { width: 2560, height: 1440 });
        expect(c.zoom / fitZoom(c.canvas, c.world)).toBeCloseTo(2, 6);
    });

    it('moves to a pose, instantly or eased, and zoom 0 means the fit', () => {
        const c = createCameraController(size);
        moveCameraTo(c, { x: 100, y: 200, zoom: 2 });
        expect(c.x).toBe(3840);
        moveCameraTo(c, { x: 100, y: 200, zoom: 0 }, true);
        expect([c.x, c.y, c.zoom]).toEqual([100, 200, 0.5]);
    });

    it('turns a wheel delta into a zoom factor', () => {
        expect(wheelFactor(0)).toBe(1);
        expect(wheelFactor(-100)).toBeGreaterThan(1);
        expect(wheelFactor(100)).toBeLessThan(1);
        expect(wheelFactor(100) * wheelFactor(-100)).toBeCloseTo(1, 12);
    });
});

describe('viewBounds', () => {
    it('spans the canvas at the zoom, centred on the view', () => {
        const c = createCameraController({
            canvas: { width: 3840, height: 2160 },
            world: { width: 7680, height: 4320 },
        });
        expect(viewBounds(c, { left: 0, right: 0, top: 0, bottom: 0 })).toEqual({
            left: 0,
            right: 7680,
            top: 4320,
            bottom: 0,
        });
        moveCameraTo(c, { x: 1000, y: 1000, zoom: 1 }, true);
        const b = viewBounds(c, { left: 0, right: 0, top: 0, bottom: 0 });
        expect([b.right - b.left, b.top - b.bottom]).toEqual([3840, 2160]);
    });
});
