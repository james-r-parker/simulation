import { describe, expect, it } from 'vitest';
import { createCameraController } from '../../js/app/camera.js';
import { createPointerInput, DRAG_THRESHOLD_PX } from '../../js/app/pointer-input.js';

/**
 * @returns {{input: ReturnType<typeof createPointerInput>, camera: any, picks: number[]}} an input over one agent at the
 *   world centre
 */
function setup() {
    const camera = createCameraController({ canvas: { width: 200, height: 100 }, world: { width: 200, height: 100 } });
    const agents = {
        count: 1,
        x: new Float32Array([100]),
        y: new Float32Array([50]),
        size: new Float32Array([10]),
        spec: new Uint32Array([0]),
        genomeId: new Uint32Array([77]),
    };
    const picks = /** @type {number[]} */ ([]);
    const input = createPointerInput({
        camera,
        getAgents: () => /** @type {any} */ (agents),
        getMinPx: () => [12],
        onPick: (id) => picks.push(id),
    });
    return { input, camera, picks };
}

describe('createPointerInput', () => {
    it('picks the agent under a click', () => {
        const { input, picks } = setup();
        input.down(100, 50);
        input.up(100, 50);
        expect(picks).toEqual([77]);
    });

    it('picks nothing, as 0, when the click lands on empty space', () => {
        const { input, picks } = setup();
        input.down(5, 5);
        input.up(5, 5);
        expect(picks).toEqual([0]);
    });

    it('pans on a drag, and a drag is not a click', () => {
        const { input, camera, picks } = setup();
        camera.targetZoom = camera.zoom * 2;
        const x = camera.targetX;
        input.down(100, 50);
        input.move(100 + DRAG_THRESHOLD_PX + 20, 50);
        input.up(124, 50);
        expect(picks).toEqual([]);
        expect(camera.targetX).toBeLessThan(x);
    });

    it('treats a small wobble as a click', () => {
        const { input, picks } = setup();
        input.down(100, 50);
        input.move(101, 51);
        input.up(101, 51);
        expect(picks).toEqual([77]);
    });

    it('ignores moves and releases with no press', () => {
        const { input, camera, picks } = setup();
        const x = camera.targetX;
        input.move(50, 50);
        input.up(50, 50);
        expect(picks).toEqual([]);
        expect(camera.targetX).toBe(x);
    });

    it('zooms in on a wheel scroll up', () => {
        const { input, camera } = setup();
        const zoom = camera.targetZoom;
        input.wheel(-100, 100, 50);
        expect(camera.targetZoom).toBeGreaterThan(zoom);
    });
});

describe('createPointerInput with two pointers', () => {
    it('zooms in when two pointers spread apart, and does not pick on release', () => {
        const { input, camera, picks } = setup();
        const zoom = camera.targetZoom;
        input.down(90, 50, 1, true);
        input.down(110, 50, 2, true);
        input.move(70, 50, 1);
        input.move(130, 50, 2);
        expect(camera.targetZoom).toBeCloseTo(zoom * 3, 6);
        input.up(70, 50, 1);
        input.up(130, 50, 2);
        expect(picks).toEqual([]);
    });

    it('zooms out when two pointers pinch together', () => {
        const { input, camera } = setup();
        camera.targetZoom = camera.zoom = camera.maxZoom;
        input.down(60, 50, 1);
        input.down(140, 50, 2);
        input.move(80, 50, 1);
        expect(camera.targetZoom).toBeCloseTo(camera.maxZoom * (60 / 80), 6);
    });

    it('keeps the world point between the fingers under their midpoint as they move together', () => {
        const { input, camera } = setup();
        camera.targetZoom = camera.zoom = camera.minZoom * 4;
        const under = (/** @type {number} */ px) => camera.targetX + (px - 100) / camera.targetZoom;
        const world = under(100);
        input.down(90, 50, 1);
        input.down(110, 50, 2);
        input.move(100, 50, 1);
        input.move(120, 50, 2);
        expect(under(110)).toBeCloseTo(world, 6);
        expect(camera.targetY).toBeCloseTo(50, 6);
    });

    it('carries on panning with the finger left after the other lifts', () => {
        const { input, camera, picks } = setup();
        camera.targetZoom = camera.zoom = camera.minZoom * 4;
        input.down(90, 50, 1);
        input.down(110, 50, 2);
        input.up(110, 50, 2);
        const x = camera.targetX;
        input.move(80, 50, 1);
        expect(camera.targetX).toBeGreaterThan(x);
        input.up(80, 50, 1);
        expect(picks).toEqual([]);
    });

    it('drops a cancelled pointer, and a cancelled press never picks', () => {
        const { input, picks } = setup();
        input.down(100, 50, 3, true);
        input.cancel(3);
        input.up(100, 50, 3);
        expect(picks).toEqual([]);
        input.down(100, 50, 4);
        input.up(100, 50, 4);
        expect(picks).toEqual([77]);
    });
});

describe('createPointerInput stale pointers', () => {
    it('treats a second press from the same pointer as a fresh press, so the tap still picks', () => {
        const { input, picks } = setup();
        input.down(100, 50, 1);
        input.down(100, 50, 1);
        input.up(100, 50, 1);
        expect(picks).toEqual([77]);
    });

    it('ignores a cancel for a pointer already released, so a later tap is not marked a drag', () => {
        const { input, picks } = setup();
        input.down(100, 50, 1);
        input.up(100, 50, 1);
        input.cancel(1);
        input.down(100, 50, 2);
        input.up(100, 50, 2);
        expect(picks).toEqual([77, 77]);
    });
});

describe('createPointerInput touch picking', () => {
    /**
     * @param {number} touchMinPx the touch floor in device px
     * @returns {{input: ReturnType<typeof createPointerInput>, picks: number[]}} an input over one small agent at the
     *   world centre, drawn 12 px across
     */
    function small(touchMinPx) {
        const camera = createCameraController({
            canvas: { width: 200, height: 100 },
            world: { width: 200, height: 100 },
        });
        camera.zoom = camera.targetZoom = 1;
        const agents = {
            count: 1,
            x: new Float32Array([100]),
            y: new Float32Array([50]),
            size: new Float32Array([1]),
            spec: new Uint32Array([0]),
            genomeId: new Uint32Array([5]),
        };
        const picks = /** @type {number[]} */ ([]);
        const input = createPointerInput({
            camera,
            getAgents: () => /** @type {any} */ (agents),
            getMinPx: () => [12],
            onPick: (id) => picks.push(id),
            getTouchMinPx: () => touchMinPx,
        });
        return { input, picks };
    }

    it('hit-tests a tap at the touch floor, wider than a mouse click', () => {
        const { input, picks } = small(88);
        input.down(140, 50, 1, false);
        input.up(140, 50, 1);
        input.down(140, 50, 2, true);
        input.up(140, 50, 2);
        expect(picks).toEqual([0, 5]);
    });

    it('keeps a specialisation minimum above the touch floor', () => {
        const { input, picks } = small(4);
        input.down(110, 50, 1, true);
        input.up(110, 50, 1);
        expect(picks).toEqual([5]);
    });
});
