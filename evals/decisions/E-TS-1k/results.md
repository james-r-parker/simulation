# E-TS-1k - the kept passer on eight fresh offsets (training-stages Phase 6, T59, T60; record E202)

**Question.** With the kept passer (T59), is a passed rung still sent back by the retention review, and do more offsets reach
`hunt-mid` and `hunt`?

**Prediction, written before the run.** 0 `TrainReview` events on every run (a kept passer repeats its reading on the same gate seed);
at least 2 of the 8 fresh offsets pass `hunt-mid`; `prey-ahead` `winShareOverReference` above 0.12 (the best reading so far) on at
least 1 run that reaches `hunt`. Falsified when a run has a review, fewer than 2 offsets pass `hunt-mid`, or no `hunt` reading exceeds 0.12.

**Runs.** `E-TS-1k-o<k>` for offsets 8, 24, 40, 56, 72, 88, 104 and 120: `npm run train -- --curriculum evals/train-ladder.json
--until habitat --generations 380 --ticks 4000 --offer-from 100 --workers 3 --seed-offset <k> --out .sim/train/ladder-1k-o<k>`.

**Result (E202).** The prediction is falsified on two of its three clauses.

| Clause                                                    | Read                                                            | Held |
| --------------------------------------------------------- | --------------------------------------------------------------- | ---- |
| 0 `TrainReview` events on every run                       | 0 on all 8 (by construction: a kept passer repeats its reading) | yes  |
| At least 2 of 8 offsets pass `hunt-mid`                   | 1 (offset 8); offset 88 stalled at `hunt-mid` (-0.0134)         | no   |
| `prey-ahead` `winShareOverReference` above 0.12 at `hunt` | max 0.0569 over o8's 20 `hunt` checkpoints (generation 120)     | no   |

Stalls: o24, o72, o104 and o120 at `hunt-weak`; o40 and o56 at `nursery` (`food-behind` 0.223); o8 at `hunt` after 200
`hunt` generations (`prey-crossing` -0.015, `kin-spared` -0.015). All runs exit 3. The kept passer stops the cycling but does not
raise the reading: the cause is the chase itself (T62).
