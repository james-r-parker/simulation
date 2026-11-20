import { describe, expect, it } from 'vitest';
import { createAppState } from '../../js/app/actions.js';
import { createCameraController } from '../../js/app/camera.js';
import { createFollowController, frameFollow } from '../../js/app/follow.js';
import { createStory, holdMsFor, noteStory } from '../../js/app/follow-handoff.js';
import { createFollowInterest } from '../../js/app/follow-target.js';
import { createInterpolated } from '../../js/app/interpolate.js';

/** @returns {any} a player stub holding the story, the interest ring and no pursuits */
function stubPlayer() {
    return {
        story: createStory(),
        followInterest: createFollowInterest(),
        flee: { pursuits: { count: 0 } },
        bits: { PREGNANT: 1 },
    };
}

/** @param {any} [player] the effects player @returns {{camera: any, state: any, agents: any, logs: any[], follow: ReturnType<typeof createFollowController>}} a view */
function setup(player = null) {
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
        getPlayer: () => player,
        log: (level, event, fields) => logs.push({ level, event, ...fields }),
    });
    return { camera, state, agents, logs, follow };
}

/** @param {ReturnType<typeof setup>} s @param {number} dtMs @param {boolean} [paused] @returns {void} advances one visible frame */
function step(s, dtMs, paused = false) {
    s.follow.step({ dtMs, nowMs: 1000, available: true, paused });
}

/** The hold with no remembered death: a starvation's clip plus 600 ms. */
const HOLD_MS = holdMsFor(null, 99);

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
        step(s, HOLD_MS - 1);
        expect(s.state.followId).toBe(7);
        expect(s.camera.targetX).toBe(100);
        step(s, 1);
        expect(s.state.followId).toBe(999);
        expect(s.state.selectedId).toBe(7);
        expect(s.camera.targetZoom).toBe(0.8);
        expect(s.logs).toEqual([
            { level: 'info', event: 'FollowStarted', fromId: 0, toId: 7, reason: 'entry' },
            { level: 'info', event: 'FollowChanged', fromId: 7, toId: 999, reason: 'death' },
            { level: 'info', event: 'FollowHandoff', from: 7, to: 999, relation: 'pick' },
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
        step(s, HOLD_MS - 300);
        expect(s.state.followId).toBe(8);
    });

    it('ends follow when a real population is empty, releasing the camera', () => {
        const s = setup();
        s.state.followId = 7;
        s.agents.count = 0;
        step(s, HOLD_MS);
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

describe('follow as a story', () => {
    const CTX = { kinds: { DIED: 2, BORN: 1 }, eatenCause: 1, causeNames: ['STARVED', 'EATEN'] };

    it('holds for the death clip plus 600 ms, then hands the camera to the killer with a 3 s caption', () => {
        const player = stubPlayer();
        const s = setup(player);
        noteStory(player.story, { kind: 2, x: 100, y: 0, a: 7, b: 8, c: 256, d: 5 }, CTX);
        s.state.followId = 7;
        step(s, 16);
        s.agents.genomeId[0] = 999;
        const hold = holdMsFor(player.story, 7);
        step(s, hold - 1);
        expect(s.state.followId).toBe(7);
        expect(s.follow.caption()).toBe('');
        step(s, 1);
        expect(s.state.followId).toBe(8);
        expect(s.logs.at(-1)).toEqual({ level: 'info', event: 'FollowHandoff', from: 7, to: 8, relation: 'killer' });
        expect(s.follow.caption()).toBe('its killer');
        s.follow.step({ dtMs: 16, nowMs: 1000 + 2999, available: true, paused: false });
        expect(s.follow.caption()).toBe('its killer');
        s.follow.step({ dtMs: 16, nowMs: 1000 + 3000, available: true, paused: false });
        expect(s.follow.caption()).toBe('');
    });

    it('names a child, and says nothing for a plain pick; cancelling and reset clear the caption', () => {
        const player = stubPlayer();
        const s = setup(player);
        noteStory(player.story, { kind: 1, x: 0, y: 0, a: 8, b: 5, c: 7, d: 1 }, CTX);
        noteStory(player.story, { kind: 2, x: 0, y: 0, a: 7, b: 0, c: 0, d: 0 }, CTX);
        s.state.followId = 7;
        step(s, 16);
        s.agents.genomeId[0] = 999;
        step(s, holdMsFor(player.story, 7));
        expect(s.state.followId).toBe(8);
        expect(s.follow.caption()).toBe('its daughter');
        s.state.followId = 0;
        step(s, 16);
        expect(s.follow.caption()).toBe('');
        s.state.followId = 999;
        step(s, 16);
        s.agents.genomeId[0] = 998;
        step(s, holdMsFor(player.story, 999));
        expect(s.logs.at(-1)).toMatchObject({ event: 'FollowHandoff', relation: 'pick' });
        expect(s.follow.caption()).toBe('');
        s.follow.reset();
        expect(s.follow.caption()).toBe('');
    });
});
