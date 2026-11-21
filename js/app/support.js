// Whether this browser can run the app: module workers and WebGL2 are required. The page shows the reason instead of a
// blank canvas. Also the one guarded read of `localStorage`.

/**
 * @param {() => {getContext: (kind: string) => unknown}} createCanvas a canvas factory
 * @returns {boolean} whether a WebGL2 context can be made
 */
function hasWebGl2(createCanvas) {
    try {
        return Boolean(createCanvas().getContext('webgl2'));
    } catch {
        return false;
    }
}

/**
 * @param {{Worker?: unknown, createCanvas: () => {getContext: (kind: string) => unknown}}} env the browser's pieces: its
 *   `Worker` constructor (undefined when missing) and a canvas factory
 * @returns {string | null} why the app cannot run, null when it can
 */
export function unsupportedReason({ Worker, createCanvas }) {
    if (typeof Worker !== 'function') {
        return 'This browser has no Web Workers, which Blob Evolution needs. Use a current desktop Chrome, Edge or Firefox.';
    }
    return hasWebGl2(createCanvas)
        ? null
        : 'This browser or its graphics driver offers no WebGL2, which Blob Evolution needs. Use a current desktop Chrome, Edge or Firefox.';
}

/**
 * @param {() => Storage} [read] reads `localStorage`
 * @returns {Storage | null} the storage, or null where reading it throws (blocked site data)
 */
export function safeStorage(read = () => localStorage) {
    try {
        return read();
    } catch {
        return null;
    }
}
