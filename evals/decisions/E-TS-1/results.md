# E-TS-1 - the first ladder run (training-stages Phase 6, T26 and T27)

**Question.** Which stages of `evals/train-ladder.json` pass, stall or regress on offsets 0, 64 and 128, and what do the
stalls say about the ladder? The run judges the ladder, not a skill ([training-stages.md](../../../docs/designs/training-stages.md),
Phase 6).

**Prediction, written before the run (verbatim from Phase 6).** `nursery` passes on 3 of 3 offsets; `hunt-contact` passes
on at least 2 of 3 because slowed prey give the contact the T20 trace found missing (24 of 27 losses never reached the
jaws); `hunt` stalls on at least 1 of 3. (The `pack` clause, "stalls on 3 of 3", is void: the stage is not in the ladder.)
Falsified for `hunt-contact` when it stalls on 2 of 3: the lever is then not contact, and the lost-trial reasons of the
stall name the next record.

**Runs.** `npm run train -- --curriculum evals/train-ladder.json --until habitat --generations 380 --seed-offset <k>
--workers 8` from `origin/main` 26ae0c51 (the manifests hold the sha), `k` = 0, 64, 128, 32 episodes per generation, gate
checkpoints every 10 generations, a stage passes when two checkpoints in a row pass (`hold` 2). All three exited 3,
`TrainStageStalled`. Files here: `o<k>-curve.jsonl`, `o<k>-crossplay.json`, `o<k>-manifest.json`, `summary.json` (the
extracted numbers and the diagnostics below). The archives (3 MB each) stay under `.sim/train/ladder-1-o<k>/` and are not
committed.

## Step 0 - the detectors

- The gate drills run on `config: {}` (`drillPart` in `scripts/lib/train-checkpoint.mjs`): the default world, not the
  stage's, with the drills' scripted `fleer` as the prey. So `hunt-contact`'s slowed prey (`turnMultiplier` 0.5) are in the
  training worlds only, and the gate asks a hunter to catch a sprinting evader.
- The gate pools every champion of the drill's specialisation (two predators), so a second champion with no wins halves the
  pooled share; the reading is a floor, not the best champion's.
