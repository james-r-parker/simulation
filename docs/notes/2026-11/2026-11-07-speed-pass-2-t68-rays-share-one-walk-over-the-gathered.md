### 2026-11-07 - Speed pass 2 (T68): rays share one walk over the gathered circles

Profile of the 500-agent step (`node --cpu-prof`, ranked by self time): `hiddenStep` 16 percent, `hebbianStep` 14,
`castRays` 10, `appendFixtures` 6, `forwardAll` 6, `outputStep` 5, `gatherNear` 5, `buildHash` and its count pass 6.
Brain parts wait for the WASM spike. Results on `bench:micro --area ray --compare origin/main` (alternating runs, a
machine at load 27, so the margins are wide):

| Change                                                            | Bench               | Change | Margin |
| ----------------------------------------------------------------- | ------------------- | ------ | ------ |
| Far herd body rejected on one axis before the distance test       | `gatherNear` x 484  | +8.7%  | 6.9%   |
| All 16 rays walk the gathered circles once (circle-major)         | `castRays` x 484    | +77%   | 21.5%  |
| `hebbianStep` with running indices instead of row and column sums | `hebbianStep` x 486 | +4.8%  | 12.0%  |

The last one is inside its margin and was dropped. The ray change is bit-identical: a ray's hit is the least distance
with ties to the lower key, so the order circles are met in cannot change it, and the golden test passes unchanged. The
`coverConceals` path keeps the per-ray loop. Not yet measured: `bench.step_ms@500` end to end (needs a quiet machine).
