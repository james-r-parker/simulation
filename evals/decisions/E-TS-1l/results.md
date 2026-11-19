# E-TS-1l - does an opponent pool on `hunt-mid` and `hunt` lift `prey-ahead`? (training-stages Phase 6, T61; record E204)

**Question.** With 20% of each generation's founders drawn from the opponent pool (earlier champions) on `hunt-mid` and `hunt`, does
`prey-ahead` `winShareOverReference` rise above the 0.12 best so far?

**Prediction, written before the run (training-stages Phase 6, `E-TS-1l` row, commit c1136c51).** Above 0.2 on at least 1 of the 2
resumed runs; falsified when neither gets above 0.2 (then T62, a sim rule, is the next lever).

**Runs.** `evals/train-ladder-pool.json` (the ladder with `pool` 0.2 on `hunt-mid` and `hunt`), resumed from `archive-99.json` (the
start of `hunt`) of `E-TS-1h` offset 144 and `E-TS-1k` offset 8, `--until habitat --generations 380 --ticks 4000 --offer-from 100
--workers 12`, outputs `.sim/train/ladder-1l-o144` and `.sim/train/ladder-1l-o8`. Both exited 3 (`TrainStageStalled` at `hunt`).

## Readings (`winShareOverReference`; bar 0.5)

| Run  | Generations in `hunt` | Maximum (checkpoints)    | Last   | `prey-crossing` `edgeLow` | `kin-spared` | Notes                                                                       |
| ---- | --------------------- | ------------------------ | ------ | ------------------------- | ------------ | --------------------------------------------------------------------------- |
| o144 | 100 to ~315           | **0.1195** (140 to 290)  | 0.1195 | 0.007                     | -0.015       | reviews sent it to `nursery` at 130 and 300 (`food-behind`); plateau at 250 |
| o8   | 100 to ~295           | **0.0569** (110 and 120) | 0.0098 | -0.013 to -0.015          | -0.015       | plateau at 130; the reading fell to 0.0098 and stayed                       |

## Verdict

- **Falsified**: the maxima are 0.1195 and 0.0569 against above 0.2 predicted. The 0.1195 of o144 equals the best of `E-TS-1j`
  (offset 0), so the pool did not move the reading past what the 60-generation runs reach; o8 lost its 0.057.
- `kin-spared` stays at -0.015 on both and `prey-crossing` is negative on o8: the pool's earlier champions do not give the chase
  new material. The cause is the chase itself, so T62 (prey stamina and a hunter burst, a sim rule with the keep rule) is the next lever.
