# E-TS-1g - the ladder with a `hunt-mid` rung at sprint 0.5 (training-stages Phase 6, T48, T49; record E197)

**Question.** Does a middle rung (`hunt-mid`: the hunt world with the prey's `sprintBoost` 0.5, gate `drill.prey-mid.edgeLow` 0.001)
carry the hunters from `hunt-weak` (0.2) towards `hunt` (1)?

**Prediction, written before the run (training-stages Phase 6, `E-TS-1g` row, commit cc89ff61).** Offsets 0, 128 and 192 repeat the
stages before `hunt-mid` to the digit; `hunt-mid` passes on at least 1 of the 2 offsets that reach it (0 and 192) within 60
generations; `prey-ahead` `winShareOverReference` above 0.119 on at least 1 run that reaches `hunt`; `kin-spared` under 0.001 on every run
that reaches `hunt`; offset 48 (new) passes `nursery`. Falsified when `hunt-mid` stalls on both offsets that reach it.

**Runs.** `E-TS-1g-o<k>`, `k` = 0, 128, 192, 48, flags as `E-TS-1f` (`--ticks 4000 --offer-from 100 --workers 8`), from
`feat/training-stages-hunt` at cc89ff61; gate logs in `o<k>-gates.jsonl`.

## Table

| Offset | `nursery`                                       | `hunt-contact` | `hunt-weak`              | `hunt-mid` (`prey-mid` `edgeLow`, bar 0.001)                                                      | Ended                    |
| ------ | ----------------------------------------------- | -------------- | ------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------ |
| 0      | passed at 20                                    | passed at 40   | passed at 100 (0.007)    | stall: -0.013 at 110 to 130, back to `hunt-weak` at 140 (-0.003), `hunt-mid` again, -0.013 to 165 | stall `hunt-mid` at 165  |
| 128    | passed at 30                                    | passed at 50   | stall (-0.015 to -0.007) | not reached                                                                                       | stall `hunt-weak` at 110 |
| 192    | passed at 30, regressed 50                      | passed at 70   | passed at 90 (0.007)     | stall: -0.010, -0.010, -0.015; back to `hunt-weak` at 130 and 150 (-0.010), then -0.010           | stall `hunt-mid` at 160  |
| 48     | **stall**: 0.191, 0.223, 0.191, 0.191 (bar 0.3) | not reached    | not reached              | not reached                                                                                       | stall `nursery` at 40    |

## Verdict

- Offsets 0, 128 and 192 repeat `E-TS-1f` through `hunt-weak` to the digit: the determinism clause holds.
- `hunt-mid` stalls on both offsets that reach it (0 and 192): the prediction is **falsified** by the rule written with it, and
  `prey-mid` reads -0.013 and -0.010 to -0.015, the readings of a hunter that never wins. Both runs cycled back to `hunt-weak` (once on
  offset 0, twice on 192) and the rung did not pass.
- `hunt` is never reached, so its clauses (`winShareOverReference`, `kin-spared`) are not read.
- Offset 48 stalls `nursery` on the first checkpoint (`food-behind` 0.191, no pass at any checkpoint): with offsets 16 and 64 that is 3 of 6
  distinct offsets run (0, 16, 48, 64, 128, 192) where the nursery stalls, 2 of them fresh ones that never passed at generation 10
  (offset 48) or passed at 10 and lost it (16, 64).

## Why the rung failed, from the numbers already in hand

The graded-sprint table of `E-TS-1f` predicted it: the `hunt-weak` passer (offset 0 generation 99, cell 7) wins 6 of 64 at sprint 0.2 and
**1** at 0.5, then 5 at 0.4 and 6 at 0.3, so a step of 0.3 in sprint asks for a six-fold fall in wins at once. The elite that passes the
0.2 rung wins about as often at 0.3 (6) and 0.4 (5) as at 0.2 (6), and 1 at 0.5: a rung at sprint 0.3 is within what the passer already
does. The `hunt-mid` rung was set at the first value of the table where the passer's wins collapse; the step is too wide, not the
direction. (A rung is the stage and the drill together, so the world also trains at 0.5 where the same elites have no signal.)

## Next

`E-TS-1h` (training-stages T52, T53): the same rung at sprint 0.3, the step the passer's own curve supports, with the prediction in the
Phase 6 table. The nursery stall (3 of 6) stays an open record: the numbers-first read of T37 and T38 is not done.
