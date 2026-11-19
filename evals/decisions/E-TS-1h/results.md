# E-TS-1h - `hunt-mid` at sprint 0.3 (training-stages Phase 6, T52, T53; record E198)

**Question.** Is the step from `hunt-weak` (sprint 0.2) to `hunt-mid` at 0.3, the step the `hunt-weak` passer's own curve supports (6 of 64
wins at 0.2 and 0.3), one the hunters can take?

**Prediction, written before the run (training-stages Phase 6, `E-TS-1h` row, commit 3bf96152).** Offsets 0 and 192 repeat the stages
through `hunt-weak` to the digit (both pass); `hunt-mid` passes on at least 1 of those 2 within 60 generations and no pass is followed
by a return to `hunt-weak`; offsets 80 and 144 are fresh and `nursery` passes on at least 1 of the 2. Falsified when `hunt-mid` stalls
on both offsets 0 and 192.

**Runs.** `E-TS-1h-o<k>`, `k` = 0, 192, 80, 144, flags as `E-TS-1f`, from `feat/training-stages-hunt` at 3bf96152; gate logs in
`o<k>-gates.jsonl`.

## Table

| Offset | `nursery`                                         | `hunt-contact`       | `hunt-weak` (`prey-weak`)   | `hunt-mid` (`prey-mid` `edgeLow`, bar 0.001)                                                                   | `hunt`                                                                                                                                        | Ended                   |
| ------ | ------------------------------------------------- | -------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 0      | passed at 20; dipped at 160 (`food-behind` 0.084) | passed at 40         | passed at 100 (0.007)       | **stall**: -0.010 at every checkpoint from 110 to 167                                                          | not reached                                                                                                                                   | stall `hunt-mid` at 167 |
| 192    | passed at 30, regressed at 50, passed again       | passed at 70         | passed at 90 (0.007)        | **stall**: -0.007 to -0.015; back to `hunt-weak` once (130)                                                    | not reached                                                                                                                                   | stall `hunt-mid` at 155 |
| 80     | **stall**: 0.272, 0.272, 0.223, 0.239 (bar 0.3)   | not reached          | not reached                 | not reached                                                                                                    | not reached                                                                                                                                   | stall `nursery` at 40   |
| 144    | passed at 20 (0.544)                              | passed at 40 (0.828) | passed at 60 (0.082, 0.134) | **passed at 100** (0.076 at 70, 0.040 at 90 and 100; a `nursery` dip at 80: `food-ahead` -0.286, passed again) | stall: `prey-ahead` `winShareOverReference` 0.087 (110 to 150), 0.0098 (160); `prey-crossing` **0.007 to 0.012, passes**; `kin-spared` -0.015 | stall `hunt` at 160     |

## Verdict

- Offsets 0 and 192 repeat the earlier runs through `hunt-weak` to the digit: determinism holds.
- `hunt-mid` stalls on both offsets 0 and 192 (-0.010; -0.007 to -0.015): the prediction is **falsified** by its own rule.
- No pass of `hunt-mid` returns to `hunt-weak` on the run that passes it (offset 144; its one dip was to `nursery`).
- Fresh offsets: 80 stalls `nursery`, 144 passes it: 1 of 2, the clause holds.
- What the fresh offset adds: offset 144 passed every rung through `hunt-mid` and reached `hunt` for the first time since the offsets of E-TS-1d,
  with `prey-crossing` passing (0.007 to 0.012) and `prey-ahead` `winShareOverReference` at 0.087; `kin-spared` still -0.015 and `hunt` stalled.
  Its margins at the earlier rungs are 10 times those of offsets 0 and 192 (`hunt-weak` 0.134 against 0.007). The rung is not what stops
  offsets 0 and 192: they pass `hunt-weak` by a margin of 0.007 and have nothing left for the next rung. The ladder's yield varies with the
  offset (1 of the 3 offsets that can reach `hunt-mid` passes it), not with the rung's step.
- The nursery food-behind stall: 80 is the fourth offset (16, 48, 64, 80) of 8 distinct offsets run (0, 16, 48, 64, 80, 128, 144, 192).

## The champions of offset 144

`archive-159` was exported to `.sim/champions/keep/ets-1h-o144` and its `champions-v1` against `live` at 64 seeds runs as
`CHAMP-v1-ets1h-64` (live arm reused from `live-64.json`).

| Slot                                                        | Run                 | Result  |
| ----------------------------------------------------------- | ------------------- | ------- |
| 64 seeds (offset 64), `--keep-rule`, `champions-v1` of o144 | `CHAMP-v1-ets1h-64` | pending |

## What this run does and does not show

It shows that the rung at 0.3 is passable (one offset) and that the yield differs by offset; four offsets and one archive each are leads.
No eval ran for the ladder, so there is no `eval:compare` verdict.
