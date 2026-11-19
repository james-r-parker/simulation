# E-TS-1i - a denser nursery world (training-stages Phase 6, T55, T56; record E199; the world change is reverted)

**Question.** The nursery `food-behind` gate stalls on 4 of 8 offsets (16, 48, 64, 80). Does a nursery with 1.8 times the food per area
(1800 x 1200, `foodPatchRadius` 280, `hashCellSize` 560, as the hunt worlds) let the stalled offsets pass?

**Prediction, written before the run (training-stages Phase 6, `E-TS-1i` row, commit 8966ed75).** `nursery` passes on at least 2 of the 3
stalled offsets (80, 48, 16) within 40 generations and on offset 144, the control. Falsified when at most 1 of the 3 passes.

**Runs.** `E-TS-1i-o<k>`, `k` = 80, 48, 16, 144, flags as `E-TS-1f`, from `feat/training-stages-hunt` at 8966ed75; gate logs in
`o<k>-gates.jsonl`.

## Table

| Offset | `nursery`                                                                                                                      | Later stages                                                                                                                                                | Ended                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 80     | **passed at 30** (0.144 at 10, 0.566 at 20 and 30); stalled in E-TS-1h at 0.22 to 0.27                                         | `hunt-contact` 50 (0.739), `hunt-weak` 70 (0.046), `hunt-mid` 90 (0.034); `hunt`: `prey-ahead` 0.000, `prey-crossing` -0.007, `kin-spared` -0.015           | stall `hunt` at 150      |
| 48     | **worse**: `food-behind` -0.115 at 10, -0.101 at 20, 0.255 at 30, -0.115 at 40 (and `food-ahead` 0.110 and 0.186 at 10 and 40) | not reached                                                                                                                                                 | stall `nursery` at 40    |
| 16     | **worse**: `food-behind` -0.060 at 10 to 30, -0.046 at 40 (it was 0.523 at generation 10 in E-TS-1d)                           | not reached                                                                                                                                                 | stall `nursery` at 40    |
| 144    | passed at 30 (0.483; control; 0.544 before)                                                                                    | `hunt-contact` 50 (0.128), `hunt-weak` passed at 60 (0.259), **regressed to `nursery` at 70** (`food-ahead` -0.151), then `hunt-weak` -0.013 from 80 to 115 | stall `hunt-weak` at 115 |

## Verdict

- The prediction is **falsified**: 1 of the 3 stalled offsets passes (80), not 2.
- The control regressed: offset 144 passes `nursery` but loses it at 70 (`food-ahead` -0.151) and then stalls at `hunt-weak` (-0.013),
  where in E-TS-1h it passed every rung through `hunt-mid`.
- Offsets 48 and 16 are worse than before (`food-behind` -0.115 and -0.046 against 0.19 and 0.2 to 0.5): the denser world made the
  forager's `food-behind` reading worse on two of the three, so more food per area is not the lever and may cost the forager its turn
  (more food within reach ahead, fewer reasons to look behind).
- The world change (T55) is **reverted** (the record stays); the nursery is back to 2400 x 1600.
- What survives: offset 80, which never passed before, reaches `hunt` with all the earlier rungs passed (`hunt-weak` 0.046, `hunt-mid` 0.034),
  `prey-ahead` 0.000 and `kin-spared` -0.015. One archive, one offset: a lead, not a result.

## What this run does and does not show

It shows a denser nursery does not fix the stall and may worsen it; four offsets and one archive each are leads. The T54 turn read (the
`TURN` output share and latency of the generation-10 and generation-20 foragers) stays the next numbers-first step for the nursery. No
eval ran, so there is no `eval:compare` verdict.
