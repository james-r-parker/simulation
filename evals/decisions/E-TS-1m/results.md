# E232 - a scattered nursery against the food-behind stall (E-TS-1m)

Prediction (written before the run, `docs/designs/training-stages.md` Phase 8): `nursery-scatter` passes `nursery` on at least 4 of the 7 stalled offsets and on every one of the 9 that pass it in `base`, `hunt-contact` on at least as many offsets as `base` (9), the median within-archive rho of forager lower bound against `food-behind` wins above 0 (base -0.26), and `train:compare` reads `better` or `no verdict`. `turn-rung`: `forage-turn` passes on at least 12 of 16 and `nursery` still stalls on at least 4 of the 7.

Run: `E-TS-1m-2` (`npm run train:screen -- --grid evals/train-screens/food-behind.grid.json`, 16 offsets 0 to 120 by 8, until `hunt-mid`; the first run is [E-TS-1m-invalid](../E-TS-1m-invalid/results.md)). `base` was reused on all 16 offsets. Results: `evals/train-screens/results/food-behind/` (`table.md`, `yield.json`, `verdicts.json`).

## Pass shares

| stage        | base | nursery-scatter | turn-rung |
| ------------ | ---- | --------------- | --------- |
| forage-turn  | -    | -               | 94%       |
| nursery      | 56%  | 88%             | 81%       |
| hunt-contact | 56%  | 88%             | 81%       |
| hunt-weak    | 25%  | 63%             | 50%       |
| hunt-mid     | 19%  | 31%             | 31%       |

Passed last stage 3 (base), 5 (`nursery-scatter`), 5 (`turn-rung`). CPU 17.6, 20.7 and 23.5 h. `train:compare` of `nursery-scatter` against `base`: 12 up, 4 down, 0 tied, mean score difference +0.919 [-0.135, 1.792], sign test p 0.077, no verdict. `turn-rung` is `incomparable` (it names another stage list).

## The 7 stalled offsets, nursery

Last nursery gate (`curve.jsonl`): generation, then `food-ahead` and `food-behind` `edgeLow` (bar 0.3).

| offset | base: gen, ahead, behind | base elites clearing `food-behind` | scatter: gen, ahead, behind | scatter elites clearing `food-behind` | turn-rung |
| ------ | ------------------------ | ---------------------------------- | --------------------------- | ------------------------------------- | --------- |
| 8      | 40, 0.658, 0.069 stall   | 3 of 10                            | 10, 0.658, 0.616 pass       | 10 of 10                              | passes    |
| 24     | 35, -0.286, -0.141 stall | 7 of 10                            | 10, 0.658, 0.616 pass       | 4 of 8                                | passes    |
| 32     | 35, 0.658, 0.176 stall   | 4 of 10                            | 10, 0.658, 0.566 pass       | 7 of 9                                | passes    |
| 40     | 40, 0.658, 0.176 stall   | 5 of 10                            | 10, 0.658, 0.566 pass       | 8 of 9                                | passes    |
| 56     | 35, 0.658, 0.255 stall   | 7 of 10                            | 10, 0.658, 0.566 pass       | 7 of 10                               | passes    |
| 72     | 40, 0.564, -0.060 stall  | 3 of 10                            | 10, 0.658, 0.566 pass       | 3 of 10                               | stalls    |
| 96     | 35, 0.658, 0.255 stall   | 6 of 10                            | 10, 0.658, 0.616 pass       | 10 of 10                              | passes    |

`nursery-scatter` passes all 7 at generation 10, the first gate after the minimum; `turn-rung` passes 6 (offset 72 stalls `nursery` after passing `forage-turn`). The two base passers that the scatter world loses, offsets 80 and 88, are the regression below. Offset 80 stalls `nursery` (last gate `food-behind` -0.115, best 0.373) and offset 88 stalls it at generation 40 (0.272, best 0.445); in `turn-rung` offset 80 never passes `forage-turn` and offset 88 passes it and stalls `nursery`.

## T65 read of each run's last nursery archive

`npm run drill -- --archive <file> --elites all --drills food-ahead,food-behind --seed 1000000 --trials 64 --workers 4` on `archive-<G-1>.json`, G the last `nursery` generation in `curve.jsonl`, all 16 runs of each arm.

| Read                                                                           | base                     | nursery-scatter         |
| ------------------------------------------------------------------------------ | ------------------------ | ----------------------- |
| Forager elites drilled; those whose `food-behind` `edgeLow` clears 0.3         | 159; 103 (0.65)          | 155; 121 (0.78)         |
| Offsets whose top-lower-bound elite clears `food-behind` (the gate's champion) | 9 of 16 (the 9 passers)  | 14 of 16                |
| Median within-archive Spearman rho, lower bound against `food-behind` wins     | -0.18 (below 0 on 12/16) | +0.08 (below 0 on 6/16) |

The base median here is -0.18, not the design's -0.26 (the design's read came from the `nursery-both` runs and a different archive pick, not re-derived here); the sign and the 12 of 16 below 0 agree. The scatter world turns the within-archive ranking from against the turn to neutral; the median sits close to zero (16 offsets, values from -0.64 to +0.83), so it is a shift, not a strong positive correlation.

## Clauses

`nursery-scatter`:

| Clause                                                        | Reading                                                 | Verdict   |
| ------------------------------------------------------------- | ------------------------------------------------------- | --------- |
| `nursery` passes on at least 4 of the 7 stalled offsets       | 7 of 7                                                  | held      |
| ...and on every one of the 9 base passers                     | offsets 80 and 88 stall (7 of 9 hold: 14 of 16 overall) | falsified |
| `hunt-contact` passes on at least as many offsets as base (9) | 14                                                      | held      |
| Median within-archive rho above 0                             | +0.08                                                   | held      |
| `train:compare` reads `better` or `no verdict`, never `worse` | `no verdict` (p 0.077, 12 up, 4 down)                   | held      |

The prediction's own falsification rule ("a base passer stalls in `nursery`") fires on offsets 80 and 88, so the prediction as written is falsified on that one clause although every pass count rises (nursery 9 to 14, passed last stage 3 to 5). The coordinator ran T69 on the pass-count reading; the held-out run answers whether the 2 regressions are a pattern.

`turn-rung`:

| Clause                                                        | Reading                          | Verdict   |
| ------------------------------------------------------------- | -------------------------------- | --------- |
| `forage-turn` passes on at least 12 of 16                     | 15 of 16 (94%; offset 80 stalls) | held      |
| `nursery` still stalls on at least 4 of the 7 stalled offsets | 1 of 7 (offset 72)               | falsified |

Falsified: the stall is not only the nursery's ranking of the turn; acquiring the turn also matters, since a rung that trains it first on the scattered world frees 6 of the 7. Its nursery pass share (81%) is below `nursery-scatter`'s (88%) because offsets 72, 80 and 88 stall.

## Outcome to task

- T69 (held-out offsets 128 to 248, `E-TS-1n`): run, prediction in the T69 note below.
- A scattered world is the lever: the base-passer losses at offsets 80 and 88 are the cost to read on the held-out offsets before any adoption (T70). No gate or bar moves.
- At 90 items about 6.6 items are in a forager's view against 1.5 at the 20-item first draft (the Decisions table gives both), so the working world is much denser than the draft; the nearest item is still as often behind as ahead, but with more items in view the turn pays less than the design's single-item picture, which may explain the offsets 80 and 88 losses (not tested).
