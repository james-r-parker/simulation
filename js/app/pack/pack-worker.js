// The pack worker entry: binds `pack-loop.js` to the real worker scope. `self` carries the one `packInit` message and
// `Atomics.wait` blocks between requests. Everything with logic is in pack-loop.js and pack-host.js; this file only
// connects them, so it is covered by the browser spec. It never imports three or touches the DOM.

import { receive } from './pack-loop.js';

const scope = /** @type {DedicatedWorkerGlobalScope} */ (/** @type {unknown} */ (self));

scope.onmessage = (event) =>
    receive(event.data, {
        post: (message) => scope.postMessage(message),
        wait: (words, index, value, timeoutMs) => Atomics.wait(words, index, value, timeoutMs),
    });
