# E273 - body-genes costs screen (E-BG-2, T14)

`npm run screen -- --grid evals/screens/body-genes-costs.grid.json --workers 24`: 16 seeds (offset 0) x 200000 ticks per arm on the
live policy, base `evals/role-budget/step5-d.json` without its genes. `control` has every new span 0; `no-cost` the T17 spans with
every cost exponent 0; `heat-only` adds `speedHeat` 1, `sprintHeat` 0.005, `sprintStoreHeat` 1; `fat-only` adds `fatSlow` 1,
`sizeTurn` 1, `burnThrust` 1; `all-costs` adds both and `hearingCost` 1, `noseCost` 1, `smokeSightRange` 1. Reports and the screen
table are in `evals/screens/results/body-genes-costs/` (not committed).

| Reading (mean of 16)                | control | no-cost | heat-only | fat-only | all-costs |
| ----------------------------------- | ------- | ------- | --------- | -------- | --------- |
| `eval.gene_edge_share`              | 0       | 0       | 0         | 0        | 0         |
| `eval.gene_spread.size`             | 0.0057  | 0.0033  | 0.0023    | 0.0027   | 0.0029    |
| `eval.gene_spread.speed`            | -       | 0.0019  | 0.0018    | 0.0015   | 0.0016    |
| keep rule vs control (alive)        | -       | no harm | no harm   | no harm  | no harm   |
| alive seeds (of 16)                 | 12      | 10      | 10        | 13       | 7         |
| `eval.population_mean`              | 233     | 218     | 194       | 221      | 171       |
| seeds under 80 hunters, p50 hunters | 1       | 2       | 0         | 1        | 5         |
| pop > min vs control                | -       | -0.06   | -0.13     | -0.06    | -0.25     |

The screen has no per-spec end count, so the "fewer than 5 agents of a spec" leg of the prediction is read through `population_mean`,
the hunter reading and the seeds under 80.
