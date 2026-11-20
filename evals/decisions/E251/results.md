# E251 (E-TL-3a) - Adaptive difficulty retest (`from: 0`, `target: 0.15`)

- **Command:** `scripts/run-detached.sh E-TL-3a --frozen -- npm run train:screen -- --grid evals/train-screens/adaptive.grid.json --runs /home/j1mb0jay/code/simulation/.sim/train-screens/adaptive-t16a`
- **Ladder:** `evals/train-ladder-adaptive.json` (`adapt: { param: 'preySprint', drill: 'prey-ahead', from: 0, to: 1, step: 0.05, target: 0.15 }`)
- **Outcome:** Exit code 1 (`9 training run(s) failed`).
    - **Fixed arm (16/16 completed):** nursery 56% (9/16), hunt-contact 56% (9/16), hunt-weak 25% (4/16), hunt-mid 19% (3/16), hunt 0%, mean score 1.85, cpu 21.5 h.
    - **Adaptive arm (7/16 completed, 9/16 failed):** The 7 offsets that stalled at nursery (`8, 24, 32, 40, 56, 72, 96`) finished identically to `fixed` (0%, mean score 0.65, cpu 8.0 h). All 9 offsets that passed `nursery` and `hunt-contact` (`0, 16, 48, 64, 80, 88, 104, 112, 120`) crashed on entering `hunt` with:
      `Error: config.specialisations.forager.sprintBoost is 0; expected a finite number > 0`
    - **Root cause:** `validateAdapt` in `js/evo/adaptive-difficulty.js` permits `from >= 0`, and `withPreySprint` sets `specialisations.{forager,reproducer,scout,defender}.sprintBoost` to `preySprint`, but `js/sim/config-validate.js` (and `test/sim/config-validate.test.js`) requires `sprintBoost > 0`.
    - **Prediction:** Falsified / blocked by config validation (`from: 0` is invalid for `sprintBoost`; `hunt` passed 0/16 in both arms).
    - **Next:** Either delete the adaptive path in T17, or retest with a positive `from` (e.g. `0.01` or `0.05`) if `T16a` is meant to run with nonzero `sprintBoost`.
