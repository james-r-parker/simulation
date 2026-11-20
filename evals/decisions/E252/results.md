# E252 - Leak-gene knockout matches brain-inspection silence (E-UK-0)

Prediction (`docs/designs/unit-knockout.md`, written before the run): on T2's commit (`302e85aa`), setting `leak[13]` or `leak[14]` to `KNOCKOUT_LEAK_GENE` (-8) on `archive-159-predator-cell94` (`prey-ahead`, seed 1, 128 trials) yields 24/128 and 25/128 with the same before-only and after-only trials as the 2026-11-19 `silence` rows in `docs/designs/sim-notes.md`.

Command: `npm run inspect -- --champions .sim/champions/keep/ets-1h-o144 --name archive-159-predator-cell94 --drill prey-ahead --trials 128 --edit <file>`

| Unit | Edit            | Intact | Edited |    Change | Before only | After only                                                          | McNemar p |
| ---: | --------------- | -----: | -----: | --------: | ----------- | ------------------------------------------------------------------- | --------: |
|  h13 | `leak[13] = -8` |  6/128 | 24/128 | +0.140625 | 113         | 1,2,21,22,39,47,48,61,69,76,78,79,88,89,100,111,117,119,123         |  0.000040 |
|  h14 | `leak[14] = -8` |  6/128 | 25/128 | +0.148438 | 11,86,113   | 4,7,9,12,15,18,22,27,32,39,46,67,68,79,80,85,92,102,104,107,114,125 |  0.000157 |

Outcome: **held** — identical to the 2026-11-19 `silence` rows trial for trial.
