// The worker entry: binds the sim host to the real worker scope. `self` carries messages, `performance.now` is the
// clock, a `MessageChannel` posts a slice at once when ticks are owed and `setTimeout` waits for the next tick.
// Everything with logic is in sim-host.js; this file only connects it, so it is covered by the browser spec.

import { getPolicy, LIVE_POLICY } from '../evo/policies/index.js';
import { CHAMPIONS_POLICY, CHAMPIONS_V1_PATH, createChampionGate, fetchChampionFiles } from './champion-fetch.js';
import { createSimHost } from './sim-host.js';

const scope = /** @type {DedicatedWorkerGlobalScope} */ (/** @type {unknown} */ (self));
const channel = new MessageChannel();
/** @type {(() => void) | null} */
let pending = null;

channel.port1.onmessage = () => {
    const run = pending;
    pending = null;
    if (run !== null) {
        run();
    }
};

const host = createSimHost({
    post: (message, transfer) => scope.postMessage(message, transfer ?? []),
    now: () => performance.now(),
    schedule(delayMs, run) {
        if (delayMs <= 0) {
            pending = run;
            channel.port2.postMessage(0);
        } else {
            setTimeout(run, delayMs);
        }
    },
    createPolicy(options) {
        const name = options.policyName ?? LIVE_POLICY;
        return getPolicy(name).create(name === CHAMPIONS_POLICY ? { ...options, champions: gate.files() } : options);
    },
});

// `?policy=champions-v1` seeds from the published champions: the gate fetches them before the host sees `init`.
const championsBase = new URL(CHAMPIONS_V1_PATH, scope.location.href).href;
const gate = createChampionGate({
    receive: (message) => host.receive(message),
    load: () => fetchChampionFiles((url) => fetch(url), championsBase),
});

scope.onmessage = (event) => gate.receive(event.data);
