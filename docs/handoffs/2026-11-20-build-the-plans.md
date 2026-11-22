# Handoff 2026-11-20 - build the improvement plans

**Read "Direction (user, 2026-11-21)" first.** It is the current order. The Focus, Build order and Progress sections are the record of 2026-11-20 and of the first coordinator's nights; where they disagree with Direction (which step is next, what gates training, `season/next`), Direction holds.

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

## Focus (user, 2026-11-20)

- **Seven leads, everything else a step.** The Build queue holds seven lead plans: metric-noise (measurement),
  fair-chase (hunting), agent-workflow, training-loop (training), ambient-display (app), throughput (speed) and
  world-balance (world). Every other plan is a numbered step under one of them (`**Scheduled by:**`); each lead's
  `## Order` section gives the order. Build nothing out of order unless the user names it. Every mechanism in the world
  stays on: no feature is turned off to make training easier.
- **No experiment that feeds a decision runs until two things are built:** metric-noise.md Phase 4 (the power, keep-rule
  and interval defects) and fair-chase.md Phase 1 (the sprint store and its envelope reading). Runs that only build or
  test code are fine. The first decision run after the freeze is fair-chase Phase 2.
- **One coordinator, one model family.** One session owns the queue, the ledger and the status lines. A session of
  another model family takes only work that edits no plan doc and records no experiment.
- **Watch before tables.** ambient-display.md Phase 6 (the scene reel) is how a behaviour change is reviewed; the user
  watches the reel weekly.
- **Headlines.** A decision reads one headline metric per scene (metric-noise.md Phase 5), not 370 metrics.
- **After the chase is fair,** the hunt rung co-evolves prey with hunters (training-stages.md Phase 9).

## Direction (user, 2026-11-21) - this section overrides the Focus rules above and the Build order below for lane B

**No training run, ladder screen or champion export starts until the gates below are read.** Every large rules change
lands first, in big chunks (one phase to a pull request), straight on `main` (a rules change is a breaking PR with its
`library/seasons.json` change; there is no `season/next`). Every mechanism in the world stays on.

### Lane B, in order

| Step | Build                                                                                                                                                                                                                                                                                                 | Plan                                                                                                                                | Why here                                                                         |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1    | Events with named fields, spec names, the per-slot state list                                                                                                                                                                                                                                         | [registries.md](../designs/registries.md) Phase 1                                                                                   | a refactor that moves no hash; everything after adds events, state and detectors |
| 2    | Body and senses: the lane catalogue, the brain input and output schema (T6a), the `pooled-v6` layout with 13 sense inputs and `reserve`, the trait registry with 18 traits in 24 slots at neutral numbers, the inheritance routine, the graded sprint ([fair-chase.md](../designs/fair-chase.md) T7a) | [body-genes.md](../designs/body-genes.md) Phase 1                                                                                   | one layout change before any training; the calculator reads the lanes            |
| 3    | The effects registry, every within-life modifier of today moved into it, then the social and adrenaline effects at neutral numbers                                                                                                                                                                    | [status-effects.md](../designs/status-effects.md) Phases 1 and 2                                                                    | the calculator reads the effects                                                 |
| 4    | The calculator: all five phases, with the trait corners (body-genes.md Phase 2) and the pack row (status-effects.md T13)                                                                                                                                                                              | [role-budget.md](../designs/role-budget.md)                                                                                         | gate 1: can each role work, can a newborn reach food, does a sitter die first    |
| 5    | The numbers: trait spans and costs, effect strengths, birth energy with the cold stack; one 16-seed screen and one 64-seed keep-rule pair on the live policy                                                                                                                                          | body-genes.md Phase 3, status-effects.md Phase 3                                                                                    | chosen with the calculator, not before it                                        |
| 6    | The detector interface, then every role's metrics against planted scenes                                                                                                                                                                                                                              | registries.md Phase 3, [metric-noise.md](../designs/metric-noise.md) Phase 6                                                        | gate 2                                                                           |
| 7    | A reflex case and a drill for each role, bars from the calculator, then the reflex validation study                                                                                                                                                                                                   | [brain-reflex-tests.md](../designs/brain-reflex-tests.md) Phase 5 then Phase 2; [training-loop.md](../designs/training-loop.md) T34 | gate 3: level one and level two measure the right things                         |
| 8    | Training: `train:feasible` on the graded-sprint arm, then the ladder screen                                                                                                                                                                                                                           | fair-chase.md T7b, T8                                                                                                               | the first training runs                                                          |

