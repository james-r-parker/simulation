# E171 - grazeThrust 0.6 and 0.65 on the seeds where 0.75 cost hunters (eat-choice T28)

**Prediction (recorded before the run).** A smaller easing of the graze slowdown keeps part of E170's forager gain at a
smaller hunter cost. On seeds 65 to 128 at 200000 ticks, against `main` (`evals/decisions/E167/head.report.json`,
`grazeThrust` 0.5), at least one of `grazeThrust` 0.6 and 0.65 reads `eval.deliberate_food_share` `better` and
`npm run eval:compare -- --keep-rule` reads no guard `WORSE`, `eval.hunter_catches_per_1k` included. Falsified when
every arm that lifts the share reads a guard `WORSE`. The arm that passes is then run on seeds 1 to 64 against the
defaults before any switch.

**Runs:** `npm run eval -- --seeds 64 --seed-offset 64 --ticks 200000 --policy live --config
evals/decisions/E171/graze-<value>.json --out evals/decisions/E171/graze-<value>.report.json` for 0.6 and 0.65, each
compared with `--keep-rule --allow-config-diff grazeThrust`.

Results follow when the runs end.
