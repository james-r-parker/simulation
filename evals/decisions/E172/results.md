# E172 - grazeThrust 0.6 on seeds 1 to 64 (eat-choice T28)

**Prediction (recorded before the run).** On seeds 1 to 64 at 200000 ticks, `grazeThrust` 0.6 against the defaults
(0.5) reads `eval.deliberate_food_share` `better` and no keep-rule guard `WORSE`, `eval.hunter_catches_per_1k` included,
as on seeds 65 to 128 (E171). Falsified when the share is not better or a guard reads `WORSE`. When it holds, 0.6
becomes the default (season 9).

**Run:** `npm run screen -- --grid evals/decisions/E172/screen.grid.json --out evals/decisions/E172/screen`, then
`graze-0.6` against `graze-0.5` with `--keep-rule --allow-config-diff grazeThrust`.

Results follow when the run ends.
