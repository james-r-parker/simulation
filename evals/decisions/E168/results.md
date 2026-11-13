# E168 - the receptive-mate scent screen (low-density-edge T27)

**Prediction (recorded before the run).** `E-LD-4`: on the switched world with the scent inputs (`pooled-v6`), a
`mateScentDeposit` arm (0.5, 1 or 2; `pheromoneDeposit` is 1 and `pheromoneMax` 5) reads `held` `better` than the scent
off at 64 seeds, with the `alive` guard not worse and `eval.mating_share` higher: males that can smell a ready female find
her at low density, where E-LD-1 placed the edge. Falsified when no scent arm reads `held` `better`, or the leading arm's
`alive` guard reads `worse`. Risk: the inputs start with random weights, so the scent pays only once brains evolve to
follow it inside a 200000-tick run.

The grids run only on `feat/receptive-mate-scent`, where `mateScentDeposit` exists.

**First pass:** seeds 1 to 16 (`npm run screen -- --grid evals/decisions/E168/screen16.grid.json`), ranked
by `held`, then `alive`, then `eval.mating_share`. **Second pass:** the leading arm and `off` on seeds 1 to 64 with
`--keep-rule`.

## First pass (seeds 1 to 16)

| Arm         | `held` harmed/recovered | `alive` | `eval.mating_share` | Median lowest pop | Pop mean | `eval.lineages_alive` |
| ----------- | ----------------------- | ------- | ------------------- | ----------------- | -------- | --------------------- |
| `off`       | -                       | -       | 0.691               | 16.5              | 266      | 4.35                  |
| `scent-0.5` | 3 / 0                   | 1 / 4   | 0.667               | 8                 | 255      | 4.33                  |
| `scent-1`   | 3 / 1                   | 1 / 3   | 0.668               | 29                | 294      | 4.24                  |
| `scent-2`   | 1 / 1                   | 1 / 5   | 0.711               | 70                | 315      | 3.59                  |

`scent-2` leads by `held`, then `alive`, then `eval.mating_share`, and the crash depth rises with the deposit (8, 29, 70).
Since the trend has not levelled at 2, the second pass adds `scent-4` (recorded here, before it runs): `off`, `scent-2` and
`scent-4` on seeds 1 to 64, each against `off` with `--keep-rule`, and `scent-4` against `scent-2`.

## Second pass (seeds 1 to 64)

`npm run screen -- --grid evals/decisions/E168/screen64.grid.json`; each arm against `off` with
`npm run eval:compare -- <off> <arm> --keep-rule --allow-config-diff mateScentDeposit`, and the crash depth from
`node scripts/capacity-traces.mjs`.

| Arm       | `held` harmed/recovered (p) | `alive` harmed/recovered (p) | `under80` | Catches/1k | `eval.mating_share` | `eval.births_per_1k` | Median lowest pop | Hunters alive at end | Other verdicts                                                     |
| --------- | --------------------------- | ---------------------------- | --------- | ---------- | ------------------- | -------------------- | ----------------- | -------------------- | ------------------------------------------------------------------ |
| `off`     | -                           | -                            | -         | 0.384      | 0.675               | 0.170                | 10.5              | 48/64                | -                                                                  |
| `scent-2` | 11 / 4 (0.12)               | 11 / 13 (0.84)               | 10 / 10   | 0.404 =    | 0.669               | 0.174 =              | 14                | 50/64                | `qd_score`, predator fitness, food intake better; cold stress less |
| `scent-4` | 9 / 8 (1)                   | 6 / 13 (0.17)                | 9 / 9     | 0.373 =    | 0.660               | 0.165 =              | 29                | 55/64                | `qd_score` better; hunter juvenile deaths fewer                    |

Smallest loss each guard could detect: `alive` 27 seeds, `under80` 21 to 23, `held` 13 (`scent-2`) and 20 (`scent-4`).
`scent-4` against `scent-2` reads `WORSE` on catches/1k (-7.7%, interval [-0.063, -0.0005]).

## Verdict

**E-LD-4 is falsified.** No scent arm reads `held` `better`: `scent-2` leans the wrong way (11 seeds lost against 4
held) and `scent-4` is level (9 / 8). The scene the scent serves did not move either: `eval.mating_share` is a little
lower in both arms, `eval.births_per_1k` reads `no-difference`, and the edge mate-birth rate is flat. The first pass
lead of `scent-2` (median lowest 70) did not replicate on 64 seeds (14).

The keep rule reads no harm for both arms, but the guards cannot see a loss of a quarter of the seeds (`alive` 27), and
the scent is a new brain input, which `docs/principles.md` counts as a cost that needs a scene metric to move. None
did: the `qd_score` and hunter gains are not the mating scene, and with no change in mating they are more likely the
two extra inputs than the scent. **The scent does not land.** T28 (the switch) is not built; the grid, the inputs and
`pooled-v6` stay on the unmerged branch `feat/receptive-mate-scent` (`0bab9926`, `0fd685aa`), and season 8 stays.

Reading: mating is not what limits recovery at the edge on the switched world. Males already find ready females on two
thirds of births (`eval.mating_share` 0.67), and a stronger lure does not change how many prey are left to find.

## Do males follow the scent? (2026-11-13)

The verdict above left one gap: the scent inputs start with random weights, so a 200000-tick run might end before
brains learn to use them. `scent-follow.mjs` (in this folder; results in `scent-follow.json`) re-runs the `scent-4` world
on seeds 1 to 8 for 200000 ticks on `feat/receptive-mate-scent` and measures steering, sampled every 5 ticks: for each
agent, its mean turn output when the left antenna smells more mate scent minus its mean turn when the right one does
(turn runs from -1 to 1; positive steers toward the scent). The placebo is the same contrast for ready males against
a smooth field no brain can sense, sampled at the same antenna points; it shows what movement alone produces.

| Ticks           | Mate-ready males | Everyone else  | Placebo (ready males) |
| --------------- | ---------------- | -------------- | --------------------- |
| 0 - 20000       | 0.012 +- 0.010   | 0.038 +- 0.006 | -0.003 +- 0.007       |
| 20000 - 40000   | 0.012 +- 0.005   | 0.036 +- 0.004 | -0.005 +- 0.004       |
| 80000 - 100000  | 0.025 +- 0.005   | 0.037 +- 0.006 | -0.012 +- 0.005       |
| 180000 - 200000 | 0.014 +- 0.003   | 0.033 +- 0.007 | -0.001 +- 0.006       |

Means over the 8 seeds, +- one standard error. Ready males smell the scent on 85% to 100% of their samples at the end,
so the signal reaches them.

**Reading: brains do not learn to follow the scent.** The placebo sits at 0, so the method is sound. Ready males lean
slightly toward the scent (about 1% of a full turn), but they did so from the first 20000 ticks, the lean does not grow
over 200000 ticks, and agents with no reason to seek a mate (females and males not ready) lean about twice as much.
The lean is what any agent shows by heading for food and company, which the scent overlaps, not a mate search. The
verdict stands, and the gap it left is closed for this design: a longer run would not have helped, because selection
did not start to shape the response. A scent that males do follow would need a reason the scent alone gives, such as
one that is not everywhere: the ready-male scent coverage near 1 says deposit 4 spreads it over most of where males are.
