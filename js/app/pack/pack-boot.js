// The browser side of the pack worker: the real Worker, timers and clock behind the client, a hidden page stopping the
// worker, and starting it on a world once its layers are built. A browser shell, like the sim worker's entry: it needs a
// real Worker and a document, so test/browser/app.spec.js covers it; everything with logic is in pack-client.js.

import { appLog } from '../app-log.js';
import { causeNamesOf } from '../renderer/effects-player.js';
import { createPackClient, createPackWorld } from './pack-client.js';

/**
 * @param {{hidden: boolean, addEventListener: (type: string, listener: () => void) => void}} doc the document
 * @returns {ReturnType<typeof createPackClient>} a client over the real pack worker; a hidden page stops the worker and
 *   a visible one starts it again
 */
export function bootPack(doc) {
    const client = createPackClient({
        createWorker: () =>
            /** @type {any} */ (new Worker(new URL('./pack-worker.js', import.meta.url), { type: 'module' })),
        now: () => performance.now(),
        setTimer: (ms, run) => setTimeout(run, ms),
        clearTimer: (handle) => clearTimeout(/** @type {any} */ (handle)),
        log: appLog,
    });
    doc.addEventListener('visibilitychange', () => (doc.hidden ? client.pause() : client.resume()));
    return client;
}

/**
 * Starts the pack worker on the world the layers were just built for.
 * @param {ReturnType<typeof createPackClient>} pack the client
 * @param {{ready: Record<string, any> | null, client: Record<string, any> | null,
 *   refs: import('../app-layers.js').LayerRefs}} world the newest `ready`, the sim client holding the ring and the
 *   layer references holding the effect stores
 * @returns {void}
 */
export function startPack(pack, { ready, client, refs }) {
    pack.start(
        createPackWorld({
            ready: /** @type {Record<string, any>} */ (ready),
            ring: /** @type {Record<string, any>} */ (client).ring,
            storesMemory: /** @type {any} */ (refs.stores).memory,
            causeNames: causeNamesOf(/** @type {Record<string, any>} */ (ready).layout.deathCauses),
        }),
    );
}
