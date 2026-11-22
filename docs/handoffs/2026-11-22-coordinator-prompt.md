# Coordinator prompt - 2026-11-22

Paste this into a new session to pick up Blob Evolution as coordinator.

---

You are the coordinator for Blob Evolution. Read `AGENTS.md`, then `docs/principles.md`, then
`docs/handoffs/2026-11-20-build-the-plans.md`: first "Direction (user, 2026-11-21)", then the newest Progress entry
("coordinator session 2026-11-21 evening"). You own the build queue, the experiment ledger and every plan's status line.
You build by delegating chunks to subagents, reviewing their work and merging on green CI.

## Rules that hold

- **No training before lane B step 8.** No `npm run train`, `train:feasible`, `train:screen`, `train:tune`, or
  `train:profile` on a real ladder, and no champion export. Evals of the live policy (`npm run eval`, `eval:compare`,
  the step 5 screens) are not training and may run.
- **Defaults must let good behaviour work** (user, 2026-11-21). Every role's job works at the default numbers for a good
  performer with every buff off. Status-effect buffs only amplify teamwork once it emerges. Role-budget rows are gated
  with every effect off.
- **One batch PR per session** (user, 2026-11-21). Each chunk is built by a subagent on its own branch, cut from the
  session's batch branch (`batch/<date>-<name>`, from fresh `origin/main`). The subagent pushes the branch and does not
  open a PR or run `ship.sh`. You review it, merge it into the batch with `--no-ff`, run `npm run sync` and
  `scripts/check.sh --fix --quick`, and push. CI runs once on the set. Merge the batch on green.
- **Models.** Rust and WASM go to Opus. `[judgement]` work goes to Sonnet, `[mechanical]` work to Haiku.
- **A rules change** is a breaking commit (`!`) with its `library/seasons.json` entry in the same PR. An unreleased
  season's `rulesHash` moves in place.
- **Merging the release PR deploys production.** Merge it only on the user's word.
- **GitHub API budget.** Poll CI with `gh run watch <id> -i 120` or slower. Fast watchers across several PRs exhausted the
  5000-an-hour limit on 2026-11-21.
- **Stop and ask the user only** for a production deploy, a keep-rule `WORSE` on a change you believe should land, a plan
  that needs a new design direction, or the items under "Waiting on the user".

## Where it stands

- `origin/main` is at `80f10d18` (release `11.0.0`, PR #630 and release PR #503 are both already merged; production is
  season 12 without the step-5 numbers adopted). Do not merge another release PR without the user's word.
- Lane B steps 1 to 4 are built. Step 5 has its candidates: `evals/role-budget/step5-d.json` is the finalist. E272: no
  harm to the keep rule's seed guards at 16 seeds; `body_plan_coverage` 0.18 to 0.055; no rally raised.
- Built in the calculator: the defender row is read at an escort distance (87 px) and, optionally, in a guard posture
  (`guardPosture: 'between'`). The row is still red on the smoke cell. The guard must turn 180 degrees to release,
  releasing at tick 26 against the latest useful release of tick 5. No turn or thrust multiplier up to x20 fixes it.
- Speed: status-effects Phase 5 and body-genes Phase 7 are built, with their Targets not met (lifecycle +57%, physics
  +19% above 4e56979d on a loaded machine).

## Do first

1. **Quiet-machine speed reads**, before any eval starts, under `flock /tmp/claude-1000/cpu.lock`. Do body-genes T54,
   the status-effects Phase 5 Targets, and re-record `bench/baseline.json` if the plans call for it. The next speed
   steps are written in status-effects Phase 5: a generated reader per effect group, and lazy base reads in `liveIn`.
2. **The defender smoke.** Ask the user. The calculator says the fix is behavioural or a rule change, not a body
   number: a release without the 180-degree turn, or the cloud dropped ahead of the releaser. Until it is decided,
   `defender:predator` stays red and is recorded as such. Do not tune it green.
3. **Step 5 to adoption** (body-genes T15 and T18, status-effects T16 to T18):
    - correct the calculator's cold-stack formula (`--check` exits 1 on step5-d, 3.9% short on `forager:idle`);
    - re-run the predator corner reads at the final spans;
    - read why no rally was raised on step5-d;
    - consider widening the spans no row needed narrowed (`body_plan_coverage`);
    - then run the 64-seed keep-rule pair (E-BG-3) and adopt on `main` as a breaking PR with its season entry.
4. **Then step 6**: registries T12; metric-noise gate 2 (a fresh 128-seed season baseline once step 5 is adopted, and a
   live defender metric). **Then step 7**: brain-reflex-tests T23, E-RT-1.

Beside lane B: agent-workflow Phase 7 (less merge churn, and a systemic answer to the coverage timeouts now fixed one
by one with `scaleTimeout`). The real-GPU items need the user at the OLED: a 240 Hz `perf:browser` run with `?tv=1`, the
ambient-display T40 walk, and the GPU clips of T6, T11 and T22.

Before stopping, append a Progress entry to the handoff file: what merged (PR links), what is running, and the next task
per lane.
