### 2026-11-08 - Metric trust Phase 2 invariants (T20c, T20b)

- Four live defaults seeds at 20000 ticks keep ratio shares in [0, 1], nonnegative per-1000 rates, hunter income shares summing to 1, and birth-source shares summing to 1 when present. `runPool` and direct `runSeed` metrics match for every seed.
- `test/evo/kills.agreement.slow.test.js` confirms the ledger kill count matches `HunterKill` events and no dead hunter life has positive kill energy with zero kills. The core known-answer source test pins the exact `births_per_1k` formula.
- The planned prey-summer trace comparison moves to T34: reports currently keep only total population per checkpoint, so they cannot provide the prey-only minimum. The ecology source test still pins the metric's known answers.
- Tier 2 ran in a clean temporary worktree. 6115 of 6116 tests passed; the one check-tier test failed because `SMOKE_LOCAL=1` was set for the entire gate. It passed when rerun without that variable. The isolated local browser-smoke gate passed, as did conventions, design index, format, lint, typecheck, deps, dupes, bench-check, build and eval-smoke.
