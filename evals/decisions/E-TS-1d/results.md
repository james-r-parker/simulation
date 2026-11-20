# E-TS-1d - the ladder with short episodes and an early offer window (training-stages Phase 6, T43)

**Question.** The E-TS-1c census found the hunt worlds run out of prey by tick 500 of a 60000-tick episode while only deaths from
tick 10000 were offered, so the hunt family selected on hunters that outlived the prey. Does offering the first ticks of short
episodes let the hunt family select on its lesson?

**Prediction, written before the run (E-TS-1c record 4, committed with T42).** The same ladder with `--ticks 4000 --offer-from 100`
added, on offsets 0, 128, 192 and 16: `nursery` passes on at least 3 of 4; `hunt-weak` passes on at least 3 of 4 (a stall on 2 of 4
falsifies the offer-window theory); `kin-spared` reads under 0.001 on at least 3 of the runs that reach `hunt` (no kin lever).

**Runs.** `scripts/run-detached.sh --frozen` from the scratch branch `scratch/ets-1c` (`feat/training-stages-hunt` with
`hunterBiteBias` -0.5 on the `hunt-weak` and `hunt` worlds): `npm run train -- --curriculum evals/train-ladder.json --until habitat
--generations 380 --ticks 4000 --offer-from 100 --seed-offset <k> --workers 6`, `k` = 0, 128, 192, 16; archives under
`.sim/train/ladder-1d-o<k>/`. **The bias is not adopted** (E193: a closed bite at birth cuts strikes at air but costs 49% of catches;
the keep rule reads `WORSE`), so the next ladder run drops it. The curves and gate logs of the four runs are in this directory
(`o<k>-curve.jsonl`, `o<k>-gates.jsonl`).

## Table

All four runs exited 3 (`TrainStageStalled`). A stage reads PASSED after two consecutive passing checkpoints.

| Offset | `nursery`                                                        | `hunt-contact` (`prey-adrift`)         | `hunt-weak` (`prey-weak` `edgeLow`, bar 0.001)                        | `hunt`                                                                                                                                                                                  | Ended                    |
| ------ | ---------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 0      | passed at 20                                                     | passed at 40 (0.524, 0.867)            | stall: -0.0026 at every checkpoint from 50 to 100                     | not reached                                                                                                                                                                             | stall `hunt-weak` at 100 |
| 16     | **stall**: 0.523 at 10, then 0.099, 0.207, 0.207 (`food-behind`) | not reached                            | not reached                                                           | not reached                                                                                                                                                                             | stall `nursery` at 40    |
| 128    | passed at 30 (0.616)                                             | passed at 50 (0.604, 0.012)            | passed at 80 (0.002 at 70 and 80; -0.015 at 60)                       | stall at 90, 110, 130, 150: `winShareOverReference` 0.000 to 0.031, `prey-crossing` -0.010 to -0.015, `kin-spared` -0.015; back to `hunt-weak` at 100, 120, 140, 155 (-0.007 to -0.013) | stall `hunt-weak` at 155 |
| 192    | passed at 30, regressed at 50 (`food-ahead` 0.009), passed again | passed at 70 (0.168; first pass at 40) | passed at 130 (0.082 at 120 and 130; -0.010 to -0.015 from 80 to 110) | stall: `winShareOverReference` 0.000 to 0.010, `prey-crossing` -0.003 to -0.015, `kin-spared` -0.015; back to `hunt-weak` once (170)                                                    | stall `hunt` at 195      |

## Verdict

- `nursery` passes on 3 of 4 (offsets 0, 128, 192; 16 stalls): the prediction (at least 3 of 4) holds, narrowly. Offset 16 passed
  `nursery` in E-TS-1c with 60000-tick episodes, so the short episode did harm one nursery.
- `hunt-weak` passes on 2 of 4 (128 and 192; offset 0 stalls at -0.0026, offset 16 never gets there): **falsified** (at least 3 of
  4). The theory's own clause (falsified when a run that offers the first seconds still stalls `hunt-weak` on 2 of 4) reads 1 stall
  and 1 not reached, and offset 128 stalls there at the end: the theory is neither confirmed nor killed.
- `kin-spared` reads -0.015 on both runs that reach `hunt` (128, 192): under 0.001 on 2 of 2, consistent with "no kin lever", but 2
  runs are not the 3 the clause asks for. T44 (the kin bite inhibition) stays proposed.

## What the offer window did

- It moved the two offsets that stalled `hunt-weak` in E-TS-1c. Offset 128 passed at 80 (0.002, barely above the bar) where it
  stalled at -0.013 for 60 generations, and offset 192 passed at 130 (0.082) where it stalled at -0.015. In E-TS-1c offsets 128, 192
  and 16 read -0.013, -0.015 and -0.010 at every checkpoint from 50 to 100; here offset 128 reads -0.015 at generation 60 and 0.002
  at 70, so one 10-generation step moved it.
- It regressed offset 0, which passed `hunt-weak` in E-TS-1c on an inherited elite (generation 60, 0.012). Here the elite at the end
  of `hunt-contact` (generation 40, `prey-adrift` 0.867) is a different one, and `prey-weak` reads -0.0026 at all six checkpoints from
  50 to 100 (123 of 124 lost trials `never-in-jaws`): no movement at all. Offset 0's earlier pass was an inherited elite, not
  selection, and the offer window gives this elite no signal either.
- It did not make `hunt-weak` stable. Offset 128 went `hunt` -> `hunt-weak` four times (generations 100, 120, 140, 155) because
  the selection of `hunt` loses the `prey-weak` reading (0.002 to -0.007 to -0.013): the `hunt` world also runs out of prey
  (E-TS-1c record 4), so its offers read hunters that outlive the prey again. Offset 192 regressed once (170); its `hunt-weak` pass
  is the strongest in any run (0.082), which is why it held longer.
