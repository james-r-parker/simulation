### 2026-10-17 - Measuring the v6 app in a browser

- A Chromium trace with categories `v8` and `disabled-by-default-v8.gc` names each whole GC pause on the `CrRendererMain`
  thread `MinorGC` (a scavenge) or `MajorGC` (a mark-compact). `V8.GCScavenger`, `V8.GCCompactor` and every `V8.GC_*` phase
  event sit inside them, so `browser.gc_pause_ms` sums only `MinorGC` and `MajorGC` (`GC_PAUSE_EVENTS` in
  `scripts/lib/perf-v6.mjs`). GC on worker threads is on other threads and is not counted. `browser.startTracing(page, ...)`
  returns the trace as a Buffer of JSON with a `traceEvents` array.
- Headless Chromium reports `EXT_disjoint_timer_query_webgl2` under SwiftShader, but its results can be discarded as
  disjoint and the frame rate there (about 9 Hz at 1280x720 with 500 agents) says nothing about a GPU: the script refuses a
  software renderer without `--allow-fallback` and a display under 120 Hz without `--allow-low-refresh`.
- `PerformanceObserver` with `type: 'longtask'` gives each task's `startTime` on the page's `performance.now()` clock, so
  tasks in the first 5 s are dropped by comparing it with `WARMUP_MS`.
- The worker sends `stats` only while the sim runs, so a paused app has no new stats; the top bar reads the tick and
  population from the newest snapshot, which each `step` posts.
