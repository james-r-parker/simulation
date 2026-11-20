import { describe, expect, it } from 'vitest';
import { createCameraController, followSubject } from '../../js/app/camera.js';
import {
    BREATH_RATE,
    createFrameState,
    enterFrame,
    frameSubject,
    handoffFrame,
    pursuitPartner,
    settleFrame,
    VELOCITY_TAU_MS,
    ZOOM_FACTORS,
} from '../../js/app/follow-frame.js';
import { createFollowInterest } from '../../js/app/follow-target.js';
import { createInterpolated } from '../../js/app/interpolate.js';

/** @param {Partial<{count: number, hunter: number[], prey: number[], closeness: number[]}>} p @returns {any} pairs */
function pursuits(p = {}) {
    return { count: p.count ?? 0, hunter: p.hunter ?? [], prey: p.prey ?? [], closeness: p.closeness ?? [] };
}

/** @param {any} [pairs] the pursuit table @returns {any} a player stub */
function player(pairs = pursuits()) {
    return {
        followInterest: createFollowInterest(),
        flee: { pursuits: pairs, rules: { maxVelocity: 2 } },
        bits: { ATE_SHIFT: 0, TIMER_MASK: 31 },
    };
}

/** @returns {any} two agents, the subject (genome 7) first */
function agents() {
    const a = createInterpolated(2);
    a.count = 2;
    a.genomeId.set([7, 8]);
    a.x.set([1000, 1100]);
    a.y.set([800, 800]);
    return a;
}

/** @returns {{camera: any, fr: any}} a camera at a known zoom and a framing entered on it */
function rig() {
    const camera = createCameraController({
        canvas: { width: 1920, height: 1080 },
        world: { width: 7680, height: 4320 },
    });
    camera.targetZoom = 0.5;
    const fr = createFrameState(camera);
    enterFrame(fr);
    return { camera, fr };
}

/** @param {any} fr @param {any} a @param {Record<string, any>} [over] @returns {any} the subject after one frame */
function frame(fr, a, over = {}) {
    const s = frameSubject(fr, a, 0, { dtMs: 16, nowMs: 0, paused: false, player: null, ...over });
    settleFrame(fr);
    return s;
}

describe('pursuitPartner', () => {
    it('finds the other body of the closest pursuit, whichever end the subject is', () => {
        const pairs = pursuits({ count: 3, hunter: [0, 4, 5], prey: [1, 0, 6], closeness: [0.2, 0.9, 0.5] });
        expect(pursuitPartner(pairs, 0)).toBe(4);
        expect(pursuitPartner(pairs, 1)).toBe(0);
        expect(pursuitPartner(pairs, 3)).toBe(-1);
    });
});

describe('displayed velocity', () => {
    it('starts at rest, smooths toward the moved distance over its time constant, and is zero while paused', () => {
        const { fr } = rig();
        const a = agents();
        expect(frame(fr, a).vx).toBe(0);
        a.x[0] += 1.6;
        const s = frame(fr, a);
        const alpha = 1 - Math.exp(-16 / VELOCITY_TAU_MS);
        expect(s.vx).toBeCloseTo(100 * alpha, 2);
        a.x[0] += 1.6;
        expect(frame(fr, a, { paused: true }).vx).toBe(0);
        a.y[0] += 1.6;
        const moved = frame(fr, a);
        expect(moved.vy).toBeGreaterThan(0);
        expect(frame(fr, a, { dtMs: 0 }).vy).toBe(moved.vy);
    });

    it('leaves the velocity alone on a stalled frame, whose displacement spans more than its clamped dt', () => {
        const { fr } = rig();
        const a = agents();
        frame(fr, a);
        a.x[0] += 1.6;
        const moved = frame(fr, a);
        a.x[0] += 50;
        expect(frame(fr, a, { dtMs: 100, holdMs: 0 }).vx).toBe(moved.vx);
    });

    it('starts again after a handoff', () => {
        const { fr } = rig();
        const a = agents();
        frame(fr, a);
        a.x[0] += 5;
        expect(frame(fr, a).vx).toBeGreaterThan(0);
        handoffFrame(fr);
        a.x[0] += 5;
        expect(frame(fr, a).vx).toBe(0);
    });
});

describe('the pair', () => {
    it('is the other body of a pursuit, and not while paused or with no player', () => {
        const { fr } = rig();
        const a = agents();
        const p = player(pursuits({ count: 1, hunter: [0], prey: [1], closeness: [1] }));
        const s = frame(fr, a, { player: p });
        expect([s.pair, s.px, s.py]).toEqual([true, 1100, 800]);
        expect(frame(fr, a, { player: p, paused: true }).pair).toBe(false);
        expect(frame(fr, a).pair).toBe(false);
    });
});

describe('the zoom', () => {
    it('stays at the base for a still subject with nothing happening, and eases rather than jumps', () => {
        const { fr } = rig();
        const a = agents();
        expect(frame(fr, a, { player: player() }).zoom).toBe(0.5);
        a.flags[0] = 3;
        const next = frame(fr, a, { player: player() }).zoom;
        const target = 0.5 * ZOOM_FACTORS.active;
        expect(next).toBeGreaterThan(0.5);
        expect(next).toBeLessThan(target);
        expect(next).toBeCloseTo(0.5 + (target - 0.5) * (1 - Math.exp((-BREATH_RATE * 16) / 1000)), 9);
    });

    it('closes in on an event, widens with speed and in a pursuit', () => {
        const settled = (/** @type {(a: any, p: any) => void} */ setup) => {
            const { fr } = rig();
            const a = agents();
            const p = player();
            setup(a, p);
            let zoom = 0;
            for (let k = 0; k < 600; k++) {
                zoom = frame(fr, a, { player: p, nowMs: 0 }).zoom;
            }
            return zoom;
        };
        expect(settled((a, p) => void (p.followInterest.count = 0))).toBeCloseTo(0.5, 4);
        expect(
            settled((_a, p) => {
                p.followInterest.subject[0] = 7;
                p.followInterest.score[0] = 45;
                p.followInterest.atMs[0] = 0;
                p.followInterest.count = 1;
            }),
        ).toBeCloseTo(0.5 * ZOOM_FACTORS.active, 4);
        expect(settled((a) => void (a.speed[0] = 2))).toBeCloseTo(0.5 * (1 - ZOOM_FACTORS.speed), 4);
        expect(
            settled(
                (_a, p) =>
                    void Object.assign(p.flee.pursuits, pursuits({ count: 1, hunter: [0], prey: [1], closeness: [1] })),
            ),
        ).toBeCloseTo(0.5 * ZOOM_FACTORS.pursuit, 4);
    });

    it('is left alone while paused', () => {
        const { fr } = rig();
        expect(frame(fr, agents(), { player: player(), paused: true }).zoom).toBe(0);
    });

    it('yields to a manual zoom until the handoff, which keeps it as the base', () => {
        const { camera, fr } = rig();
        const a = agents();
        frame(fr, a, { player: player() });
        camera.targetZoom = 1.2;
        expect(frame(fr, a, { player: player() }).zoom).toBe(0);
        expect(frame(fr, a, { player: player() }).zoom).toBe(0);
        handoffFrame(fr);
        const s = frame(fr, a, { player: player() });
        expect(s.zoom).toBeCloseTo(1.2, 9);
        followSubject(camera, s, 16);
        expect(camera.targetZoom).toBeCloseTo(1.2, 9);
    });

    it('is clamped to the camera limits', () => {
        const { camera, fr } = rig();
        fr.base = 1e9;
        expect(frame(fr, agents()).zoom).toBe(camera.maxZoom);
    });
});
