### 2026-11-14 - `resolveTimestampsAsync` sums every pass since the last resolve (crisp-renderer)

`renderer.resolveTimestampsAsync('render')` returns the summed GPU milliseconds of the render passes of the newest frame
since the previous resolve (three 0.187, `framesDuration[frames[frames.length - 1]]` in both the WebGPU and the WebGL
pool), the last value while a resolve is pending, and `undefined` without `trackTimestamp` or the `timestamp-query`
feature. `gpu-time.js` keeps one resolve in flight and records each result as one frame. (Corrected 2026-11-18: it
first divided that one frame by every frame drawn since the previous resolve, so `browser.gpu_frame_p95_ms` read about
0.1 ms on WebGPU at 3840x2160.)
