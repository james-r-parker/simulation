# E205 - E-TL-1: plateauStop on the ladder (training-loop T8)

Status: running. The yield table and CPU hours are added when the screen ends.

Prediction (written before the run): equal pass shares per stage; `no verdict` on `train:compare` score; at least 30% fewer CPU hours in the `stop` arm.

Run: `npm run train:screen -- --grid evals/train-screens/plateau.grid.json` (2 arms x 16 offsets = 32 runs).
