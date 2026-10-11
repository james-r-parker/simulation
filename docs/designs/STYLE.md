# Design doc style

Design docs in `docs/designs/` describe Blob Evolution **as it is**. They are specifications, not narratives.

A design doc and a plan are the **same artefact** at different points in its life. A doc starts `Proposed` -
nothing built, read it as a plan - becomes `In progress` as phases land, and ends `Implemented`, at which point
it describes shipped code. There is no separate plans folder, no ADR register, and no step where a plan is
transcribed into documentation.

The simulation is built over many short sessions. The status line and the validated stamp are what let any
session - human or agent - pick the work up cold.

## Status (required, first line after the title)

Every doc opens with exactly one status line, in this format:

```
**Status:** <Keyword> - optional detail.
```

The keyword comes from this closed set. Detail after the dash is free text - name the phase, the PR, what is
left.

| Keyword       | Means                                                                             |
| ------------- | --------------------------------------------------------------------------------- |
| `Proposed`    | Nothing built. Reads as a plan; do not trust it as a description of the code.     |
| `In progress` | Partly built. The detail says which phases are real.                              |
| `Implemented` | Describes shipped code. Trust it, and fix it when the code moves.                 |
| `Superseded`  | Kept for history. The detail links what replaced it.                              |
| `Reference`   | Not a design of the simulation - audits, research, learnings, environment guides. |

The status line is the **only** place status is recorded. [README.md](README.md) is generated from it by
`node scripts/designs-index.mjs --write`, and `scripts/check.sh` fails when the two disagree - so never hand-edit
the index. **A doc whose keyword is wrong is worse than a doc with no status**, so move the keyword in the same PR
that moves the code.

## Validated (required while `Proposed` or `In progress`)

A doc that has not been built yet is a claim about a codebase that keeps moving. Record which one:

```
**Validated:** <sha> (<YYYY-MM-DD>)
```

Put it directly under the status line. `<sha>` is `git rev-parse --short origin/main` at the time the doc was
last checked against the code. The index surfaces it, so a plan that has drifted a long way from `main` is
visible without opening it. Restamp it whenever the doc is re-checked - the `resume-plan` skill does exactly
this. Drop the line once the doc is `Implemented`.

## Priority (required while `Proposed` or `In progress`)

```
**Priority:** 3 - <why this rank, in one line>
```

Directly under the validated stamp, above `**Depends on:**`. The number is the doc's rank in the build queue:
1 is built next. Ranks are unique across all `Proposed` and `In progress` docs, and the index lists them in order
under **Build queue**. The rank applies to the doc's next unbuilt phase, the one its status line names.

- A new doc takes the rank its author proposes; the docs it moves down are renumbered in the same PR.
- The evolution loop (the `run-evolution-loop` skill) proposes re-ranks from eval and benchmark
  results. A re-rank is a PR that waits for approval.
- A reason that starts with `pinned` keeps its rank against the loop's proposals.
- Drop the line once the doc is `Implemented`.

## Depends on (optional)

```
**Depends on:** [headless-sim-core.md](headless-sim-core.md)
```

Directly under the priority line. Links other design docs that must be built first. The index shows it, so the
build order is readable without numbered file names.

## Targets (required on every unbuilt phase)

Under each unbuilt `### Phase N - ...` heading, one line says what the phase is expected to move:

```
**Targets:** bench.step_ms@500, eval.food_energy_per_1k
```

- A target is a metric name from the **Metrics** table in `evolution-evals.md`: an
  `eval.*` metric from `npm run eval`, a `bench.*` metric from `npm run bench`, or a `browser.*` metric from
  `scripts/browser-perf.mjs`. A trailing `*` matches any suffix (`eval.best_fitness.*`).
- A phase that moves no metric says `**Targets:** none - <reason>`.
- A phase with targets is not `(built)` until its PR carries the `eval:compare` or `bench` output for each target.

## Phases

Multi-phase work uses `### Phase N - …` headings, marked `(built)` as they land, with the status detail line
summarising. That, plus the merged PRs, is the entire progress record.

There is deliberately **no state file, no task register and no session log.** Git knows what shipped; the status
line says what it means. The only writable coordination surface is one line, updated by the PR that earned the
change.

## One doc per design

Flat files, no folder per plan. Where a design genuinely needs two documents, use **sibling files**
cross-linked with a `> Companion to …` blockquote.

Name the file after the feature, kebab-case: `headless-sim-core.md`. No numbers.

## Mandated sections (Proposed and In progress docs)

Every design ends with a **Delivery requirements** table covering each concern below. Each row names concrete
artifacts and behaviours, or says **"N/A - \<reason\>"**. A bare "N/A" is not acceptable. The `create-plan` skill
explains each row.

