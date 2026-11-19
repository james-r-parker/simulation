# E-TS-1j - does `hunt` need longer than 60 generations? (training-stages Phase 6, T57, T58; record E200)

**Question.** The best `prey-ahead` readings so far (0.119, 0.087) came inside the 60 generations `hunt` was allowed. With `hunt`
`maxGenerations` 200, the bar unchanged, does `winShareOverReference` keep rising?

**Prediction, written before the run (training-stages Phase 6, `E-TS-1j` row, commit f92623e1).** `prey-ahead` `winShareOverReference`
rises above 0.2 on at least 1 of the 2 runs by generation 200; falsified when neither gets above 0.2 (then `hunt` needs a new lever,
not more time).

**Runs.** Resumed, not retrained (archives carry the gate state): `E-TS-1j-o144` from the `E-TS-1h` offset 144 archive at generation 100
under `evals/train-ladder.json`, `E-TS-1j-o0` from the `E-TS-1f` offset 0 archive at generation 100 under `evals/train-ladder-no-mid.json`,
`--until habitat --generations 380 --ticks 4000 --offer-from 100 --workers 12`; gate logs in `o<k>-gates.jsonl`.

## Readings at every `hunt` checkpoint (`winShareOverReference`; bar 0.5)

| Run  | Generations in `hunt`                                                     | Maximum over all checkpoints (generation)       | Last         | `prey-crossing` `edgeLow`       | `kin-spared` | What ended it                                                                                                                    |
| ---- | ------------------------------------------------------------------------- | ----------------------------------------------- | ------------ | ------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| o144 | 100 to 270 (170)                                                          | **0.0869** (110 to 150, the same value 5 times) | 0.0569 (270) | 0.0069, 0.012, -0.0068, -0.0026 | -0.0148      | reviews sent it to `nursery` at 220 and 240 (`food-behind` 0.207 in the review, 5 generations each); stalled in `nursery` at 280 |
| o0   | 100 to 315 (215, 15 of them in three 5-generation reviews in `hunt-weak`) | **0.1195** (150 to 230, the same value 9 times) | 0.0569 (315) | -0.0148 at every checkpoint     | -0.0148      | reviews sent it to `hunt-weak` at 250, 270 and 290; stalled at `hunt` at 315                                                     |

The reading is flat for 40 to 80 generations at a time (one elite holds the cell) and then drops to 0.0569 or 0.0098 when the champion
pick changes; it never rises past its first maximum. The `winShareLow` that sits under the maxima is 0.0122 (o144) and 0.0168 (o0).

## Verdict

- **Falsified**: the maximum is 0.087 (o144) and 0.120 (o0), against 0.2 predicted: more generations did not raise the reading. The
  maxima are the readings of the 60-generation runs, reached again and then lost.
- The retention review (`REVIEW_GENERATIONS` 5, `REVIEW_MAX` 3, `js/evo/stage-gate.js`) pulled both runs back into earlier
  stages: o144 never came back from `nursery` (the old `food-behind` stall, 4 of 8 offsets), o0 spent 15 of its 215 generations in
  `hunt-weak`.
- `hunt` needs a new lever, not more time (see E201).
