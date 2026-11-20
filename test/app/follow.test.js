import { describe, expect, it } from 'vitest';
import { createAppState } from '../../js/app/actions.js';
import { createCameraController } from '../../js/app/camera.js';
import { createFollowController, frameFollow, FOLLOW_HOLD_MS } from '../../js/app/follow.js';
import { createInterpolated } from '../../js/app/interpolate.js';

/** @returns {{camera: any, state: any, agents: any, logs: any[], follow: ReturnType<typeof createFollowController>}} a view */
function setup() {
    const camera = createCameraController({
        canvas: { width: 1920, height: 1080 },
        world: { width: 14400, height: 8100 },
    });
    const state = createAppState();
    const agents = createInterpolated(2);
    agents.count = 2;
    agents.genomeId.set([7, 8]);
    agents.x.set([100, 200]);
    const logs = /** @type {any[]} */ ([]);
    const follow = createFollowController({
        camera,
        state,
        getAgents: () => agents,
        getPlayer: () => null,
        log: (level, event, fields) => logs.push({ level, event, ...fields }),
    });
    return { camera, state, agents, logs, follow };
}

/** @param {ReturnType<typeof setup>} s @param {number} dtMs @param {boolean} [paused] @returns {void} advances one visible frame */
function step(s, dtMs, paused = false) {
    s.follow.step({ dtMs, nowMs: 1000, available: true, paused });
}

describe('continuous follow', () => {
    it('chooses a live selection, falls back from stale selections, and handles empty worlds', () => {
        const s = setup();
        expect(s.follow.choose(8)).toBe(8);
        expect(s.follow.choose(999)).toBe(8);
        s.agents.count = 0;
        expect(s.follow.choose()).toBe(0);
    });

    it('holds a death briefly, then follows another living subject without changing selection or zoom', () => {
        const s = setup();
        s.state.selectedId = s.state.followId = 7;
        step(s, 16);
        expect(s.camera.targetX).toBe(100);
        s.camera.targetZoom = 0.8;
        s.agents.genomeId[0] = 999;
        step(s, FOLLOW_HOLD_MS - 1);
        expect(s.state.followId).toBe(7);
        expect(s.camera.targetX).toBe(100);
        step(s, 1);
        expect(s.state.followId).toBe(999);
        expect(s.state.selectedId).toBe(7);
        expect(s.camera.targetZoom).toBe(0.8);
        expect(s.logs).toEqual([
            { level: 'info', event: 'FollowStarted', fromId: 0, toId: 7, reason: 'entry' },
            { level: 'info', event: 'FollowChanged', fromId: 7, toId: 999, reason: 'death' },
        ]);
    });

    it('stays with its subject while it lives', () => {
        const s = setup();
        s.state.followId = 7;
        for (let i = 0; i < 10; i++) {
            step(s, 100);
        }
        expect(s.state.followId).toBe(7);
        expect(s.logs).toHaveLength(1);
    });

    it('freezes a pending handoff while paused and when a packed frame is unavailable', () => {
        const s = setup();
        s.state.followId = 99;
        step(s, 300);
        step(s, 10000, true);
        s.follow.step({ dtMs: 10000, nowMs: 2000, available: false, paused: false });
        expect(s.state.followId).toBe(99);
        step(s, 350);
        expect(s.state.followId).toBe(8);
    });

    it('ends follow when a real population is empty, releasing the camera', () => {
        const s = setup();
        s.state.followId = 7;
        s.agents.count = 0;
        step(s, FOLLOW_HOLD_MS);
        expect(s.state.followId).toBe(0);
        expect(s.camera.following).toBe(false);
        expect(s.logs.at(-1)).toMatchObject({ event: 'FollowEnded', reason: 'empty' });
    });

    it('cancels a pending handoff and resets its timer before a new follow', () => {
        const s = setup();
        s.state.followId = 99;
        step(s, 600);
        s.state.followId = 0;
        step(s, 100);
        expect(s.logs.at(-1)).toMatchObject({ event: 'FollowEnded', reason: 'cancel' });
        s.state.followId = 88;
        step(s, 100);
        expect(s.state.followId).toBe(88);
        s.follow.reset();
        expect(s.state.followId).toBe(0);
        expect(s.camera.following).toBe(false);
        s.follow.reset();
        s.state.followId = 77;
        step(s, 100);
        expect(s.state.followId).toBe(77);
    });

    it('clears a partial hold if the same live subject reappears', () => {
        const s = setup();
        s.state.followId = 99;
        step(s, 600);
        s.agents.genomeId[0] = 99;
        step(s, 16);
        s.agents.genomeId[0] = 7;
        step(s, 100);
        expect(s.state.followId).toBe(99);
    });
});

describe('follow framing', () => {
    it('zooms entry to a useful close view on landscape and portrait canvases', () => {
        const { camera } = setup();
        frameFollow(camera);
        expect(camera.targetZoom).toBeCloseTo(1.2);
        expect(camera.zoom).toBeLessThan(camera.targetZoom);
        camera.canvas = { width: 500, height: 900 };
        camera.targetZoom = camera.minZoom;
        frameFollow(camera);
        expect(camera.targetZoom).toBeCloseTo(500 / 900);
    });

    it('preserves a closer view and obeys both zoom limits', () => {
        const { camera } = setup();
        camera.targetZoom = 2;
        frameFollow(camera);
        expect(camera.targetZoom).toBe(2);
        camera.maxZoom = 0.5;
        frameFollow(camera);
        expect(camera.targetZoom).toBe(0.5);
        camera.minZoom = camera.maxZoom = 4;
        frameFollow(camera);
        expect(camera.targetZoom).toBe(4);
    });
});
