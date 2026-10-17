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
