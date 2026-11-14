# E174 - patch stock pays for plant food (honest-budgets Phase 1, T3 to T5)

**Prediction (recorded before the run).** With `patchStockEnergy` on, a patch spends real energy on the items it
grows, so a crowded patch empties and per-capita intake falls with density. On the 16-seed screen
(`evals/screens/honest-food.grid.json`, seeds 1 to 16, 400000 ticks, floor on, policy live), at least one energy arm
reads, against `control`:

- `eval.density_starve_slope` median above 0 (control -0.46 on the E173 reference),
- `eval.patch_leave_depleted` higher,
- `eval.chance_food_energy_per_1k` below `eval.deliberate_food_energy_per_1k`.

The 1x arms (`foodPatchCapacity` 83000) lose `alive` or `held` seeds; the 2.5x arms keep them but move the slope
least. Falsified when every energy arm keeps the slope at or under 0.

**Arms.** Capacity per patch from the full-map maximum sustainable yield `0.25 x foodPatchRegrow x mean(patchRegrow)
1.119 x season mean of patchRegrowFactor 0.925 x foodPatchCapacity x 16`, against 173 energy a tick of plant intake
(blobs plus herds, mean of the E173 reference: `food_energy_per_1k x population_mean / (1 - herd_grazed_share)`):
1x 83000, 1.5x 125000, 2.5x 208000; each with `foodBackgroundShare` 0.05 and 0.02.

**Run:** `npm run screen -- --grid evals/screens/honest-food.grid.json` on branch `season/next` (T1 and T2), then the
finalist and the control on seeds 1 to 64 with `--keep-rule` (T5).

## Screen result (16 seeds, 400000 ticks)

**Verdict: falsified.** No energy arm moves the slope above 0. The tightest stock moves every target the predicted way, but
not far enough:

| Arm       | density_starve_slope p50 | seeds > 0 | seeds above control | patch_leave_depleted p50 | chance / deliberate food p50 | population_mean p50 | screen verdict |
| --------- | ------------------------ | --------- | ------------------- | ------------------------ | ---------------------------- | ------------------- | -------------- |
| `control` | -0.411                   | 0/16      | -                   | 0.371                    | 266 / 156                    | 305                 | PASS           |
| `y1-b5`   | -0.137                   | 1/16      | 10/16               | 0.401                    | 274 / 160                    | 218                 | PASS           |
| `y1-b2`   | -0.369                   | 2/16      | 11/16               | 0.367                    | 274 / 155                    | 297                 | PASS           |
| `y15-b5`  | -0.376                   | 2/16      | 9/16                | 0.389                    | 256 / 132                    | 331                 | FAIL (pop max) |
| `y15-b2`  | -0.644                   | 3/16      | 8/16                | 0.365                    | 273 / 140                    | 338                 | FAIL           |
| `y25-b5`  | -0.848                   | 1/16      | 7/16                | 0.343                    | 279 / 144                    | 374                 | FAIL (pop max) |
| `y25-b2`  | -0.906                   | 1/16      | 6/16                | 0.351                    | 271 / 151                    | 387                 | FAIL (pop max) |

- The slope falls with capacity: a larger stock no longer binds, and the population grows to the cap instead.
- Chance food stays above deliberate food on every seed of every arm (0/16). Paying for spawns does not make food
  local by itself. The background share (0.05 against 0.02) changes neither.
- No arm harms the keep-rule guards on the screen. `y1-b2` is the finalist: it passes, keeps the population
  (16/16 above the minimum) and puts the slope above control on 11 of 16 seeds.

**Next.** The patch stock is a realistic mechanism (energy is conserved), so it is kept if the keep rule finds no
harm: `y1-b2` on seeds 1 to 64 against the E173 reference (`evals/decisions/E173/reference.report.json`, same seeds,
ticks and policy; with the flag off every world hash is unchanged), `--keep-rule`.
