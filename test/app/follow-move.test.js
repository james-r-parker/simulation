import { describe, expect, it } from 'vitest';
import { createAppState } from '../../js/app/actions.js';
import { createCameraController, followAim } from '../../js/app/camera.js';
import { MAX_PAN_SCREENS_PER_S, MAX_ZOOM_FACTOR_PER_S } from '../../js/app/camera-move.js';
import { createFollowController } from '../../js/app/follow.js';
import { holdMsFor } from '../../js/app/follow-handoff.js';
import { cancelHandoffMove, createHandoffMove, stepHandoffMove } from '../../js/app/follow-move.js';
import { createInterpolated } from '../../js/app/interpolate.js';

const CANVAS = { width: 1920, height: 1080 };
const WORLD = { width: 14400, height: 8100 };

/** @returns {import('../../js/app/camera.js').CameraController} a camera zoomed in on the left of the world */
function closeCamera() {
    const camera = createCameraController({ canvas: CANVAS, world: WORLD });
    Object.assign(camera, { x: 1000, y: 1000, zoom: 1, targetX: 1000, targetY: 1000, targetZoom: 1 });
    return camera;
}

const SUBJECT = { x: 9000, y: 5000, vx: 0, vy: 0, pair: false, px: 0, py: 0, zoom: 1 };

/**
 * @param {{x: number, y: number, zoom: number}} a a pose
 * @param {{x: number, y: number, zoom: number}} b the next pose
 * @param {number} dtMs the frame
 * @returns {{pan: number, zoomFactor: number}} the pan in canvas widths a second and the zoom factor a second
 */
function rates(a, b, dtMs) {
    const s = dtMs / 1000;
    return {
        pan: (Math.hypot(b.x - a.x, b.y - a.y) * b.zoom) / CANVAS.width / s,
        zoomFactor: Math.exp(Math.abs(Math.log(b.zoom / a.zoom)) / s),
    };
}

describe('follow-move', () => {
    it('leaves the camera to the spring when no handoff is pending', () => {
        const m = createHandoffMove();
        const camera = closeCamera();
        expect(stepHandoffMove(m, camera, SUBJECT, 16)).toBe(false);
        expect(camera.x).toBe(1000);
    });

    it('moves the camera to the new subject within the caps, then hands the spring a camera with no error', () => {
        const m = createHandoffMove();
        const camera = closeCamera();
        m.pending = true;
        let last = { x: camera.x, y: camera.y, zoom: camera.zoom };
        let frames = 0;
        let peak = { pan: 0, zoomFactor: 1 };
        while (stepHandoffMove(m, camera, SUBJECT, 16)) {
            const r = rates(last, camera, 16);
            peak = { pan: Math.max(peak.pan, r.pan), zoomFactor: Math.max(peak.zoomFactor, r.zoomFactor) };
            last = { x: camera.x, y: camera.y, zoom: camera.zoom };
            frames += 1;
            expect(frames).toBeLessThan(5000);
        }
        expect(m.plan?.outS).toBeGreaterThan(0);
        expect(peak.pan).toBeLessThanOrEqual(MAX_PAN_SCREENS_PER_S * 1.01);
        expect(peak.pan).toBeGreaterThan(0.1);
        expect(peak.zoomFactor).toBeLessThanOrEqual(MAX_ZOOM_FACTOR_PER_S * 1.01);
        // the move ends at the aim, so the spring that follows has nothing to catch up
        const aim = followAim(camera, SUBJECT, { x: 0, y: 0, zoom: 0 });
        expect(Math.hypot(camera.x - aim.x, camera.y - aim.y)).toBeLessThan(15);
        expect(Math.abs(camera.zoom - aim.zoom)).toBeLessThan(0.02);
        expect(stepHandoffMove(m, camera, SUBJECT, 16)).toBe(false);
    });

    it('follows a subject that moves while the camera travels, and holds while paused', () => {
        const m = createHandoffMove();
        const camera = closeCamera();
        m.pending = true;
        stepHandoffMove(m, camera, SUBJECT, 16);
        const held = { x: camera.x, y: camera.y, zoom: camera.zoom };
        expect(stepHandoffMove(m, camera, SUBJECT, 0)).toBe(true);
        expect(camera).toMatchObject(held);
        const moving = { ...SUBJECT };
        for (let t = 0; t < 60_000 && stepHandoffMove(m, camera, moving, 16); t += 16) {
            moving.x += 2;
        }
        expect(Math.hypot(camera.x - moving.x, camera.y - moving.y)).toBeLessThan(15);
    });

    it('drops a pending or running move when cancelled, and plans nothing for a subject already framed', () => {
        const m = createHandoffMove();
        const camera = closeCamera();
        m.pending = true;
        cancelHandoffMove(m);
        expect(stepHandoffMove(m, camera, SUBJECT, 16)).toBe(false);
        m.pending = true;
        expect(stepHandoffMove(m, camera, SUBJECT, 16)).toBe(true);
        cancelHandoffMove(m);
        expect(stepHandoffMove(m, camera, SUBJECT, 16)).toBe(false);
        const near = { ...SUBJECT, x: camera.x, y: camera.y, zoom: camera.zoom };
        m.pending = true;
        expect(stepHandoffMove(m, camera, near, 16)).toBe(false);
    });
});

describe('a follow handoff after a death', () => {
    it('is one eased move: no frame beyond the pan and zoom caps', () => {
        const camera = createCameraController({ canvas: CANVAS, world: WORLD });
        Object.assign(camera, { x: 1000, y: 1000, zoom: 1, targetX: 1000, targetY: 1000, targetZoom: 1 });
        const state = createAppState();
        const agents = createInterpolated(2);
        agents.count = 2;
        agents.genomeId.set([7, 8]);
        agents.x.set([1000, 9000]);
        agents.y.set([1000, 5000]);
        const logs = /** @type {any[]} */ ([]);
        const follow = createFollowController({
            camera,
            state,
            getAgents: () => agents,
            getPlayer: () => null,
            log: (level, event, fields) => logs.push({ event, ...fields }),
        });
        state.followId = 7;
        const step = (/** @type {number} */ dtMs) => follow.step({ dtMs, nowMs: 1000, available: true, paused: false });
        for (let i = 0; i < 20; i++) {
            step(16);
        }
        // subject 7 dies: it is gone from the world
        agents.count = 1;
        agents.genomeId.set([8]);
        agents.x.set([9000]);
        agents.y.set([5000]);
        const holdFrames = Math.ceil(holdMsFor(null, 7) / 16) + 2;
        for (let i = 0; i < holdFrames; i++) {
            step(16);
        }
        expect(state.followId).toBe(8);
        expect(logs.some((l) => l.event === 'FollowHandoff' && l.to === 8)).toBe(true);
        let last = { x: camera.x, y: camera.y, zoom: camera.zoom };
        let travelled = 0;
        for (let i = 0; i < 3000; i++) {
            step(16);
            const r = rates(last, camera, 16);
            expect(r.pan).toBeLessThanOrEqual(MAX_PAN_SCREENS_PER_S * 1.02);
            expect(r.zoomFactor).toBeLessThanOrEqual(MAX_ZOOM_FACTOR_PER_S * 1.02);
            travelled += Math.hypot(camera.x - last.x, camera.y - last.y);
            last = { x: camera.x, y: camera.y, zoom: camera.zoom };
        }
        expect(travelled).toBeGreaterThan(7000);
        expect(Math.hypot(camera.x - 9000, camera.y - 5000)).toBeLessThan(5);
    });
});
