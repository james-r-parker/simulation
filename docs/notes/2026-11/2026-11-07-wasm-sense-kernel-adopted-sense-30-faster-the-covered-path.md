### 2026-11-07 - WASM sense kernel adopted: sense 30% faster, the covered path twice as fast (wasm-kernels T11)

The ray march (the gather and every ray's nearest hit) runs in `sense_slot`; the JS ray march is deleted. Measured under
`flock /tmp/claude-1000/cpu.lock` against the brain-only tree (e1ebff05):

| Measure                                                                    | JS ray march  | Kernel        | Change          |
| -------------------------------------------------------------------------- | ------------- | ------------- | --------------- |
| `bench-compare --sizes=500 --runs=5`, `bench.phase_ms.sense@500`           | 0.870         | 0.611         | -29.8%          |
| Same, `@500merit` / `@500w7680`                                            | 1.003 / 1.162 | 0.687 / 0.796 | -31.5% / -31.5% |
| Same, `bench.step_ms@500`                                                  | 2.970         | 2.631         | -11.4%          |
| Alternating A/B, `senseAll` ms per call, 500 agents, 5 pairs (median)      | 1.372         | 0.890         | 1.54 times      |
| Same with `coverConceals` (the default once refuge rings and cover are on) | 1.644         | 0.831         | 1.98 times      |

- Two rays per `f64x2` won in the covered loop and lost in the uncovered one: most rows miss most rays, so the scalar loop
  returns before the square root while the vector form pays for both lanes. The covered loop gained once the square root ran
  only when a lane could hit (`v128_any_true`).
- The micro bench worlds under Vitest's bench mode run the JS rules several times slower than plain Node (senseAll 4.6 ms
  there against 0.8 ms in a Node script on the same world), so phase-level claims use `npm run bench` and `bench-compare`,
  and the `wasm` area times the kernel exports raw.
- A world copy that takes its own arena needs its own `foodRows` entries as well as its own `agentRows`, now that
  `attachWasm` re-points both.
