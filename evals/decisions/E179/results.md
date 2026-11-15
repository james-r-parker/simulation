# E179 - predator recruitment and juvenile survival (honest-budgets Phase 6, T34 to T36)

**Prediction (recorded before the run).** Capping the immediate kill gorge (`killGorgeShare` 0.4) leaves real carcasses
for juveniles and scavengers; relaxing `territoryMax`/`territoryRadius`, raising `predator.splitMinEnergyMultiplier`
to 0.85, and blocking `canHunt`-crossing `specMutationRate` flips (`specFlipNoHunt`) lets surviving hunters breed
together and fund viable cubs; and adding either `juvenilePlantShare` (0.25) or higher `huntSizeRatio` (0.9) lets
juveniles survive to adulthood. On the 16-seed screen (`evals/screens/honest-recruit.grid.json`, seeds 1 to 16,
400000 ticks, floor on, policy live), the finalist (`cub-plant`, `cub-size`, or `recruit`) lowers
`eval.hunter_juvenile_death_share` below 0.55 while keeping `eval.hunter_catches_per_1k` and
`eval.hunter_income_share.carcass` alive, and on 64 matched seeds `keepRule` reads no guard `WORSE`. Falsified when
every arm reads `eval.hunter_catches_per_1k` or `held` `WORSE`.

**Arms.** `control` is `killGorgeShare` 1 (today's rules; its worlds are the season's exactly). `gorge` is
`killGorgeShare` 0.4. `recruit` adds `territoryMax` 4, `territoryRadius` 250, `predator.splitMinEnergyMultiplier` 0.85,
and `specFlipNoHunt` true. `cub-plant` adds `juvenilePlantShare` 0.25. `cub-size` adds `huntSizeRatio` 0.9.

**Run:** `npm run screen -- --grid evals/screens/honest-recruit.grid.json` on branch `feat/honest-budgets-t34-recruit`
(T35), then the finalist and the control on seeds 1 to 64 with `--keep-rule` (T36).
