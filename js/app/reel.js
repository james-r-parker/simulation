// The scene reel: a clip of each scene of docs/principles.md, cut by the app. A ring (`reel-ring.js`) keeps the last 12 s
// of the camera and the followed subject. When the scene counters (`scene-counters.js`) note a new instance of a scene,
// the reel scores the moment by how many instances of that scene came in the last 10 s of ticks; a moment that beats the
// scene's best starts a clip, and 4 s later `reel-recorder.js` cuts 10 s (6 before, 4 after) out of its rolling
// recording. Only the best-scored clip per scene per world is kept. The reel reads the counters and never touches the
// sim: a detector's companion, never fitness.

import { AFTER_MS, BEFORE_MS, clipName } from './reel-format.js';
import { createRing, density, newest, pushSample, RECENT } from './reel-ring.js';
import { SCENES } from './scene-counters.js';

/** Ticks before a scene may start another clip. */
export const COOLDOWN_TICKS = 300;

/**
 * @typedef {import('./reel-ring.js').View} View
 */

/**
 * @typedef {object} Moment
 * @property {string} scene the scene's id
 * @property {number} tick when it happened
 * @property {number} score the instances of the scene in the last `DENSITY_TICKS`
 * @property {number} genomeId its newest participant, 0 for none
 * @property {number} x where
 * @property {number} y where
 * @property {View} framing the camera and the follow at the moment, read from the ring
 */

/**
 * @typedef {Moment & {name: string, blob: any, url: string}} Clip
 */

/**
 * @typedef {object} ReelState
 * @property {Int32Array} seen each scene's newest instance tick the reel has looked at
 * @property {Int32Array} started the tick of each scene's last clip start
 * @property {Int32Array[]} recent each scene's recent instance ticks
 * @property {Uint16Array} heads where each scene's next recent tick goes
 * @property {(Clip | null)[]} best each scene's best clip
 * @property {import('./reel-ring.js').Ring} ring the camera ring
 * @property {{moment: Moment, dueMs: number} | null} pending the clip waiting on its 4 s after the moment
 */

/** @returns {ReelState} an empty reel */
function createState() {
    const n = SCENES.length;
    return {
        seen: new Int32Array(n).fill(-1),
        started: new Int32Array(n).fill(-1),
        recent: Array.from({ length: n }, () => new Int32Array(RECENT).fill(-1)),
        heads: new Uint16Array(n),
        best: new Array(n).fill(null),
        ring: createRing(),
        pending: null,
    };
}

/**
 * @param {ReelState} st the reel's state
 * @param {{scenes: import('./scene-counters.js').SceneCounters, onFrame?: (moment: Moment) => void}} deps the counters
 *   and what frames a moment
 * @param {{i: number, nowMs: number}} at the scene's index and the clock
 * @returns {void} counts the scene's new instance and starts a clip when it beats the scene's best
 */
function consider(st, { scenes, onFrame }, { i, nowMs }) {
    const tick = scenes.lastTick[i];
    st.recent[i][st.heads[i]] = tick;
    st.heads[i] = (st.heads[i] + 1) % RECENT;
    const score = density(st.recent[i], tick);
    const held = st.best[i];
    const cooling = st.started[i] >= 0 && tick - st.started[i] < COOLDOWN_TICKS;
    if (st.pending !== null || cooling || (held !== null && score <= held.score)) {
        return;
    }
    st.started[i] = tick;
    const genomeId = scenes.genome[i];
    const moment = {
        scene: SCENES[i].id,
        tick,
        score,
        genomeId,
        x: scenes.x[i],
        y: scenes.y[i],
        framing: newest(st.ring),
    };
    st.pending = { moment, dueMs: nowMs + AFTER_MS };
    onFrame?.(moment);
}

/**
 * @param {ReelState} st the reel's state
 * @param {{recorder: {cut: (ms: number) => any}, makeUrl: (blob: any) => string, revokeUrl: (url: string) => void,
 *   onClip?: (clip: Clip) => void}} deps the recorder, the URLs and what hears a clip
 * @param {number} nowMs the clock
 * @returns {void} cuts the pending clip once its 4 s after the moment have passed
 */
function finish(st, { recorder, makeUrl, revokeUrl, onClip }, nowMs) {
    if (st.pending === null || nowMs < st.pending.dueMs) {
        return;
    }
    const { moment } = st.pending;
    st.pending = null;
    const blob = recorder.cut(BEFORE_MS + AFTER_MS);
    if (blob === null) {
        return;
    }
    const at = SCENES.findIndex((s) => s.id === moment.scene);
    const old = st.best[at];
    if (old !== null) {
        revokeUrl(old.url);
    }
    const clip = { ...moment, name: clipName(moment.scene, moment.tick), blob, url: makeUrl(blob) };
    st.best[at] = clip;
    onClip?.(clip);
}

/**
 * @param {ReelState} st the reel's state
 * @param {(url: string) => void} revokeUrl gives a clip's URL up
 * @returns {void} forgets the world: the clips, the moments seen and the ring
 */
function forget(st, revokeUrl) {
    for (const clip of st.best) {
        if (clip !== null) {
            revokeUrl(clip.url);
        }
    }
    st.best.fill(null);
    st.seen.fill(-1);
    st.started.fill(-1);
    st.recent.forEach((r) => r.fill(-1));
    st.heads.fill(0);
    st.ring.n = 0;
    st.ring.lastMs = -Infinity;
    st.pending = null;
}

/**
 * @param {{scenes: import('./scene-counters.js').SceneCounters, recorder: {cut: (ms: number) => any},
 *   makeUrl?: (blob: any) => string, revokeUrl?: (url: string) => void, onFrame?: (moment: Moment) => void,
 *   onClip?: (clip: Clip) => void}} deps the counters it reads, the recorder it cuts from, how a clip gets a URL and
 *   gives it up, what frames a moment (follows its subject) and what hears a finished clip
 * @returns {{note: (view: View & {nowMs: number}) => void, reset: () => void, clips: () => Clip[],
 *   clipOf: (scene: string) => Clip | null, pending: () => Moment | null}} `note` runs once a frame; `reset` forgets a
 *   world; `clips` lists the best clip of each scene seen
 */
export function createReel({
    scenes,
    recorder,
    makeUrl = (blob) => URL.createObjectURL(blob),
    revokeUrl = (url) => URL.revokeObjectURL(url),
    onFrame,
    onClip,
}) {
    const st = createState();
    return {
        pending: () => st.pending?.moment ?? null,
        clips: () => /** @type {Clip[]} */ (st.best.filter((c) => c !== null)),
        clipOf: (scene) => st.best[SCENES.findIndex((s) => s.id === scene)] ?? null,
        reset: () => forget(st, revokeUrl),
        note(view) {
            pushSample(st.ring, view);
            for (let i = 0; i < SCENES.length; i++) {
                if (scenes.lastTick[i] > st.seen[i]) {
                    st.seen[i] = scenes.lastTick[i];
                    consider(st, { scenes, onFrame }, { i, nowMs: view.nowMs });
                }
            }
            finish(st, { recorder, makeUrl, revokeUrl, onClip }, view.nowMs);
        },
    };
}
