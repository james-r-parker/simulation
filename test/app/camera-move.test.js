import { describe, expect, it } from 'vitest';
import {
    BOTH_FIT_SHARE,
    EASE_PEAK,
    MAX_PAN_SCREENS_PER_S,
    MAX_ZOOM_FACTOR_PER_S,
    SLOW_PAN_SCREENS_PER_S,
    ease,
    movePose,
    planMove,
} from '../../js/app/camera-move.js';

const VIEW = { canvas: { width: 3840, height: 2160 }, world: { width: 14400, height: 8100 } };
const HOME = 3840 / 14400;
const DT = 1 / 240;
const FAR = { from: { x: 2000, y: 1500, zoom: 1.07 }, to: { x: 11000, y: 6500, zoom: 1.07 } };

/**
 * @param {ReturnType<typeof planMove>} move the move
 * @returns {{x: number, y: number, zoom: number}[]} its poses at 240 Hz, to half a second after its end
 */
function sample(move) {
    const poses = [];
    for (let t = 0; t <= move.durationS + 0.5; t += DT) {
        poses.push(movePose(move, t));
    }
    return poses;
}

/**
 * @param {{x: number, y: number, zoom: number}[]} poses consecutive frames
 * @returns {{pan: number, zoomRate: number}[]} the pan in canvas widths a second and the zoom factor's log a second
 */
function speeds(poses) {
    const out = [];
    for (let i = 1; i < poses.length; i++) {
        const [a, b] = [poses[i - 1], poses[i]];
        out.push({
            pan: (Math.hypot(b.x - a.x, b.y - a.y) * b.zoom) / VIEW.canvas.width / DT,
            zoomRate: Math.abs(Math.log(b.zoom / a.zoom)) / DT,
        });
    }
    return out;
}

