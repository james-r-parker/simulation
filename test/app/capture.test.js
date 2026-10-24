import { describe, expect, it } from 'vitest';
import {
    captureScreenshot,
    CLIP_BITS_PER_SECOND,
    CLIP_DURATION_MS,
    CLIP_FPS,
    clipSupported,
    createCapture,
    createClipRecorder,
    screenshotMeta,
    VP9_MIME,
    WEBM_MIME,
} from '../../js/app/capture.js';
import { assignSlots, createFamilySlots } from '../../js/app/family-slots.js';

/**
 * @param {{ctxNull?: boolean, blob?: any}} [options] canvas stub behaviour
 * @returns {{canvas: any, calls: any[]}} a 2D canvas fake recording every call
 */
function fake2dCanvas({ ctxNull = false, blob = { kind: 'png' } } = {}) {
    const calls = /** @type {any[]} */ ([]);
    const ctx = {
        font: '',
        fillStyle: '',
        textBaseline: '',
        drawImage: (/** @type {any} */ src, /** @type {number} */ x, /** @type {number} */ y) =>
            calls.push(['drawImage', src.width, src.height, x, y]),
        measureText: (/** @type {string} */ text) => ({ width: text.length * 10 }),
        fillRect: (/** @type {number[]} */ ...args) => calls.push(['fillRect', ...args]),
        beginPath: () => calls.push(['beginPath']),
        arc: (/** @type {number[]} */ ...args) => calls.push(['arc', ...args]),
        fill: () => calls.push(['fill']),
        fillText: (/** @type {string} */ text, /** @type {number} */ x, /** @type {number} */ y) =>
            calls.push(['fillText', text, x, y]),
    };
    const canvas = {
        width: 0,
        height: 0,
        getContext: () => (ctxNull ? null : ctx),
        toBlob: (/** @type {(b: any) => void} */ cb, /** @type {string} */ type) => {
            calls.push(['toBlob', type]);
            cb(blob);
        },
    };
    return { canvas, calls };
}

