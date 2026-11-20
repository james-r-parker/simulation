# Handoff 2026-11-20 - build the improvement plans

For the session that builds the plans written on 2026-11-20. Read `AGENTS.md` and `docs/principles.md` first, then the
plan for the lane being started (the `resume-plan` skill).

## Goal and done

The app is a well-trained world that is interesting to watch, looks right left on a side screen all day, shows every
reading one key away, and is quick for agents to change. Done is each plan below at `Implemented`, or stopped at a
recorded falsification.

## Where things stand

| Area       | State on 2026-11-20                                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Ladder     | nursery and hunt-contact pass on 88% of 16 offsets, hunt-weak 63%, hunt-mid 31%, `hunt` 0% (E232)                                            |
| Live world | hunters hold BITE on about 70% of ticks (E190); the world empties of hunters about 3.7 times a run; of the 15 scenes, Scavenge and Pack show |
| Verdicts   | 26 records E189 to E251: one adoption, 24 no difference; `train:compare` read `no verdict` 8 times of 8                                      |
| Agents     | 35 of the last 200 `check` runs failed (ratchet 14, smoke 10, shipped-data tests 8); `AGENTS.md` is 132 KB                                   |
| App        | the director is built and not wired; a death is a frozen glide and a fade; follow leaves a death after 650 ms                                |

## Build order

Lanes A, B and C own disjoint paths and run side by side. Inside a lane, build in order, one chunk per branch and PR.

| Order | Lane | Plan and phase                                                                                                | Owns                                          | Why here                                                        |
| ----- | ---- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------- |
| 1     | A    | [agent-workflow.md](../designs/agent-workflow.md) Phase 5 (start to merge)                                    | `scripts/`, `.github/`, skills                | every later chunk ships through `task-start.sh` and `ship.sh`   |
| 2     | A    | agent-workflow.md Phase 1 (context diet)                                                                      | `AGENTS.md`, `docs/`                          | every session and subagent reads `AGENTS.md`                    |
| 3     | B    | [fair-chase.md](../designs/fair-chase.md) Phase 1 (the store, the envelope), on `season/next`                 | `js/sim/`, `wasm/`, `js/evo/chase-*`          | minutes of scripted reading decide whether the rest is worth it |
| 4     | B    | [training-loop.md](../designs/training-loop.md) Phase 5 (T24, T25, then T16b)                                 | `js/evo/yield-*`, `scripts/train-*`, `evals/` | fair-chase Phase 2 is judged on 32 offsets and the pass test    |
| 5     | C    | [ambient-display.md](../designs/ambient-display.md) Phases 1 and 2                                            | `js/app/`                                     | the director on air and the death are the largest visible gains |
| 6     | B    | fair-chase.md Phase 2 (the rung), then Phase 3 (the world, adopt or delete)                                   | `evals/`, then `js/sim/` on `season/next`     | long runs; detach them and build lane A or C meanwhile          |
| 7     | A    | agent-workflow.md Phases 2, 3 and 4                                                                           | `evals/ledger/`, `scripts/`, `.github/`       | Phase 2 edits every experiment record: no eval record PR open   |
| 8     | C    | ambient-display.md Phases 3, 4 and 5                                                                          | `js/app/`                                     | follow, the far-screen look, the insights drawer                |
| 9     | B    | [training-stages.md](../designs/training-stages.md) T64, then [unit-knockout.md](../designs/unit-knockout.md) | `evals/`, `js/evo/`                           | cheap ladder levers that need no sim rule                       |
| 10    | B    | [throughput.md](../designs/throughput.md) Phase 1                                                             | `bench/`, `scripts/`                          | a quiet machine under the CPU lock; no eval running             |

## Review of 2026-11-20 (metrics, the brain kernel, the profile)

| Review       | Result                                                                                                                                                                                                                                                                                                                             | Planned as                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Core metrics | 17 core and hunter metrics recounted from raw events with no difference. Six defects in the statistics layer: power readings on almost no valid splits (8 `verified` metrics rest on them), the keep rule reading renamed metrics as "no harm", hunter metrics that include burn-in, a 16-seed interval that is wrong 1 time in 11 | [metric-noise.md](../designs/metric-noise.md) Phase 4 (T8 to T15)                                                |
| Rust brain   | No defect: an independent reference matches the kernel bit for bit over 21 cases, and three broken copies fail. Three docs state an older layout (89 inputs; the built one has 92)                                                                                                                                                 | [wasm-kernels.md](../designs/wasm-kernels.md) Phase 7 (T33 to T35)                                               |
| Profile      | An eval seed is 99% step and observer. A training run is not: workers are 35 to 45% busy at 12 workers (snapshots cloned into every task, workers respawned every generation) and checkpoints are 27% of wall                                                                                                                      | [training-loop.md](../designs/training-loop.md) T27 to T33; [throughput.md](../designs/throughput.md) T7a to T7c |

Build metric-noise.md Phase 4 before the next keep-rule or `eval:compare` read in lane B, and training-loop.md T27 to T33 before the fair-chase ladder screen (it is the long run they shorten). The proof scripts are in `.sim/review-2026-11-20/` of the main checkout (untracked).

## Worker budget

`defaultWorkers()` is 24 of 32 threads, and 24 workers give only 10% more than 16. An eval or a screen takes 16. Until training-loop.md T27 and T29 land, a training run takes 3 or 4 workers (0.9 busy share against 0.4 at 12), so run 4 or 5 runs side by side. Never
start a long run with `--workers 2`: E240 ran at 13% of the machine for a day.

## Experiment ids

Until agent-workflow.md Phase 2 is built, take the next free id above the highest in `evals/experiments.json` on
`origin/main` and on every open PR. E250 is cited in training-stages.md and has no record: backfill it in the first
record PR (source: commit 3dc3a220 and `evals/decisions/`).

## Ruled out - do not retry

| Lever                                                  | Record                                   |
| ------------------------------------------------------ | ---------------------------------------- |
| Slower prey turn, early offer window                   | E191, E194                               |
| Prey share 0.9 or 1.0 in the hunt stage worlds         | E196, E230                               |
| A hunt-mid rung at sprint 0.5 or 0.3 as the fix        | E197, E198                               |
| A denser nursery                                       | E199                                     |
| A longer hunt stage, more offsets, the kept passer     | E200, E202                               |
| An opponent pool share of 0.2                          | E204                                     |
| Nursery `maxGenerations` 80, `plateauStop` 10, or both | E208, E230, E231                         |
| 48 episodes                                            | E208, E209                               |
| A closed bite at birth (`hunterBiteBias`)              | E193                                     |
| A lower strike price                                   | withdrawn as a rescue (user, 2026-11-18) |

Adaptive difficulty is untested, not falsified: E251 stopped on a validation error (training-loop.md T16b).

## Waiting on the user

- Watch the E203 champions (`?policy=champions-v1` with the set in `.sim/champions/keep/ets-1h-o144`): the only set that
  beat live with every keep-rule guard at no harm.
- Agent permissions: allow subagents `gh pr create` and `git push ` on their own branches.
- Enable the merge queue in the `main` ruleset ([quality-gates-and-test-tiers.md](../designs/quality-gates-and-test-tiers.md) T32).
- E240 (the metric-noise stream's two 128-seed, 600000-tick evals) was stopped on the user's word at 27 of 128 seeds.
  Rerun it at 8 workers per arm when [metric-noise.md](../designs/metric-noise.md) T4 is picked up.

## Before stopping

Commit, open the PR, and append to this file: what merged (PR links), what is running (run names and their worktree),
and the next task id per lane.