| Concern                 | Names                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| Architecture            | The split between sim core (`js/sim`), evolution (`js/evo`), worker, renderer and UI; new modules by name |
| Unit tests              | `test/**` files and the behaviours they pin                                                               |
| Headless e2e            | The golden deterministic run (seed, config, ticks, expected `worldHash`) or the `eval:smoke` run          |
| Performance budget      | `bench.*` and `browser.*` metrics before and after, against the committed baselines                       |
| Evolution metrics       | `eval.*` metrics the phase must move and the `eval:compare` verdict required                              |
| Determinism             | RNG streams used; what is replayable from seed and config                                                 |
| Config and persistence  | New config keys with defaults; IndexedDB schema version changes; saved file formats                       |
| Logging and diagnostics | `simLog` events added (name, level, fields), what each failure path logs, the replay command              |
| Browser compatibility   | Browsers and devices verified; WebGL, WebGPU and worker assumptions                                       |
| Docs                    | Files touched; what this doc becomes once `Implemented`                                                   |
| Verification            | Done-criteria: `scripts/check.sh`, the manual browser walk                                                |

## Tests and diagnostics ship with the code

Every phase ships its tests and its logging in the same PR as the behaviour. A phase is not `(built)` without
both.

- **Tests.** Each behaviour a phase adds has a test that pins it, including its failure paths. A bug fix starts
  with a test that fails before the fix. Simulation tests run headless on a seeded world - never on
  `Math.random`, wall-clock time or a real GPU.
- **Log events.** Each decision point and failure path emits a structured `simLog` event with a stable name.
  Events carry the ids needed to follow one agent or one run (seed, tick, agent slot, genome id). Nothing logs
  per agent per tick.
- **Debuggability.** The design doc's Logging and diagnostics row says what a failure looks like in the logs and
  how to replay it from seed and config. The `debug-sim` skill is the procedure agents follow.

A **stub** - a `Proposed` doc whose status detail starts with `stub` - may leave a row as `TBD - <reason>`. The
`create-plan` skill replaces every `TBD` before the doc's first phase is built; `TBD` in any other doc is a
defect.

Followed by a **Task breakdown** table and a **Verification** section.

## Task breakdown

The table format is strict - `scripts/designs-index.mjs` lints it, and `jmz plan run` reads it:

| #   | Task                                | Nature       | Depends on |
| --- | ----------------------------------- | ------------ | ---------- |
| T1  | Add `createConfig` and its defaults | [mechanical] | -          |
| T2  | Implement the spatial hash          | [judgement]  | T1         |

- Exactly four columns: `#`, `Task`, `Nature`, `Depends on`.
- Ids are `T` plus a number, optionally a letter suffix (`T4a`), unique within the doc.
- `Nature` is `[mechanical]` (fully specified) or `[judgement]` (design decisions remain).
- `Depends on` lists ids separated by commas, or `-`. Every id it names exists in the doc.
- One task = one self-contained commit. The last task of every phase is the conformance review.
- Tasks are grouped under `### Phase N - ...` headings that match the phases above.

## Voice

- Present tense, active voice. "The worker posts a snapshot", not "We post" or "The worker will post".
- No first person ("we", "you", "I").
- No process language ("decided", "chose", "considered", "rejected").

A `Proposed` doc is the one place future tense is tolerable, because nothing exists yet to describe. Prefer
present tense even there - it is what the doc says once it is `Implemented`, so it saves a rewrite.

## Density

- Statement > paragraph > diagram > example. In that order.
- One fact per sentence.
- Tables for any structure that repeats (config keys, metrics, events, states).
- Use `-` rather than em dashes.

## Linking to code

Link source files **repo-relative** (`../../js/sim/brain.js`).

**Name the symbol, never pin a line.** `forwardAll` in `brain.js` still means something after the file moves; a
pinned line number silently starts pointing at a closing brace. `scripts/designs-index.mjs` rejects
`file.js:123` references.

## What does NOT belong in a design doc

- Rationale ("X was picked because Y")
- History ("originally A, now B")
- Alternatives considered
- Aspirational language. If it is true, write it; if not, omit it.

## Where rationale and learnings live

| Kind                               | Home                                                            |
| ---------------------------------- | --------------------------------------------------------------- |
| Why a change was made              | The commit body and the PR description                          |
| Audits, research, comparisons      | A `Reference` doc (e.g. `legacy-audit.md`)                      |
| Platform and library surprises     | [sim-notes.md](sim-notes.md), under `## Learned while building` |
| Results of an evolution experiment | `evals/experiments.json` (the `run-evolution-loop` skill)       |

## Notes (sparse callout)

Use a `> Note:` blockquote ONLY for non-obvious behaviour a reader would otherwise be surprised by. The bar:
"if you didn't read this, you might write a bug."

Wrong:

> Note: A SharedArrayBuffer was considered for the snapshot but left out.

Right:

> Note: A transferred snapshot buffer is detached on the sending side. The worker writes only into the buffer
> the main thread has handed back.
