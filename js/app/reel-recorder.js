// The reel's rolling recorder: one `MediaRecorder` on the canvas runs for as long as the world does, handing over a
// chunk a second, and keeps the first chunk (which carries the WebM header) and the chunks of the last 12 s. A `cut`
// writes the header and the chunks of the window asked for into one blob, so a clip can start before the moment that
// asked for it. The encoder runs off the frame loop: the loop only reads the clock. A cut that starts at a chunk that
// is not a keyframe may open on a few garbled frames; the clip is for watching behaviour, not for the look.

import { BITS_PER_SECOND, VP9_MIME, WEBM_MIME } from './reel-format.js';

/** Chunk length in ms, the grain of a cut. */
export const SLICE_MS = 1000;
/** The longest window the ring keeps, in ms. */
export const KEEP_MS = 12_000;

/**
 * @param {() => number} now the clock in ms
 * @returns {{add: (data: any) => void, since: (ms: number) => any[], clear: () => void, count: () => number}} the header
 *   chunk and the ring of the rest: `add` takes a chunk (the first is the header), `since` lists the header and the
 *   chunks that ended after `ms`
 */
function createChunks(now) {
    /** @type {any} */
    let head = null;
    /** @type {{at: number, data: any}[]} */
    let ring = [];
    return {
        count: () => ring.length + (head === null ? 0 : 1),
        clear() {
            head = null;
            ring = [];
        },
        add(data) {
            if (head === null) {
                head = data;
                return;
            }
            const at = now();
            ring.push({ at, data });
            while (ring.length > 0 && ring[0].at < at - KEEP_MS - SLICE_MS) {
                ring.shift();
            }
        },
        since: (ms) => (head === null ? [] : [head, ...ring.filter((c) => c.at > ms).map((c) => c.data)]),
    };
}

/**
 * @param {{MediaRecorder: any, now: () => number, makeBlob?: (chunks: any[], type: string) => any}} deps the
 *   `MediaRecorder` constructor (absent where unsupported), the clock in ms and how a blob is made
 * @returns {{start: (canvas: any) => boolean, cut: (windowMs: number) => any, stop: () => void,
 *   running: () => boolean, chunks: () => number}} `start` begins on a canvas and says whether it could; `cut` returns the
 *   last `windowMs` as one blob, or null before a chunk arrived; `stop` ends the recording
 */
export function createRollingRecorder({ MediaRecorder, now, makeBlob = (chunks, type) => new Blob(chunks, { type }) }) {
    /** @type {any} */
    let recorder = null;
    /** @type {any} */
    let stream = null;
    let mime = WEBM_MIME;
    const store = createChunks(now);
    return {
        running: () => recorder !== null,
        chunks: store.count,
        start(canvas) {
            if (typeof MediaRecorder !== 'function' || typeof canvas?.captureStream !== 'function') {
                return false;
            }
            mime = MediaRecorder.isTypeSupported?.(VP9_MIME) ? VP9_MIME : WEBM_MIME;
            stream = canvas.captureStream(30);
            recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: BITS_PER_SECOND });
            recorder.ondataavailable = (/** @type {{data?: {size: number}}} */ e) => e.data?.size && store.add(e.data);
            recorder.start(SLICE_MS);
            return true;
        },
        cut(windowMs) {
            const chunks = store.since(now() - windowMs);
            return chunks.length === 0 ? null : makeBlob(chunks, mime);
        },
        stop() {
            recorder?.stop();
            for (const track of stream?.getTracks?.() ?? []) {
                track.stop();
            }
            recorder = null;
            stream = null;
            store.clear();
        },
    };
}
