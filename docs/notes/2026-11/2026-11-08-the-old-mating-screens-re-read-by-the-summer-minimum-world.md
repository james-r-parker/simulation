### 2026-11-08 - The old mating screens re-read by the summer minimum (world-balance T98)

- **What is on disk:** `evals/screens/results/mate-range` (E127) and `evals/screens/results/boom-damp` (E128), 8 seeds x 200000 ticks, floor off. E129's 16-seed reports (`evals/results/e129-*.json`) are gone.
- **Proxy, not the metric:** the old traces keep the total population every 1000 ticks, not the prey count, so the read is the lowest total population at a summer checkpoint after burn-in (`eraSeasonTicks` 36000, season 1 of 4). That is an upper bound on `eval.prey_summer_min`: hunters are counted in.

| Screen     | Arm                   | Seeds at or above 100 through summer | Median summer minimum | Under 80 at the end |
| ---------- | --------------------- | ------------------------------------ | --------------------- | ------------------- |
| both       | defaults              | 5 of 8                               | 197                   | 3                   |
| mate-range | mate-350              | 2 of 8                               | 73                    | 3                   |
| mate-range | mate-500              | 4 of 8                               | 179                   | 4                   |
| mate-range | mate-700              | 4 of 8                               | 104                   | 3                   |
| mate-range | mate-900              | 4 of 8                               | 116                   | 3                   |
| mate-range | mate-900-clonal-off   | 0 of 8                               | 0                     | 7                   |
| boom-damp  | flat-1.3              | 3 of 8                               | 39                    | 5                   |
| boom-damp  | spring-1.2            | 2 of 8                               | 45                    | 6                   |
| boom-damp  | margin-150            | 4 of 8                               | 165                   | 2                   |
| boom-damp  | margin-250            | 5 of 8                               | 178                   | 3                   |
| boom-damp  | margin-250-spring-1.2 | 4 of 8                               | 108                   | 4                   |
| boom-damp  | margin-250-mate-500   | 4 of 8                               | 151                   | 4                   |

- **Reading:** no arm beats the defaults on the proxy; a wider fixed `mateRange` does not lift the summer minimum, and spring 1.2 alone looked worse (2 of 8). This is 8 seeds on an older `main` (before the megafauna, keepers and WASM kernels), so it covers none of the T100 grid's arms: all seven stay in.
