---
name: create-plan
description: Use when planning new simulation capability or a change of approach - sim core, sensors, brains, fitness, selection, archive, trainer, worker, renderer, persistence, evals or benchmarks - before or while in plan mode. Triggers on "plan this", "design doc for", "let's plan", "how should we build", "write the doc for". Not for bug fixes, typo or doc tweaks, or pure refactors.
---

# create-plan

## Overview

A plan is a design doc in `docs/designs/` with status `Proposed`. It is the same file that later describes the
shipped code, so it follows [STYLE.md](../../../docs/designs/STYLE.md) from the first line.

**Core principle:** every requirement is either concretely planned - named files, functions, config keys, metrics
and behaviours - or ruled out with `N/A - <reason>`. A bare "add tests", "make it faster" or "N/A" is the failure
mode this skill exists to prevent.

Planning is a stage of its own. A body of work gets all of its design docs written, reviewed and approved before
any of its code changes; the user then confirms the Build queue.

## Scope gate

Use this skill for new capability or a change of approach. Skip it for:

- bug fixes (failing test, fix, commit - use `create-pr`)
- typo, wording or doc-only tweaks
- pure refactors with no behaviour change

If unsure, ask the user in one line before writing a doc.

## Steps

### 0. Set up the doc

1. Read `docs/designs/STYLE.md` in full. It is the contract; this skill only explains it.
2. Check for an existing doc first: `fd -e md . docs/designs` and `rg -il '<feature words>' docs/designs`.
   Extend an existing `Proposed` doc rather than starting a sibling. Read `legacy-audit.md` when it exists - it is
   the evidence for what the legacy code does wrong.
3. The plan lives at `docs/designs/<kebab-feature>.md` - never `~/.claude/plans`, a scratch file or the
   conversation alone. If plan mode writes elsewhere, copy the content into the design doc before finishing.
4. Stamp the head of the doc:

    ```
    # <Feature title>

    **Status:** Proposed - <one line: what, which phase first>.
    **Validated:** <sha> (<YYYY-MM-DD>)
    **Priority:** <rank> - <why this rank>
    **Depends on:** [other-doc.md](other-doc.md)
    ```

    Get `<sha>` from `git fetch origin && git rev-parse --short origin/main`; use today's date. Omit
    `**Depends on:**` when there is nothing to build first. Propose a `**Priority:**` rank against the Build queue in
    `docs/designs/README.md` (1 is next; ranks are unique), renumber the docs it moves down in the same PR, and ask the
    user to confirm the rank in the interview.

5. Under every `### Phase N - ...` heading, add one `**Targets:**` line: the metrics the phase should move (the
   Metrics table in `evolution-evals.md` once it exists: `eval.*`, `bench.*`, `browser.*`), or
   `**Targets:** none - <reason>`. The `designs-index` gate fails an unbuilt phase without exactly one.
6. Link code repo-relative and by symbol (`forwardAll` in `../../js/sim/brain.js`), never by line number. Verify
   every named symbol that already exists with `rg -n '\b<symbol>\b' js` or `sg -p '<pattern>' -l js js`. Name a doc
   that does not exist yet in code font, not as a link - the gate rejects links that do not resolve.
7. Regenerate the index: `node scripts/designs-index.mjs --write`, and commit `docs/designs/README.md` with the
   doc. Never hand-edit the index.

### 1. Explore

Read the code the doc replaces or extends before asking anything. Note the symbols, hardcoded tunables, hot paths
and existing tests. Prefer reusing an existing function over planning a new one, and say which.

### 2. Interview - one AskUserQuestion batch

Ask these together, in a single batch:

- **Scale and performance:** agent count, ticks per second, which `bench.*` / `browser.*` budget it must hold.
- **Determinism:** which RNG streams it draws from; must it replay bit-for-bit from seed and config?
- **Evolution impact:** which `eval.*` metrics it must move, and by how much counts as better.
- **Persistence:** does it change saved genomes, the archive, champion files or the IndexedDB schema version?
- **Browser:** which browsers and devices it must run on; does it need WebGPU, workers or transferables?
- **Delivery:** one PR, or phases? Which phase ships first? Confirm the proposed Priority rank.

If intent is still unclear after the answers - conflicting goals, unknown visible behaviour - escalate to a deeper
interview (follow-up questions one topic at a time) before writing requirements. Do not guess.

### 3. Delivery requirements

End the doc with a **Delivery requirements** table using exactly the rows in STYLE.md. "Concrete" here means:

