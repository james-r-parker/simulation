# E173 - power of the feed-phase contact shares (eat-choice T27)

**Prediction (recorded before the run).** With contacts tallied in the feed phase (T27), every contact is counted, so
`eval.food_contact_bite_share` and `eval.full_contact_bite_share` vary less from seed to seed than the sampled shares of
E164 (detectable change 0.15 at 32 seeds). On a 64-seed reference of the season 10 defaults (seeds 1 to 64, 400000
ticks, floor on, policy live), `npm run eval:power` gives each a detectable change of at most 0.05 (`MAX_SHARE_MDE`) at
32 seeds, so both become `verified`. Falsified when either share's detectable change at 32 seeds is above 0.05.

**Run:** `npm run eval -- --seeds 64 --ticks 400000 --policy live --out evals/decisions/E173/reference.report.json`,
then `npm run eval:power -- evals/decisions/E173/reference.report.json` and `node scripts/metric-power-write.mjs --merge`.

Results follow when the run ends.
