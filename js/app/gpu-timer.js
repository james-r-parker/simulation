// GPU frame time through EXT_disjoint_timer_query_webgl2: one query around each frame's draw, results collected a few
// frames later without stalling. Absent extension: no timer, and the app reports no GPU time.

import { createFrameRing } from './frame-stats.js';

/** Queries in flight at once; a frame is skipped when all are busy. */
export const MAX_IN_FLIGHT = 8;

/**
 * @param {{getExtension: (name: string) => any}} gl a WebGL2 context
 * @returns {boolean} whether the timer query extension exists
 */
export function hasGpuTimer(gl) {
    return gl.getExtension('EXT_disjoint_timer_query_webgl2') !== null;
}

/**
 * @param {any} gl a WebGL2 context
 * @param {number} [capacity] results the ring keeps
 * @returns {{begin: () => void, end: () => void, poll: () => void, samples: () => Float64Array, reset: () => void} | null} the timer, null
 *   when the extension is missing. `begin` and `end` bracket a frame's draw, `poll` collects finished queries (call it
 *   once a frame) and `samples` is the finished frame times in ms and `reset` forgets them.
 */
export function createGpuTimer(gl, capacity) {
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (ext === null) {
        return null;
    }
    let ring = createFrameRing(capacity);
    /** @type {any[]} */
    const pending = [];
    /** @type {any} */
    let open = null;
    return {
        begin() {
            if (open === null && pending.length < MAX_IN_FLIGHT) {
                open = gl.createQuery();
                gl.beginQuery(ext.TIME_ELAPSED_EXT, open);
            }
        },
        end() {
            if (open !== null) {
                gl.endQuery(ext.TIME_ELAPSED_EXT);
                pending.push(open);
                open = null;
            }
        },
        poll() {
            const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
            while (pending.length > 0 && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
                const query = pending.shift();
                if (!disjoint) {
                    ring.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
                }
                gl.deleteQuery(query);
            }
        },
        samples: () => ring.values(),
        reset() {
            ring = createFrameRing(capacity);
        },
    };
}
