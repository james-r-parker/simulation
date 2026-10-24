// Sharing captures: `captureScreenshot` (`P`) copies the WebGL canvas right after `draw` onto a 2D canvas, paints a
// caption plate (leading family's chip and name, `Year 3, Summer`, seed) and saves `blob-<seed>-<tick>.png`;
// `createClipRecorder` (`Shift+P`) records up to 15 s at 60 fps and 8 Mbit/s (`video/webm;codecs=vp9`, else
// `video/webm`) and saves `blob-<seed>-<tick>.webm`, stopping early on a second press.

import { familyName } from './renderer/colors.js';
import { familyCss } from './ui/css-color.js';
import { calendarOf } from './ui/status-line.js';

/** Clip length in ms before automatic stop. */
export const CLIP_DURATION_MS = 15_000;
/** Capture frame rate passed to `canvas.captureStream`. */
export const CLIP_FPS = 60;
/** Target video bitrate (8 Mbit/s). */
export const CLIP_BITS_PER_SECOND = 8_000_000;
/** Preferred and fallback WebM MIME types. */
export const VP9_MIME = 'video/webm;codecs=vp9';
export const WEBM_MIME = 'video/webm';

/**
 * @param {unknown} MediaRecorder the global `MediaRecorder` constructor, if any
 * @returns {boolean} whether the browser supports recording a clip
 */
export function clipSupported(MediaRecorder) {
    return typeof MediaRecorder === 'function';
}

/**
 * @typedef {object} ScreenshotMeta
 * @property {number} seed the world seed
 * @property {number} tick the frame tick
 * @property {{name: string, cssColor: string} | null} family leading family name and CSS colour chip, null when none
 * @property {{year: number, season: string} | null} calendar current year and season name, null before stats
 */

/**
 * Builds the caption-plate metadata from the worker's `ready` and `stats` messages and the family colour slots.
 * @param {{ready: Record<string, any> | null, stats: Record<string, any> | null, tick: number,
 *   slots: import('./family-slots.js').FamilySlots}} source current world state
 * @returns {ScreenshotMeta} metadata for `captureScreenshot`
 */
export function screenshotMeta({ ready, stats, tick, slots }) {
    const seed = ready?.seed ?? 0;
    const top = stats?.lineages?.top;
    const lead = top?.[0];
    const family =
        lead === undefined ? null : { name: familyName(seed, lead.id, top), cssColor: familyCss(slots, lead.id) };
    const calendar = stats !== null && ready?.info !== undefined ? calendarOf(stats, ready.info) : null;
    return { seed, tick, family, calendar };
}

/**
 * Draws the dark translucent caption plate with optional family chip and caption text in the bottom-left corner.
 * @param {any} ctx 2D canvas context
 * @param {{width: number, height: number}} size canvas dimensions in device pixels
 * @param {ScreenshotMeta} meta world metadata for the plate
 * @returns {void}
 */