describe('clipSupported and screenshotMeta', () => {
    it('detects whether MediaRecorder is a constructor', () => {
        expect(clipSupported(function FakeRecorder() {})).toBe(true);
        expect(clipSupported(undefined)).toBe(false);
        expect(clipSupported({})).toBe(false);
    });

    it('builds screenshot metadata with and without ready, stats and a leading family', () => {
        const slots = createFamilySlots();
        assignSlots(slots, [{ id: 4 }]);
        const ready = { seed: 7, info: { seasonNames: ['spring', 'summer', 'autumn', 'winter'], seasonLength: 100 } };
        const stats = { tick: 550, season: 1, generationMax: 12, lineages: { top: [{ id: 4, share: 0.5 }] } };
        const full = screenshotMeta({ ready, stats, tick: 550, slots });
        expect(full.seed).toBe(7);
        expect(full.tick).toBe(550);
        expect(full.calendar).toEqual({ year: 2, season: 'Summer', generation: 12 });
        expect(full.family?.name).toMatch(/^[A-Z][a-z]+$/);
        expect(full.family?.cssColor).toMatch(/^rgb\(/);

        const empty = screenshotMeta({ ready: null, stats: null, tick: 10, slots });
        expect(empty).toEqual({ seed: 0, tick: 10, family: null, calendar: null });

        const noLead = screenshotMeta({ ready: { seed: 3 }, stats: { lineages: { top: [] } }, tick: 5, slots });
        expect(noLead).toEqual({ seed: 3, tick: 5, family: null, calendar: null });
    });
});

describe('captureScreenshot', () => {
    it('copies the WebGL canvas, draws the caption plate with chip and calendar, and saves blob-<seed>-<tick>.png', () => {
        const { canvas, calls } = fake2dCanvas();
        const saved = /** @type {any[]} */ ([]);
        captureScreenshot({
            source: { width: 3840, height: 2160 },
            createCanvas: () => canvas,
            meta: {
                seed: 3,
                tick: 120,
                family: { name: 'Velari', cssColor: 'rgb(86, 180, 233)' },
                calendar: { year: 3, season: 'Summer' },
            },
            onSave: (file) => saved.push(file),
        });
        expect([canvas.width, canvas.height]).toEqual([3840, 2160]);
        expect(calls[0]).toEqual(['drawImage', 3840, 2160, 0, 0]);
        expect(calls.some((c) => c[0] === 'arc')).toBe(true);
        const textCall = calls.find((c) => c[0] === 'fillText');
        expect(textCall[1]).toBe('Velari  ·  Year 3, Summer  ·  seed 3');
        expect(saved).toEqual([{ name: 'blob-3-120.png', blob: { kind: 'png' } }]);
    });

    it('omits the chip and calendar when absent, and does nothing when 2D context or blob is null', () => {
        const { canvas, calls } = fake2dCanvas({ blob: null });
        const saved = /** @type {any[]} */ ([]);
        captureScreenshot({
            source: { width: 1280, height: 720 },
            createCanvas: () => canvas,
            meta: { seed: 9, tick: 4, family: null, calendar: null },
            onSave: (file) => saved.push(file),
        });
        expect(calls.some((c) => c[0] === 'arc')).toBe(false);
        expect(calls.find((c) => c[0] === 'fillText')[1]).toBe('seed 9');
        expect(saved).toEqual([]);

        const noCtx = fake2dCanvas({ ctxNull: true });
        captureScreenshot({
            source: { width: 800, height: 600 },
            createCanvas: () => noCtx.canvas,
            meta: { seed: 1, tick: 1, family: null, calendar: null },
            onSave: (file) => saved.push(file),
        });
        expect(noCtx.calls).toEqual([]);
    });
});

describe('createClipRecorder', () => {
    /**
     * @param {{vp9?: boolean | null, withTracks?: boolean}} [options] fake recorder options
     * @returns {any} a fake MediaRecorder and canvas setup
     */
    function setupRecorder({ vp9 = true, withTracks = true } = {}) {
        const instances = /** @type {any[]} */ ([]);
        class FakeMediaRecorder {
            static isTypeSupported = vp9 === null ? undefined : (/** @type {string} */ t) => vp9 && t === VP9_MIME;
            /**
             * @param {any} stream stream
             * @param {any} options options
             */
            constructor(stream, options) {
                this.stream = stream;
                this.options = options;
                this.started = false;
                this.ondataavailable = /** @type {any} */ (null);
                this.onstop = /** @type {any} */ (null);
                instances.push(this);
            }
            start() {
                this.started = true;
            }
            stop() {
                this.onstop?.();
            }
        }
        let stoppedTracks = 0;
        const timers = /** @type {{ms: number, run: () => void, cleared: boolean}[]} */ ([]);
        const saved = /** @type {any[]} */ ([]);
        const toasts = /** @type {string[]} */ ([]);
        const canvas = {
            captureStream: (/** @type {number} */ fps) => ({
                fps,
                getTracks: withTracks ? () => [{ stop: () => (stoppedTracks += 1) }] : undefined,
            }),
        };
        return {
            FakeMediaRecorder,
            instances,
            timers,
            saved,
            toasts,
            canvas,
            stoppedTracks: () => stoppedTracks,
            setTimer: (/** @type {number} */ ms, /** @type {() => void} */ run) => {
                const handle = { ms, run, cleared: false };
                timers.push(handle);
                return handle;
            },
            clearTimer: (/** @type {any} */ h) => {
                if (h) {
                    h.cleared = true;
                }
            },
        };
    }

    it('records a 15 s VP9 clip at 60 fps and 8 Mbit/s and stops on the timer or a second press', () => {
        const env = setupRecorder({ vp9: true });
        const rec = createClipRecorder({
            MediaRecorder: env.FakeMediaRecorder,
            setTimer: env.setTimer,
            clearTimer: env.clearTimer,
            onSave: (f) => env.saved.push(f),
            onToast: (t) => env.toasts.push(t),
        });
        expect(rec.isRecording()).toBe(false);
        expect(rec.toggle({ canvas: env.canvas, seed: 3, tick: 88 })).toBe('started');
        expect(rec.isRecording()).toBe(true);
        expect(env.instances[0].stream.fps).toBe(CLIP_FPS);
        expect(env.instances[0].options).toEqual({ mimeType: VP9_MIME, videoBitsPerSecond: CLIP_BITS_PER_SECOND });
        expect(env.timers[0].ms).toBe(CLIP_DURATION_MS);

        env.instances[0].ondataavailable({ data: { size: 0 } });
        env.instances[0].ondataavailable({});
        env.instances[0].ondataavailable({ data: new Blob(['abcd']) });

        expect(rec.toggle({ canvas: env.canvas, seed: 3, tick: 99 })).toBe('stopped');
        expect(rec.isRecording()).toBe(false);
        expect(env.timers[0].cleared).toBe(true);
        expect(env.stoppedTracks()).toBe(1);
        expect(env.saved).toHaveLength(1);
        expect(env.saved[0].name).toBe('blob-3-88.webm');
        expect(env.saved[0].blob).toBeInstanceOf(Blob);
        expect(env.saved[0].blob.type).toBe(VP9_MIME);
        expect(env.toasts).toEqual(['Recording 15 s clip (press Shift+P to stop)', 'Saved clip blob-3-88.webm']);
    });

    it('falls back to video/webm when VP9 is unsupported and stops automatically when the timer fires', () => {
        const env = setupRecorder({ vp9: null, withTracks: false });
        const rec = createClipRecorder({
            MediaRecorder: env.FakeMediaRecorder,
            setTimer: env.setTimer,
            onSave: (f) => env.saved.push(f),
            onToast: (t) => env.toasts.push(t),
            makeBlob: (chunks, type) => ({ chunks, type }),
        });
        expect(rec.toggle({ canvas: env.canvas, seed: 5, tick: 12 })).toBe('started');
        env.timers[0].run();
        expect(rec.isRecording()).toBe(false);
        expect(env.saved).toEqual([{ name: 'blob-5-12.webm', blob: { chunks: [], type: WEBM_MIME } }]);
    });

    it('returns unsupported when MediaRecorder or canvas.captureStream is missing', () => {
        const env = setupRecorder();
        const noRec = createClipRecorder({
            MediaRecorder: undefined,
            setTimer: env.setTimer,
            clearTimer: env.clearTimer,
            onSave: () => {},
            onToast: () => {},
        });
        expect(noRec.toggle({ canvas: env.canvas, seed: 1, tick: 1 })).toBe('unsupported');

        const withRec = createClipRecorder({
            MediaRecorder: env.FakeMediaRecorder,
            setTimer: env.setTimer,
            clearTimer: env.clearTimer,
            onSave: () => {},
            onToast: () => {},
        });
        expect(withRec.toggle({ canvas: {}, seed: 1, tick: 1 })).toBe('unsupported');
    });
});

describe('createCapture', () => {
    it('arms a screenshot for the next afterDraw and delegates clip recording', () => {
        const { canvas: outCanvas } = fake2dCanvas();
        const saved = /** @type {any[]} */ ([]);
        const toasts = /** @type {string[]} */ ([]);
        let sourceCanvas = /** @type {any} */ ({ width: 1920, height: 1080 });
        let client = /** @type {any} */ ({ latest: { tick: 77 }, stats: null });
        let ready = /** @type {any} */ ({ seed: 4 });
        const cap = createCapture({
            doc: { createElement: () => outCanvas },
            setTimer: () => 1,
            getReady: () => ready,
            getClient: () => client,
            getCanvas: () => sourceCanvas,
            slots: createFamilySlots(),
            download: (f) => saved.push(f),
            toast: (t) => toasts.push(t),
        });
        cap.afterDraw({ tick: 10 });
        expect(saved).toEqual([]);

        cap.screenshot();
        cap.afterDraw({ tick: 10 });
        expect(saved).toHaveLength(1);
        expect(saved[0].name).toBe('blob-4-77.png');
        expect(toasts).toEqual(['Saved screenshot blob-4-77.png']);

        client = null;
        ready = null;
        cap.screenshot();
        cap.afterDraw({ tick: 19.8 });
        expect(saved.at(-1).name).toBe('blob-0-19.png');

        sourceCanvas = null;
        cap.screenshot();
        cap.afterDraw({ tick: 25 });
        expect(saved).toHaveLength(2);
        cap.recordClip();

        const defaults = createCapture({
            doc: { createElement: () => outCanvas },
            setTimer: () => 1,
            getReady: () => ({ seed: 1 }),
            getClient: () => ({ latest: { tick: 2 } }),
            slots: createFamilySlots(),
            download: (f) => saved.push(f),
            toast: (t) => toasts.push(t),
        });
        defaults.screenshot();
        defaults.afterDraw({ tick: 2 });
        defaults.recordClip();
        expect(saved).toHaveLength(2);
    });
});
