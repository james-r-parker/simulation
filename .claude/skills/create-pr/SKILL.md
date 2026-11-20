---
name: create-pr
description: Use when committing, pushing or opening a pull request, or when the check workflow fails on a PR. Triggers on "commit this", "open a PR", "push", "ship it", "raise a PR", "CI is red", "check failed".
---

# create-pr

## Overview

**The PR gate is CI** (`.github/workflows/check.yml`, whose final job is the required `check`). On a quiet runner it
runs the whole test suite, `*.slow.test.js` included, sharded over parallel jobs with coverage, then the coverage ratchet
on the merged coverage, the static gates (`scripts/check.sh --ci --skip=test`) and the browser smoke, in about 6 minutes;
a docs-only PR (`scripts/change-scope.sh`) runs `scripts/check.sh --ci --docs`. The local machine is shared with evals,
so a full local gate times out on load rather than on code. Locally an agent runs the quick pre-push check; the full
local gate is only for performance PRs.

**Core principle:** `scripts/ship.sh` does the mechanical half (merge the base, the gate, the body check, push, PR,
auto-merge, wait). The steps below are the judgement half an agent does before it runs it; the gate runs last, inside
`ship.sh`, so a hand edit after it cannot leave format or index drift behind.

## Before ship.sh (in order)

1. **Know what the gate is.** `scripts/ship.sh` runs it (step 3): `scripts/check.sh --fix --quick` for a code change,
   `scripts/check.sh --fix --docs` when `scripts/change-scope.sh` says `docs` or `records`, and commits what `--fix`
   wrote. The pre-commit hook already ran the tests of each commit's staged files, and CI runs the rest on a quiet
   runner. The full local gate (`scripts/check.sh --fix --skip=browser-smoke`, under `flock /tmp/claude-1000/cpu.lock`
   on a quiet machine) is only for a PR that moves step time (`bench-check`). A failed gate prints a digest under its
   `✗` line and keeps the output in `.checklogs/<gate>.log`; act on the digest, open the log only when it is not enough,
   and never rerun `vitest`, `tsc` or `eslint` just to see the errors. `scripts/check.sh --rerun-failed` reruns only the
   gates the last run left failed.
2. **Tests and logs present:** every behaviour in the diff has a test that pins it, a bug fix has a test that failed
   before the fix, and every new decision point or failure path emits a sim log event (`log.log` in `js/sim/log.js`, with
   `headless-sim-core.md`). Missing either blocks the PR; add them, do not defer them.
3. **Coding standards:** the diff meets [docs/coding-standards.md](../../../docs/coding-standards.md) and the AGENTS.md size limits - each new module has a one-line purpose and a
   test file, no size limit is dodged with `eslint-disable`, errors are loud, hot paths allocate nothing.
4. **Measurements attached:** if the phase has `**Targets:**`, run the comparison for each target and keep the
   output for the PR body: `npm run bench` against `bench/baseline.json` for `bench.*`, `node
scripts/browser-perf.mjs` (v6 by default; `--viewport 3840x2160` and `2560x1440`, on the dev machine's Chrome with `--cdp`) against the budgets in `bench/browser-baseline.json` for `browser.*` (`bench/legacy-baseline.json` is the deleted app's), and `npm run eval:compare` for
   `eval.*` (the `run-evolution-loop` skill, at least 16 seeds). A target that moved the wrong way blocks the PR.
   On any `perf(...)` commit, or a change to a function under `bench/micro/`, also attach `npm run bench:micro -- --compare origin/main` (per-function ops/s and change; a tool beside the whole-step `bench-compare`, which stays the gate).
   These commands arrive with `headless-sim-core.md`, `evolution-evals.md` and `dev-workflow-and-gate.md` Phase 2;
   before then, a phase with Targets cannot be marked built.
5. **Docs in sync:** if the change touched config keys, npm scripts, gate commands, log events or behaviour
   described in `AGENTS.md` or `README.md`, run the `audit-docs` skill and apply the approved edits.