describe('camera-move', () => {
    it('eases from 0 to 1 and clamps', () => {
        expect(ease(-1)).toBe(0);
        expect(ease(0)).toBe(0);
        expect(ease(0.5)).toBeCloseTo(0.5, 9);
        expect(ease(2)).toBe(1);
    });

    it('names the comfort caps', () => {
        expect(MAX_PAN_SCREENS_PER_S).toBeCloseTo(1 / 3, 9);
        expect(SLOW_PAN_SCREENS_PER_S).toBeLessThan(MAX_PAN_SCREENS_PER_S);
        expect(MAX_ZOOM_FACTOR_PER_S).toBe(1.5);
        expect(EASE_PEAK).toBe(1.875);
    });

    it('zooms out until both subjects fit, never closer than now, then pans, then zooms in', () => {
        const move = planMove(FAR.from, FAR.to, VIEW);
        expect(move.midZoom).toBeLessThan(FAR.from.zoom);
        expect(move.midZoom).toBeGreaterThanOrEqual(HOME - 1e-9);
        const spanX = (Math.abs(FAR.to.x - FAR.from.x) * move.midZoom) / VIEW.canvas.width;
        expect(spanX).toBeLessThanOrEqual(BOTH_FIT_SHARE + 1e-9);
        const poses = sample(move);
        const outEnd = Math.floor(move.outS / DT);
        const panEnd = Math.floor((move.outS + move.panS) / DT);
        for (let i = 1; i < poses.length; i++) {
            const [a, b] = [poses[i - 1], poses[i]];
            if (i <= outEnd) {
                expect(b.zoom).toBeLessThanOrEqual(a.zoom + 1e-12);
                expect(b.x).toBe(FAR.from.x);
            } else if (i > panEnd + 1) {
                expect(b.zoom).toBeGreaterThanOrEqual(a.zoom - 1e-12);
                expect(b.x).toBeCloseTo(FAR.to.x, 6);
            }
            expect(b.zoom).toBeLessThanOrEqual(FAR.from.zoom + 1e-9);
        }
        const last = poses[poses.length - 1];
        expect(last).toMatchObject({ x: FAR.to.x, y: FAR.to.y });
        expect(last.zoom).toBeCloseTo(FAR.to.zoom, 9);
        expect(poses[0].zoom).toBeCloseTo(FAR.from.zoom, 9);
    });

    it('never pans faster than the cap nor zooms faster than the zoom cap, in any frame', () => {
        const cases = [
            [FAR.from, FAR.to],
            [
                { x: 7000, y: 4000, zoom: 3 },
                { x: 7200, y: 4100, zoom: 3 },
            ],
            [
                { x: 7000, y: 4000, zoom: HOME },
                { x: 9000, y: 4000, zoom: 1.07 },
            ],
            [
                { x: 3000, y: 1000, zoom: 1.07 },
                { x: 8000, y: 4000, zoom: HOME * 1.1 },
            ],
        ];
        for (const [from, to] of cases) {
            const move = planMove(from, to, VIEW);
            const cap = move.slow ? SLOW_PAN_SCREENS_PER_S : MAX_PAN_SCREENS_PER_S;
            for (const s of speeds(sample(move))) {
                expect(s.pan).toBeLessThanOrEqual(cap * 1.002);
                expect(Math.exp(s.zoomRate)).toBeLessThanOrEqual(MAX_ZOOM_FACTOR_PER_S * 1.002);
            }
        }
    });

    it('has no discontinuity in pose or velocity, and rests at both ends and at the joint', () => {
        const move = planMove(FAR.from, FAR.to, VIEW);
        const s = speeds(sample(move));
        for (let i = 1; i < s.length; i++) {
            expect(Math.abs(s[i].pan - s[i - 1].pan)).toBeLessThan(0.01);
            expect(Math.abs(s[i].zoomRate - s[i - 1].zoomRate)).toBeLessThan(0.02);
        }
        expect(s[0].pan + s[0].zoomRate).toBeLessThan(0.01);
        expect(s[s.length - 1]).toEqual({ pan: 0, zoomRate: 0 });
        const joint = Math.round(move.outS / DT);
        expect(s[joint].pan + s[joint].zoomRate).toBeLessThan(0.05);
    });

    it('skips the zoom out and pans slowly when the next subject is already on screen', () => {
        const move = planMove({ x: 7000, y: 4000, zoom: 1.07 }, { x: 7300, y: 4100, zoom: 1.07 }, VIEW);
        expect(move.outS).toBe(0);
        expect(move.slow).toBe(true);
        expect(move.midZoom).toBe(1.07);
        expect(sample(move).every((p) => Math.abs(p.zoom - 1.07) < 1e-9)).toBe(true);
        expect(move.panS).toBeCloseTo((Math.hypot(300, 100) * 1.07 * EASE_PEAK) / (3840 * SLOW_PAN_SCREENS_PER_S), 9);
        expect(planMove(FAR.from, FAR.to, VIEW).slow).toBe(false);
    });

    it('does not zoom in on the way when the next shot is wider than the current one', () => {
        const move = planMove({ x: 7000, y: 4000, zoom: 1.07 }, { x: 7000, y: 4000, zoom: HOME }, VIEW);
        expect(move.midZoom).toBeCloseTo(HOME, 9);
        expect(move.inS).toBe(0);
        const poses = sample(move);
        for (let i = 1; i < poses.length; i++) {
            expect(poses[i].zoom).toBeLessThanOrEqual(poses[i - 1].zoom + 1e-12);
        }
    });

    it('rests with a zero-length move, and follows a subject that moved since the plan', () => {
        const still = planMove(FAR.from, FAR.from, VIEW);
        expect(still.durationS).toBe(0);
        expect(movePose(still, 0)).toEqual(FAR.from);
        expect(movePose(still, 5)).toEqual(FAR.from);
        const move = planMove(FAR.from, FAR.to, VIEW);
        const moved = { x: FAR.to.x + 500, y: FAR.to.y - 300, zoom: FAR.to.zoom };
        const end = movePose(move, move.durationS + 1, { to: moved });
        expect(end.x).toBe(moved.x);
        expect(end.y).toBe(moved.y);
        expect(movePose(move, 0, { to: moved }).x).toBe(FAR.from.x);
        const out = { x: 0, y: 0, zoom: 0 };
        expect(movePose(move, 1, { out })).toBe(out);
    });
});
