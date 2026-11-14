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

Results follow when the run ends.
