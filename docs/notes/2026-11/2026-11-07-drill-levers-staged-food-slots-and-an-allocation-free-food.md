### 2026-11-07 - Drill levers: staged food slots and an allocation-free food count (training Phase 2)

Two drill-only changes (no live-sim code; `worldHash` and `golden.json` unchanged, golden test run): `STAGE_CONFIG` in
`js/evo/pool-discrimination-stage.js` gets `maxFood` 48 (`STAGE_MAX_FOOD`; it inherited 3600, so every tiny drill world walked
3600 food slots per tick in the hash build), and `aliveFoods` in `js/evo/drill-scenarios.js` (3.7% of a drill trial) became
`aliveFoodCount` and `onlyAliveFood`, which allocate nothing. Drill outcomes did not move: the table below is identical
before and after. `npm run drill` on four fresh smoke champions (4 generations, nursery) plus the references, wall time:

| Workers | Before | After   | Change |
| ------- | ------ | ------- | ------ |
| 2       | 8.71 s | 5.37 s  | -38%   |
| 4       | 5.40 s | not run | -      |
| 8       | 3.52 s | 2.26 s  | -36%   |

| Subject                   | food-ahead   | food-behind  | two-foods    | prey-ahead   | prey-too-big | hunter-closing | rock-refuge  | mean edge |
| ------------------------- | ------------ | ------------ | ------------ | ------------ | ------------ | -------------- | ------------ | --------- |
| archive-3-forager-cell5   | 1.00 (+0.84) | 1.00 (+0.82) | 0.00 (-0.11) | -            | -            | 0.13 (+0.13)   | 0.00 (+0.00) | +0.34     |
| archive-3-predator-cell15 | -            | -            | -            | 0.00 (+0.00) | 0.97 (-0.03) | -              | -            | -0.02     |
| reference memoryless      | 1.00 (+0.84) | 1.00 (+0.82) | 0.00 (-0.11) | 0.31 (+0.31) | 0.31 (-0.69) | 0.03 (+0.03)   | 0.00 (+0.00) | +0.17     |

- The elites of the earlier smoke table were refused (rules and descriptor hashes have moved since), so the table was
  re-made from a fresh 4-generation smoke run; the same champions fed both columns.
- `bench:micro --area drill --compare origin/main --runs 3` under the CPU lock (base 5f85ab5dc, head the two levers): one
  trial of each of the 7 drills 12.67 -> 16.10 ops/s, +27.0% (+-9.5%), so about 89 -> 113 trials per second per worker.
  The T12 training run (8 workers) was started while this queued, so the margin is wider than on a quiet machine.
