# E231 - nursery with both limits lifted (E-TL-7)

Prediction: nursery passes on at least 11 of 16 offsets against 9 and the screen reads better; falsified if the stalled offsets still stall (then nursery is a skill limit, not a budget limit).

Run: `E-TL-7` (`npm run train:screen -- --grid evals/train-screens/nursery-both.grid.json`), arm `nursery-80-nostop` (`maxGenerations` 80, `plateauStop` 0 together) against `base`, offsets 0 to 120 by 8, until `hunt-mid`.

Outcome: pending (run `E-TL-7` in flight).