Beside lane B: body-genes.md Phase 5 (the remaining readers move to lanes, mechanical), and lanes A and C as listed under "Progress". After step 8: training-loop.md T33 (it is a training run) and T28.

**Do not run before step 8:** `npm run train`, `train:feasible`, `train:screen`, `train:tune`, `train:profile` on a real ladder, or a champion export. Evals of the live policy (`npm run eval`, `eval:compare`, the screens of step 5) are not training and may run.

**Rust, by Opus:** body-genes.md T3 (`move_all`), T7 and T31 (`wasm/src/brain.rs`), T13a (`wasm/src/sense.rs`). fair-chase.md T7a needs no Rust change.

**Step 5 before gate 2:** the screen of step 5 is judged by the keep rule's settled guard, which metric-noise.md Phase 4 already verified; the role metrics that step 6 checks are reported there, not decided on.

**History in other plans:** `season/next` in eat-choice.md, low-density-edge.md, carrying-capacity.md and unit-knockout.md describes how built phases landed; it is not a rule.

### Decisions behind the plans

- **Perception is physical:** size, speed, closing rate and how much of the view a kind fills; never a spec label. The
  inputs are always on and judged after the first training run (body-genes.md Phase 4).
- **Traits:** one registry, per-spec menus where a span of 0 fixes a trait (no flags), one inheritance routine, contract
  tests over every entry. A trade between two abilities is one trait with two opposite effects.
- **Effects:** stacking, capped, timed. No effect pays a body for an act: `answered` needs a kill both hunters bit.
- **The defender shoves** (the repel that exists and is off). **The sprint is graded** with the store on.
- **The calculator's anchors** were computed from the code: `evals/decisions/role-budget/anchors.md`. The settings
  inventory is `evals/decisions/body-genes/settings-inventory.md`.
- **To check before trusting the herd rows:** a startled herd's centroid is held, so a stampede travels about 516 px in
  360 ticks (role-budget.md T21a).
- Rust and WASM work goes to Opus. One coordinator; subagents may open their own pull requests.

## Build order

Lanes A, B and C own disjoint paths and run side by side. Inside a lane, build in order, one chunk per branch and PR.

