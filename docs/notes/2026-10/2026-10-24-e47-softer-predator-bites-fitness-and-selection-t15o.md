### 2026-10-24 - E47 softer predator bites (fitness-and-selection T15o)

- **Prediction** (`evals/experiments/E47-prediction.md`, written before the run): catch rate falls roughly in proportion to bite size (bite 10 about 0.08, bite 8 about 0.06, both `better`); predator births fall to about 60 (bite 10) and 45 (bite 8) per seed, both `better`; fed median lifespan on seeds 17-32 recovers to about -5% (bite 10) and -3% (bite 8), both no-difference. Expected pick: bite 10 if it clears fed lifespan on both sets, else bite 8.
- **Run:** live policy, seeds 1-32, 200000 ticks, main f047245, the predator `biteMultiplier` the only lever over the defaults (12). Reports: `evals/experiments/E47-bite8-report.json`, `E47-bite10-report.json`; splits in `evals/experiments/E47-bite{8,10}-seeds{1-16,17-32}.json`. Each set is compared with the E36 reference split of the same seeds.
- **Table** (`eval:compare`, verdict per seed set 1-16 / 17-32; means in brackets):

| Arm     | catch_rate                      | predator_births            | fed_median_lifespan                         |
| ------- | ------------------------------- | -------------------------- | ------------------------------------------- |
| bite 10 | better / better (0.080 / 0.066) | better / better (230 / 66) | no-difference / worse, -8.5% (5673 / 5656)  |
| bite 8  | better / better (0.060 / 0.051) | better / better (127 / 40) | no-difference / no-difference (5743 / 5760) |

The E36 reference is 0.006 / 0.005 catch rate, 3.6 / 5.2 predator births and 5802 / 6180 fed lifespan. Population is 390 / 378 for bite 8 (the x12 fix is 373 / 368).

- **Result:** the prediction's catch and birth falls were right, and both arms stayed `better`. The fed-lifespan recovery failed for bite 10 (predicted about -5%, no-difference; it was -8.5% and worse on seeds 17-32), so the expected pick does not hold. Bite 8 is the softest arm that keeps catch rate and births `better` with fed lifespan not worse on either set, and it becomes the default (T15o).
- **Births of 30 or more per seed:** bite 8 has 7 of 16 on each set (the x12 fix had 10 and 11 of 16). The E36 bar of 12 of 16 is still missed, and the births criterion stays with Phase 4.
- **Golden hashes, old to new** (`test/sim/golden.json`, and the busy effect constants in `test/worker/sim-host.slow.test.js`): `cases` default `5d6bdc130c1bef61` to `7a7accb9ab2944be`; `cases` busy `0cbaa2a6b8ddf9b3` to `3cc3b8cda813eeca`; `shortCases` default `897120be022ee74d` unchanged (300 ticks, too short for the change to reach that hash); `shortCases` busy `8616e7e60b016f2b` to `f65f58c06b08c4e0`. The busy effect stream moves from `680983d656117e86` and 1828 records to `dd77d19ae7805ad7` and 2558 records, with no dropped records. `runGolden` and `driveGolden` agree, and `npm run browser:hash` matches both golden cases in Chromium 156.
