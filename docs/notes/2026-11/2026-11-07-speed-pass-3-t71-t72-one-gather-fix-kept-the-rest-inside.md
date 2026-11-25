### 2026-11-07 - Speed pass 3 (T71, T72): one gather fix kept, the rest inside the margin

Profile of the 500-agent step (`node --cpu-prof`, self time): `hiddenStep` 16 percent, `hebbianStep` 14, `castRays` 10,
`appendFixtures` 6, `forwardAll` 6, `outputStep` 5, `gatherNear` 5, `buildHash` with its count pass 6, `integrate` 3.
The brain, sense and hash code are moving to the WASM kernel, so only a gather fix was kept. Results on `bench:micro`
and `bench:parts` against origin/main (alternating runs, a loaded machine, so the margins are wide):

| Change                                                                      | Bench              | Change | Margin | Kept |
| --------------------------------------------------------------------------- | ------------------ | ------ | ------ | ---- |
| Obstacles rejected on one axis, fixture rows written straight to `rayLocal` | `gatherNear` x 484 | +23%   | 10.8%  | yes  |
| Cell loop hoisted and `appendCircle` inlined                                | `gatherNear` x 484 | -4.9%  | 15.1%  | no   |
| Count pass writes its cell box directly (no shared `range` array)           | physics buildHash  | +2.5%  | 13.4%  | no   |
| Wall bounce of both axes in one function                                    | `integrate`        | 0.0%   | 7.8%   | no   |
| Skip the square root when a lower bound already loses                       | `castRays` x 484   | -0.1%  | 10.9%  | no   |

End to end (`bench-compare --sizes=500 --runs=5`, load about 27): `bench.step_ms@500` 7.97 to 7.63 (-4.3%), sense phase
1.60 to 1.37 ms; inside the gate's noise, not a quiet-machine number. The golden test passes unchanged.
