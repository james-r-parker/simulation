### 2026-11-07 - Trainer smoke run and ticks per second (training T8 to T11)

A short run, not the Phase 2 done run (that needs about 40 x 32 x 60000 ticks): `npm run train -- --generations 6
--episodes 8 --ticks 30000 --offer-from 5000 --checkpoint-every 3 --curriculum evals/train-curriculum.json --workers 8`,
all six generations in the nursery stage. It took 3 minutes on 8 workers and the archive grew from nothing to coverage 0.106
(qd 628). Checkpoint at generation 6: mean drill edge +0.23, `eval.food_energy_per_1k` 289 (185 at generation 3),
`eval.catch_rate` 0.38. Exported with `train:export`, the five champions drilled as:

| Subject               | food-ahead   | food-behind  | two-foods    | prey-ahead   | prey-too-big | hunter-closing | rock-refuge  | mean edge |
| --------------------- | ------------ | ------------ | ------------ | ------------ | ------------ | -------------- | ------------ | --------- |
| smoke-forager-cell5   | 1.00 (+0.90) | 1.00 (+0.82) | 0.00 (-0.10) | -            | -            | 0.00 (+0.00)   | 0.00 (+0.00) | +0.32     |
| smoke-predator-cell25 | -            | -            | -            | 0.00 (+0.00) | 0.97 (-0.03) | -              | -            | -0.02     |
| reference memoryless  | 1.00 (+0.90) | 1.00 (+0.82) | 0.00 (-0.10) | 0.31 (+0.31) | 0.28 (-0.72) | 0.03 (+0.03)   | 0.00 (+0.00) | +0.18     |

- Six small generations already beat the random brain on both food drills by +0.82 to +0.90 and match the memoryless
  reference there; the predator wins none of `prey-ahead` (it never kills in the drill). `two-foods`, the hunter and refuge
  drills are not learned yet. The `defender`, `reproducer` and `scout` champions have no drill (the drills only stage
  foragers and predators).
- Default world, 100 agents: about 2 ms per tick per worker (3000 ticks in 5.5 s), so a 60000-tick episode is about 2
  minutes and one 32-episode generation about 8 minutes on 8 workers. Worker use per generation was only 25 to 41% in the
  smoke run: 8 episodes on 8 workers wait for the slowest world (nursery worlds go extinct and finish early). The doc's 32
  episodes keep the pool fuller.
- `evals/predator-world.json` no longer passes `createConfig` (`hashCellSize` 140 is below the largest radius 532.5 that
  `maxEnergy` 25000 gives); the hunt stage uses `evals/train-hunt-world.json`.
- The nursery (`evals/micro-world.json`) has no floor (`minAgents` 0): random brains go extinct before tick 12000 on some
  seeds, which ends those episodes early and offers few genomes. If the full run shows the nursery barely seeding the
  archive, a `minAgents` above 0 in the stage is the first thing to try.
- `npm run league` on a trained champion plays no games until the league has admitted champions, and prints Elo 1500.
