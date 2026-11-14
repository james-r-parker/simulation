# E173 - power of the feed-phase contact shares (eat-choice T27)

**Prediction (recorded before the run).** With contacts tallied in the feed phase (T27), every contact is counted, so
`eval.food_contact_bite_share` and `eval.full_contact_bite_share` vary less from seed to seed than the sampled shares of
E164 (detectable change 0.15 at 32 seeds). On a 64-seed reference of the season 10 defaults (seeds 1 to 64, 400000
ticks, floor on, policy live), `npm run eval:power` gives each a detectable change of at most 0.05 (`MAX_SHARE_MDE`) at
32 seeds, so both become `verified`. Falsified when either share's detectable change at 32 seeds is above 0.05.

**Run:** `npm run eval -- --seeds 64 --ticks 400000 --policy live --out evals/decisions/E173/reference.report.json`,
then `npm run eval:power -- evals/decisions/E173/reference.report.json` and `node scripts/metric-power-write.mjs --merge`.

**Result: falsified.** The 64-seed reference ran in 4056 s (32 workers). At 32 seeds the detectable change is 0.1 for
`eval.food_contact_bite_share` and 0.075 for `eval.full_contact_bite_share`, both above 0.05, so both stay `watch`.

| Metric                         | Mean  | SD    | Min   | Median | Max   | False positive 16 / 32 | Detectable 16 / 32 (E164 at 32) |
| ------------------------------ | ----- | ----- | ----- | ------ | ----- | ---------------------- | ------------------------------- |
| `eval.food_contact_bite_share` | 0.140 | 0.114 | 0.012 | 0.121  | 0.492 | 8.7% / 6.3%            | 0.15 / 0.1 (0.15)               |
| `eval.full_contact_bite_share` | 0.110 | 0.106 | 0.005 | 0.091  | 0.432 | 11.4% / 7.0%           | 0.15 / 0.075 (0.15)             |

**Reading.** Counting every contact tightens both shares (0.15 to 0.1 and 0.075), but the spread left is between
seeds, not sampling: one seed bites on 1% of contacts, another on 49%. That spread is the lineage each world settles
on, so more contacts per seed cannot remove it. The shares stay detectors to read beside a verdict, not verdict
metrics. The power readings are merged into `js/evo/metric-registry/power.js` (`evals/decisions/E173/power.json`).
