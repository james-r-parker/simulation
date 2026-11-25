### 2026-11-18 - A ladder gate reads the default world, and a trainer archive does not open in `drill` (training-stages E-TS-1)

The gate drills of a training run run on `config: {}` (`drillPart` in `scripts/lib/train-checkpoint.mjs`), not on the stage's
world, and the drills' prey is the scripted `fleer`, not the stage's brain-driven prey. So `hunt-contact`'s slowed prey
(`turnMultiplier` 0.5) shape the training worlds and never the gate: on offset 128 the stage's last predator kills the stage's
foragers 42 of 64 in the `prey-ahead` staging and wins 0 of 64 against the fleer. Against a prey that sprints straight a slowed
turn moves nothing (the `memoryless` reference wins 9 of 64 on the defaults and 6 of 64 with the turn halved); the scripted
pursuer of `audit:chase` catches at 0.6 of the view 0.00 on the defaults and 0.56 only when the prey's `sprintBoost` is cut to
0.6 (`sprintBoost` 1 is the default, a forager's sprint 12.0 against a predator's 14.4 and both cruising at 8.0). A gate is
read two checkpoints in a row (`hold` 2), so a champion swap between checkpoints can fail a stage that passed once (offset 64,
`nursery`). `npm run drill -- --archive` rejects a trainer archive (`archive.descriptor: expected v1, got v7`; `train:export`
reads it with `TRAINER_DESCRIPTOR` and the stage-neutral `rulesHash`), and a stage file passed as `--config` crashes `stageWorld`
(`initialAgents` 60 replaces the drill's own staging); pass the `specialisations` block alone. `train:crossplay` and
`train:curve` on a finished run take 20 to 60 s. Numbers and the tasks: `evals/decisions/E-TS-1/results.md`, training-stages
T33 to T38.
