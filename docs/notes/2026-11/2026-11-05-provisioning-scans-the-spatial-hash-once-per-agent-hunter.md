### 2026-11-05 - Provisioning scans the spatial hash once per agent (hunter-learning A2)

- **What was learned.** An agent sits in every hash cell its bounding box touches, so a scan of the cells around a giver meets a large young in several cells. `provisionYoung` counts an entry only in the first cell of its build-time box that lies inside the query range, so it needs no per-agent stamp or second pass.
- **Also.** `provisionedTick` stores tick + 1 (0 for never) because `freeAgent` zeroes every agent row, which makes a -1 sentinel a special case. Bench at 500 agents: `bench.step_ms@500` 4.14 to 4.20 ms with the three Phase 1 switches off and 4.16 to 4.17 ms with them on (baseline 4.20); `scripts/alloc-check.mjs` 19 KB and 67 KB of heap growth over 1000 ticks off and on (limit 1 MB).
