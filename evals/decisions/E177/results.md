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

## Screen result (16 seeds, 400000 ticks, on the Phase 2 defaults)

**Verdict: not falsified; no arm moves the edge much.** No arm reads `eval.edge_starve_per_prey` worse than `control`,
and every arm reads no harm on the 16-seed keep rule. Lifting the cap trades matings for splits:

| Arm         | edge starve per prey p50 | childshare by condition p50 | split birth share p50 | mating share | births/1k vs ref | spec <= 70% | pop mean | hunters alive |
| ----------- | ------------------------ | --------------------------- | --------------------- | ------------ | ---------------- | ----------- | -------- | ------------- |
| `control`   | 0.112                    | 0.00006                     | 0.35                  | 0.66         | =                | 12/16       | 268      | 0.7           |
| `nocap`     | 0.116                    | 0.000002                    | 0.51                  | 0.50         | +31%             | 12/16       | 237      | 0.6           |
| `nocap-g`   | 0.121                    | -0.0002                     | 0.47                  | 0.53         | +26%             | 11/16       | 243      | 0.8           |
| `nocap-g-r` | 0.107                    | 0.0008                      | 0.59                  | 0.40         | +16%             | 7/16        | 216      | 0.8           |

- With no clonal cap, splits rise from 35% to about half of births, and the population mean falls by 25 to 50.
- `nocap-g-r` is the finalist: the lowest edge starvation and the only arm with `eval.childshare_by_condition`
  clearly above 0 (parents in better condition give more). Its costs are the fewest seeds under the specialisation cap
  (7/16 against 12/16, p 0.13) and a mating share of 0.40 against 0.66. The 64-seed keep rule (T25) decides.

**Next.** `nocap-g-r` (`evals/decisions/E177/nocap-g-r.config.json`) and the defaults on seeds 1 to 64, `--keep-rule`
(T25).
