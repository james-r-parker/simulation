# E206 - E-TL-2: the learnability check on the ladder (training-loop T11)

Status: running. The per-stage table is added when the check ends.

Prediction (written before the run): every gate drill of every rung through `hunt-mid` (`food-ahead`, `food-behind`, `prey-adrift`, `prey-weak`, `prey-mid`) is learnable; `hunt` is not (`prey-ahead` at 0.5 of the reference's win share), which says the next lever is a sim rule ([training-stages.md](../../../docs/designs/training-stages.md) T62), not a ladder change.

Run: `npm run train:feasible -- --curriculum evals/train-ladder.json --workers 4 --out evals/train-screens/results/feasible-ladder.json` at the default sizes (8 populations, 200 generations, 64 brains, 4 trials).
