# E177 - the edge breeds (honest-budgets Phase 4, T22 to T25)

**Prediction (recorded before the run).** With no clonal cap, a line with several splits behind it keeps splitting while
no mate is in reach, and the tick a mate is in reach the next birth has to be a mating, so edge prey are no longer
starved by a cap that closes the split gate. A split that gives the `childShare` gene's share (`splitGiftGene`) lets
selection act on the gene in splits as in matings, and `birthReserve` stops a birth that would leave the mother under 300. On the 16-seed screen (`evals/screens/honest-edge.grid.json`, seeds 1 to 16, 400000 ticks, floor on, policy live),
the finalist reads `eval.edge_starve_per_prey` not worse than `control`, and on 64 matched seeds `keepRule` reads `held`
not worse with no guard `WORSE`, and `eval.childshare_by_condition` above 0. Falsified (the branch is parked) when
`eval.edge_starve_per_prey` reads `WORSE` on every arm.

**Arms.** `control` is season 10 (`splitClonalMax` 3, a split gives half, `birthReserve` 0). `nocap` sets
`splitClonalMax` 1000000 (out of reach). `nocap-g` adds `splitGiftGene` true. `nocap-g-r` adds `birthReserve` 300.

**Run:** `npm run screen -- --grid evals/screens/honest-edge.grid.json` on branch `season/next` (T24), then the finalist
and the control on seeds 1 to 64 with `--keep-rule` (T25).
