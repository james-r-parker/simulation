# E170 - the grazeThrust 0.75 switch on fresh seeds (eat-choice T26)

**Prediction (recorded while the head run starts, before any result).** On seeds 65 to 128 at 200000 ticks, the switch
(`grazeThrust` 0.75, season 9) against `main` (`evals/decisions/E167/head.report.json`: the season 8 defaults, the sim
unchanged since) reads no keep-rule guard `WORSE`, and `eval.deliberate_food_share` `better`. `held` is expected to lean
better, as in E169. Falsified when a guard reads `WORSE` or the deliberate share is not better.

**Run:** `npm run eval -- --seeds 64 --seed-offset 64 --ticks 200000 --policy live --out evals/decisions/E170/head.report.json`,
then `npm run eval:compare -- evals/decisions/E167/head.report.json evals/decisions/E170/head.report.json --keep-rule
--allow-config-diff grazeThrust`.

Results follow when the run ends.