- `npm run drill -- --archive <trainer archive>` and `reflex --archive` reject a trainer archive (`archive.descriptor:
expected v1, got v7`); `train:export` reads it with `TRAINER_DESCRIPTOR` and the stage-neutral `rulesHash`. The diagnostics
  below used the exported champion files and a scratch script that decodes the archive the way `train:export` does. A
  `--config` that is a stage file breaks `stageWorld` (`initialAgents` 60 overrides the drill's own staging), so the diagnostics
  pass the `specialisations` block alone.
- `train:exam` does not exist on `main` (training-stages Phase 5, T22 to T24, is not built): **not run**.
- The curve's `drill edge` and the gate readings are constant between checkpoints because the champion is: the best
  predator row did not change from generation 40 to 80 on offset 128 nor 60 to 80 on offset 0, and the best forager did not
  change after generation 20 on offsets 0 and 64.

## Table

| Offset | `nursery`                                                                                                     | `hunt-contact`                                                                                   | Later stages | Run ended                |
| ------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------ | ------------------------ |
| 0      | **pass** at generation 20 (`food-ahead` 0.658, `food-behind` 0.616 at checkpoints 10 and 20)                  | **stall** at 80 gens: `prey-ahead` `edgeLow` -0.0068 (3 of 128), lost `never-in-jaws` 123 of 125 | not reached  | stage 2 (maxGenerations) |
| 64     | **regression, then stall** at 40 gens: passed checkpoint 10 (`food-behind` 0.464), failed 20, 30, 40 at 0.239 | not reached                                                                                      | not reached  | stage 1 (maxGenerations) |
| 128    | **pass** at generation 20 (`food-behind` 0.544 then 0.523)                                                    | **stall** at 80 gens: `prey-ahead` `edgeLow` -0.0148 (0 of 128), lost `never-in-jaws` 126 of 128 | not reached  | stage 2 (maxGenerations) |

Cross-play of the run (64 trials per cell, the `prey-ahead` staging, the predator champion against the forager champions,
default world): the last predator against the last forager kills 1 of 64 on offset 0, 4 of 64 on offset 64 and 42 of 64 on
offset 128 (hunter progress 0.315, low 0.225, the only run with a rising hunter); prey progress is 0 in all three (low
under 0 each); the cycle share is 0.14, 0 and 0. In the pack cell (three sibling hunters) offset 128 kills 64 of 64.

## Verdict

- `nursery` passes on 2 of 3, not 3 of 3: **prediction falsified**. The miss is a regression, not a failure to learn:
  offset 64's generation-10 champion passed both conditions and its generation-20 champion did not.
- `hunt-contact` passes on 0 of 3 (it ran on 2): **prediction falsified**, and the stated falsification (stalls on 2 of 3)
  holds. The lever "slowed prey give the contact" is not what the gate reads: see the first record.
- `hunt` is not reached on any offset: the clause "stalls on at least 1 of 3" is **undecided**; it carries to the next run.

## Outcome record 1 - `hunt-contact` stalls on offsets 0 and 128

**Observation.** Offsets 0 and 128, generation 80, gate seed, 128 pooled trials: `drill.prey-ahead.edgeLow` -0.0068 and
-0.0148 against a bar of 0.001. The bar beside them: the `memoryless` reference wins 9 of 64 (the validity run of T25: it
passes the condition), random brains win none of the same trials (the drill edge equals the win share). Lost trials: `never-in-jaws` 123 and 126, `prey-died-unkilled` 2 and 2,
`never-bit` 0: the same shape as the T20 trace (24 of 27 never in the jaws). The curve shows the hunters bite where they
reach (`bite_wish_with_prey_in_jaws` 0.82 to 0.99, `bite_on_prey_view` 0.99 on offset 0) and make kills in the training world (kill
income share 0.40 to 0.46 of hunter income; zero-kill share 0.3 to 1.0 by checkpoint, swinging with a few hunters). Diagnostics (64 trials, seed
1000000, the final predator champions, `summary.json`):

| Reading                                                                              | offset 0 (cell 57, cell 6) | offset 128 (cell 5, cell 56) | `memoryless`       |
| ------------------------------------------------------------------------------------ | -------------------------- | ---------------------------- | ------------------ |
| `prey-ahead` wins, default world (the gate's world)                                  | 3, 0 of 64                 | 0, 0 of 64                   | 9 of 64            |
| `prey-ahead` wins, prey `turnMultiplier` 0.5 (the stage's rule)                      | 2, 0 of 64                 | 0, 0 of 64                   | 6 of 64            |
| `prey-ahead` wins, prey `sprintBoost` 0.6                                            | 4, 0 of 64                 | 0, 0 of 64                   | 13 of 64           |
| `prey-ahead` wins, prey `sprintBoost` 0.2 (sprint 8.8 against a hunter cruise 8.0)   | 5, 0 of 64                 | 2, 0 of 64                   | 14 of 64           |
| crossplay: predator vs the stage's own forager champions (brain-driven, not fleeing) | 1 of 64                    | 42 of 64                     | -                  |
| skip cells of the champions: prey into `BITE`, `THRUST`, `TURN`                      | +1.91, +1.17, +1.04        | +2.89, +1.37, +1.40          | -                  |
| median closest approach, `sprintBoost` 0.2, offset 0 (summed radii; touching is 1)   | 3.54, 3.84                 | -                            | 3.98 (random 4.06) |

Chase audit (`npm run audit:chase -- --pairs predator:forager --trials 4`, a scripted pursuer against an evader that
breaks): the catch share at 0.6 of the view, the drill's place, is 0.00 on the defaults and on `turnMultiplier` 0.5 for the
prey, 0.56 at `sprintBoost` 0.6, 0.75 at 0.2, and 0.88 against an evader that runs straight. `npm run probe:learn --
--lessons prey-ahead --generations 60 --seeds 4 --population 48 --trials 4` (short): best final win share 0.00 on all 4
populations. The exam is not run (see step 0).

**Theory.** Three sentences, each falsifiable:

1. The stage trains a hunter to close on prey that does not run (the prey are brain-driven foragers that were never selected
   to flee), and the gate asks it to catch a scripted sprinting evader: the gate reads the lesson of `hunt`, not contact.
   A fixture: the offset 128 predator wins at least half of a `prey-ahead` whose prey stands still, and loses to the
   scripted fleer. The numbers above fit: it kills the stage's foragers 42 of 64 in the same staging and wins 0 of 64
   against the fleer, and the slowed turn does not help against a prey that runs straight (the reference falls from 9 to 6
   of 64 and an elite from 3 to 2).
2. Offset 0 has not learned contact at all (cross-play 1 of 64 against its own foragers): the same stage gave offset 128 a
   hunter that kills 0.66 of its stage's prey and offset 0 one that kills 0.02, so contact is not reliably found in 80
   generations, and its selection signal stalls (the best predator row of offset 128 is unchanged from generation 40).
   Sparse start: random brains win `prey-ahead` on none of 256 trials and direct selection on the lesson found 0.00 in 60 short
   generations.
3. Not a sensing or steering failure: the skip cells wire prey into `BITE` (+1.9 to +2.9), `THRUST` and `TURN`, the hunters
   bite with prey in the jaws on 0.82 to 0.99 of those ticks, and one offset catches prey 0.66 of the time in the same
   arena. Not the pooled reading alone: the best single champion (offset 0, cell 57: 3 of 64) is far below the reference
   (9 of 64).

**Natural analogue.** Young predators do not start on escaping prey. Cat mothers bring live injured prey, meerkat adults
give pups disabled scorpions, orca and killer-whale calves practise on stranded or crippled prey, and juveniles of most
carnivores play-stalk and pounce on objects that do not flee; success on healthy prey comes later and stays low (juvenile
success rates are often a fraction of an adult's). The practice is graded by how much the target resists, not by how
slowly it turns. Here the stage's prey resists nothing (no flight) while the gate's resists fully, with no rung between.

**Principle check.**

| Theory                                                                | Scenes and rules served                      | Detector, not reward                                                        | Fails closed                                     | Senses local        | No script or rescue                                                                                                                          | World, not breeding         |
| --------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| A drill with prey that does not run, as the `hunt-contact` gate (T35) | A real chase; rules 1 and 6 (the hunt chain) | yes: a drill, in no fitness, merit or rank                                  | yes: a hunter that does not close still fails it | yes: no input added | yes: a detector's staging, no stage partner                                                                                                  | yes: the gate, not breeding |
| Prey that flee slowly in the stage world (`sprintBoost` below 1)      | A real chase                                 | yes                                                                         | yes                                              | yes                 | **fails**: the stage prey are brains and do not flee, so the lever does nothing unless a scripted partner exists (Decisions: none are built) | yes                         |
| Zero or lower the gate to the observed reading                        | none                                         | **fails**: reads nothing; the reference passes it and random brains fail it | -                                                | -                   | -                                                                                                                                            | -                           |

The second and third rows are refused and go into Decisions.

**Prediction and detector (for T35 and T36, written before them).** With the gate on a non-fleeing prey, `hunt-contact`
passes on at least 4 of 5 offsets (0, 64, 128, 192, 256) within its 60 generations; a stall on 2 of 5 falsifies the
reading "contact is learnable in this arena" and the arena (`hunt-contact.json`) is the next record. Detector: the new
drill's `edgeLow` (bar to be set by its validity run, never below the reference's).

**Task rows.** T33, T34, T35, T36 in Phase 6. T34 is the diagnostic that tells theories 1 and 2 apart before T35.

## Outcome record 2 - `nursery` regresses on offset 64

**Observation.** Offset 64: checkpoint 10 `food-behind` `edgeLow` 0.464 (pass; win share 0.62), checkpoint 20 0.239, 30 and 40
0.239 (fail; win share 0.42), bar 0.3; `food-ahead` 0.658 at all four (saturated at a win share 0.77 on every offset). The
best forager row changed from 4434 (generation 10) to 12402 (generation 20) and never changed again: a champion with more
lifetime energy but a worse turn to food behind it replaced the one that passed. On offsets 0 and 128 the `food-behind`
share stayed at 0.73 and 0.67. Loss reasons are not recorded for the food drills (null).

**Theory.** The nursery's food is mostly ahead or near, so energy income does not separate a forager that turns round from one
that does not, and the champion pick (best lower bound of the archive) can swap a turner for a forward drifter; the gate's
two-checkpoint hold then stalls the stage. A fixture: the generation-10 and generation-20 offset 64 foragers, read on
`food-behind` with its turn output (a forager skip-cell read), differ in the turn toward food in the rear arc, and the
generation-20 one has higher nursery income.

**Natural analogue.** Foragers that lose a food source turn back and search the area it was found in (area-restricted
search in ants, nematodes and foraging birds); juveniles learn it from patchy, depleting food, not from food that is always
ahead.

**Principle check.** A drill and a gate only: no fitness term, no input, no scripted mode. The change under test is the
nursery world's food layout, a config edit. Fails nothing.

**Prediction and detector (T37, T38).** One archive is a lead. T37 repeats `nursery` on five more offsets; the nursery
passes on at least 4 of 5 (with offset 64, at least 6 of 8 overall) or the nursery's food layout is the next record
(`drill.food-behind.edgeLow`, bar 0.3, unchanged).

**Task rows.** T37, T38.

## What this run does and does not show

It shows the gate of `hunt-contact` and the stage it gates do not measure the same lesson, that contact is found on 1 of 2
offsets, and that a gate passed once can be lost at the next checkpoint. It does not show that contact is unlearnable, that
`hunt` is hard, or anything about the target world (the ladder's first run claims none). Three offsets and one archive each
are leads. No eval ran, so there is no `eval:compare` verdict.

## T34 - the contact diagnostic (theories 1 and 2 told apart)

Run on the final archives of `.sim/train/ladder-1-o0`, `o64` (generation 39, its last) and `o128` (generation 79) at `origin/main`
after T33 (`drill --archive` now reads them; the diagnostic uses the same decode). Files here: `contact-diagnostic.mjs`
(64 `prey-ahead` trials, seeds 1000000 to 1000063, default world, per predator elite of each style band and `memoryless`; the
prey is the drill's scripted `fleer` or an inert prey whose outputs are zero), `contact-diagnostic.json` (its output) and
`stage-kills.mjs` (a stage-world episode seeded from the archive at debug level, then `scripts/hunter-income.mjs`).

| Subject (cell)           | wins vs fleer | wins vs inert | median closest approach (fleer / inert, summed radii) | SPRINT share with prey in view (fleer / inert) | THRUST above 0.5 (fleer / inert) |
| ------------------------ | ------------- | ------------- | ----------------------------------------------------- | ---------------------------------------------- | -------------------------------- |
| offset 0, cell 57        | 1             | 32            | 3.87 / 1.00                                           | 0.25 / 0.40                                    | 0.24 / 0.94                      |
| offset 0, cell 6         | 0             | 5             | 4.06 / 1.00                                           | 1.00 / 0.97                                    | 0.03 / 0.52                      |
| offset 64, cell 3        | 0             | 37            | 4.05 / 1.00                                           | 0.27 / 0.14                                    | 0.00 / 0.23                      |
| offset 64, cell 59       | 0             | 45            | 4.05 / 1.00                                           | 0.00 / 0.04                                    | 0.20 / 0.88                      |
| offset 128, cell 5       | 0             | 49            | 4.02 / 1.00                                           | 0.45 / 0.59                                    | 0.24 / 0.67                      |
| offset 128, cell 56      | 0             | 54            | 4.06 / 1.00                                           | 0.31 / 0.07                                    | 0.02 / 0.75                      |
| `memoryless` (reference) | 5             | 8             | 4.01 / 4.01                                           | 0.29 / 0.09                                    | 0.29 / 0.09                      |

Against an inert prey five of the six elites reach it (median closest approach 1.00, touching) and win 32 to 54 of 64; they thrust
on 0.23 to 0.94 of the in-view ticks and keep their distance from the fleer (median 3.9 to 4.1), where they thrust on 0.00 to 0.24 of
the in-view ticks. The reference shows neither (it wins 8 of 64 inert, closest 4.01). SPRINT is not the lever: the elites sprint
on 0.00 to 1.00 of the in-view ticks whichever the prey (the offset 0, cell 6 elite always sprints and wins 5 inert, 0 fleer).

Stage kills (`stage-kills.mjs`, 20000 ticks, `hunt-contact.json`, 100-agent founders from the archive, `HunterKill` ticks): offset 128
seed 1 has 39 kills, 23 within 400 ticks, 27 within 1000 and 1 after 5000; seed 2 has 38, 29 and 29 (none after 5000); offset 0 seed 1
has 27, 20 and 23 (none after 5000). `hunter-income.mjs` on offset 128 seed 1: 41 lives, 26 with no kill; kill share of income 0.35,
bite 0.27, carcass 0.39 (offset 0: 34 lives, 19 with no kill, kill share 0.32). Kills are an opening event: a hunter next to a prey
that has not moved off, not a sustained chase, and the stage world never asks a hunter to catch a prey that runs.

**Theory named: theory 1.** The stage selects for closing on prey that does not run and the gate asks for catching one that does;
five of six elites (offsets 0, 64 and 128) win 0.50 to 0.84 against an inert prey and 0 or 1 of 64 against the fleer. Theory 2
(contact is not found) holds for one elite only (offset 0, cell 6: 5 of 64 inert), and offset 0 also has the strong one (cell 57:
32 of 64), so contact is found on all three offsets by its best elite, which the E-TS-1 cross-play (1 of 64 against moving
foragers on offset 0) did not show. Prediction for T35 and T36 stands: with the gate on the inert-prey drill `hunt-contact`
passes on at least 4 of 5 offsets. The detector is still `drill.<name>.edgeLow`; no bar moves, no stage world changes.
