### 2026-10-21 - Vitest 5 bench mode is a test-context API

Vitest 5.0.3 has no `bench` export to call inside `describe`: a benchmark is `bench(name, options, fn)` taken from the
test context (`test('x', async ({ bench }) => { await bench('name', fn).run() })`) in a `*.bench.js` file that
`vitest bench --run` runs (`benchmark.include` in `vitest.config.js`). There is no `--outputJson`; `writeResult` in the
bench options writes `{ latency, throughput, period, totalTime }` (each with `mean` and `rme`) to a path inside the
project root, which `scripts/bench-micro.mjs` reads back. The import of a bench file's modules is most of its run time
(about 30 s for the eight files; the benches themselves take about 20 s).