6. **Design doc phase:** if the work delivers a phase of a design doc:
    - run a fresh conformance review agent over the design doc and the full diff (`git diff origin/main...HEAD`),
      checking every Delivery requirements row - **in parallel with** the final check, never instead of it
    - the review also checks that the old path of every flag the PR switched on is deleted, or kept with a reason in
      `scripts/flag-ledger.json`
    - move the **Status:** line and mark the phase `(built)`; drop `**Validated:**` and `**Priority:**` (or `**Scheduled by:**`, with its row in the lead's `## Order` table) once
      `Implemented`
    - regenerate the index: `node scripts/designs-index.mjs --write`
    - append learnings to `docs/designs/sim-notes.md` under a dated heading (`### YYYY-MM-DD - <topic>` under
      `## Learned while building`)
7. **Write the PR body** to a file (the template under Ship); `ship.sh` checks it (step 4) before it pushes.

## Git conventions

- Never commit to `main`. Start with `scripts/task-start.sh <type>/<short-desc>` (a worktree branched from fresh `origin/main`; e.g. `feat/headless-sim-core-phase-1`). Design docs in the planning stage go on `docs/<doc-name>`.
- Stage explicit paths: `git add js/sim/rng.js test/sim/rng.test.js`. Never `git add -A` or `git add .`. Review
  first with `git diff --staged`.
- One self-contained commit per task; each commit passes the pre-commit hook, whose `test-related` gate runs the tests of the staged files, so the task's own tests run at commit time (`npx vitest run <files>` is for iterating before the commit, not a second run). The full gate and CI run once per chunk PR (4 to 8 tasks, AGENTS.md "Build in chunks").
- Conventional subject: `<type>(<optional scope>): <subject>`.
    - types: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`
    - lower-case subject, no trailing period, <= 100 characters
- Body says **what** and **why**. The why lives in commits and PR bodies, never in design docs.
- End the message with the `Co-Authored-By:` trailer the running agent's environment specifies. Do not hardcode a
  model name.

## Ship (only when the user asks to push or open a PR)

Write the body to a file (not committed; `.pr-body.md` is the usual name), ending with the attribution line the
environment specifies:

```markdown
## Summary

<what changed and why, 1-5 bullets>

## Scene served

<the scene or selection rule from docs/principles.md and the detector metric in backticks; "None - no behaviour change">

## Design doc

[<doc>.md](docs/designs/<doc>.md) - Status: <old> -> <new>

## Delivery requirements

| Concern      | Delivered |
| ------------ | --------- |
| Architecture | ...       |

## Measurements

<bench / browser-perf / eval:compare output for each Target, or "No targets">

## Verification

- scripts/check.sh --fix --quick: green
- Manual browser walk: <steps and result>

## Learnings

<entries added to sim-notes.md, or "None">
```

Omit Design doc, Delivery requirements and Measurements only for changes with no design doc (fixes, chores). A diff under
`js/sim/` or `js/evo/` must have a Scene served section that names a scene or selection rule and a backticked detector
metric (not "None"); `ship.sh` refuses it otherwise.

Then, from the branch's worktree with everything committed:

```bash
scripts/ship.sh --title "<conventional title>" --body .pr-body.md
```

It blocks until the PR is merged or red. Add `--no-merge` to leave auto-merge off (the coordinator reviews first). It
never rebases or force pushes, and it does not run `gh pr merge` itself beyond turning on auto-merge with a merge
commit.

| Exit | Meaning                               | Do                                                                     |
| ---- | ------------------------------------- | ---------------------------------------------------------------------- |
| 0    | merged (or green with `--no-merge`)   | report the link and the minutes it prints                              |
| 1    | checks red                            | read the failed job names and log tails below; fix; commit; rerun      |
| 2    | uncommitted files, or on `main`       | commit or stash the files; branch                                      |
| 3    | merging `origin/<base>` conflicted    | resolve the listed paths, commit the merge, rerun                      |
| 4    | the gate failed                       | read the failed gates it names and `.checklogs/<gate>.log`; fix; rerun |
| 5    | the body fails the template           | add the section it names; rerun                                        |
| 6    | push, PR or auto-merge failed         | read the `gh` error (auth, branch protection)                          |
| 7    | green but not merged after 10 minutes | read the `mergeStateStatus` it prints (a required review, a queue)     |

A rerun after a fix commit resumes at step 2 on the same PR. The run is logged to `.checklogs/ship.jsonl`.

On a red `check` (exit 1) the digest names the job; for more, `gh run view <run-id> --log-failed`.

- `static`: the "Local gate" step shows the digest under each `✗` line; for more, `gh run download <run-id> -n
check-logs` (`.checklogs/` and `TestResults/`). A `format` or `designs-index` failure is fixed by `scripts/check.sh --fix`.
- `test <pass> <i>/<n>`: the log names the failed test and its assertion; the shard's seed is `github.run_id`, so
  `TEST_SCOPE=<shard, heavy or statistical> npx vitest run --sequence.shuffle --sequence.seed=<run id> <file>` replays the
  order for one file. A test that times out on a quiet runner is a real slow test: speed it up or move it to a
  `.slow.test.js` file's own limit, never skip it.
- `coverage`: the ratchet line names the scope and metric below its baseline; add tests for the uncovered code (never
  lower `scripts/quality-baseline.json`). After a failed shard its numbers are partial, so fix the shard first.
- Reproduce, fix the root cause, commit the fix, rerun `scripts/ship.sh`. Do not just re-run the job.

Never merge while `check` is red or pending.

**One concern per PR.** An unrelated fix found on the way gets its own branch and PR.

## Common mistakes

- Committing on `main`, or branching from a stale local `main`.
- `git add -A` sweeping in `.sim/`, `evals/results/`, `.checklogs/` or scratch files.
- Editing after the last `scripts/check.sh --fix` and committing format drift.
- Running the full local gate beside evals "to be safe": it times out on load, and CI runs it on a quiet runner.
- Starting a long run with a hand-written `nohup` or `pgrep` loop instead of `scripts/run-detached.sh` and
  `scripts/wait-run.sh`.
- Hand-editing `docs/designs/README.md` instead of running the generator.
- Leaving the design doc Status line behind the code, or forgetting `(built)`.
- Claiming a Target moved without the measurement in the PR body.
- A sim, evo or brain behaviour change whose body names no scene or selection rule from `docs/principles.md`.
- Rationale in the design doc instead of the commit body.
- A subject with a capital letter, trailing period or non-conventional type.
- Pushing or opening a PR the user did not ask for.
- Re-running a red CI job without understanding why it failed.
- Hand-running the push, `gh pr create` and the watch instead of `scripts/ship.sh`; writing a polling loop for CI.

## Red flags

- "It passes on my machine" without `scripts/check.sh --ci` when CI disagrees.
- A PR mixing a feature, a refactor and a doc sweep.
- A conformance review used as a substitute for the gate.
- A benchmark compared against a baseline recorded on other hardware.
