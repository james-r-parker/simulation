# E255 (E-FC-2) - prey-ahead learnable under courser

fair-chase.md Step 2 (T7). The prediction (courser makes prey-ahead learnable on 2 to 4 of 8 populations) was committed in
`evals/experiments.json` before any run. **Verdict: falsified. Under courser prey-ahead is 1 of 8 (best 0.125 against a bar of
0.109), and the drills below it get worse, not better.**

## Two readings, and why the first is not a courser reading

1. `npm run train:feasible -- --curriculum evals/train-ladder.json --until hunt --workers 16` and the same on
   `evals/train-screens/stages/fair-chase-ladder.json` (run `fc2-feasible`). The two outputs are identical per stage
   (`.sim/fc2/feasible-base.json`, `.sim/fc2/feasible-courser.json`). The check ran every drill under the default config
   (`DRILL_CONFIG = {}` in `scripts/lib/feasible-run.mjs`) and read the stage's config for the fair band only, so the courser
   ladder never turned the store on in a drill. This stays so until the drill fix (PR 571, into `season/next`). The shared
   numbers are the "default config" column.
2. A one-off script (`scripts/fc2-courser-drills.mjs`, not committed; runs `fc2-courser-drills`, killed by a restart after two
   drills, and `fc2-courser-drills-2`) that calls `learnLesson` for each gate drill of the hunt rungs with
   `evals/fair-chase/courser.json` (`sprintStoreEnabled`, `sprintDrain` 0.01, predator `sprintDrainMultiplier` 0.5) as the
   drill config, the check's sizes (8 populations, 200 generations, 64 brains, 4 trials), and the bar recomputed with
   `baselineShares` under the same config. Those are the "courser config" column.

## Per drill (populations reaching the bar of 8, best final win share, bar)

| Rung         | Drill         | Default config   | Courser config    |
| ------------ | ------------- | ---------------- | ----------------- |
| nursery      | food-ahead    | 8/8, 1.00, 0.46  | not run           |
| nursery      | food-behind   | 8/8, 1.00, 0.43  | not run           |
| hunt-contact | prey-adrift   | 8/8, 1.00, 0.001 | 8/8, 1.00, 0.001  |
| hunt-weak    | prey-weak     | 3/8, 0.88, 0.001 | 2/8, 0.25, 0.001  |
| hunt-mid     | prey-mid      | 1/8, 0.56, 0.001 | 0/8, 0.00, 0.001  |
| hunt         | prey-ahead    | 0/8, 0.03, 0.109 | 1/8, 0.125, 0.109 |
| hunt         | prey-crossing | 2/8, 0.81, 0.001 | 0/8, 0.00, 0.001  |
| hunt         | kin-spared    | 0/8, 0.00, 0.001 | 0/8, 0.00, 0.001  |

Learnable means at least 2 of 8 populations at the bar. Under courser prey-ahead, prey-mid, prey-crossing and kin-spared are
not learnable; prey-weak is. prey-ahead moved from 0/8 to 1/8 (best 0.03 to 0.125): short of the 2 needed.

prey-crossing fell from best 0.81 to exactly 0 on all eight populations, and prey-weak lost most of its best share. A
diagnosis of that collapse (the hunter's store and speed on the drills) follows before any further run.

## Diagnosis of the prey-crossing collapse: the store working as specified, not a bug

Traces of the drill under the courser config (scratch scripts, not committed; `playTrial` with `onTick`, seed 1):

- The store is on in a drill trial (`sprintStore` present, level 0.99 at tick 0 for the subject and the prey, so full at the start), a
  scripted chaser (`oracleSubject`) wins `prey-crossing` 0.484 under both configs (and 0.328, 0.781, 0.641, 1.0 on
  `prey-ahead`, `prey-weak`, `prey-mid`, `prey-adrift`; the memoryless reference is equally unchanged): its chases end before
  the hunter's store reaches the floor (store 0.79 at tick 40). A drain of 0.0001 leaves a learning curve identical to off;
  a drain of 0.01 keeps `prey-crossing` at exactly 0 from generation 1.
- The brains that win in the default config win late. Generation 1 of seed 1 has 4 of 64 brains winning under off and 0 under
  courser, with identical trajectories up to the win. The first such brain closes a gap of 380 on a crossing prey at about
  6.2 against the prey's 5.4, and bites at tick 275 or later. With the store the same brain reaches the floor (0.3) at tick
  140 (store drain 0.005 per tick: sprint drain 0.01 x predator multiplier 0.5, from 0.99), its sprint factor falls to 0.03 by
  tick 200 and its speed to 4.3, then 3.2, below the prey's 5.3; the gap grows from 317 to 485.
- The prey never spends a store in that chase: its store stays at 0.84 because the evader sprints only with the pursuer within
  3 x `JINK_RANGE` (360), and the gap stays above it. It cruises at 5.3, unboosted.
- Any `SPRINT` output above 0 drains at the full rate (the boost is the same size at 0.01 as at 1), so a brain with a small
  constant sprint output pays 140 ticks of burst and refills nothing (a refill needs `SPRINT` at or under 0 and
  `THRUST` under `sprintRestThrust`).

So the 140-tick courser burst is shorter than the 300-tick tail chases by which random brains win today; the learned drills
need a catch inside the burst, or a brain that rations `SPRINT`. No sim code was changed.
