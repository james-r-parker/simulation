import { describe, expect, it } from 'vitest';
import { fitZoom, homeZoom, ZOOM_IN } from '../../../js/app/camera.js';
import { MOMENT_KIND } from '../../../js/app/director/scoring.js';
import {
    LINGER_BASE_S,
    momentFrameWidth,
    planShot,
    SHOT_STATE,
    shotPose,
    smootherstep,
    WIDE_BASE_S,
    WIDE_DRIFT_AMPLITUDE,
    WIDE_DRIFT_PERIOD_X_S,
    WIDE_DRIFT_PERIOD_Y_S,
    WIDE_MIN_S,
    WIDE_SPAN_S,
    wideDrift,
    wideFraming,
} from '../../../js/app/director/shots.js';

const CANVAS = Object.freeze({ width: 3840, height: 2160 });
const WORLD = Object.freeze({ width: 14400, height: 8100 });

describe('js/app/director/shots', () => {
    it('evaluates smootherstep at the start, middle and end and clamps outside [0, 1]', () => {
        expect(smootherstep(-0.5)).toBe(0);
        expect(smootherstep(0)).toBe(0);
        expect(smootherstep(0.5)).toBeCloseTo(0.5, 6);
        expect(smootherstep(1)).toBe(1);
        expect(smootherstep(1.5)).toBe(1);
        expect(smootherstep(0.25)).toBeGreaterThan(0);
        expect(smootherstep(0.25)).toBeLessThan(0.5);
    });

    it('returns the close-shot world width for each moment kind', () => {
        expect(momentFrameWidth(MOMENT_KIND.CHASE)).toBe(1600);
        expect(momentFrameWidth(MOMENT_KIND.PACK_KILL)).toBe(1600);
        expect(momentFrameWidth(MOMENT_KIND.KILL)).toBe(1600);
        expect(momentFrameWidth(MOMENT_KIND.SMOKE_SCREEN)).toBe(1600);
        expect(momentFrameWidth(MOMENT_KIND.ALARM_CHORUS)).toBe(2400);
        expect(momentFrameWidth(MOMENT_KIND.BIRTH_CLUSTER)).toBe(2400);
        expect(momentFrameWidth(MOMENT_KIND.FAMILY_LEAD)).toBe(3600);
    });

    it('computes the Lissajous drift with periods 90 s and 140 s and amplitude 3% of world width', () => {
        const atZero = wideDrift(0, WORLD.width);
        expect(atZero.dx).toBeCloseTo(0, 6);
        expect(atZero.dy).toBeCloseTo(0, 6);

        const quarterX = wideDrift(WIDE_DRIFT_PERIOD_X_S / 4, WORLD.width);
        expect(quarterX.dx).toBeCloseTo(WORLD.width * WIDE_DRIFT_AMPLITUDE, 4);

        const quarterY = wideDrift(WIDE_DRIFT_PERIOD_Y_S / 4, WORLD.width);
        expect(quarterY.dy).toBeCloseTo(WORLD.width * WIDE_DRIFT_AMPLITUDE, 4);
    });

    it('frames the middle 80% of agents (10th to 90th percentile, padded 10%, never below fitZoom)', () => {
        const fit = fitZoom(CANVAS, WORLD);
        const empty = wideFraming([], { canvas: CANVAS, world: WORLD, zoomScale: 1.1 });
        expect(empty).toEqual({ x: WORLD.width / 2, y: WORLD.height / 2, zoom: fit * 1.1 });

        const agents = [
            { x: 100, y: 100 }, // 0th percentile outlier
            { x: 2000, y: 1000 },
            { x: 3000, y: 1500 },
            { x: 4000, y: 2000 },
            { x: 5000, y: 2500 },
            { x: 6000, y: 3000 },
            { x: 7000, y: 3500 },
            { x: 8000, y: 4000 },
            { x: 9000, y: 4500 },
            { x: 10000, y: 5000 },
            { x: 14000, y: 8000 }, // 100th percentile outlier
        ];
        const framed = wideFraming(agents, { canvas: CANVAS, world: WORLD });
        expect(framed.x).toBe(6000);
        expect(framed.y).toBe(3000);
        const expectedBoxZoom = Math.min(CANVAS.width / (8000 * 1.2), CANVAS.height / (4000 * 1.2));
        expect(framed.zoom).toBeCloseTo(Math.max(fit, expectedBoxZoom), 5);

        const spreadWide = [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 14400, y: 8100 },
            { x: 14400, y: 8100 },
        ];
        const clampedFloor = wideFraming(spreadWide, { canvas: CANVAS, world: WORLD, zoomScale: 1 });
        expect(clampedFloor.zoom).toBeCloseTo(fit, 6);

        const singleAgent = [{ x: 3000, y: 2000 }];
        const clampedCeil = wideFraming(singleAgent, { canvas: CANVAS, world: WORLD, zoomScale: 1.15 });
        expect(clampedCeil.zoom).toBeCloseTo(fit * ZOOM_IN, 5);
    });

    it('plans and evaluates poses at the start, middle and end of wide, glide, linger and pullback', () => {
        const agents = [
            { x: 4000, y: 2000 },
            { x: 8000, y: 5000 },
        ];
        const rng = { next: () => 0.5 };

        const wide = planShot({
            state: SHOT_STATE.WIDE,
            startTimeS: 10,
            agents,
            canvas: CANVAS,
            world: WORLD,
            rng,
        });
        expect(wide.state).toBe(SHOT_STATE.WIDE);
        expect(wide.move?.durationS).toBe(0);
        expect(wide.minDurationS).toBe(WIDE_MIN_S);
        expect(wide.durationS).toBeCloseTo(WIDE_BASE_S + 0.5 * WIDE_SPAN_S, 6);
        const wideStart = shotPose(wide, 10, WORLD);
        const wideMid = shotPose(wide, 25, WORLD);
        const wideEnd = shotPose(wide, 40, WORLD);
        expect(wideStart.zoom).toBeCloseTo(wide.toPose.zoom, 6);
        expect(wideMid.x).not.toBeCloseTo(wideStart.x, 2);
        expect(wideEnd.y).not.toBeCloseTo(wideMid.y, 2);

        const moment = { kind: MOMENT_KIND.KILL, score: 80, x: 5000, y: 3000 };
        const glide = planShot({
            state: SHOT_STATE.GLIDE,
            startTimeS: 20,
            fromPose: wideStart,
            moment,
            canvas: CANVAS,
            world: WORLD,
        });
        expect(glide.durationS).toBe(glide.move?.durationS);
        expect(glide.durationS).toBeGreaterThan(3);
        expect(glide.toPose.zoom).toBeCloseTo(CANVAS.width / 1600, 5);
        const glideStart = shotPose(glide, 20, WORLD);
        expect(glideStart.x).toBeCloseTo(wideStart.x, 9);
        expect(glideStart.zoom).toBeCloseTo(wideStart.zoom, 9);
        const glideEnd = shotPose(glide, 20 + glide.durationS, WORLD);
        expect(glideEnd.x).toBeCloseTo(5000, 6);
        expect(glideEnd.y).toBeCloseTo(3000, 6);
        expect(glideEnd.zoom).toBeCloseTo(glide.toPose.zoom, 9);
        // the zoom out comes first: the first quarter of the move never closes in
        expect(shotPose(glide, 20 + glide.durationS * 0.1, WORLD).zoom).toBeLessThanOrEqual(wideStart.zoom + 1e-9);

        const linger = planShot({
            state: SHOT_STATE.LINGER,
            startTimeS: 22,
            fromPose: glide.toPose,
            moment,
            canvas: CANVAS,
            world: WORLD,
        });
        expect(linger.durationS).toBe(LINGER_BASE_S);
        expect(shotPose(linger, 22, WORLD)).toEqual(glide.toPose);
        expect(shotPose(linger, 26, WORLD)).toEqual(glide.toPose);
        expect(shotPose(linger, 30, WORLD)).toEqual(glide.toPose);

        const pullback = planShot({
            state: SHOT_STATE.PULLBACK,
            startTimeS: 30,
            fromPose: linger.toPose,
            agents,
            canvas: CANVAS,
            world: WORLD,
            rng,
        });
        expect(pullback.durationS).toBe(pullback.move?.durationS);
        const pullbackStart = shotPose(pullback, 30, WORLD);
        expect(pullbackStart.x).toBeCloseTo(linger.toPose.x, 9);
        expect(pullbackStart.zoom).toBeCloseTo(linger.toPose.zoom, 9);
        const pullbackMid = shotPose(pullback, 30 + pullback.durationS / 2, WORLD);
        expect(pullbackMid.zoom).toBeLessThan(linger.toPose.zoom);
        const pullbackEndS = 30 + pullback.durationS;
        const pullbackEnd = shotPose(pullback, pullbackEndS, WORLD);
        const endDrift = wideDrift(pullbackEndS, WORLD.width);
        expect(pullbackEnd.x).toBeCloseTo(pullback.toPose.x + endDrift.dx, 4);
        expect(pullbackEnd.y).toBeCloseTo(pullback.toPose.y + endDrift.dy, 4);
        expect(pullbackEnd.zoom).toBeCloseTo(pullback.toPose.zoom, 5);
    });

    it('falls back to default poses when fromPose or rng is omitted', () => {
        const moment = { kind: MOMENT_KIND.ALARM_CHORUS, score: 65, x: 2000, y: 1500 };
        const glideNoFrom = planShot({
            state: SHOT_STATE.GLIDE,
            startTimeS: 0,
            moment,
            canvas: CANVAS,
            world: WORLD,
        });
        expect(glideNoFrom.fromPose).toEqual(glideNoFrom.toPose);
        expect(glideNoFrom.durationS).toBe(0);

        const lingerNoFrom = planShot({
            state: SHOT_STATE.LINGER,
            startTimeS: 3,
            moment,
            canvas: CANVAS,
            world: WORLD,
        });
        expect(lingerNoFrom.fromPose).toEqual(lingerNoFrom.toPose);
        expect(lingerNoFrom.toPose.zoom).toBeCloseTo(fitZoom(CANVAS, WORLD), 6);

        const pullbackNoFrom = planShot({
            state: SHOT_STATE.PULLBACK,
            startTimeS: 11,
            canvas: CANVAS,
            world: WORLD,
        });
        expect(pullbackNoFrom.fromPose).toEqual(pullbackNoFrom.toPose);
    });

    it('frames by homeZoom in portrait, so a wide or close shot never shows the world as a band', () => {
        const phone = { width: 412, height: 915 };
        const home = homeZoom(phone, WORLD);
        expect(home).toBeGreaterThan(fitZoom(phone, WORLD) * 2);
        const spread = [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 14400, y: 8100 },
            { x: 14400, y: 8100 },
        ];
        expect(wideFraming(spread, { canvas: phone, world: WORLD }).zoom).toBeCloseTo(home, 6);
        expect(wideFraming([], { canvas: phone, world: WORLD, zoomScale: 1.1 }).zoom).toBeCloseTo(home * 1.1, 6);
        const moment = /** @type {any} */ ({ kind: MOMENT_KIND.FAMILY_LEAD, x: 5000, y: 4000 });
        const glide = planShot({ state: SHOT_STATE.GLIDE, startTimeS: 0, moment, canvas: phone, world: WORLD });
        expect(glide.toPose.zoom).toBeGreaterThanOrEqual(home);
        const landscape = wideFraming(spread, { canvas: CANVAS, world: WORLD });
        expect(landscape.zoom).toBeCloseTo(fitZoom(CANVAS, WORLD), 6);
    });

    it('moves a new wide framing from the last pose, blending the drift in so the pose never steps', () => {
        const agents = [
            { x: 2000, y: 1000 },
            { x: 9000, y: 5000 },
        ];
        const fromPose = { x: 6000, y: 3000, zoom: 0.5 };
        const wide = planShot({
            state: SHOT_STATE.WIDE,
            startTimeS: 100,
            fromPose,
            agents,
            canvas: CANVAS,
            world: WORLD,
        });
        const moveS = wide.move?.durationS ?? 0;
        expect(moveS).toBeGreaterThan(0);
        expect(wide.minDurationS).toBeCloseTo(moveS + WIDE_MIN_S, 9);
        expect(wide.durationS).toBeCloseTo(moveS + WIDE_BASE_S, 9);
        expect(shotPose(wide, 100, WORLD)).toEqual(fromPose);
        let last = shotPose(wide, 100, WORLD);
        for (let t = 100.05; t < 100 + moveS + 5; t += 0.05) {
            const pose = shotPose(wide, t, WORLD);
            expect((Math.hypot(pose.x - last.x, pose.y - last.y) * pose.zoom) / CANVAS.width / 0.05).toBeLessThan(0.35);
            expect(Math.abs(Math.log(pose.zoom / last.zoom))).toBeLessThan(0.04);
            last = pose;
        }
        const settled = shotPose(wide, 100 + moveS + 10, WORLD);
        const drift = wideDrift(100 + moveS + 10, WORLD.width);
        expect(settled.x).toBeCloseTo(wide.toPose.x + drift.dx, 6);
    });
});
