### 2026-10-23 - T15d defaults and golden re-pin (fitness-and-selection T15d)

- **Package:** `predatorRescueMin` 3, `predatorRescueInterval` 450, `predatorKillEnergy` 150, `alarmThreshold` 0.65,
  `huntCallThreshold` 0.65, `huntSizeRatio` 0.8, `biteArc` 1.571, `huntCallCost` 10, and the predator specialisation's
  `passiveLossMultiplier` 0.6, `splitMinEnergyMultiplier` 0.6 and `biteMultiplier` 12 (was 4). `alarmCost` 0.5 and
  `smokeCost` 20 are unchanged.
- **Hashes, old to new** (`test/sim/golden.json` and the busy effect constants in `test/worker/sim-host.slow.test.js`):
  `cases` default `75c8dc9a60512678` to `5d6bdc130c1bef61`; `cases` busy `b690703c6e579c89` to `0cbaa2a6b8ddf9b3`;
  `shortCases` default `990e90a40089671e` to `897120be022ee74d`; `shortCases` busy `46f51e32b0128c7e` to `8616e7e60b016f2b`.
  The busy effect stream (`BUSY_EFFECT_HASH`, `BUSY_EFFECT_RECORDS`) moves from `234c3f686e2b6a65` and 6329 records to
  `680983d656117e86` and 1828 records, with no dropped records. Both runs agree: `runGolden` and `driveGolden` print the
  same world hashes, and the effect stream is the same whatever the slicing.
- **One commit:** the defaults and the re-pin share a commit, because the pre-commit gate runs the golden tests, so a
  defaults-only commit cannot pass it.
- **Size-rule fixtures:** bite-rule, feeding, predator-prey and ray-march state the pre-T15d `huntSizeRatio` 1.01 they
  assume. Each keeps its assertions; bite-rule and ray-march gain a case at 0.8.
- **Bench:** `BENCH_CONFIG` restates `biteArc` Math.PI / 4 and the predator `biteMultiplier` 4, so the frozen bench
  world does not move from the defaults change.
- **Evo slow tests (nine failures, all premise):** all nine pass on `e6a1c73`. They are defined on the old combat world
  (a controller duel, a legacy-fitness exploit bound), which the changed defaults altered. `test/evo/helpers/pre-t15d.js`
  pins `huntSizeRatio` 1.01, `biteArc` Math.PI / 4, `huntCallCost` 0.5 and the predator `biteMultiplier` 4 after
  `FEATURES_OFF`, and `predator-world.js` and `anti-exploit.slow.test.js` use it; no assertion changed. Unpinning one key at
  a time (the outcomes move with the seed, so read them as which key reaches the test, not a clean split): `huntSizeRatio`
  reaches D4 and D7 and the survivable-prey duel (stronger hunters take prey the duel assumes survive); `huntCallCost`
  reaches the survivable duel and FIT-8 with sexes on; `biteMultiplier` reaches FIT-5 and FIT-8 with sexes off (both are
  `it.fails`, and with 12 the exploit no longer beats the bound, so the expected failure flipped to a pass); `biteArc`
  reaches none. The live-world guard is the `fitnessV1` arms, which expect no failure and pass.
- **Coverage:** the `js/worker` ratchet fell (lines 99.83% to 99.66%) because the `forgetOldLeaders` delete in
  `lineage-board.js` was only reached by a leader change in a slow host test, and the new world has none there. A unit test
  in `test/worker/lineage-board.test.js` now covers it directly; the baseline is untouched.
