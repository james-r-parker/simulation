# E169 - G1b reopened with the graze hold on (eat-choice T26)

**Prediction (recorded before the run).** With the graze hold on (season 8 defaults), a lighter graze slowdown lets a
forager keep closing on the next item while it holds `BITE`, so meals that were taken in place become approaches. An arm
with `grazeThrust` 0.75 or 1 reads `eval.deliberate_food_share` `better` than the defaults (`grazeThrust` 0.5) on seeds
1 to 64 at 400000 ticks, and `npm run eval:compare -- --keep-rule` reads no guard `WORSE`. Falsified when neither arm
lifts `eval.deliberate_food_share`, or the arm that does reads a guard `WORSE`. Watched beside it:
`eval.graze_speed_ratio` (should rise toward 1 with the value), `eval.food_energy_per_1k` and `eval.lineages_alive`.
Risk: the slowdown is what prices holding the bite (G1b), so at 1 foragers may hold `BITE` all the time and eating on
contact returns; `eval.graze_time_share` shows it.

**Run:** `npm run screen -- --grid evals/screens/eat-choice-graze-rescreen.grid.json --out evals/decisions/E169/screen`,
then each arm against `graze-0.5` with `--keep-rule --allow-config-diff grazeThrust`. A value is adopted (a season 9
switch) only on a keep-rule no-harm read that lifts `eval.deliberate_food_share`.

Results follow when the run ends.
