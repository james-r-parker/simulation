# E208 - first tuning night (E-TL-4)

Prediction: nursery `maxGenerations` 80 reads `better` on the 16 tune offsets (nursery passing on at least 12 of 16 against 9) and confirms `better` on the 16 held-out offsets; `episodes` 48 reads `no verdict`. Falsified when the nursery arm reads `no verdict` or `worse` on the tune offsets.

Run: `E-TL-4` (`npm run train:tune -- --spec evals/train-tune.json`), ladder hash `32041bc8`, 16 tune offsets (0 to 120 by 8), screens until `hunt-mid`. Results: `evals/train-tune/results/2026-11-19/` (`summary.md`, `result.json`, `tune/table.md`, `tune/yield.json`, `tune/verdicts.json`).

## Outcome

| arm                       | matched          | mean score diff | sign p | verdict    | nursery | hunt-contact | hunt-weak | hunt-mid | cpu h |
| ------------------------- | ---------------- | --------------- | ------ | ---------- | ------- | ------------ | --------- | -------- | ----- |
| base                      | -                | -               | -      | -          | 56%     | 56%          | 25%       | 19%      | 18.2  |
| maxGenerations-nursery-80 | 0 up, 16 tied    | 0.000           | 1.0    | no verdict | 56%     | 56%          | 25%       | 19%      | 18.9  |
| episodes-48               | 11 up, 4 down, 1 | +0.57           | 0.118  | no verdict | 69%     | 69%          | 44%       | 38%      | 24.9  |

- **Prediction falsified for the nursery arm.** All 16 runs are identical to base (same scores, same pass shares). The plateau stop ends nursery before generation 40, so a larger `maxGenerations` never binds; the extra 0.7 cpu hours is run-to-run timing noise in the same work. The reading is that nursery stalls by plateau, not by the generation cap.
- **Prediction met for `episodes` 48** (no verdict): the interval [-0.47, 1.49] includes 0 and the sign test is 0.118. The pass shares nearly double on the hunt stages (hunt-weak 25 -> 44%, hunt-mid 19 -> 38%) at +37% cpu; cpu per hunt-mid pass falls 0.43 -> 0.37 h. A real effect is plausible but 16 offsets cannot show it.
- Learnability flagged `hunt-weak` and `hunt-mid` as unlearnable from scratch on all three arms, as E206.

## Outcome to task

- T22a: confirm `episodes` 48 on the 16 held-out offsets 128 to 248 (E209).
- T22b: nursery `plateauStop` 10 or 0 as the next nursery arm; `maxGenerations` does not bind while the plateau stop ends nursery first.
