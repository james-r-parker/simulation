import { describe, expect, it } from 'vitest';
import { createRollingRecorder, KEEP_MS, SLICE_MS } from '../../js/app/reel-recorder.js';
import { BITS_PER_SECOND, VP9_MIME, WEBM_MIME } from '../../js/app/reel-format.js';

/** A fake `MediaRecorder` that hands over chunks when told. */
class FakeRecorder {
    static supported = true;
    static made = /** @type {FakeRecorder[]} */ ([]);
    /** @param {any} stream @param {any} options */
    constructor(stream, options) {
        this.stream = stream;
        this.options = options;
        this.started = 0;
        this.stopped = false;
        this.ondataavailable = /** @type {any} */ (null);
        FakeRecorder.made.push(this);
    }
    /** @param {string} type @returns {boolean} whether vp9 is on */
    static isTypeSupported(type) {
        return FakeRecorder.supported && type === VP9_MIME;
    }
    /** @param {number} ms the slice */
    start(ms) {
        this.started = ms;
    }
    stop() {
        this.stopped = true;
    }
    /** @param {any} data a chunk */
    emit(data) {
        this.ondataavailable({ data });
    }
}

/** @returns {any} a recorder over fakes, the clock and the canvas */
function setup() {
    FakeRecorder.made.length = 0;
    FakeRecorder.supported = true;
    const clock = { ms: 0 };
    const stopped = /** @type {boolean[]} */ ([]);
    const canvas = { captureStream: () => ({ getTracks: () => [{ stop: () => stopped.push(true) }] }) };
    const rec = createRollingRecorder({
        MediaRecorder: FakeRecorder,
        now: () => clock.ms,
        makeBlob: (chunks, type) => ({ chunks, type }),
    });
    return { rec, clock, canvas, stopped, fake: () => FakeRecorder.made[0] };
}

/** @param {any} s the setup @param {string} name a chunk's name @returns {void} one more second, one chunk */
function chunk(s, name) {
    s.clock.ms += SLICE_MS;
    s.fake().emit({ size: 1, name });
}

/** @param {any} blob a fake blob @returns {string[]} its chunks' names */
const names = (blob) => blob.chunks.map((/** @type {any} */ c) => c.name);

describe('the rolling recorder', () => {
    it('records a second at a time at the reel bitrate, preferring vp9', () => {
        const s = setup();
        expect(s.rec.start(s.canvas)).toBe(true);
        expect(s.rec.running()).toBe(true);
        expect(s.fake().started).toBe(SLICE_MS);
        expect(s.fake().options).toEqual({ mimeType: VP9_MIME, videoBitsPerSecond: BITS_PER_SECOND });
    });

    it('falls back to plain webm, and starts nothing where it cannot', () => {
        const s = setup();
        FakeRecorder.supported = false;
        s.rec.start(s.canvas);
        expect(s.fake().options.mimeType).toBe(WEBM_MIME);
        expect(createRollingRecorder({ MediaRecorder: undefined, now: () => 0 }).start(s.canvas)).toBe(false);
        expect(s.rec.start({})).toBe(false);
    });

    it('cuts the header and the chunks of the window, and nothing before a chunk came', () => {
        const s = setup();
        s.rec.start(s.canvas);
        expect(s.rec.cut(10_000)).toBeNull();
        s.fake().emit({ size: 0 });
        s.fake().emit(undefined);
        expect(s.rec.chunks()).toBe(0);
        for (const name of ['head', 'a', 'b', 'c', 'd']) {
            chunk(s, name);
        }
        expect(names(s.rec.cut(10_000))).toEqual(['head', 'a', 'b', 'c', 'd']);
        expect(names(s.rec.cut(2500))).toEqual(['head', 'b', 'c', 'd']);
        expect(s.rec.cut(1000).type).toBe(VP9_MIME);
    });

    it('keeps only the last 12 s, and the header always', () => {
        const s = setup();
        s.rec.start(s.canvas);
        chunk(s, 'head');
        for (let i = 0; i < 30; i++) {
            chunk(s, `c${i}`);
        }
        expect(s.rec.chunks()).toBeLessThanOrEqual(KEEP_MS / SLICE_MS + 3);
        const kept = names(s.rec.cut(60_000));
        expect(kept[0]).toBe('head');
        expect(kept.at(-1)).toBe('c29');
        expect(kept).not.toContain('c0');
    });

    it('stops the recording and the stream and forgets the chunks', () => {
        const s = setup();
        s.rec.start(s.canvas);
        chunk(s, 'head');
        s.rec.stop();
        expect(s.fake().stopped).toBe(true);
        expect(s.stopped).toEqual([true]);
        expect(s.rec.running()).toBe(false);
        expect(s.rec.cut(1000)).toBeNull();
        s.rec.stop();
    });

    it('makes a real blob of the chunks by default', () => {
        const s = setup();
        const rec = createRollingRecorder({ MediaRecorder: FakeRecorder, now: () => s.clock.ms });
        rec.start(s.canvas);
        s.fake().emit(new Blob(['ab']));
        expect(rec.cut(1000)).toBeInstanceOf(Blob);
        expect(rec.cut(1000).size).toBe(2);
    });
});
