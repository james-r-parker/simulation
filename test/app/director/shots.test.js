import { describe, expect, it } from 'vitest';
import { fitZoom, ZOOM_IN } from '../../../js/app/camera.js';
import { MOMENT_KIND } from '../../../js/app/director/scoring.js';
import {
    glideDurationS,
    LINGER_BASE_S,
    momentFrameWidth,
    planShot,
    PULLBACK_DURATION_S,
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

    it('returns the close-shot world width and glide duration for each moment kind', () => {
        expect(momentFrameWidth(MOMENT_KIND.CHASE)).toBe(1600);
        expect(momentFrameWidth(MOMENT_KIND.PACK_KILL)).toBe(1600);
        expect(momentFrameWidth(MOMENT_KIND.KILL)).toBe(1600);
        expect(momentFrameWidth(MOMENT_KIND.SMOKE_SCREEN)).toBe(1600);
        expect(momentFrameWidth(MOMENT_KIND.ALARM_CHORUS)).toBe(2400);
        expect(momentFrameWidth(MOMENT_KIND.BIRTH_CLUSTER)).toBe(2400);
        expect(momentFrameWidth(MOMENT_KIND.FAMILY_LEAD)).toBe(3600);

        expect(glideDurationS(MOMENT_KIND.PACK_KILL)).toBe(2);
        expect(glideDurationS(MOMENT_KIND.KILL)).toBe(2);
        expect(glideDurationS(MOMENT_KIND.CHASE)).toBe(3);
        expect(glideDurationS(MOMENT_KIND.FAMILY_LEAD)).toBe(3);
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
        expect(glide.durationS).toBe(2);
        expect(glide.toPose.zoom).toBeCloseTo(CANVAS.width / 1600, 5);
        expect(shotPose(glide, 20, WORLD)).toEqual(wideStart);
        const glideMid = shotPose(glide, 21, WORLD);
        expect(glideMid.x).toBeCloseTo((wideStart.x + 5000) / 2, 4);
        expect(glideMid.y).toBeCloseTo((wideStart.y + 3000) / 2, 4);
        expect(shotPose(glide, 22, WORLD)).toEqual(glide.toPose);

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
        expect(pullback.durationS).toBe(PULLBACK_DURATION_S);
        expect(shotPose(pullback, 30, WORLD)).toEqual(linger.toPose);
        const pullbackMid = shotPose(pullback, 32, WORLD);
        expect(pullbackMid.zoom).toBeCloseTo((linger.toPose.zoom + pullback.toPose.zoom) / 2, 4);
        const pullbackEnd = shotPose(pullback, 34, WORLD);
        const endDrift = wideDrift(34, WORLD.width);
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
});
