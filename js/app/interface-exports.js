// The two downloads: the archive (which the worker sends when asked) and the debug bundle.

import { buildDebugBundle } from './debug-bundle.js';

/**
 * @param {() => Record<string, any> | null} getFailed the bundle the supervisor kept after a failure
 * @returns {() => Record<string, any> | null} gives the failed run's bundle the first time it is asked for it, then null
 */
export function createFailedBundleTaker(getFailed) {
    /** @type {Record<string, any> | null} */
    let taken = null;
    return () => {
        const failed = getFailed();
        if (failed === null || failed === taken) {
            return null;
        }
        taken = failed;
        return failed;
    };
}

/**
 * Downloads the debug bundle: the failed run's the first time after a restart, else the current run's.
 * @param {{getReady: () => Record<string, any> | null, getClient: () => Record<string, any> | null,
 *   overrides: Record<string, number>, download: (file: {name: string, text: string}) => void,
 *   toast: (text: string) => void, takeFailed: () => Record<string, any> | null}} deps the run and the outputs
 * @returns {void}
 */
export function exportBundle({ getReady, getClient, overrides, download, toast, takeFailed }) {
    const ready = getReady();
    const bundle =
        takeFailed() ??
        (ready === null ? null : buildDebugBundle({ ready, overrides, tick: getClient()?.latest?.tick ?? 0 }));
    if (bundle === null) {
        toast('There is no run to describe yet');
        return;
    }
    download({ name: `blob-debug-${bundle.seed}-${bundle.tick}.json`, text: JSON.stringify(bundle, null, 2) });
}
