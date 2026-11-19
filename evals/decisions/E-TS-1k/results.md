# E-TS-1k - the kept passer on eight fresh offsets (training-stages Phase 6, T59, T60; record E202)

**Question.** With the kept passer (T59), is a passed rung still sent back by the retention review, and do more offsets reach
`hunt-mid` and `hunt`?

**Prediction, written before the run.** 0 `TrainReview` events on every run (a kept passer repeats its reading on the same gate seed);
at least 2 of the 8 fresh offsets pass `hunt-mid`; `prey-ahead` `winShareOverReference` above 0.12 (the best reading so far) on at
least 1 run that reaches `hunt`. Falsified when a run has a review, fewer than 2 offsets pass `hunt-mid`, or no `hunt` reading exceeds 0.12.

**Runs.** `E-TS-1k-o<k>` for offsets 8, 24, 40, 56, 72, 88, 104 and 120: `npm run train -- --curriculum evals/train-ladder.json
--until habitat --generations 380 --ticks 4000 --offer-from 100 --workers 3 --seed-offset <k> --out .sim/train/ladder-1k-o<k>`.

**Result.** Pending.
