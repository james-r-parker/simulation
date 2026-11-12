# E163 - the graze-hold re-read (eat-choice T19)

**Prediction (recorded before the run):** on seeds 65 to 128 at 400000 ticks, the head with the graze hold (eat-choice
T18) reads `eval.deliberate_food_share` not worse than `evals/decisions/E162/main.report.json` (0.43), and the keep rule
still reads no guard `WORSE`. Falsified when `deliberate_food_share` reads worse against main.

**Run:** `npm run eval -- --seeds 64 --seed-offset 64 --ticks 400000 --policy live --out evals/decisions/E163/head.report.json`

Results follow when the run ends.
