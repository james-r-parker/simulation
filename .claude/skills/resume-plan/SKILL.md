---
name: resume-plan
description: Use when picking a design doc back up in a new session. Triggers on "carry on", "resume", "what's next", "continue the plan", "pick up where we left off", or naming a doc in docs/designs/ to work on.
---

# resume-plan

## Overview

The simulation is built in short sessions. The only progress record is each design doc's **Status:** line, its
`(built)` phase markers and git history - there is no state file or session log.

**Core principle:** a plan is a claim about a codebase that has kept moving. Re-validate it against `origin/main`
before starting any task, and restamp it when it checks out.

## Steps

1. **Find the doc.** Read the **Build queue** in `docs/designs/README.md`: the doc ranked 1 by its `**Priority:**`
   line is next, unless the user names another. If the latest experiments in `evals/experiments.json` argue for a
   different order, say so and ask before re-ranking.
2. **Read it fully.** Status line, Validated stamp, Depends on, every phase, the Delivery requirements and Task
   breakdown tables. Also read any doc it depends on, and confirm those are `Implemented` or far enough along.
3. **Measure drift.**

    ```bash
    git fetch origin
    git log --oneline <validated-sha>..origin/main
    git diff --stat <validated-sha> origin/main
    ```

    Review relevant hunks with `git diff <validated-sha> origin/main -- <path>`.

4. **Re-verify every reference.** For each file and symbol the doc names:
    - files: `fd <name> js scripts test`
    - symbols: `rg -n '\b<symbol>\b' js scripts test` or `sg -p '<pattern>' -l js js`
    - built phases: confirm the code they describe actually exists on `origin/main`.
5. **Check library facts.** Compare versions and API claims in the doc against `package.json` (exact pins) and
   `docs/designs/sim-notes.md`. Flag any API the doc relies on that the notes say has changed.
6. **Check the baselines.** If the next phase has Targets, confirm the baselines it compares against exist
   (`bench/baseline.json`, `bench/legacy-baseline.json`, `bench/browser-baseline.json`, `evals/baselines/*.json`) and were recorded on this
   machine; a baseline from different hardware is not comparable for `bench.*` or `browser.*` metrics. The baselines
   are created by `dev-workflow-and-gate.md` Phase 2, `headless-sim-core.md` and `evolution-evals.md`; a phase whose
   baseline does not exist yet waits for the doc that creates it.
7. **Update the doc** where the code moved: renamed symbols, moved files, tasks already done by other work, new
   dependencies. Keep STYLE.md voice. Then restamp:

    ```
    **Validated:** <git rev-parse --short origin/main> (<today YYYY-MM-DD>)
    ```

    If the Status line is wrong, fix it, then run `node scripts/designs-index.mjs --write`.

8. **Report** to the user:
    - the doc and its current status
    - drift summary (commits since the old stamp, anything that affected the plan)
    - edits made to the doc
    - the next phase, its tasks with `[mechanical]` / `[judgement]` hints and dependencies, and which can run in
      parallel
    - its Targets and the baselines they will be compared against
    - conflicts or open questions
9. **Ask before starting.** Do not begin implementation until the user confirms the next step. When work starts,
   branch off fresh `origin/main` (see `create-pr`).

## Red flags

- Starting work on a stale **Validated:** stamp without re-checking.
- Trusting line numbers, or trusting that a named symbol exists without `rg` / `sg`.
- Treating a `Proposed` doc as a description of the code.
- Editing `docs/designs/README.md` by hand instead of running the generator.
- Skipping a `Depends on:` doc that is not built yet.
- Starting a phase with Targets when its baseline is missing.
- Silently resolving a conflict between the doc and the code - report it and ask.
- Starting implementation before the user says go.