| Order | Lane | Plan and phase                                                                                                | Owns                                                                     | Why here                                                        |
| ----- | ---- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| 0     | B    | [metric-noise.md](../designs/metric-noise.md) Phase 4 (T8 to T15), then Phase 5                               | `scripts/eval-*`, `js/evo/compare*`, `js/evo/keep-rule.js`, the registry | no verdict is trusted until the statistics layer is fixed       |
| 1     | A    | [agent-workflow.md](../designs/agent-workflow.md) Phase 5 (start to merge)                                    | `scripts/`, `.github/`, skills                                           | every later chunk ships through `task-start.sh` and `ship.sh`   |
| 2     | A    | agent-workflow.md Phase 1 (context diet)                                                                      | `AGENTS.md`, `docs/`                                                     | every session and subagent reads `AGENTS.md`                    |
| 3     | B    | [fair-chase.md](../designs/fair-chase.md) Phase 1 (the store, the envelope), on `season/next`                 | `js/sim/`, `wasm/`, `js/evo/chase-*`                                     | minutes of scripted reading decide whether the rest is worth it |
| 4     | B    | [training-loop.md](../designs/training-loop.md) Phase 5 (T24, T25, then T16b)                                 | `js/evo/yield-*`, `scripts/train-*`, `evals/`                            | fair-chase Phase 2 is judged on 32 offsets and the pass test    |
| 5     | C    | [ambient-display.md](../designs/ambient-display.md) Phases 1 and 2                                            | `js/app/`                                                                | the director on air and the death are the largest visible gains |
| 6     | B    | fair-chase.md Phase 2 (the rung), then Phase 3 (the world, adopt or delete)                                   | `evals/`, then `js/sim/` on `season/next`                                | long runs; detach them and build lane A or C meanwhile          |
| 7     | A    | agent-workflow.md Phases 2, 3 and 4                                                                           | `evals/ledger/`, `scripts/`, `.github/`                                  | Phase 2 edits every experiment record: no eval record PR open   |
| 8     | C    | ambient-display.md Phases 3, 4 and 5                                                                          | `js/app/`                                                                | follow, the far-screen look, the insights drawer                |
| 9     | B    | [training-stages.md](../designs/training-stages.md) T64, then [unit-knockout.md](../designs/unit-knockout.md) | `evals/`, `js/evo/`                                                      | cheap ladder levers that need no sim rule                       |
| 10    | B    | [throughput.md](../designs/throughput.md) Phase 1                                                             | `bench/`, `scripts/`                                                     | a quiet machine under the CPU lock; no eval running             |

## Review of 2026-11-20 (metrics, the brain kernel, the profile)

| Review       | Result                                                                                                                                                                                                                                                                                                                             | Planned as                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Core metrics | 17 core and hunter metrics recounted from raw events with no difference. Six defects in the statistics layer: power readings on almost no valid splits (8 `verified` metrics rest on them), the keep rule reading renamed metrics as "no harm", hunter metrics that include burn-in, a 16-seed interval that is wrong 1 time in 11 | [metric-noise.md](../designs/metric-noise.md) Phase 4 (T8 to T15)                                                |
| Rust brain   | No defect: an independent reference matches the kernel bit for bit over 21 cases, and three broken copies fail. Three docs state an older layout (89 inputs; the built one has 92)                                                                                                                                                 | [wasm-kernels.md](../designs/wasm-kernels.md) Phase 7 (T33 to T35)                                               |
| Profile      | An eval seed is 99% step and observer. A training run is not: workers are 35 to 45% busy at 12 workers (snapshots cloned into every task, workers respawned every generation) and checkpoints are 27% of wall                                                                                                                      | [training-loop.md](../designs/training-loop.md) T27 to T33; [throughput.md](../designs/throughput.md) T7a to T7c |

Build metric-noise.md Phase 4 before the next keep-rule or `eval:compare` read in lane B, and training-loop.md T27 to T33 before the fair-chase ladder screen (it is the long run they shorten). The proof scripts are in `.sim/review-2026-11-20/` of the main checkout (untracked).

## Speed prototypes (2026-11-20)

Two changes make a default-world eval seed 13.7% faster with every `worldHash` and metric identical: one food pass with a
cell mask in herd grazing, and a slot skip in carcass tracking ([throughput.md](../designs/throughput.md) T6, T7b; the
patches are in `.sim/review-2026-11-20/speed/`). The planned live-food list is dropped: the food array is 99% full.

Two findings for the world lead, not planned yet: plant supply is set by the `maxFood` cap, not by regrowth, and a
carcass is lost when the array is full; and a world asked for 500 agents decays to about 150 unless `floorTrigger` is
raised, so check what `npm run bench` at 500 really holds (throughput.md T1).

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
- Agent permissions: allow subagents `gh pr create` on their own branches. (No merge queue: GitHub does not offer it to a
  user-owned repository, and the ruleset does not require an up-to-date branch, so none is needed.)
