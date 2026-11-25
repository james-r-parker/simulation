### 2026-11-17 - Browser smoke waits for the first app draw

The smoke's old `requestAnimationFrame` counter started as soon as the canvas element attached, before the renderer's
first completed draw, and counted browser callbacks rather than frames recorded by the app. `js/app/main.js` now exposes
`globalThis.__blob.frames` and `.tick`; the smoke waits for a completed draw, clears startup samples, then keeps the
30-draw minimum over the same 5-second window while checking that the worker tick advances. Hosted CI recorded only
25 frame intervals in that window: the performance interval ring intentionally omits intervals over 250 ms and can
therefore undercount completed draw callbacks. The smoke reads a separate post-reset draw count; deterministic tests
ensure ignored intervals still count completed draws and startup counts cannot pass without new draws. On local
Chromium with SwiftShader, the full browser suite passed in about 105 seconds.
