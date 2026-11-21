import { describe, expect, it } from 'vitest';
import { AFTER_MS, BEFORE_MS } from '../../js/app/reel-format.js';
import { COOLDOWN_TICKS, createReel } from '../../js/app/reel.js';
import { DENSITY_TICKS, RING_SAMPLES, SAMPLE_MS } from '../../js/app/reel-ring.js';
import { bumpScene, createSceneCounters, resetSceneCounters, SCENE_AT } from '../../js/app/scene-counters.js';
import { ready } from './helpers/interface-setup.js';

/** @returns {any} a reel over fixture counters and a fake recorder, with what it was asked to do */
function setup() {
    const scenes = createSceneCounters();
    resetSceneCounters(scenes, ready);
    const cuts = /** @type {number[]} */ ([]);
    const recorder = {
        blob: /** @type {any} */ ({ size: 1 }),
        cut: (/** @type {number} */ ms) => (cuts.push(ms), recorder.blob),
    };
    const revoked = /** @type {string[]} */ ([]);
    const framed = /** @type {any[]} */ ([]);
    const heard = /** @type {any[]} */ ([]);
    let made = 0;
    const reel = createReel({
        scenes,
        recorder,
        makeUrl: () => `blob:${++made}`,
        revokeUrl: (url) => revoked.push(url),
        onFrame: (m) => framed.push(m),
        onClip: (c) => heard.push(c),
    });
    return { scenes, recorder, cuts, revoked, framed, heard, reel };
}

/** @param {number} nowMs the clock @param {Record<string, number>} [more] the camera and follow @returns {any} a frame */
const frame = (nowMs, more = {}) => ({ nowMs, x: 5, y: 6, zoom: 2, followId: 9, ...more });

/** @param {any} s the setup @param {string} scene a scene id @param {number} tick when @returns {void} an instance */
const instance = (s, scene, tick) => bumpScene(s.scenes, SCENE_AT[scene], { tick, genome: 7, x: 1, y: 2 });

describe('a moment of a scene', () => {
    it('starts a clip, frames it and cuts 10 s once 4 s have passed', () => {
        const s = setup();
        s.reel.note(frame(0));
        instance(s, 'call', 100);
        s.reel.note(frame(50));
        expect(s.framed).toHaveLength(1);
        expect(s.framed[0]).toMatchObject({ scene: 'call', tick: 100, score: 1, genomeId: 7, x: 1, y: 2 });
        expect(s.framed[0].framing).toEqual({ x: 5, y: 6, zoom: 2, followId: 9 });
        expect(s.reel.pending()?.scene).toBe('call');
        s.reel.note(frame(50 + AFTER_MS - 1));
        expect(s.cuts).toEqual([]);
        s.reel.note(frame(50 + AFTER_MS));
        expect(s.cuts).toEqual([BEFORE_MS + AFTER_MS]);
        expect(s.reel.pending()).toBeNull();
        expect(s.reel.clipOf('call')).toMatchObject({ name: 'call-100.webm', tick: 100, url: 'blob:1' });
        expect(s.heard).toHaveLength(1);
        expect(s.reel.clips().map((/** @type {any} */ c) => c.scene)).toEqual(['call']);
    });

    it('is not a moment for a scene with no signal, and an empty reel holds no clip', () => {
        const s = setup();
        s.reel.note(frame(0));
        expect(s.reel.clips()).toEqual([]);
        expect(s.reel.clipOf('patch')).toBeNull();
        expect(s.reel.clipOf('nope')).toBeNull();
    });

    it('waits for a clip in flight: one clip at a time', () => {
        const s = setup();
        instance(s, 'call', 100);
        s.reel.note(frame(0));
        instance(s, 'pack', 110);
        s.reel.note(frame(10));
        expect(s.framed).toHaveLength(1);
    });

    it('cuts nothing when the recorder has nothing yet', () => {
        const s = setup();
        s.recorder.blob = null;
        instance(s, 'call', 100);
        s.reel.note(frame(0));
        s.reel.note(frame(AFTER_MS));
        expect(s.reel.clips()).toEqual([]);
    });
});

