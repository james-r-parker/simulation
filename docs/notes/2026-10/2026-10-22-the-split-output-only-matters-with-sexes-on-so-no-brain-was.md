### 2026-10-22 - The `SPLIT` output only matters with sexes on, so no brain was ever selected on it

`readyToSplit` returns true for any mature, rested agent above `splitMinEnergy` when `sexesEnabled` is false and never reads
`SPLIT`; with sexes on it needs a female with `SPLIT` above 0.5. Archive elites and floor immigrants were scored with the
legacy rule, so only 1% to 8% of agents above 900 energy output `SPLIT` above 0.5 when sexes are switched on, and splitting (84%
of the defaults' mating and split births) all but stops. The output is learnt slowly (6 of 100 agents at 200000 ticks, 17 of 100 at
1000000), not fast enough for a 200000-tick eval. Any new gate on an output that the archive has never seen is a selection
cliff: measure the share of agents that pass it before switching it on.
