### 2026-11-12 - The eat-choice brain phase rise is headcount, not inputs (wasm-kernels T29)

`bench.phase_ms.brain@500` rose 11% and `@500w7680` 26% from v6.1.0 to the eat-choice season with no brain code
changed. The nonzero inputs per agent barely moved (+3.6%, +1.3%); the bench world keeps more agents alive below its
500 cap (272 to 302, 162 to 197 a tick in the phase window), and the brain costs the same 1.6 to 1.7 us per alive agent.
The `500` bench row is not 500 agents: read a phase change against the alive count before blaming a kernel. Sense and
physics rose with it.
