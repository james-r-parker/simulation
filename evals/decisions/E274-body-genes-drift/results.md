# E274 - do the body genes move (T14d)

Seed 313056, arms `no-cost` and `fat-only` of `evals/screens/body-genes-costs.grid.json`, 200000 ticks on the live policy, the living
agents read at 1000, 50000, 100000 and 200000 through `runReplay`'s `stepFn` (a throwaway script, not committed).

| Reading                   | no-cost | fat-only |
| ------------------------- | ------- | -------- |
| largest gene, tick 1000   | 0.068   | 0.068    |
| largest gene, tick 50000  | 0.388   | 0.221    |
| largest gene, tick 100000 | 0.388   | 0.282    |
| largest gene, tick 200000 | 0.257   | 0.328    |
| largest gene sd           | 0.137   | 0.103    |

The largest ratio sd on size, vision, speed and fat was 0.017 (no-cost). An edge is a gene of 1.47 (`tanh` 0.9). The genes drift by
under 0.4, so `eval.gene_edge_share` reads 0 truthfully, and `eval.gene_spread` (in ratio units, span x tanh) is capped by the span: the
predator `speed` span 0.05 gives at most 0.05 at the edge itself.
