### 2026-11-08 - Carrion split: hunters eat carcasses, but the zero-kill lives do not live on them (training T28)

- **Run:** `npm run replay -- --seed <n> --ticks 200000 --level debug --policy map-elites-v6` on seeds 1 to 16 (floor on, defaults, `main` at `e090f95e`), then `node scripts/hunter-income.mjs` on each log. The first pass ran without `--policy` and so on `baseline-v5`; it is discarded.

| Share of hunter income (kill + bite + carcass) | Median over 16 seeds | Range        |
| ---------------------------------------------- | -------------------- | ------------ |
| kill                                           | 0.12                 | 0.09 to 0.16 |
| bite                                           | 0.41                 | 0.37 to 0.54 |
| carcass                                        | 0.46                 | 0.37 to 0.50 |
| carcass energy eaten by zero-kill lives        | 0.13                 | 0.07 to 0.23 |
| zero-kill lives over all hunter lives          | 0.55                 | 0.46 to 0.76 |

- **Carcass plus herd above 0.5:** not decided. `splitHunterIncome` reads `HunterLedger`, which has no herd field, and the E140 report with `eval.hunter_income_share.herd` is gone. Carcass alone is 0.46, so any herd share near 0.05 crosses 0.5.
- **A third of carcass energy to zero-kill lives:** no, 0.13 (no seed above 0.23). The carcasses are eaten mostly by hunters that also kill. Theory (1b), hunters that live on carrion without killing, is not supported, so no new record opens for it.
- **Caveat:** the ledger's kill count misses about 1 killing life in 10 (metric-trust.md, "One kill"), which counts some killers as zero-kill and raises the 0.13. The true share is lower, so the reading holds.
  ||||||| parent of 3e3bb2f9 (docs(world-balance): the old mating screens re-read by the summer minimum (T98))
