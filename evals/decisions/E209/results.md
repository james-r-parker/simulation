# E209 - episodes 48 on the held-out offsets (E-TL-5)

Prediction: episodes 48 reads better on the held-out offsets (sign test p < 0.05, interval excludes 0) and doubles hunt-mid passes again; falsified on no verdict or worse.

Run: `E-TL-5` (`npm run train:screen -- --grid evals/train-screens/episodes48-holdout.grid.json`), offsets 128 to 248 by 8, until `hunt-mid`. Results: `evals/train-screens/results/episodes48-holdout/`.

Outcome: prediction falsified (effect no-difference).

| Measure               | base | episodes 48 |
| --------------------- | ---- | ----------- |
| nursery passed        | 81%  | 75%         |
| hunt-contact passed   | 81%  | 75%         |
| hunt-weak passed      | 56%  | 63%         |
| hunt-mid passed       | 31%  | 44%         |
| passed the last stage | 5/16 | 7/16        |
| cpu hours             | 20.1 | 25.9 (+29%) |

- Matched 16 offsets: 8 up, 6 down, 2 tied; mean score difference +0.136 [-0.967, 1.107]; sign test p 0.79; no verdict.
- Across E208 and E209 the hunt-mid pass share rose both times (19 to 38, 31 to 44) but the score reads no verdict on either set.
- Held-out base passes nursery on 81% against 56% on the tune offsets: offset luck is large.

Decision: episodes 48 is not adopted. It costs about 30% more CPU and the gain is not separable from noise.
