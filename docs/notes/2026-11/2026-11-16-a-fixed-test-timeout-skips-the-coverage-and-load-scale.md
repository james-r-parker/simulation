### 2026-11-16 - A fixed test timeout skips the coverage and load scale

`vitest.config.js` stretches the default timeout under coverage (`COVERAGE_TIMEOUT_FACTOR`) and on a busy machine
(`busyScale`), but an explicit number passed to `it` gets neither unless it goes through `scaleTimeout`
(`scripts/lib/test-timeout.mjs`). `test/edge-probe.slow.test.js` passed `120000` raw: its one world takes 37 s quiet and
144 s to 174 s in the coverage pass at load 33 to 64 (V8 coverage costs about 3.7x even though half the step is the
uninstrumented WASM kernels), so it failed every loaded `scripts/check.sh`. Shrinking the world does not help: the edge
rows start at burn-in (10000 ticks), and a third-size world still took 20 s against 42 s for the default (fixed flora,
herd and kernel costs) and lost its hunters. Twenty more raw timeouts in eight files had the same gap; a
`no-restricted-syntax` rule for `test/**/*.test.js` in `eslint.config.js` now fails a bare number as the timeout of
`it`, `test` or `describe` (`test/timeout-lint.test.js`).
