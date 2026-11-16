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

## Keep rule (T25, 64 matched seeds)

`npm run eval:compare -- evals/decisions/E177/defaults-s10c.report.json evals/decisions/E177/nocap-g-r.report.json
--keep-rule --allow-config-diff splitClonalMax,splitGiftGene,birthReserve` (the table is `compare.txt`, the full result
`compare.json`). Both arms ran on seeds 1 to 64, 400000 ticks, floor on; the control is the season 10 defaults.

**Verdict: no harm detected at this size; the switch (T26) is made.**

| Guard                        | Result                                                         | Smallest loss detected |
| ---------------------------- | -------------------------------------------------------------- | ---------------------- |
| alive                        | no harm: 18 seeds harmed, 12 recovered, exact p 0.362          | 25 seeds               |
| under80                      | no harm: 4 harmed, 3 recovered, exact p 1                      | 12 seeds               |
| held                         | no harm: 7 harmed, 2 recovered, exact p 0.18                   | 10 seeds               |
| `eval.hunter_catches_per_1k` | no harm: 1.347 to 1.319, diff -0.028, interval [-0.102, 0.045] | 0.073                  |

- The guards cannot see a loss under a quarter of the seeds on `alive` (25 of 64 is 39%): a small hunter loss is
  not excluded. `held` and `under80` see losses of 10 and 12 seeds.
- The adoption bar is not met (hunters alive 40/64 against 0.75; seeds under 80 4/64 against 3/64), as it is not met by
  the control (about 46/64): the finalist has a net 6 seeds fewer with hunters alive, and the alive guard reads no harm only because it cannot see a loss under 25 seeds. Hunter survival is the open cost of this switch. It is not the keep rule's test: nothing realistic is deleted here, and the plan's done
  condition is the keep rule reading no guard `WORSE`.
- Targets: `eval.childshare_by_condition` -0.0003 to 0.0005 (difference 0.00084, interval [0.00033, 0.00138]), above 0.
  `eval.edge_starve_per_prey` is null on some seeds (no edge checkpoint), so it has no verdict; its reference form
  `eval.edge_ref_starve_per_prey` falls 0.118 to 0.089 (-24.5%, interval [-0.032, -0.025]), with `edge_ref_mate_births_per_prey`
  down 0.142 to 0.094 and `edge_ref_split_births_per_prey` up 0.081 to 0.129.
- Better: `eval.births_per_1k` (+12%), `eval.coverage`, `eval.qd_score`, `eval.spec_effective`, `eval.cold_stress_share`,
  `eval.food_energy_per_1k`, `eval.basin_family_effective`. Population mean and the cap share fall.
- Worse: `eval.hunter_first_kill_km_median` (415 to 699), `eval.hunter_first_kill_rmst`, `eval.hunter_juvenile_death_share`
  (0.76 to 0.86), `eval.lineages_alive` (2.30 to 2.15), `eval.mean_fitness.predator` and `eval.p90_fitness.predator`
  (-43%). Hunter births are 92% splits (72% before): a split gives a hunter child the half gift with no mate to bring a
  second hunter genome.

**Outcome to task.** Observation: the cap-free finalist splits more (births 33% to 57% splits), edge starvation falls
and `childShare` selection shows in the metric. Theory: the cap and the half gift hid the gene from selection; a
birth reserve stops the thin-mother births that fed juvenile deaths. Principle check: rule 3 (mating breaks the genome
bag) is weakened by more splits, but `mateScarce` still forces a mating the tick a mate is in reach; no guard reads
`WORSE`, so the keep rule gives no ground to keep the cap. Task: T26 makes the finalist the default and deletes
`splitClonalMax`, `clonalDepth` and the clonal gate share. Open, for the next balance pass and not a Phase 4 task: the
juvenile hunter deaths and the slower first kill (hunters split more, mate less); a hunter-side mating push would be
planned in the hunter docs, with `eval.hunter_juvenile_death_share` as its detector.

The grids `evals/screens/honest-edge.grid.json`, `clonal.grid.json` and `mate-range.grid.json` name `splitClonalMax` or
`splitGiftGene`, deleted at T26: they are the record of their runs and no longer load on this tree.
