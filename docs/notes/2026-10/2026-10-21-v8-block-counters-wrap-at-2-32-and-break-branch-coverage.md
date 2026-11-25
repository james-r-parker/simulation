### 2026-10-21 - V8 block counters wrap at 2^32 and break branch coverage

`vitest --coverage` (v8) merges block counts as unsigned 32-bit numbers. `circleHit` in `js/sim/ray-march.js` runs about
4.5 billion times in the whole suite (the slow evo tests alone are 3.6 billion), so its call count wrapped past 2^32
and the implicit "else" of its early-return `if` (call count minus the hot branch) came out negative, which
`json-summary` counts as uncovered: `js/sim` branches read 99.87% against a baseline of 100% although every branch ran.
A branch-free `circleHit` (a 0/1 `valid` multiplier) avoided the wrap but took a square root on every miss:
`node scripts/bench-compare.mjs` put `bench.phase_ms.sense@500` at +8.8% and the 7680 x 4320 row at +17.6%, so it was
reverted. Instead (user, 2026-10-21) `scripts/check.sh` runs the test gate in two passes: everything with coverage
except `STATISTICAL_TESTS` in `vitest.config.js` (`deliberate-controllers`, `survivable-world` and `anti-exploit`
slow tests), then those three without coverage. If a branch in a hot function reads as uncovered with negative
counts in `coverage-final.json`, suspect the same wrap before adding tests.