| Concern                 | Concrete looks like                                                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | Which of `js/sim`, `js/evo`, the worker, the renderer or the UI each piece lives in; new modules and exported functions by name                                      |
| Unit tests              | `test/<area>/<module>.test.js` files and the behaviours each pins (edge cases, failure paths, reference comparisons); every task that adds behaviour lists its tests |
| Headless e2e            | The golden run: seed, config overrides, tick count and the `worldHash` it asserts; or the `eval-smoke` run                                                           |
| Performance budget      | The `bench.*` / `browser.*` numbers before and after, and the regression threshold the gate enforces                                                                 |
| Evolution metrics       | The `eval.*` metrics, seeds and ticks, and the `eval:compare` verdict that counts as done                                                                            |
| Determinism             | RNG streams used (`fork(rng, '<name>')`); what replays from seed and config; what does not and why                                                                   |
| Config and persistence  | Each new key in `createConfig` with type and default; schema version bumps and their upgrade path                                                                    |
| Logging and diagnostics | Each new `simLog` event: name, level, fields; what every failure path logs; the `npm run replay` command that reproduces it                                          |
| Browser compatibility   | Browsers verified; fallbacks when a feature is missing                                                                                                               |
| Docs                    | Files touched (AGENTS.md, README, skills); what this doc becomes once `Implemented`; learnings for `sim-notes.md`                                                    |
| Verification            | `scripts/check.sh` green plus the manual browser walk, step by step                                                                                                  |

Tests and logging are never deferred to a later phase: each phase's tasks include the tests and log events for the
behaviour they add (STYLE.md, "Tests and diagnostics ship with the code").

### 4. Task breakdown

Add a **Task breakdown** table with exactly these columns. The `designs-index` gate lints it and `jmz plan run`
reads it, so the format is strict:

| #   | Task                                | Nature       | Depends on |
| --- | ----------------------------------- | ------------ | ---------- |
| T1  | Add `createConfig` and its defaults | [mechanical] | -          |
| T2  | Implement the spatial hash          | [judgement]  | T1         |

- Ids are `T` plus a number, optionally a letter suffix (`T4a`); `Depends on` lists ids separated by commas, or `-`.
- One task = one self-contained commit that passes the gate.
- `[mechanical]`: fully specified, little room for choice. `[judgement]`: design decisions remain. Tag honestly.
- Make dependencies explicit so independent tasks can run in parallel.
- Group tasks under `### Phase N - ...` headings that match the doc's phases.
- A plan that adds a flag or an enum value carries the task that deletes the losing path once the new value wins, and
  adds the flag to `scripts/flag-ledger.json` (`key`, `plan`, `task`, `reason`) in the same change; the `conventions`
  gate fails a boolean or enum config rule missing from the ledger, and an entry whose plan is built while the key
  still exists.

### 5. Mandated final task

The last task of every phase is the conformance review:

- A **fresh** review agent (no shared context) reads the design doc and the full diff against `origin/main`
  and checks every Delivery requirements row was delivered, or that its N/A still holds.
- It runs **in parallel with** the final `scripts/check.sh`, never instead of it.
- The same PR moves the **Status:** line (`In progress - Phase 1 built`, or `Implemented`), marks the phase
  `(built)`, and regenerates the index.

### 6. Review, present, commit

1. Add the **Verification** section.
2. Run a **fresh review agent** over the draft, in parallel with `scripts/check.sh --docs`. It checks the draft
   against STYLE.md and the code: every named symbol exists, no rationale or history, no bare N/A or TBD, task
   dependencies acyclic and genuinely independent where they claim to be. Fix what it finds.
3. Present the doc to the user and edit until they approve it.
4. Commit on `docs/<doc-name>` branched from fresh `origin/main` (see `create-pr` for git conventions). Push or open
   a PR only when the user asks.

## Red flags

- Any Delivery requirements cell reading "add tests", "update docs", "make it faster" or a bare "N/A".
- A `TBD` cell anywhere except a stub (status detail starting `stub`); fleshing out a stub replaces every `TBD`
  and drops `stub` from the status detail.
- A phase with Targets but no numbers for what "better" means.
- Learnings written anywhere but `sim-notes.md` (`## Learned while building`, one `### YYYY-MM-DD - <topic>` entry
  per finding).
- The plan lives anywhere other than `docs/designs/<kebab-feature>.md`.
- No `**Validated:**` stamp, or a stamp taken from a local branch instead of `origin/main`.
- Line-number references (`agent.js:42`) or symbols that `rg` / `sg` cannot find.
- Hand-edited `docs/designs/README.md`.
- Rationale, history or alternatives in the doc - they go in the commit and PR body.
- Code changes starting before the doc is approved.
- No conformance review task, or the review replacing `scripts/check.sh`.
- A flag or enum value with no task that deletes the losing path, or no entry in `scripts/flag-ledger.json`.
