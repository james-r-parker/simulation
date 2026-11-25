### 2026-11-07 - WASM Phase 4: hash, pheromones and physics in Rust, step 10% faster, drills 22% faster (wasm-kernels Phase 4)

`build_hash`, `update_pheromones`, `move_agents`, `bounce_rocks` and `resolve_contacts` replace the JS spatial hash build,
pheromone grid loops and physics loops; each matched a JS fixture recorded before the port on the first build, and the
goldens and `npm run browser:hash` are unchanged. Measured under `flock /tmp/claude-1000/cpu.lock` against `origin/main`
(4b066055, the brain and sense kernels):

| Measure                                                                    | JS    | Kernel | Change       |
| -------------------------------------------------------------------------- | ----- | ------ | ------------ |
| `bench-compare --sizes=500 --runs=2`, `bench.step_ms@500`                  | 2.665 | 2.384  | -10.5%       |
| Same, `bench.phase_ms.hash@500`                                            | 0.137 | 0.076  | -44.7%       |
| Same, `bench.phase_ms.field@500`                                           | 0.205 | 0.153  | -25.2%       |
| Same, `bench.phase_ms.physics@500`                                         | 0.298 | 0.190  | -36.1%       |
| `bench:micro --area drill --compare origin/main --runs 3`, trials/s/worker | 60.5  | 73.8   | +22%, +-4.3% |

- The hash, pheromone and contact kernels are now small next to the JS left around them: raw, `build_hash` is about 65 us,
  `update_pheromones` 41 us for three 144x81 grids and `resolve_contacts` 8 us at 500 agents. The biggest physics kernel
  is `bounce_rocks`, about 66 us for 479 agents against 136 rocks (one call per agent, a box test per rock).
- The physics moves can run as one pass before the per-agent bounces: a move reads only its own agent's velocity, and the
  trample, wall and rock steps of the agents before it write only their own agent. The rock scan cannot: `removeEnergy`
  shrinks the agent (`updateSize`) between rocks, so the kernel stops at each damaging impact and JS resumes it.
- The CPU lock keeps other timing runs away but not the evals of the parallel push (load average 5 to 30 during these
  runs); the A/B runs alternate, so the load widens the margins without favouring either side.
