# E207 - E-TL-3: adaptive difficulty against the fixed ladder (training-loop T16)

Status: done. Falsified as configured: the adaptive difficulty never left its floor, so the adaptive arm did not train a harder world than hunt-contact's.

Prediction (written before the run): `better` on `train:compare` score, adaptive against fixed, with the adaptive arm passing `hunt` on at least 1 of 16 offsets. Falsified on `no verdict` or `worse`.

Run: `npm run train:screen -- --grid evals/train-screens/adaptive.grid.json --runs /home/j1mb0jay/code/simulation/.sim/train-screens/adaptive` (2 arms x 16 offsets = 32 runs, 200 generations in `hunt`). The screen trained all 32 runs and then crashed in its report (the arms' ladders differ, and the side-by-side stage table indexed one arm's stages by the other's). The fix is in the same PR; the report was rerun with every run reused (`TrainScreenRun` `reused: true` on 32 of 32). Tables: `evals/train-screens/results/adaptive/` (`table.md`, `yield.json`, `verdicts.json`).

## Result

The verdict is `incomparable`: the fixed ladder has five stages (nursery, hunt-contact, hunt-weak, hunt-mid, hunt) and the adaptive one three, and `score = reached + bestProgress` counts stages, so the two scores (1.85 and 1.41 mean) cannot be compared. Read by stage instead:

| Stage        | Fixed passed | Adaptive passed |
| ------------ | ------------ | --------------- |
| nursery      | 56% (9/16)   | 56% (9/16)      |
| hunt-contact | 56% (9/16)   | 56% (9/16)      |
| hunt-weak    | 25% (4/16)   | -               |
| hunt-mid     | 19% (3/16)   | -               |
| hunt         | 0% (0/16)    | 0% (0/16)       |

Passed the last stage within `until`: 0 of 16 in both arms. CPU hours 19.9 (fixed) and 42.6 (adaptive, 114% more).

- The adaptive difficulty never rose above 0.10 (`adapt.from`) on any run over 200 generations: the steering drill's win share stayed under the 0.5 target at every checkpoint. The adaptive arm entered `hunt` on 9 of 16 runs, by the shape of its ladder (it passes hunt-contact and goes straight to hunt); the fixed arm reached `hunt` on 3 of 16.
- Hunt was passed on 0 of 16 runs in both arms.
- The nursery stalls on the same 7 of 16 offsets in both arms (8, 24, 32, 40, 56, 72, 96; best progress 0.09 to 0.83), as in E205: the nursery is the next lever, not the hunt rungs.
- Hunt gate losses at full sprint were about 120 of 128 `never-in-jaws` trials: the hunters do not reach their prey.
- The steering read's win share was not on the curve unless the difficulty changed, so its size is not read here. The same PR adds `steerShare` to every curve row of an adaptive stage.

## Reading

The prediction fails on its second clause (0 of 16 passed `hunt`) and the first could not be read. The mechanism did not get a fair test: with `from` 0.10 and `target` 0.5 the world never got easier or harder than its floor, because the hunt-weak passers win only a few percent of the steering drill's trials, far below 0.5. A target of 0.5 is out of reach for this population, so the loop sat at its floor.

Outcome to task: T16a in [training-loop.md](../../../docs/designs/training-loop.md) retests adaptive with `from` 0, `target` 0.15 and the steering share logged; T17's deletion of the losing path waits for it. The nursery stall note is on T8a.
