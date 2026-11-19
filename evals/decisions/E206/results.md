# E206 - E-TL-2: the learnability check on the ladder (training-loop T11)

Status: done. The prediction was half right: `hunt` is unlearnable as predicted, but `hunt-mid` is too, and `kin-spared` (which the prediction did not name) is.

Prediction (written before the run): every gate drill of every rung through `hunt-mid` (`food-ahead`, `food-behind`, `prey-adrift`, `prey-weak`, `prey-mid`) is learnable; `hunt` is not (`prey-ahead` at 0.5 of the reference's win share), which says the next lever is a sim rule ([training-stages.md](../../../docs/designs/training-stages.md) T62), not a ladder change.

Run: `scripts/run-detached.sh E-TL-2 --frozen -- npm run train:feasible -- --curriculum evals/train-ladder.json --workers 4 --out evals/train-screens/results/feasible-ladder.json` at the default sizes (8 populations, 200 generations, 64 brains, 4 trials). About 2 hours 20 minutes at 4 workers on a machine already loaded by the E-TL-1 screen. The report is `evals/train-screens/results/feasible-ladder.json`.

A drill is learnable when at least 2 of 8 populations of random brains, evolved directly on the drill, end at or above the bar the gate condition implies. The drills run under the trainer's gate drill config (the default config and the drill's own arena).

| Stage        | Drill          | Bar   | Populations at the bar | Best final share | Fair band (predator vs forager) | Learnable |
| ------------ | -------------- | ----- | ---------------------- | ---------------- | ------------------------------- | --------- |
| nursery      | food-ahead     | 0.456 | 8 of 8                 | 1.00             | -                               | yes       |
| nursery      | food-behind    | 0.425 | 8 of 8                 | 1.00             | -                               | yes       |
| hunt-contact | prey-adrift    | 0.001 | 8 of 8                 | 1.00             | 1 of 5 distances                | yes       |
| hunt-weak    | prey-weak      | 0.001 | 3 of 8                 | 0.88             | 4 of 5 distances                | yes       |
| hunt-mid     | prey-mid       | 0.001 | 1 of 8                 | 0.56             | 3 of 5 distances                | **no**    |
| hunt         | prey-ahead     | 0.109 | 0 of 8                 | 0.03             | 1 of 5 distances                | **no**    |
| hunt         | prey-crossing  | 0.001 | 2 of 8                 | 0.81             | 1 of 5 distances                | yes       |
| hunt         | kin-spared     | 0.001 | 0 of 8                 | 0.00             | -                               | **no**    |
| evade        | hunter-closing | 0.001 | 8 of 8                 | 0.97             | -                               | yes       |
| evade        | hunter-flank   | 0.001 | 8 of 8                 | 1.00             | -                               | yes       |

`arms-race` and `habitat` read cross-play and retention only, and `evade` also reads `crossplay.preyVsStage.hunt`: those readings are unchecked. Every fair band is non-empty, so the bodies leave a distance at which skill decides the chase, even at the full forager sprint.

## Reading

- `hunt` is unlearnable from random brains: `prey-ahead` reaches 0.03 at best against a bar of 0.109 (0.5 of the memoryless reference's win share). This is the prediction, and it points at a sim rule (training-stages.md T62), not a ladder change.
- `hunt-mid` is unlearnable too, at 1 of 8: not predicted. The ladder reaches it in practice (E-TS-1 runs passed `hunt-mid`), so the check is stricter than the trainer: the trainer's stages keep the previous stage's passers (`keepPasser`), and this check starts every population from random weights. Read a failure on a later rung as "not learnable from scratch", not "not learnable".
- `kin-spared` is at 0.00 in every population: the staged world never gives a win to a random brain, so the evolution has no gradient. It is a gate condition of `hunt` (`drill.kin-spared.edgeLow`), so the stage needs a scored win to start from.
- `prey-weak` (3 of 8) and `prey-crossing` (2 of 8) pass narrowly. The rungs between `prey-adrift` and `prey-ahead` are a steep ramp for a random brain.

Outcome to task: the next work is on `hunt`'s two unlearnable drills (`prey-ahead`, `kin-spared`), and on whether `hunt-mid` needs a nearer rung (`MID_SPRINT_BOOST` 0.3 against `WEAK_SPRINT_BOOST` 0.2), before the next ladder run.
