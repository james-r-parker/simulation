# E161 - the eat-choice bundle with a gentler strike cost

Seeds 1 to 64 x 400000 ticks, floor on, policy live. Grid `evals/screens/eat-choice-bundle.grid.json`; read against
`evals/decisions/E160/main-defaults.report.json` (main's defaults on the same seeds).

| arm           | lowest pop p50 | floor eps | floor birth share | food-contact bite | full-contact bite | fat speed ratio | bite idle | pop mean |
| ------------- | -------------- | --------- | ----------------- | ----------------- | ----------------- | --------------- | --------- | -------- |
| main-defaults | 8.00           | 4.64      | 0.02              | 0.50              | 0.51              | 1.32            | 0.73      | 194      |
| gf-strike-1   | 8.00           | 4.36      | 0.03              | 0.14              | 0.20              | 0.95            | 0.71      | 198      |
| gf-strike-05  | 8.00           | 5.34      | 0.04              | 0.14              | 0.19              | 0.96            | 0.72      | 154      |
| gf3-strike-1  | 8.00           | 4.34      | 0.03              | 0.18              | 0.23              | 1.07            | 0.72      | 193      |

| Arm                                        | Keep rule | held            | alive                         | under80                      | Hunter catches/1k | Hunter median life |
| ------------------------------------------ | --------- | --------------- | ----------------------------- | ---------------------------- | ----------------- | ------------------ |
| gf-strike-1 (graze 0.5, fat 0.5, strike 1) | no harm   | 4 vs 4, p 1     | 17 vs 11, p 0.35 (detects 24) | **better**, 7 vs 22, p 0.008 | +91%              | 3683 to 2359       |
| gf-strike-05 (strike 0.5)                  | WORSE     | 6 vs 0, p 0.031 | 18 vs 8, p 0.076              | 11 vs 14                     | +53%              | 3683 to 2899       |
| gf3-strike-1 (fat 0.3)                     | no harm   | 5 vs 0, p 0.063 | 19 vs 8, p 0.052              | **better**, 7 vs 21, p 0.013 | +122%             | 3683 to 2278       |

Prediction: holds for `gf-strike-1` and `gf3-strike-1`.

Reading:

- `gf-strike-1` is the bundle that lands (G1, G1b `grazeThrust` 0.5, G2 `fatSlowShare` 0.5, G3, G4 `strikeMissCost` 1).
  It pays back what G1 cost. Population mean is level with main, more seeds stay above 80, full foragers bite less
  (`eval.full_contact_bite_share` 0.51 to 0.20), and fat agents are no longer faster (`eval.fat_speed_ratio` 1.32 to 0.95).
- Caveat: the hunters-alive guard sees only a 24-seed loss at this size, more than a quarter of the seeds, so it has not
  shown no harm. The point estimate is 38/64 against main's 47/64, and hunters live shorter lives. The switch's paired
  check on seeds 65 to 128 (T16) must read the alive guard; pooled with these seeds it reaches 128.
- Food eaten falls 26% (less energy bitten deliberately) while the fed median life rises: foragers eat less and live as long.