describe('the best clip of a scene', () => {
    it('scores by instances in the last 10 s of ticks and keeps only a better one', () => {
        const s = setup();
        instance(s, 'call', 100);
        s.reel.note(frame(0));
        s.reel.note(frame(AFTER_MS));
        expect(s.reel.clipOf('call')?.score).toBe(1);
        // Cooling: a second instance inside the cooldown does not start a clip.
        instance(s, 'call', 100 + COOLDOWN_TICKS - 1);
        s.reel.note(frame(5000));
        expect(s.framed).toHaveLength(1);
        // Past the cooldown, a third instance within the window scores 3 and beats 1.
        instance(s, 'call', 100 + COOLDOWN_TICKS);
        s.reel.note(frame(5100));
        expect(s.framed).toHaveLength(2);
        expect(s.framed[1].score).toBe(3);
        s.reel.note(frame(5100 + AFTER_MS));
        expect(s.revoked).toEqual(['blob:1']);
        expect(s.reel.clipOf('call')).toMatchObject({ score: 3, tick: 100 + COOLDOWN_TICKS });
        // A lone instance far later scores 1 and does not replace it.
        instance(s, 'call', 100 + COOLDOWN_TICKS + DENSITY_TICKS * 3);
        s.reel.note(frame(20_000));
        expect(s.framed).toHaveLength(2);
        expect(s.reel.clipOf('call')?.score).toBe(3);
    });

    it('keeps one clip per scene', () => {
        const s = setup();
        instance(s, 'call', 100);
        s.reel.note(frame(0));
        s.reel.note(frame(AFTER_MS));
        instance(s, 'pack', 200);
        s.reel.note(frame(5000));
        s.reel.note(frame(5000 + AFTER_MS));
        expect(s.reel.clips().map((/** @type {any} */ c) => c.scene)).toEqual(['call', 'pack']);
    });
});

describe('the defaults', () => {
    it('gives a clip an object URL and revokes it, over the platform', () => {
        const scenes = createSceneCounters();
        resetSceneCounters(scenes, ready);
        const reel = createReel({ scenes, recorder: { cut: () => new Blob(['x'], { type: 'video/webm' }) } });
        bumpScene(scenes, SCENE_AT.call, { tick: 1, genome: 1, x: 0, y: 0 });
        reel.note(frame(0));
        reel.note(frame(AFTER_MS));
        expect(reel.clipOf('call')?.url).toMatch(/^blob:/);
        reel.reset();
        expect(reel.clips()).toEqual([]);
    });
});

describe('the ring and a new world', () => {
    it('keeps 12 s of samples at 10 Hz and frames a moment from the newest', () => {
        const s = setup();
        for (let i = 0; i < RING_SAMPLES + 20; i++) {
            s.reel.note(frame(i * SAMPLE_MS, { x: i }));
            s.reel.note(frame(i * SAMPLE_MS + 1, { x: -1 }));
        }
        instance(s, 'call', 100);
        s.reel.note(frame((RING_SAMPLES + 20) * SAMPLE_MS + 5, { x: 777 }));
        expect(s.framed[0].framing.x).toBe(777);
    });

    it('forgets the clips and the moment on reset, and gives the clips up', () => {
        const s = setup();
        instance(s, 'call', 100);
        s.reel.note(frame(0));
        s.reel.note(frame(AFTER_MS));
        instance(s, 'pack', 200);
        s.reel.note(frame(AFTER_MS + 10));
        expect(s.reel.pending()).not.toBeNull();
        s.reel.reset();
        expect(s.revoked).toEqual(['blob:1']);
        expect(s.reel.clips()).toEqual([]);
        expect(s.reel.pending()).toBeNull();
        resetSceneCounters(s.scenes, ready);
        instance(s, 'call', 5);
        s.reel.note(frame(10));
        expect(s.framed.at(-1)).toMatchObject({ scene: 'call', tick: 5, score: 1 });
    });
});