- E240 (the metric-noise stream's two 128-seed, 600000-tick evals) was stopped on the user's word at 27 of 128 seeds.
  Rerun it at 8 workers per arm when [metric-noise.md](../designs/metric-noise.md) T4 is picked up.

## Before stopping

Commit, open the PR, and append to this file: what merged (PR links), what is running (run names and their worktree),
and the next task id per lane.

## Progress - coordinator session 2026-11-20

Merged:

- [PR 551](https://github.com/james-r-parker/simulation/pull/551) agent-workflow.md Phase 5 (built): `scripts/task-start.sh`, `scripts/ship.sh`, shard 6 split (304 s to 61 s; `heavy-gate-validity` 4 min 34 s, over the 4-minute bar).
- [PR 553](https://github.com/james-r-parker/simulation/pull/553) agent-workflow.md Phase 1 chunk A (T1 to T4): `docs/commands.md`, `AGENTS.md` 135842 to 13837 bytes, `docs/notes/`, the 400-character status cap.
- [PR 552](https://github.com/james-r-parker/simulation/pull/552) ambient-display.md Phase 1 chunk A (T1 to T4): the director on air behind `?tv=1`, the `T` key and idle. `director:dry` misses its bars (chase precision 0.25 to 0.5; seed 2 at 36 shots an hour); T4b planned.
- [PR 554](https://github.com/james-r-parker/simulation/pull/554) metric-noise.md Phase 4 T8 to T11, T13, T14: D1 to D6 fixed; 177 of 375 metrics verified (204 before); null false positives at 16 seeds 9.3% to 5.8%.

In flight:

| Lane | Work                                                                                                | Where                                                                                                                                                           |
| ---- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B    | E254 (run `settled-baseline-E252`): 128-seed 200000-tick baseline with the settled metrics, for T12 | run `settled-baseline-E252`, frozen, in worktree `agent-a049f978c889fc87d` (keep it)                                                                            |
| B    | fair-chase.md Phase 1 (T1 to T5, E253 = E-FC-1), on `season/next`                                   | branch `feat/sprint-store` (Opus)                                                                                                                               |
| A    | agent-workflow.md Phase 1 chunk B (T5 to T8)                                                        | branch `docs/scene-scorecard`                                                                                                                                   |
| C    | ambient-display.md T4b (the `director:dry` bars)                                                    | branch `feat/director-bars`                                                                                                                                     |
| -    | throughput.md T7a, T6, T7b                                                                          | draft [PR 550](https://github.com/james-r-parker/simulation/pull/550): needs `bench:parts --area field --compare origin/main` under the CPU lock once E252 ends |

Next per lane: A - Phase 1 review T9, then Phases 3 and 6. B - T12 and T15 on E254, then training-loop.md Phase 5. C - T5 (perf:browser on the real GPU and the walk), then Phase 2.

Waiting on the user, updated: subagents may push and open PRs (user, 2026-11-20), but the auto-mode classifier still refuses a subagent's `git push`; the coordinator pushes.

## Progress - coordinator session 2026-11-21 (stopped on the user's word)

Merged since the 2026-11-20 entry: [550](https://github.com/james-r-parker/simulation/pull/550) (throughput T6, T7a, T7b: `grazeHerds` +432%, the field phase +136% at 500 agents), [551](https://github.com/james-r-parker/simulation/pull/551), [553](https://github.com/james-r-parker/simulation/pull/553), [556](https://github.com/james-r-parker/simulation/pull/556), [557](https://github.com/james-r-parker/simulation/pull/557), [561](https://github.com/james-r-parker/simulation/pull/561), [566](https://github.com/james-r-parker/simulation/pull/566), [569](https://github.com/james-r-parker/simulation/pull/569) (agent-workflow Phases 1, 3, 4, 5, 6), [554](https://github.com/james-r-parker/simulation/pull/554) and [560](https://github.com/james-r-parker/simulation/pull/560) (metric-noise Phase 4: 179 of 375 metrics verified, E254 the shared baseline, the keep-rule guard on `eval.hunter_catches_per_1k_settled`), [558](https://github.com/james-r-parker/simulation/pull/558), [571](https://github.com/james-r-parker/simulation/pull/571), [574](https://github.com/james-r-parker/simulation/pull/574), [576](https://github.com/james-r-parker/simulation/pull/576) (fair-chase Phase 1, drills under the stage's sprint rules, season 11 on `main`, E253 and E255), [563](https://github.com/james-r-parker/simulation/pull/563), [564](https://github.com/james-r-parker/simulation/pull/564) (training-loop T24 to T32), [552](https://github.com/james-r-parker/simulation/pull/552), [559](https://github.com/james-r-parker/simulation/pull/559), [562](https://github.com/james-r-parker/simulation/pull/562), [567](https://github.com/james-r-parker/simulation/pull/567), [568](https://github.com/james-r-parker/simulation/pull/568), [570](https://github.com/james-r-parker/simulation/pull/570), [575](https://github.com/james-r-parker/simulation/pull/575) (ambient-display Phases 1 to 5 except the real-GPU reviews), [572](https://github.com/james-r-parker/simulation/pull/572) (exam test timeouts).

Decisions from the user on 2026-11-21:

- **No `season/next`.** The user is the only user: a rules change lands on `main` as a breaking commit with the next `library/seasons.json` entry in the same PR. Season 11 (`rulesHash` c15b0d2869de5a5d) opened that way in PR 574. `season/next` is no longer synced.
- **The calculator before the rung.** E256 (the fair-chase ladder screen) waits for `role-budget.md` Phase 1: run it only when the calculator shows the courser arm leaves a catchable window, or after tuning with it.
- **Body genes are spec gene menus.** Keep the five specs, move more settings into the spec table, give each spec a menu of gene-tweakable traits with paired costs, and plan "who is that" perception (agents today see kin, threat, prey and other, never a spec).

E255 is falsified: under courser a learning hunter sprints at any positive output, pays full drain, reaches the floor at about tick 140 and then cruises below the prey, so it loses the tail chases random brains win today (evals/decisions/E255/results.md).

Open, not merged: the plan PR (role-budget.md new, body-genes.md rewritten, fair-chase and world-balance order edits, every touched plan's status line). The user reviews it before anything is built from it. Waiting on the user: the real-GPU reviews (ambient-display T5, T6, T11, T17, T22, T28) on the OLED; removing the 10 merged agent worktrees with `scripts/worktree-gc.sh` (the permission check refused it for this session); the release PR 503 (now a major release).

Run logs kept in worktrees: E254 in `agent-a049f978c889fc87d/.runs/`, E255 in `agent-ae27dc64e8e848bcc/.runs/`.

Next per lane once the plan PR is approved: A - agent-workflow Phase 2 (the ledger), then T30 and the reviews. B - role-budget.md Phase 1, then training-loop T33, then E256. C - ambient-display Phase 6 (the scene reel). Follow-up tasks offered in the app: hold the `scripts` coverage aggregate before the push; count slow tests in the pull-request `ratchet-related` job.

## Progress - coordinator session 2026-11-21 (lane B, Direction order)

Lane B step 1: [registries.md](../designs/registries.md) Phase 1 (T1 to T5) lands in the PR that carries this entry (branch `refactor/registries-phase1`). It is a refactor that moves no golden. It adds `EVENTS` with named fields and one emitter, `js/sim/specs.js`, and `agentSpecs` with `hashed` and `kernels` in `js/sim/agent-arrays.js`. It also adds the generated `docs/log-events.md` and `docs/config-keys.md`. The same PR regenerates the stale E254 table in metric-noise.md, which had turned `main` red since PR 578.

- Found by the T4 contract test: `restTimer` (a hunter's rest after a kill) is in no hash list. It is kept in `UNHASHED_ROWS` with that reason. Hashing it re-pins every golden, so it rides the next golden re-pin, which is body-genes.md T7.
- body-genes.md T1 is done with no corrections. All 230 config keys are classed, and all 108 class B reader counts match `origin/main` by the inventory's own method (`rg -c -w`, lines, not matches).
- Waiting on the user: the worktree `docs-body-genes-inventory` holds a discarded diff and needs removing by hand, because a hook stops this session from writing in another worktree. Subagents meet the same hook: build them in an isolated worktree, or ship from the coordinator's worktree.

Next per lane: B - body-genes.md Phase 1 from T2, with fair-chase.md T7a (Sonnet for the chunk, Opus for T3 and T7). A - agent-workflow.md Phase 2. C - ambient-display.md Phase 6.

## Progress - coordinator session 2026-11-21 evening (lane B steps 2 to 5, stopped at 22:00)

Merged today, in Direction order (each PR's body has its measurements): registries Phase 1 and the detector interface
([583](https://github.com/james-r-parker/simulation/pull/583), [588](https://github.com/james-r-parker/simulation/pull/588));
the ledger ([584](https://github.com/james-r-parker/simulation/pull/584)); body-genes Phases 1, 2 and 5
([585](https://github.com/james-r-parker/simulation/pull/585), [595](https://github.com/james-r-parker/simulation/pull/595),
[596](https://github.com/james-r-parker/simulation/pull/596), [599](https://github.com/james-r-parker/simulation/pull/599),
[609](https://github.com/james-r-parker/simulation/pull/609), [610](https://github.com/james-r-parker/simulation/pull/610),
[616](https://github.com/james-r-parker/simulation/pull/616), [617](https://github.com/james-r-parker/simulation/pull/617),
[620](https://github.com/james-r-parker/simulation/pull/620), [626](https://github.com/james-r-parker/simulation/pull/626));
status-effects Phases 1 and 2 with T12, T13 and T14 ([600](https://github.com/james-r-parker/simulation/pull/600),
[613](https://github.com/james-r-parker/simulation/pull/613), [624](https://github.com/james-r-parker/simulation/pull/624),
[627](https://github.com/james-r-parker/simulation/pull/627), [629](https://github.com/james-r-parker/simulation/pull/629));
role-budget Phases 1 to 5 ([593](https://github.com/james-r-parker/simulation/pull/593),
[598](https://github.com/james-r-parker/simulation/pull/598), [601](https://github.com/james-r-parker/simulation/pull/601),
[602](https://github.com/james-r-parker/simulation/pull/602), [603](https://github.com/james-r-parker/simulation/pull/603));
the step 5 candidates ([614](https://github.com/james-r-parker/simulation/pull/614)); metric-noise Phase 6 and the gate-2
verdict ([592](https://github.com/james-r-parker/simulation/pull/592), [608](https://github.com/james-r-parker/simulation/pull/608),
[615](https://github.com/james-r-parker/simulation/pull/615), [621](https://github.com/james-r-parker/simulation/pull/621),
[623](https://github.com/james-r-parker/simulation/pull/623)); the role reflex cases, bars and drills
([590](https://github.com/james-r-parker/simulation/pull/590), [597](https://github.com/james-r-parker/simulation/pull/597),
[604](https://github.com/james-r-parker/simulation/pull/604), [606](https://github.com/james-r-parker/simulation/pull/606),
[612](https://github.com/james-r-parker/simulation/pull/612)); the calm camera and the reel
([586](https://github.com/james-r-parker/simulation/pull/586), [594](https://github.com/james-r-parker/simulation/pull/594),
[605](https://github.com/james-r-parker/simulation/pull/605), [611](https://github.com/james-r-parker/simulation/pull/611));
plans for the later effects, `liver`, `armour` and the speed tasks ([607](https://github.com/james-r-parker/simulation/pull/607),
[618](https://github.com/james-r-parker/simulation/pull/618)); `npm run sync` and the merge-churn plan
([622](https://github.com/james-r-parker/simulation/pull/622)).

**The evening batch** ([630](https://github.com/james-r-parker/simulation/pull/630), user, 2026-11-21: the remaining work
ships as one PR with many commits; each chunk is built on its own branch from the batch and merged in). It holds
body-genes T46, T51 (breaking: season 12's `rulesHash` moved in place to 5ea8af3e744bdb8f), T52, T53 and T55;
status-effects T15 and T23 to T30; body-genes T17 (E271); brain-reflex-tests T21a and T22; the defender escort distance;
E272, the guard posture, this entry and the next session prompt (`docs/handoffs/2026-11-22-coordinator-prompt.md`). Merge it on green if it is still open (no release PR merge: 503 deploys production).

Findings to carry:

- **Speed.** status-effects Phase 5 is built and its Targets are not met: lifecycle +57% and physics +19% above
  4e56979d (5% bar), measured on a loaded machine. `foldGroup` is the largest added cost; the next steps are written in
  Phase 5. body-genes T52 and T53 moved the body sense into Rust bit-identically with no gain (the cost is per-hit
  arithmetic; an `f64x2` pair is the lever left). T54, `bench/baseline.json` and both speed reads need a quiet machine:
  do them first, before any eval starts.
- **Detector readings at neutral numbers.** After T28 and T30 every effect whose numbers are neutral is not raised at
  all, so `eval.effect_share.*` reads 0 for all ten at the defaults; E270's 0.199 `chilled` share is from before T30.
- **The defender.** `defender:predator` is red at the defaults for every body number. The user chose escort distance
  (role-budget.md Decisions); it is built (87 px) and the row is still red at every distance from 150 to 10 px: the
  defender starts at rest, side-on and at the grazing gait, while the hunter kills at tick 27. The user then chose the guard posture with speed as the fallback: the guard posture is built (`guardPosture: 'between'`, not the default) and wins the intercept, but the smoke cell stays red (a 180-degree turn to release, tick 26 against tick 5), and no turn or thrust multiplier up to x20 fixes it. **Waiting on the user:** a release without the turn, or the cloud dropped ahead of the releaser.
- **Step 5.** E272 (16 seeds): step5-b and step5-d both do no harm to the keep rule's seed guards; step5-d is the
  finalist (1 better, 3 worse: `body_plan_coverage` 0.18 to 0.055 from the narrowed spans, the defender's fitness). No
  rally was raised on step5-d although `rallyThrust` is 0.1. Before T18: correct the calculator's cold-stack formula
  (`--check` exited 1 on step5-d, 3.9% short on `forager:idle`; fixed 2026-11-22 on `feat/coldstack-defender-release`: `chilled` scales the passive term only, and `coldStep` keeps the sim's signed clock; it now exits 0), re-run the predator corner reads at the final spans,
  then the 64-seed keep-rule pair (E-BG-3).
- **Process.** `gh run watch` polling from many watchers exhausted the GitHub API (5000 an hour) once; poll at
  `-i 120` or slower. A stacked PR closes when its base branch is deleted: retarget it first. Coverage timeouts were
  fixed one by one with `scaleTimeout`; the systemic fix is agent-workflow Phase 7.

Next per lane: B - the quiet-machine speed reads (body-genes T54, status-effects Phase 5), then step 5's T18 path above
and the user's defender answer; then step 6 (registries T12, metric-noise gate 2: the 128-seed season-12 baseline once
step 5 is adopted) and step 7 (brain-reflex-tests T23, E-RT-1). A - agent-workflow Phase 7 (less merge churn). C - the
real-GPU items: a 240 Hz `perf:browser` run with `?tv=1`, the user's OLED walk for ambient-display T40, the GPU clips of
T6, T11 and T22.

### Progress - coordinator session 2026-11-22

Batch `batch/2026-11-22-steps` (one PR):

- **Speed reads** (quiet machine): body-genes T54 met (`sense@500` -15.1%, `sense@500w7680` -1.6%). Status-effects
  Phase 5 Targets still unmet (`lifecycle@500` +47.4%, `physics@500` +19.0% above 4e56979d; brain flat).
- **Calculator cold stack** now matches the sim's `chilled` (passive term only) and `stepChilled` clock;
  `role:budget --check` on step5-d exits 0. No config numbers moved.
- **No rally on step5-d**: no `PackCalled` is ever raised (hunt output never above `huntCallThreshold`), so the rally
  is never reached. Before T16 reads it, script a two-hunter call scene or screen a policy that calls.
- **Defender smoke (user, 2026-11-22: release without the turn, shape B)**: a cloud is aimed at the nearest hunter
  within `visionRange` and `smokeAimArc` (0.785 rad) of the heading, else dropped behind as before. Breaking; season 12
  `rulesHash` moved in place to `c64124f01c20ac17`. Defender release is now on time (slack 0, was -21), but the cell is
  still `impossible`: the cloud hides the caller for 15 ticks and it needs 36 to leave the view (caller slack -23).

Next per lane: B - the defender caller's escape (the caller side, not the release) needs a design call; step 5 T18
path (predator corner reads at the final spans, then E-BG-3 64-seed keep rule) now that `--check` passes;
status-effects Phase 5 speed steps (generated readers, lazy `liveIn`). A - agent-workflow Phase 7.

### Re-ranked queue (user rule, 2026-11-22)

Before any training (lane B step 8) every change to the world is built and adopted, every new feature is on by default, tested and balanced, the sim runs fast and the dev tooling is done. The Build queue now reads: 1 agent workflow, 2 metric noise, 3 fair chase (body-genes and status-effects adoption, role budget, chase), 4 world balance, 5 throughput, 6 training loop, 7 ambient display. fair-chase.md "Before any training" holds seven gates (4 features on, 5 balance, 6 speed, 7 dev tooling added), and training.md and training-loop.md depend on them. Merged today: role-budget T24b (PR 634). Open: PR 635 (agent-workflow T46 partly built there), agent-workflow T49 (`gate-validity.slow` at 119.5 s of 120 s), fair-chase T7d (the features-on audit).

Next per lane: A - agent-workflow Phase 7 (T42 to T49), then metric-noise gate 2 (T25 to T27). B - step 5 adoption (body-genes and status-effects Phase 3, the defender caller's escape), then world-balance, then the speed gate (status-effects T31, throughput Targets). Step 8 training waits for all seven gates. C - ambient-display real-GPU items; they do not gate training.

### Smoke decoy (2026-11-22, branch feat/smoke-decoy)

[smoke-decoy.md](../designs/smoke-decoy.md) is step 10 of fair-chase.md and closes role-budget T24a's caller side. A cloud younger than `smokeDecoyTicks` (60) reads on the hunter's prey channel at its own proximity (`isDecoy` in `js/sim/ray-march.js`), so a ray-following hunter runs at it and grips it; no target memory, no new input. `rulesHash` moves from `c64124f01c20ac17` to `93d5ee3e014475ae` (season 12 in place). `defender:predator` on `step5-d.json` with `between` reads `tight` on the smoke (slack 0, 64; was 0, -23); `side` stays red on `run`, and the defaults on `repel: off`. The 16-seed eval was identical to the byte (no smoke released in any seed); the 64-seed keep rule runs detached as `smoke-decoy-64` (`/tmp/claude-1000/-home-j1mb0jay-code-simulation--claude-worktrees-review-prs-handoff-5aa784/bc3343ef-8252-4876-8f0b-31134314098c/scratchpad/keep-rule64.txt` when done), and the two smoke metrics have no verdict at any seed count in the noise table, so the scene read is the evidence. Open: the 64-seed read (T8) and the conformance review (T9); the pre-existing `shove breaks the bite` drift of `--check` with `between` is not this change's.