function drawCaptionPlate(ctx, { width, height }, { seed, family, calendar }) {
    const scale = Math.max(1, width / 1920);
    const padX = Math.round(18 * scale);
    const padY = Math.round(12 * scale);
    const margin = Math.round(24 * scale);
    const fontPx = Math.round(18 * scale);
    const chipRadius = Math.round(7 * scale);
    const calendarPart = calendar === null ? '' : `Year ${calendar.year}, ${calendar.season}  ·  `;
    const familyPart = family === null ? '' : `${family.name}  ·  `;
    const text = `${familyPart}${calendarPart}seed ${seed}`;

    ctx.font = `600 ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
    const textWidth = ctx.measureText(text).width;
    const chipSpace = family === null ? 0 : chipRadius * 2 + Math.round(10 * scale);
    const boxW = Math.round(padX * 2 + chipSpace + textWidth);
    const boxH = Math.round(fontPx + padY * 2);
    const x = margin;
    const y = height - margin - boxH;

    ctx.fillStyle = 'rgba(8, 10, 14, 0.78)';
    ctx.fillRect(x, y, boxW, boxH);

    let textX = x + padX;
    const centerY = y + boxH / 2;
    if (family !== null) {
        ctx.fillStyle = family.cssColor;
        ctx.beginPath();
        ctx.arc(textX + chipRadius, centerY, chipRadius, 0, Math.PI * 2);
        ctx.fill();
        textX += chipSpace;
    }
    ctx.fillStyle = 'rgba(226, 232, 240, 0.92)';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, textX, centerY);
}

/**
 * Copies `source` onto a 2D canvas, paints the caption plate and delivers `blob-<seed>-<tick>.png` to `onSave`.
 * @param {{source: {width: number, height: number}, createCanvas: () => any, meta: ScreenshotMeta,
 *   onSave: (file: {name: string, blob: any}) => void}} options screenshot inputs
 * @returns {void}
 */
export function captureScreenshot({ source, createCanvas, meta, onSave }) {
    const out = createCanvas();
    out.width = source.width;
    out.height = source.height;
    const ctx = out.getContext('2d');
    if (ctx === null) {
        return;
    }
    ctx.drawImage(source, 0, 0);
    drawCaptionPlate(ctx, out, meta);
    out.toBlob((/** @type {any} */ blob) => {
        if (blob !== null) {
            onSave({ name: `blob-${meta.seed}-${meta.tick}.png`, blob });
        }
    }, 'image/png');
}

/**
 * @param {any} MediaRecorder the `MediaRecorder` constructor
 * @returns {string} `video/webm;codecs=vp9` when supported, else `video/webm`
 */
function chooseMimeType(MediaRecorder) {
    return MediaRecorder.isTypeSupported?.(VP9_MIME) ? VP9_MIME : WEBM_MIME;
}

/**
 * Starts one `MediaRecorder` session on `canvas.captureStream(60)` and wires its chunk and stop handlers.
 * @param {{MediaRecorder: any, makeBlob: (chunks: any[], type: string) => any,
 *   onSave: (file: {name: string, blob: any}) => void, onToast: (text: string) => void}} deps recorder callbacks
 * @param {{canvas: any, seed: number, tick: number}} target the canvas and world identity
 * @returns {any} the started `MediaRecorder`
 */
function startRecorder({ MediaRecorder, makeBlob, onSave, onToast }, { canvas, seed, tick }) {
    const mimeType = chooseMimeType(MediaRecorder);
    const stream = canvas.captureStream(CLIP_FPS);
    const chunks = /** @type {any[]} */ ([]);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: CLIP_BITS_PER_SECOND });
    recorder.ondataavailable = (/** @type {{data?: {size: number}}} */ e) => {
        if (e.data && e.data.size > 0) {
            chunks.push(e.data);
        }
    };
    recorder.onstop = () => {
        for (const track of stream.getTracks?.() ?? []) {
            track.stop();
        }
        const name = `blob-${seed}-${tick}.webm`;
        onSave({ name, blob: makeBlob(chunks, mimeType) });
        onToast(`Saved clip ${name}`);
    };
    recorder.start();
    onToast('Recording 15 s clip (press Shift+P to stop)');
    return recorder;
}

/**
 * @param {{MediaRecorder: any, setTimer: (ms: number, run: () => void) => unknown,
 *   clearTimer?: (handle: unknown) => void, onSave: (file: {name: string, blob: any}) => void,
 *   onToast: (text: string) => void, makeBlob?: (chunks: any[], type: string) => any}} deps recorder dependencies
 * @returns {{toggle: (target: {canvas: any, seed: number, tick: number}) => 'started' | 'stopped' | 'unsupported',
 *   isRecording: () => boolean}} the 15 s WebM clip recorder
 */
export function createClipRecorder({
    MediaRecorder,
    setTimer,
    clearTimer,
    onSave,
    onToast,
    makeBlob = (chunks, type) => new Blob(chunks, { type }),
}) {
    /** @type {any} */
    let active = null;
    /** @type {unknown} */
    let timer = null;

    const stop = () => {
        const rec = active;
        active = null;
        clearTimer?.(timer);
        timer = null;
        rec.stop();
    };

    return {
        isRecording: () => active !== null,
        toggle(target) {
            if (active !== null) {
                stop();
                return 'stopped';
            }
            if (!clipSupported(MediaRecorder) || typeof target.canvas?.captureStream !== 'function') {
                return 'unsupported';
            }
            active = startRecorder({ MediaRecorder, makeBlob, onSave, onToast }, target);
            timer = setTimer(CLIP_DURATION_MS, stop);
            return 'started';
        },
    };
}

/**
 * Coordinates the one-shot screenshot (`P`, taken right after `scene.draw`) and the 15 s clip recorder (`Shift+P`).
 * @param {{doc: {createElement: (tag: string) => any}, MediaRecorder?: any,
 *   setTimer: (ms: number, run: () => void) => unknown, clearTimer?: (handle: unknown) => void,
 *   getReady: () => Record<string, any> | null, getClient: () => Record<string, any> | null,
 *   getCanvas?: () => any, slots: import('./family-slots.js').FamilySlots,
 *   download: (file: {name: string, blob?: any, text?: string}) => void,
 *   toast: (text: string) => void}} deps capture dependencies
 * @returns {{screenshot: () => void, recordClip: () => void, afterDraw: (frame: {tick: number}) => void}} controller
 */
export function createCapture({
    doc,
    MediaRecorder,
    setTimer,
    clearTimer,
    getReady,
    getClient,
    getCanvas = () => null,
    slots,
    download,
    toast,
}) {
    let pending = false;
    const clip = createClipRecorder({ MediaRecorder, setTimer, clearTimer, onSave: download, onToast: toast });
    return {
        screenshot() {
            pending = true;
        },
        recordClip() {
            const client = getClient();
            clip.toggle({ canvas: getCanvas(), seed: getReady()?.seed ?? 0, tick: client?.latest?.tick ?? 0 });
        },
        afterDraw(frame) {
            if (!pending) {
                return;
            }
            pending = false;
            const source = getCanvas();
            if (source === null) {
                return;
            }
            const client = getClient();
            const meta = screenshotMeta({
                ready: getReady(),
                stats: client?.stats ?? null,
                tick: client?.latest?.tick ?? Math.floor(frame.tick),
                slots,
            });
            captureScreenshot({
                source,
                createCanvas: () => doc.createElement('canvas'),
                meta,
                onSave: (file) => (download(file), toast(`Saved screenshot ${file.name}`)),
            });
        },
    };
}
