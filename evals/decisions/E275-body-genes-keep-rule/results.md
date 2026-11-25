# E275 - body-genes E-BG-3: the keep-rule screen and the step 5 adoption read

64 matched seeds of 200000 ticks per arm on the live policy, read with `eval:compare --keep-rule`.

## Each block against `control` (`evals/screens/body-genes-keep-rule.grid.json`)

`control` is the step5-b base plus the defender shove, every span and effect number at 0.

| Arm          | Keys                                                                     | Keep rule | Moved (95% interval off zero)                                                                                                                                |
| ------------ | ------------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `fat-only`   | the `step5-d` spans, `fatSlow`, `sizeTurn`, `burnThrust` 1               | **WORSE** | `eval.hunter_catches_per_1k` 1.35 to 1.188 (-12.0%, [-0.278, -0.052]), settled -10.9%; `eval.trait_spread` -42.6%; median lifespan +5.7%, fed lifespan +7.3% |
| `first-meal` | `entrantEnergy` 700, `coldStackRate` 0.5                                 | no harm   | cold stress share -88.9%, births +15.3%, food energy +11.3%; median lifespan -18.3%, predator mean fitness -9.2%, lineages alive -9.0%                       |
| `social`     | `rallyThrust` 0.1, `rallyBurn` 4, `staggerThrust` 0.5, `staggerTicks` 30 | no harm   | median lifespan +5.8%, births -6.9%; `eval.effect_share.staggered` 0.00036, rallied 0 (a harm check only: no hunt calls fire)                                |

The spread leg: `eval.gene_sd.speed` reads 0.019 on `fat-only` (target above 0.05), and `eval.gene_edge_share` stays 0.

## The candidates against `defaults` (`evals/screens/step5-adoption.grid.json`)

`defaults` is what `main` runs today (an empty base).

| Arm       | What                                                                                               | Keep rule | Moved                                                                                                                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `step5-d` | the whole candidate                                                                                | no harm   | cold stress -84.5%, collision deaths -17.9%; median lifespan -7.3%, plant-eater mean fitness -6 to -9%, pursuit kill share -6.5%, trait spread -24.1%                                                     |
| `step5-e` | `step5-d` without the `fat-only` block (T18b: spans at 0, `fatSlow`, `sizeTurn`, `burnThrust` off) | no harm   | cold stress -85.4%, collision deaths -14.9%, births +7.0%, merit mate gain +13.0%; hunter catches -3.8% (no-difference); median lifespan -9.6%, plant-eater mean fitness -9 to -14%, lineages alive -9.4% |

## Reading

`fat-only` fails its guard on hunter catches: the trait menu with its costs makes hunters catch less in the step5-b world,
which is the scene fair-chase.md serves. By T18b its spans stay at 0 (the registry, lanes and inheritance stay). The
T14b heat and sense costs scale a trait above ratio 1, so with the spans at 0 they act only through `sprintHeat`, and
`step5-e` keeps them. `step5-e` passes the keep rule against `defaults` and is what T18 adopts.

`role:budget --check` exits 0 on `evals/role-budget/step5-e.json`, every row's verdict the same as `step5-d.json`.
