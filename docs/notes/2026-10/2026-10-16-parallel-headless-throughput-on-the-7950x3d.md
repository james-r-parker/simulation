### 2026-10-16 - Parallel headless throughput on the 7950X3D

`npm run bench:parallel` (500-agent bench world, 2000 ticks per worker, two runs within 3% of each other), in total
ticks per second across workers:

| Workers | Ticks/s     | Gain over 1    | Efficiency |
| ------- | ----------- | -------------- | ---------- |
| 1       | 240         | 1.00x          | 100%       |
| 8       | 1658 - 1663 | 6.92x          | 86%        |
| 16      | 2875 - 2880 | 11.98 - 12.00x | 75%        |
| 24      | 3367 - 3392 | 14.00 - 14.16x | 58%        |
| 32      | 3536 - 3636 | 14.71 - 15.17x | 46%        |

32 workers beat 16 by 23 - 26%, so SMT is worth having and the eval default stays `os.availableParallelism()` (32).
Per-worker speed falls from 240 to about 110 ticks/s at 32: shared cache and memory bandwidth, not idle cores (CPU
use 95%). The run-to-run gap is under 10%, so workers are not pinned to cores.

The eval observer reads `lastLoss` for collisions right after the physics phase (`observerPhases`): `applyCosts`
later in the same tick sets `lastLoss` to `cost` whenever it removes energy, so a reading after `step` never sees
`collision`.
