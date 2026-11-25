### 2026-11-07 - WASM brain kernel adopted: step 4.01 to 3.00 ms, drills 17% faster (wasm-kernels T7)

Every world now runs the brain in the Rust kernel from birth (`allocateWorld` attaches) and the JS brain kernel is deleted.
Measured under `flock /tmp/claude-1000/cpu.lock` on a machine also running evals (load about 10 of 32 cores), against
`origin/main` (8cf1ccd10, which runs the JS brain):

| Measure                                                                        | JS            | Rust          | Change                |
| ------------------------------------------------------------------------------ | ------------- | ------------- | --------------------- |
| `bench-compare --sizes=500 --runs=5`, `bench.step_ms@500`                      | 4.006         | 3.003         | -25.0%                |
| Same, `bench.step_ms@500merit` / `@500w7680`                                   | 4.019 / 3.549 | 2.981 / 2.742 | -25.8% / -22.7%       |
| Same, `bench.phase_ms.brain@500`                                               | 1.296         | 0.499         | -61.5% (2.6 times)    |
| `bench:micro --area drill --compare origin/main --runs 3`, trials/s per worker | 49.6          | 58.2          | +17.2%, margin +-7.0% |

- The step is under the 3.32 ms budget for the first time since the budget was set.
- `bench-compare` flagged `bench.phase_ms.sense@500` at +12.7% (and `@500merit` +10.2%, `@500w7680` +2.4%); the sense micro
  bench (`bench:parts --area sense --compare origin/main --runs 3`) shows +1.4%, margin +-10.2%, `same`. Typed-array views over
  a `WebAssembly.Memory` buffer read as fast as plain ones in the JS rules; the flag looks like load noise in the whole-step
  run, and Phase 2 moves the sense phase into the kernel anyway.
- World birth: compiling the module and probing `__heap_base` once per thread leaves a drill-size world (8 slots, 4 pages) one
  `Memory` plus one `Instance`, 28 us; the whole attach is about 35 us after the agent-row lookup moved from a scan per row
  (61 us over 99 rows, the world object being in dictionary mode before its final spread) to one `Map`.
- A synchronous `new WebAssembly.Module` of a 24 kB binary is fine in Node and in a worker; only a browser main thread limits
  synchronous compiles, and no world is born there.
