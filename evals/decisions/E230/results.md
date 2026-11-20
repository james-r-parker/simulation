# E230 - tuning night 2 (E-TL-6)

Prediction: nursery plateauStop 10 reads better on the tune offsets (nursery passes on at least 11 of 16 against 9; the 7 offsets that stall at nursery with best progress 0.67-0.83 get more checkpoints) and confirms on the held-out offsets; hunt-weak preyShare 1.0 reads no verdict.

Run: `E-TL-6` (`npm run train:tune -- --spec evals/train-tune.json --date 2026-11-20`). Results: `evals/train-tune/results/2026-11-20/`. Ladder hash `32041bc8`, screens until `hunt-mid`, 16 tune offsets.

## Outcome

| arm                    | change                          | tune verdict                                | pass shares (nursery / contact / weak / mid) | cpu            |
| ---------------------- | ------------------------------- | ------------------------------------------- | -------------------------------------------- | -------------- |
| base                   | none                            | -                                           | 56 / 56 / 25 / 19%                           | 18.2 h         |
| plateauStop-nursery-10 | `stages.nursery.plateauStop=10` | none, 16 of 16 tied                         | 56 / 56 / 25 / 19% (identical)               | +2%            |
| preyShare-hunt-weak-1  | `stages.hunt-weak.preyShare=1`  | none, 1 up 4 down 11 tied, mean diff -0.124 | hunt-weak 25 to 19%, hunt-mid 19 to 13%      | 38.9 h (+113%) |

- Nursery `plateauStop` 10: prediction falsified. Nursery has `maxGenerations` 40 and `plateauStop` 6 at `checkpointEvery` 5. With either raised alone the other still ends the stage at about 40 generations (E208's `maxGenerations` 80 arm also tied 16 of 16), so a stalled nursery gets the same budget.
- hunt-weak `preyShare` 1.0: prediction met (no verdict), but the arm is worse: cpu per hunt-weak pass 0.81 to 8.03 h. Not adopted.
- The one-change tuning lane cannot find a fix that needs two settings moved together.

## Outcome to task

- T22c: screen nursery `maxGenerations` 80 with `plateauStop` 0 together (E231).
- T22d: `proposeArms` gains bundled tunables so the lane can test such a change itself.
- The nursery tunables are removed from `evals/train-tune.json`.
