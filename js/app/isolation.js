// Whether the page is cross-origin isolated, so `SharedArrayBuffer` exists for the snapshot ring and the pack worker
// (docs/designs/pack-worker.md, "Isolation"). Pure over the scope it is given, so tests pass fakes.

/** The message shown over the canvas when isolation is missing. */
export const ISOLATION_MISSING_TEXT =
    'This page is not cross-origin isolated (the Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers are missing), so the shared memory Blob Evolution needs is unavailable.';

/**
 * @typedef {object} IsolationVerdict
 * @property {boolean} ok whether the app can start its workers
 * @property {string | null} reason why not, null when ok: `not-isolated` or `no-shared-array-buffer`
 * @property {boolean} crossOriginIsolated the scope's `crossOriginIsolated` flag
 * @property {boolean} sharedArrayBuffer whether the scope has a `SharedArrayBuffer` constructor
 */

/**
 * @param {{crossOriginIsolated?: boolean, SharedArrayBuffer?: unknown}} scope `globalThis`, or a fake of it
 * @returns {IsolationVerdict} whether the page is isolated and has shared memory, and the facts behind it
 */
export function isolationVerdict(scope) {
    const crossOriginIsolated = scope.crossOriginIsolated === true;
    const sharedArrayBuffer = typeof scope.SharedArrayBuffer === 'function';
    /** @type {string | null} */
    let reason = null;
    if (!crossOriginIsolated) {
        reason = 'not-isolated';
    } else if (!sharedArrayBuffer) {
        reason = 'no-shared-array-buffer';
    }
    return { ok: reason === null, reason, crossOriginIsolated, sharedArrayBuffer };
}

/**
 * Checks isolation before the sim worker starts; on failure logs `IsolationMissing` and shows the message.
 * @param {{scope: {crossOriginIsolated?: boolean, SharedArrayBuffer?: unknown}, container: any, log: (level: 'error', event: string, fields: Record<string, any>) => void, show: (container: any, text: string) => unknown}} env
 *   the scope to read, the canvas container, the app log and the message shower
 * @returns {boolean} whether the page is isolated and the app may start its workers
 */
export function requireIsolation({ scope, container, log, show }) {
    const { ok, reason, crossOriginIsolated, sharedArrayBuffer } = isolationVerdict(scope);
    if (!ok) {
        log('error', 'IsolationMissing', { reason, crossOriginIsolated, sharedArrayBuffer });
        show(container, ISOLATION_MISSING_TEXT);
    }
    return ok;
}
