### 2026-10-29 - Archive round (fitness-and-selection T46, E40)

`E40` is the archive round screen: `evals/screens/fitness-archive.grid.json`, policy `map-elites-v6` on the round B winner (`meritEnabled`, `splitDeliberateMin` 300), 4 seeds at offset 28, 200000 ticks, 9 arms, `--workers 30`. Reports, `table.md` and `verdicts.json` are in `evals/screens/results/fitness-archive/`. A screen, not a verdict. `split-300` is the reference (it reproduces E39 exactly) and `merit-only` the second reference. Defaults: `immigrationInterval` 600 (a config key; 0 is off), `archiveShare` 0.5, `cloneShareEnd` 0.8 (0.3 clones, 0.2 random), descriptor `v6`. Values sit on both sides of each default.

| Arm             | births/1k | delib share | skill_trend | mating | lineages | diversity | child surv | spec dom | pop | pred births | births vs ref | share vs ref |
| --------------- | --------- | ----------- | ----------- | ------ | -------- | --------- | ---------- | -------- | --- | ----------- | ------------- | ------------ |
| `merit-only`    | 0.084     | 0.118       | -0.075      | 0.155  | 22.8     | 0.23      | 0.946      | 0.49     | 390 | 36          | -6%           | -12%         |
| `split-300`     | 0.089     | 0.134       | +0.012      | 0.147  | 19.9     | 0.21      | 0.943      | 0.70     | 349 | 249         | +0%           | +0%          |
| `imm-300`       | 0.076     | 0.128       | -0.049      | 0.105  | 37.3     | 0.21      | 0.951      | 0.78     | 355 | 18          | -14%          | -4%          |
| `imm-1800`      | 0.160     | 0.133       | -0.063      | 0.124  | 12.3     | 0.22      | 0.942      | 0.57     | 210 | 62          | +79%          | -1%          |
| `share-0.25`    | 0.101     | 0.122       | -0.038      | 0.132  | 20.8     | 0.22      | 0.943      | 0.84     | 299 | 50          | +13%          | -9%          |
| `share-0.75`    | 0.077     | 0.111       | -0.081      | 0.126  | 20.3     | 0.23      | 0.952      | 0.80     | 349 | 22          | -14%          | -18%         |
| `cloneend-0.6`  | 0.113     | 0.130       | -0.028      | 0.127  | 19.0     | 0.22      | 0.939      | 0.85     | 270 | 46          | +27%          | -3%          |
| `cloneend-0.95` | 0.096     | 0.124       | +0.020      | 0.122  | 22.3     | 0.22      | 0.926      | 0.75     | 352 | 930         | +7%           | -7%          |
| `descriptor-v1` | 0.132     | 0.128       | +0.012      | 0.115  | 18.9     | 0.22      | 0.931      | 0.61     | 249 | 753         | +47%          | -4%          |

Means over the 4 seeds; "vs ref" is against `split-300`.

- **Nothing beats `split-300` on share.** Every archive arm has a share at or below it (-1% to -18%); with 4 seeds, differences under about 10% are noise, so only `share-0.75` (-18%, `skill_trend` -0.081, births -14%) is clearly a step back. Lowering `archiveShare` to 0.25 gives births +13% and spec dom 0.84.
- **`immigrationInterval` moves the world, not the skill.** `imm-300` doubles lineages (37.3) but lowers mating (0.105) and `skill_trend` (-0.049); `imm-1800` halves the pool (lineages 12.3, population 210) and lifts births +79% at share 0.133 and `skill_trend` -0.063.
- **`cloneShareEnd` 0.95** (0.45 clones, 0.05 random) is the only arm keeping the positive trend (`skill_trend` +0.020, lineages 22.3, births +7%), at share -7%; `predator_births` jumps to 930. **`cloneShareEnd` 0.6** (more random blood) gives births +27% and lower population (270) with `skill_trend` -0.028.
- **`descriptor-v1`** keeps `skill_trend` +0.012 and share -4% against descriptor v6, with births +47%, but population 249, mating 0.115 and `predator_births` 753. So v6 is not clearly better for skill at 4 seeds; v1 trades mating and population for births.
- Every arm fails the mating (>= 0.2) scorecard row, as `split-300` does (0.147); `child_survival` is 0.93 to 0.95 everywhere; no collapse (population above `minAgents` on 4 of 4).
- Predictions: right that nothing collapses and that immigration moves share under 10%; wrong that `share-0.75` helps (it hurt, -18%) and that `descriptor-v1` loses share (-4%, noise).
