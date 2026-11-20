# E231 - nursery with both limits lifted (E-TL-7)

Prediction: nursery passes on at least 11 of 16 offsets against 9 and the screen reads better; falsified if the stalled offsets still stall (then nursery is a skill limit, not a budget limit).

Run: `E-TL-7` (`npm run train:screen -- --grid evals/train-screens/nursery-both.grid.json`), arm `nursery-80-nostop` (`maxGenerations` 80, `plateauStop` 0 together) against `base`, offsets 0 to 120 by 8, until `hunt-mid`. Results: `evals/train-screens/results/nursery-both/` (`table.md`, `yield.json`, `verdicts.json`).

## Outcome

Prediction falsified. 1 up, 0 down, 15 tied; mean score difference +0.08 [0, 0.239]; sign test p 1.0; no verdict.

| stage        | base pass | arm pass | cpu h / pass (base to arm) |
| ------------ | --------- | -------- | -------------------------- |
| nursery      | 56%       | 63%      | 1.35 to 1.73               |
| hunt-contact | 56%       | 63%      | 0.13 to 0.13               |
| hunt-weak    | 25%       | 25%      | 0.79 to 0.87               |
| hunt-mid     | 19%       | 19%      | 0.41 to 0.41               |

Passed last stage 3 to 3; cpu 17.6 to 23.3 h (+32%). The only mover is offset 32 (nursery now passes, score 0.723 to 2.0).

## Which drill fails

Gate readings (`curve.jsonl` gate rows, nursery condition `drill.food-ahead.edgeLow` and `drill.food-behind.edgeLow`, each min 0.3) of the 7 base offsets that stall at nursery (8, 24, 32, 40, 56, 72, 96):

| reading                            | count of 7 | best edgeLow over the run                    |
| ---------------------------------- | ---------- | -------------------------------------------- |
| food-behind fails at the last gate | 7          | 0.07, -0.14, 0.18, 0.18, 0.26, 0.52, 0.26    |
| food-ahead fails at the last gate  | 1 (o24)    | -0.29 (the other 6 reach 0.658 at some gate) |

So the stall is the food-behind skill (turning to food behind the body). Offset 72 touched 0.52 once but did not hold it with food-ahead at the same gate. With 80 generations and no plateau stop the 6 offsets that still stall show the same best readings as at 40 generations, so extra generations add nothing.

## Outcome to task

- T22e: the nursery stall is a skill limit on food-behind: a curriculum rung or a brain change, not a longer stage; `plateauStop` 6 and `maxGenerations` 40 stay.