- `hunt` never passed: `winShareOverReference` is at most 0.031 (bar 0.5), far from the bar, not a few points short.
- A nursery-level instability that is not new: offset 192 lost `nursery` at generation 50 (`food-ahead` 0.009 after a champion
  swap during `hunt-contact`) and passed it again.

## Outcome record 5 - the nursery `food-behind` stall on offsets 64 and 16

**Observation.** The stall now shows on two offsets. Offset 64 (E-TS-1, E-TS-1b, the same digits both times, same seeds):
checkpoint 10 `food-behind` `edgeLow` 0.464, then 0.239 at 20, 30 and 40. Offset 16 here: 0.523 at 10, 0.099 at 20, 0.207 at 30 and
40 (bar 0.3); `food-ahead` stays 0.66 to 0.59. Both pass at checkpoint 10 and fail from 20, and both fail because the archive's best
forager changed.

Read on the offset 16 archives (`npm run drill -- --archive <archive-g.json> --drills food-behind --count 1 --trials 64`, the
forager elite of each generation; the `memoryless` reference wins 64 of 64 on every seed):

| Generation | Elite          | Gate seed                                       | seed 1 (win, edge) | seed 2      | seed 3      | seed 77     |
| ---------- | -------------- | ----------------------------------------------- | ------------------ | ----------- | ----------- | ----------- |
| 10         | forager cell 6 | win 0.94, edge 0.67, `edgeLow` 0.523 (the gate) | 0.91, +0.78        | 0.89, +0.80 | 0.91, +0.65 | 0.91, +0.91 |
| 20         | forager cell 4 | win 0.55, edge 0.28, `edgeLow` 0.099 (the gate) | 0.78, +0.66        | 0.77, +0.67 | 0.72, +0.46 | 0.77, +0.77 |
| 30 and 40  | forager cell 3 | win 0.66, edge 0.39, `edgeLow` 0.207 (the gate) | not read           |             |             |             |

Two things are in these numbers. (1) The champion changed to a worse turner everywhere: the win share on `food-behind` falls from
0.89 to 0.91 (generation 10) to 0.72 to 0.78 (generation 20) on every seed read, so it is not only the gate seed. (2) The gate seed
is the hardest read: the generation-20 elite wins 0.55 on it and 0.72 to 0.78 elsewhere, and the random brains' share (the edge's
baseline) is about 0.27 on it (the `memoryless` edge 0.73 from a win share of 1) and 0 to 0.25 on the others (edge 0.75 to 1.00). A
forager that clears 0.3 by a wide margin on three seeds fails it on the gate seed: a 0.2 drop in win share is a swing of the whole
edge. (Edges here are the means the drill prints; the gate reads their Wilson-bound `edgeLow`.)

**Theory.** (1) `evals/stages/nursery.json` is 60 food on 2400 x 1600 with no patch radius set, so the food is mostly near or ahead
and energy income barely separates a forager that turns round from one that drifts on; the champion pick (highest lower bound of the
archive) swaps a turner for a drifter once one has more lifetime energy (E-TS-1 record 2; now seen on two offsets, one pick each time
at the first change after generation 10). Untested: the income of the two elites, which is the next step below. (2) The bar is the
reference's (`memoryless` passes it, random brains fail it), so the gate is not lowered.

**Natural analogue.** A forager that passes a food item and carries on does one of two things in nature. It scans: it turns the
sense organ through an arc before the body follows (a rat's whisking and head turn, a bird's head-bob and look-back, an insect's
saccadic turns), so food off the heading is found without turning the whole body. Or it integrates its path: an ant, a bee or a
rodent keeps a running estimate of where it has been relative to the body (path integration; desert ants keep it to the metre) and
turns back to a patch it has just left; area-restricted search (ants, nematodes, foraging birds) is the same behaviour after a loss.
Both are paid for by patchy food that runs out: food that is always ahead does not select for either.

**Numbers-first next step (T37, T38; no gate change).** Before any world edit, on the generation-10 and generation-20 foragers of
offsets 16 and 64 read (a) the `TURN` output share and the turn latency to the food's bearing over the 64 `food-behind` trials,
and (b) the nursery income (`eval.food_energy_per_1k` of the checkpoint eval, which the curve already holds:
`o16-curve.jsonl`, 135 at generation 10 and 20, 72 at 30, 149 at 40). If the generation-20 forager turns later and earns more, the
next record is a world edit (food that runs out ahead: a nursery patch radius, a config change, never a fitness term) and a
champion pick that keeps the passing forager through the stage; if its income is not higher, the swap is drift, not selection,
and the record is how many nursery generations follow the pass (the gate passes at 10, the hold needs two checkpoints). T37
(`E-TS-1e`, five more offsets) gives the share of offsets that fail. The gate seed's harder read is noted, not changed.

**Task rows.** T37, T38 (Phase 6).

## What this run does and does not show

It shows the offer window moves the hunt family's selection (two stalled offsets passed `hunt-weak`) and that a passed rung is not
held while the next stage's episode reads hunters that outlived the prey. It does not show the offer-window theory is right (one
regression at offset 0, one nursery stall); four offsets and one archive each are leads. No eval ran, so there is no
`eval:compare` verdict.

## Next ladder run

Task rows T45 to T47 in training-stages Phase 6 (`E-TS-1f`, proposed, not run): the stage worlds' prey share and the retention
of a passed rung, without `hunterBiteBias`.
