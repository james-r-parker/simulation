# E207 - E-TL-3: adaptive difficulty against the fixed ladder (training-loop T16)

Status: running. The yield table and verdict are added when the screen ends.

Prediction (written before the run): `better` on `train:compare` score, adaptive against fixed, with the adaptive arm passing `hunt` on at least 1 of 16 offsets. Falsified on `no verdict` or `worse`.

Run: `npm run train:screen -- --grid evals/train-screens/adaptive.grid.json --runs /home/j1mb0jay/code/simulation/.sim/train-screens/adaptive` (2 arms x 16 offsets = 32 runs).
