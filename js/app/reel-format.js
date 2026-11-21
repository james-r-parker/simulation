// What the reel's clips are made of: the clip window, the encoder settings and the file name.

/** Ms of a clip before the moment, and after it. */
export const BEFORE_MS = 6000;
export const AFTER_MS = 4000;
/** Preferred and fallback WebM MIME types, and the video bitrate (4 Mbit/s: a clip is for watching behaviour). */
export const VP9_MIME = 'video/webm;codecs=vp9';
export const WEBM_MIME = 'video/webm';
export const BITS_PER_SECOND = 4_000_000;

/**
 * @param {string} scene a scene id
 * @param {number} tick the tick of the moment
 * @returns {string} the clip's file name
 */
export function clipName(scene, tick) {
    return `${scene}-${tick}.webm`;
}
