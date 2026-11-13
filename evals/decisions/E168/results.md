# E168 - the receptive-mate scent screen (low-density-edge T27)

**Prediction (recorded before the run).** `E-LD-4`: on the switched world with the scent inputs (`pooled-v6`), a
`mateScentDeposit` arm (0.5, 1 or 2; `pheromoneDeposit` is 1 and `pheromoneMax` 5) reads `held` `better` than the scent
off at 64 seeds, with the `alive` guard not worse and `eval.mating_share` higher: males that can smell a ready female find
her at low density, where E-LD-1 placed the edge. Falsified when no scent arm reads `held` `better`, or the leading arm's
`alive` guard reads `worse`. Risk: the inputs start with random weights, so the scent pays only once brains evolve to
follow it inside a 200000-tick run.

**First pass:** seeds 1 to 16 (`npm run screen -- --grid evals/screens/low-density-edge-mate-scent.grid.json`), ranked
by `held`, then `alive`, then `eval.mating_share`. **Second pass:** the leading arm and `off` on seeds 1 to 64 with
`--keep-rule`.
