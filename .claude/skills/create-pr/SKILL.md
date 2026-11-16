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

**Core principle:** the quick check runs last. Any hand edit after `scripts/check.sh --fix` can reintroduce format or
index drift, so the final action before `git add` is always another `scripts/check.sh --fix --quick` (the cheaper form in
step 7 when no code changed).

## Pre-PR gate (in order)

1. **Quick check green:** `scripts/check.sh --fix --quick` (conventions, designs-index, format, lint, typecheck, deps,
   dupes and the build; no tests, ratchet, bench-check or smokes). The pre-commit hook already ran the tests of each
   commit's staged files (`scripts/check.sh --tier 1`), and CI runs the rest on a quiet runner. The full local gate
   (`scripts/check.sh --fix --skip=browser-smoke`, under `flock /tmp/claude-1000/cpu.lock` on a quiet machine) is needed
   only for a PR that moves step time (`bench-check`); a red gate there is read the same way and rerun with
   `scripts/check.sh --rerun-failed`, which runs only the gates the last run left failed. A docs-only change (`git diff --name-only origin/main...HEAD |
scripts/change-scope.sh` prints `docs`: Markdown under `docs/`, `.claude/` or the root only) may use
   `scripts/check.sh --fix --docs`, which is what CI runs for it. Add `--quiet` to print only failures and the
   summary. A failed gate prints a digest under its `✗` line - failed tests with their assertion and first frame,
   type errors, lint problems, unformatted files - and keeps the full output in `.checklogs/<gate>.log`. Act on the
   digest; open the log only when it is not enough. Never rerun `vitest`, `tsc` or `eslint` just to see the errors.
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
    - move the **Status:** line and mark the phase `(built)`; drop `**Validated:**` and `**Priority:**` once
      `Implemented`
    - regenerate the index: `node scripts/designs-index.mjs --write`
    - append learnings to `docs/designs/sim-notes.md` under a dated heading (`### YYYY-MM-DD - <topic>` under
      `## Learned while building`)
7. **Last step before `git add`:** when no code changed after step 1 (only docs, the plan or the commit message),
   `scripts/check.sh --fix --only=designs-index,format` is enough (it only applies the fixes; the pre-commit hook runs
   the conventions, format and lint check at commit time, so it is not repeated here); when code changed, run the step 1
   command again. (`--quick` is enough for code too: CI runs the tests.)

## Git conventions

- Never commit to `main`. Branch from fresh `origin/main`: `git fetch origin && git switch -c <type>/<short-desc>
origin/main` (e.g. `feat/headless-sim-core-phase-1`). Design docs in the planning stage go on `docs/<doc-name>`.
- Stage explicit paths: `git add js/sim/rng.js test/sim/rng.test.js`. Never `git add -A` or `git add .`. Review
  first with `git diff --staged`.
- One self-contained commit per task; each commit passes the pre-commit hook, whose `test-related` gate runs the tests of the staged files, so the task's own tests run at commit time (`npx vitest run <files>` is for iterating before the commit, not a second run). The full gate and CI run once per chunk PR (4 to 8 tasks, AGENTS.md "Build in chunks").
- Conventional subject: `<type>(<optional scope>): <subject>`.
    - types: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`
    - lower-case subject, no trailing period, <= 100 characters
- Body says **what** and **why**. The why lives in commits and PR bodies, never in design docs.
- End the message with the `Co-Authored-By:` trailer the running agent's environment specifies. Do not hardcode a
  model name.

## Push and PR (only when the user asks)

1. `git push -u origin <branch>`
2. Open a draft PR:

    ```bash
    gh pr create --draft --base main --title "<conventional title>" --body "$(cat <<'EOF'
    ## Summary
    <what changed and why, 1-5 bullets>

    ## Scene served
    <the scene or selection rule from docs/principles.md and the detector metric; "None - no behaviour change">

    ## Design doc
    [<doc>.md](docs/designs/<doc>.md) - Status: <old> -> <new>

    ## Delivery requirements
    | Concern | Delivered |
    | ------- | --------- |
    | Architecture | ... |
    ... one row per STYLE.md concern, or N/A - reason ...

    ## Measurements
    <bench / browser-perf / eval:compare output for each Target, or "No targets">

    ## Verification
    - scripts/check.sh --fix: green
    - Manual browser walk: <steps and result>

    ## Learnings
    <entries added to sim-notes.md, or "None">
    EOF
    )"
    ```

    Omit the Design doc, Delivery requirements and Measurements sections only for changes with no design doc (fixes,
    chores), and end the body with the attribution line the environment specifies.

3. Watch CI: `gh pr checks <n> --watch --fail-fast`. The jobs are `scope`, `static`, `test coverage <i>/<n>` and
   `test statistical <i>/<n>` (the shards), `coverage` (the merged coverage and the ratchet), `browser-smoke`, `perf` (advisory)
   and the required `check`, which fails when any of them failed.
4. On failure: `gh run view <run-id> --log-failed`.
    - `static`: the "Local gate" step shows the digest under each `✗` line; for more, `gh run download <run-id> -n
check-logs` (`.checklogs/` and `TestResults/`). A `format` or `designs-index` failure is fixed by `scripts/check.sh
--fix`.
    - `test <pass> <i>/<n>`: the log names the failed test and its assertion; the shard's seed is `github.run_id`, so
      `TEST_SCOPE=<pass> npx vitest run --sequence.shuffle --sequence.seed=<run id> <file>` replays the order for one file.
      A test that times out on a quiet runner is a real slow test: speed it up or move it to a `.slow.test.js` file's
      own limit, never skip it.
    - `coverage`: the ratchet line names the scope and metric below its baseline; add tests for the uncovered code (never
      lower `scripts/quality-baseline.json`). After a failed shard its numbers are partial, so fix the shard first.
    - Reproduce, fix the root cause, commit the fix. Do not just re-run the job.
5. Never merge while `check` is red or pending.

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

## Red flags

- "It passes on my machine" without `scripts/check.sh --ci` when CI disagrees.
- A PR mixing a feature, a refactor and a doc sweep.
- A conformance review used as a substitute for the gate.
- A benchmark compared against a baseline recorded on other hardware.
