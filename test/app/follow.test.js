import { describe, expect, it } from 'vitest';
import { createAppState } from '../../js/app/actions.js';
import { createCameraController } from '../../js/app/camera.js';
import { createFollowController, FOLLOW_BORED_MS, frameFollow } from '../../js/app/follow.js';
import { createStory, holdMsFor, noteStory } from '../../js/app/follow-handoff.js';
import { createFollowInterest } from '../../js/app/follow-target.js';
import { createInterpolated } from '../../js/app/interpolate.js';

/** @returns {any} a player stub holding the story, the interest ring and no pursuits */
function stubPlayer() {
    return {
        story: createStory(),
        followInterest: createFollowInterest(),
        flee: { pursuits: { count: 0 }, rules: { maxVelocity: 1 } },
        bits: { PREGNANT: 1, ATE_SHIFT: 0, TIMER_MASK: 31 },
    };
}

/** @param {any} [player] the effects player @returns {{camera: any, state: any, agents: any, logs: any[], follow: ReturnType<typeof createFollowController>}} a view */
function setup(player = null) {
    const selects = /** @type {number[]} */ ([]);
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
        select: (id) => selects.push(id),
    });
    return { camera, state, agents, logs, follow, selects };
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

    it('holds a death briefly, then follows another living subject moving the selection with it and keeping the zoom', () => {
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
        expect(s.state.selectedId).toBe(999);
        expect(s.selects).toEqual([999]);
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

describe('follow framing in the controller', () => {
    it('leads a moving subject by its displayed velocity, and centres it exactly while paused', () => {
        const s = setup(stubPlayer());
        s.state.followId = 7;
        s.camera.targetZoom = 0.5;
        for (let k = 0; k < 20; k++) {
            s.agents.x[0] += 2;
            step(s, 16);
        }
        expect(s.camera.targetX).toBeGreaterThan(s.agents.x[0] + 10);
        s.follow.step({ dtMs: 16, nowMs: 1000, available: true, paused: true });
        expect(s.camera.targetX).toBeCloseTo(s.agents.x[0], 4);
        expect(s.camera.targetZoom).toBe(0.5);
    });

    it('keeps a viewer zoom made mid-follow', () => {
        const s = setup(stubPlayer());
        s.state.followId = 7;
        step(s, 16);
        s.camera.targetZoom = 1.5;
        for (let k = 0; k < 20; k++) {
            step(s, 16);
        }
        expect(s.camera.targetZoom).toBe(1.5);
    });
});

describe('boredom', () => {
    /** @param {ReturnType<typeof setup>} s @param {number} ms @param {boolean} [paused] @returns {void} runs quiet frames */
    const idle = (s, ms, paused = false) => {
        for (let t = 0; t < ms; t += 100) {
            step(s, 100, paused);
        }
    };

    it('moves to the best other subject after 120 s of nothing, with no caption', () => {
        const s = setup(stubPlayer());
        s.state.followId = 7;
        idle(s, FOLLOW_BORED_MS - 200);
        expect(s.state.followId).toBe(7);
        idle(s, 400);
        expect(s.state.followId).toBe(8);
        expect(s.logs.at(-1)).toEqual({ level: 'info', event: 'FollowHandoff', from: 7, to: 8, relation: 'bored' });
        expect(s.logs.at(-2)).toMatchObject({ event: 'FollowChanged', reason: 'bored' });
        expect(s.follow.caption()).toBe('');
    });

    it('restarts its clock on an event above the movement score, and counts nothing while paused', () => {
        const player = stubPlayer();
        const s = setup(player);
        s.state.followId = 7;
        idle(s, FOLLOW_BORED_MS - 1000);
        player.followInterest.subject[0] = 7;
        player.followInterest.score[0] = 45;
        player.followInterest.atMs[0] = 1000;
        player.followInterest.count = 1;
        idle(s, 200);
        player.followInterest.count = 0;
        idle(s, FOLLOW_BORED_MS - 1000);
        expect(s.state.followId).toBe(7);
        idle(s, 1_000_000, true);
        expect(s.state.followId).toBe(7);
    });

    it('never leaves a subject the viewer selected, at entry or during the follow', () => {
        const entry = setup(stubPlayer());
        entry.state.selectedId = entry.state.followId = 7;
        idle(entry, FOLLOW_BORED_MS + 5000);
        expect(entry.state.followId).toBe(7);
        const later = setup(stubPlayer());
        later.state.followId = 7;
        idle(later, 500);
        later.state.selectedId = 7;
        idle(later, FOLLOW_BORED_MS + 5000);
        expect(later.state.followId).toBe(7);
        later.state.selectedId = 8;
        idle(later, 500);
        expect(later.state.followId).toBe(7);
    });

    it('gives a handoff a fresh clock and no exemption, and stays with a subject that is alone', () => {
        const s = setup(stubPlayer());
        s.state.selectedId = s.state.followId = 7;
        step(s, 16);
        s.agents.genomeId[0] = 999;
        idle(s, holdMsFor(null, 7) + 100);
        const heir = s.state.followId;
        expect(heir).not.toBe(7);
        s.state.selectedId = 0;
        idle(s, FOLLOW_BORED_MS - 1000);
        expect(s.state.followId).toBe(heir);
        idle(s, 1500);
        expect(s.state.followId).not.toBe(heir);
        s.agents.count = 1;
        s.state.followId = 7;
        s.agents.genomeId[0] = 7;
        idle(s, FOLLOW_BORED_MS + 1000);
        expect(s.state.followId).toBe(7);
    });
});

describe('the inspector follows a handoff', () => {
    /** @param {ReturnType<typeof setup>} s @returns {void} the subject dies and the hold runs out */
    const die = (s) => {
        s.agents.genomeId[0] = 999;
        step(s, holdMsFor(null, 7));
    };

    it('moves the selection to the new subject even when the worker already reported the old one gone', () => {
        const s = setup();
        s.state.selectedId = s.state.followId = 7;
        step(s, 16);
        s.state.selectedId = 0;
        die(s);
        expect(s.state.selectedId).toBe(s.state.followId);
        expect(s.selects).toEqual([s.state.followId]);
    });

    it('leaves a selection of another agent, and a selection the viewer cleared, alone', () => {
        const other = setup();
        other.state.selectedId = 8;
        other.state.followId = 7;
        step(other, 16);
        die(other);
        expect(other.state.selectedId).toBe(8);
        const cleared = setup();
        cleared.state.selectedId = cleared.state.followId = 7;
        step(cleared, 16);
        cleared.state.selectedId = 0;
        step(cleared, 16);
        die(cleared);
        expect(cleared.state.selectedId).toBe(0);
        expect(cleared.selects).toEqual([]);
    });

    it('does not count the selection it made as the viewer picking the new subject', () => {
        const s = setup(stubPlayer());
        s.state.selectedId = s.state.followId = 7;
        step(s, 16);
        die(s);
        s.agents.count = 2;
        expect(s.state.selectedId).toBe(s.state.followId);
        for (let t = 0; t < FOLLOW_BORED_MS + 5000; t += 100) {
            step(s, 100);
        }
        expect(s.logs.some((entry) => entry.relation === 'bored')).toBe(true);
        expect(s.state.selectedId).toBe(s.state.followId);
    });
});
