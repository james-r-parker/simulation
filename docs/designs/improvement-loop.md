# Improvement loop

**Status:** Proposed - Phase 1 adds the nightly eval history, trend detection and the weekly improvement routine.
**Validated:** bd49bce (2026-10-11)
**Priority:** 4 - automates measuring and proposing once the evolution rework and the renderer give it something worth tuning
**Depends on:** [evolution-evals.md](evolution-evals.md), [evolution-rework.md](evolution-rework.md), [quality-gates-and-test-tiers.md](quality-gates-and-test-tiers.md)

The improvement loop proposes measured changes between sessions:

- Every night CI evaluates `main` and appends the result to a history file on its own branch.
- A trend check opens an issue when a metric gets worse across code changes.
- A weekly Claude Code routine reads the history, the issues and the experiment ledger, and opens draft PRs that
  propose experiments, config changes and Build queue re-ranks.
- CI runs each proposed experiment and posts its `eval:compare` output on the PR.
- Every proposal waits for the user. Nothing in the loop merges, closes, force-pushes, deletes or writes to `main`.

## Standing permissions

Approving this doc is the user's standing request, under the `AGENTS.md` rule "push and open PRs only when the user
asks", for exactly these actions. `AGENTS.md` Hard rules lists them as the one exception.

| Actor               | May                                                                                                                                                                                                | Branches                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `history` CI job    | Push commits that append to `evals/history.jsonl`; open or comment on `eval-trend` issues                                                                                                          | `eval-history`                                                                              |
| `experiment` CI job | Comment on the PR it runs for; upload artifacts                                                                                                                                                    | none                                                                                        |
| Weekly routine      | Push new branches and open them as draft PRs: at most 3 experiments, 1 re-rank and 1 sweep a week; comment on the `Weekly improvement report` issue; add the `run-experiment` label to its own PRs | `feat/exp-<id>-<desc>`, `docs/rerank-<date>`, `chore/sweep-<key>-<date>`, `docs/retro-r<n>` |

- No actor pushes to a branch it did not create, edits `main`, merges, closes a PR or issue it did not open,
  force-pushes or deletes a branch.
- A re-rank never moves a doc whose `**Priority:**` reason starts with `pinned`.
- Experiment PRs change only `js/evo/`, `js/sim/config-defaults.js` with `test/sim/golden.slow.test.js`, and `evals/`.

The guard is a repository ruleset on `main`: changes only through pull requests, no bypass for GitHub Actions or
apps, force-push and deletion blocked. The workflows' `GITHUB_TOKEN` cannot be scoped to one branch, so the ruleset,
not the token, protects `main`.

## Nightly history (Phase 1)

`.github/workflows/nightly.yml` ([quality-gates-and-test-tiers.md](quality-gates-and-test-tiers.md) Phase 2) gains two jobs that run on the schedule
and on `workflow_dispatch`, only when the evaluated ref is `main`:

- **`nightly-eval`** (`contents: read`, `timeout-minutes: 150`): `npm run eval -- --seeds 8 --ticks 100000 --policy
live` and uploads the report and `.sim/logs/eval-*.jsonl` as the `nightly-eval` artifact. It skips the run
  when the newest history line already has this sha and policy.
- **`history`** (`needs: nightly-eval`, `contents: write`, `issues: write`, concurrency group `eval-history`): downloads
  the report and runs `node scripts/history-append.mjs --report <file>` then `node scripts/trend.mjs`, and pushes
  `eval-history`. It installs no dependencies beyond `npm ci --ignore-scripts`.

Tier 3 keeps its own job and its 60-minute budget.

**History line.** `scripts/history-append.mjs` appends one JSON line to `evals/history.jsonl` on the orphan branch
`eval-history`: `date`, `sha`, `policy`, `configHash`, `seeds`, `ticks`, the report's per-seed values for every
metric, and each metric's mean with its 95% interval from `bootstrapInterval` (`js/evo/compare.js`). A **segment** is
a run of lines with the same `policy`, `configHash`, `seeds` and `ticks`.

**Trend.** `scripts/trend.mjs` compares, within the newest segment, the newest line with the segment's first line
through `compareReports` on the per-seed values, at the Bonferroni level `1 - 0.05 / m` over the `m` metrics that
have a direction. A metric is flagged when it is `worse` on the newest two distinct shas of the segment. A flag opens
an issue labelled `eval-trend` titled with the metric, or comments on the open one for that metric and segment only
when the sha range is new. The issue body embeds the before and after values and intervals, the sha range and the run
link. A segment with fewer than three distinct shas reports nothing.

## Weekly routine (Phase 1)

`.claude/routines/weekly-improvement.md` is the prompt of a scheduled Claude Code routine (Mondays 06:00 UTC, against
this repo). It runs the `improve-weekly` skill:

1. Fetches `eval-history` and reads `evals/history.jsonl` with `git show origin/eval-history:evals/history.jsonl`,
   plus the open `eval-trend` issues, `evals/experiments.json` and `docs/designs/README.md`.
2. With fewer than three distinct shas in the newest segment, posts "insufficient history" on the weekly issue and
   stops.
3. Proposes at most three experiments, following the `run-evolution-loop` skill: each is a draft PR adding a ledger
   entry with `hypothesis`, `prediction`, `predicted` and `predictionAt` before any run, plus the change, labelled
   `run-experiment`.
4. Proposes a re-rank when the ledger's verdicts say a queued phase would help more or less than its rank: the PR
   edits `**Priority:**` lines, keeps ranks unique and regenerates `docs/designs/README.md`.
5. Posts a summary comment on the pinned `Weekly improvement report` issue listing each proposal with its reason.

**Experiments run on CI.** `.github/workflows/experiment.yml` runs on a `run-experiment` label: two jobs (`before` on
the PR's merge-base, `after` on its head), each `npm run eval -- --seeds 16 --ticks 200000 --policy <p>` (`p` the ledger entry's `beforePolicy` or `afterPolicy`) with `timeout-minutes:
360`, then a `compare` job that runs `npm run eval:compare` with the ledger entry's `targets` and posts the table on
the PR. Report artifacts' URLs go into the entry's `before` and `after`.

## Config sweeps (Phase 2)

`npm run sweep -- --key <configKey> --values <a,b,...> --primary <metric> [--policy <name>] [--propose]`
(`scripts/sweep.mjs`):

- Refuses `brainHidden`, `rayCount` and any key that changes `brainLayout`, and refuses fewer than 16 seeds.
- Runs one eval per value with `--config` overriding the key, plus the default, on seeds 1-16 at 200000 ticks, and
  compares each with the default through `compareReports` with `--allow-config-diff <key>`.
- A **candidate** is `better` on `--primary` and `worse` on no other directional metric at the Bonferroni level.
- Each candidate is re-run on seeds 17-32; it is a **winner** when it is still `better` on `--primary` there.
- Writes `evals/sweeps/<key>-<date>.json`: per value the report artifact paths and each verdict, for both seed sets.
- `--propose` opens a draft PR whose single commit changes the default in `js/sim/config-defaults.js` and the
  golden `worldHash` together, with the sweep table in the body; the body warns that the new `rulesHash` invalidates `public/champions/v1/` and `evals/league.json`; a second
  draft PR rebaselines
  `evals/baselines/` once the first merges.
- `evals/sweep-plan.json` lists `{ key, values, primary }` entries; the weekly routine sweeps one a week, in order,
  through `.github/workflows/sweep.yml` (same shape as `experiment.yml`).

## Retros and dashboard (Phase 3)

- `scripts/check.sh --ci` writes `TestResults/gates.json`: each gate's status (`passed`, `failed`, `skipped`) and
  seconds. The `check` and `nightly` jobs upload it as the `gates` artifact on every run.
- `evals/experiments.schema.json` gains, in Phase 1, `predicted` (metric to `better`, `worse` or `no-difference`), `predictionAt`
  and `resultAt`; `predictionAt` is required when `predicted` is present. Entries without `predicted` are not counted.
- `npm run retro` (`scripts/retro.mjs`) writes `evals/retros/R<n>.json` (the next `n` after the highest present):
    - **prediction hit rate:** the share of entries with `predicted` whose every predicted verdict matched;
    - **gate failure rates:** per gate, failed over non-skipped across the last 50 `check` runs' `gates` artifacts
      (`gh run download`); expired artifacts are counted as missing and reported;
    - **skill adherence:** the share of entries with `predictionAt` before `resultAt`, and of merged PRs that mark a
      phase `(built)` whose Targets are not `none` and whose body contains `eval:compare` or `bench` output.
- The weekly routine runs the retro when the ledger has five entries newer than the newest retro, and may open a
  draft PR on `docs/retro-r<n>` changing a skill, `AGENTS.md` or `STYLE.md`, citing the retro.
- `npm run dashboard` (`scripts/dashboard-data.mjs`, then `vite` serving `evals/dashboard/`) builds
  `evals/dashboard/data.json` (gitignored) from the history, ledger and retros. `evals/dashboard/index.html` charts
  each metric's nightly mean and interval per segment, marks experiments and merges, and shows the newest retro.
- When the routine has the Artifact tool, it publishes the page with `data.json` as a private claude.ai Artifact and
  keeps its URL in `.claude/routines/weekly-improvement.md` so each week republishes the same link; otherwise it
  attaches `data.json` to the weekly issue.

## Setup

These are user actions, done once when Phase 1 is built:

1. Create the `main` ruleset described under Standing permissions.
2. Create the orphan `eval-history` branch with an empty `evals/history.jsonl`.
3. Create the labels `eval-trend` and `run-experiment`, and the pinned `Weekly improvement report` issue.
4. Create the weekly routine with the `schedule` skill from `.claude/routines/weekly-improvement.md`.

## Phases

### Phase 1 - Nightly history, trends and the weekly routine

**Targets:** none - process; the loop measures, it changes no metric itself

`scripts/lib/history.mjs`, `scripts/lib/trend.mjs`, their CLIs, the `nightly-eval` and `history` jobs,
`experiment.yml`, the ledger fields `predicted`, `predictionAt` and `resultAt`, the `improve-weekly` skill, the
routine prompt, and the `AGENTS.md` exception.

### Phase 2 - Config sweeps

**Targets:** none - tooling; each proposed default carries its own `eval:compare` evidence

`scripts/lib/sweep.mjs`, `scripts/sweep.mjs`, `sweep.yml`, `evals/sweep-plan.json` and the routine's sweep step.

### Phase 3 - Retros and dashboard

**Targets:** none - process

`TestResults/gates.json`, `scripts/lib/retro.mjs`, `scripts/retro.mjs`,
`scripts/lib/dashboard.mjs`, `scripts/dashboard-data.mjs`, `evals/dashboard/index.html`, and the routine's retro and
dashboard steps.

## Delivery requirements

| Concern                 | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Architecture            | Node CLI scripts over pure functions: `scripts/history-append.mjs`, `scripts/trend.mjs`, `scripts/sweep.mjs`, `scripts/retro.mjs`, `scripts/dashboard-data.mjs` over `scripts/lib/history.mjs`, `trend.mjs`, `sweep.mjs`, `retro.mjs`, `dashboard.mjs`, which import `js/evo/compare.js` and `js/evo/report.js`. Workflows: jobs in `.github/workflows/nightly.yml`, new `experiment.yml` and `sweep.yml`. Agent files: `.claude/routines/weekly-improvement.md`, `.claude/skills/improve-weekly/SKILL.md`. Data: `evals/sweep-plan.json`, `evals/sweeps/`, `evals/retros/`, `evals/dashboard/index.html`. No change to `js/sim` or `js/evo` behaviour |
| Unit tests              | `test/history.test.js` (line format; segment boundaries on policy, config, seeds or ticks), `test/trend.test.js` (a persistent drift over two shas flags; a one-sha blip does not; a new segment resets; fewer than three shas reports nothing; dedupe by metric and segment), `test/sweep.test.js` (candidate and winner rules on recorded reports; layout keys and fewer than 16 seeds refused), `test/retro.test.js` (hit rate, failure rates excluding skips, adherence, missing artifacts), `test/dashboard-data.test.js` (output shape); `test/check-experiments.test.js` gains the `predicted` and `predictionAt` rules                         |
| Headless e2e            | `test/nightly-dry-run.test.js` runs `history-append` and `trend --dry-run` over a fixture history of 12 lines across 4 shas with one injected persistent drift and asserts exactly one flagged metric; no network                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Performance budget      | `nightly-eval` within 150 minutes on `ubuntu-latest` (4 vCPU, 3 workers, 8 seeds x 100000 ticks); each `experiment.yml` arm within 360 minutes. No `bench.*` or `browser.*` change                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Evolution metrics       | N/A - the loop proposes changes; each proposal carries its own `eval:compare` verdicts against the Metrics table in [evolution-evals.md](evolution-evals.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Determinism             | Nightly evals use the fixed seeds, so a sha and policy give one report, and repeated nights on one sha are skipped; sweeps compare on the same seeds and confirm on seeds 9-16; the trend check is a pure function of the history file                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Config and persistence  | No `createConfig` keys. New files: `evals/history.jsonl` (on `eval-history` only), `evals/sweep-plan.json`, sweep and retro JSON, `evals/dashboard/data.json` (gitignored), `TestResults/gates.json`. The ledger schema gains `predicted`, `predictionAt` and `resultAt`. No IndexedDB change                                                                                                                                                                                                                                                                                                                                                          |
| Logging and diagnostics | No `simLog` events - tooling only. Each script prints what it read and wrote and exits non-zero naming the file and field on malformed input. `nightly-eval` adds the report and `.sim/logs/eval-*.jsonl` to its artifact. A trend issue carries the numbers, sha range and run link; reproduce locally with `npm run eval` at both shas and `npm run eval:compare`                                                                                                                                                                                                                                                                                    |
| Browser compatibility   | The dashboard page is checked in Chromium, served locally by `npm run dashboard`; the published Artifact is the same page with `data.json` alongside                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Docs                    | `AGENTS.md` Hard rules (the standing-permissions exception), Workflow (nightly, weekly, where proposals appear) and Commands (`sweep`, `retro`, `dashboard`); [quality-gates-and-test-tiers.md](quality-gates-and-test-tiers.md)'s tier note points at the `nightly-eval` job; the `run-evolution-loop` skill's Rank step points at the weekly routine. This doc becomes `Implemented` when Phase 3 lands                                                                                                                                                                                                                                              |
| Verification            | `scripts/check.sh` green; the steps in Verification below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## Task breakdown

### Phase 1 - Nightly history, trends and the weekly routine

| #   | Task                                                                                                                                                                                       | Nature       | Depends on                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | --------------------------- |
| T1  | Add `scripts/lib/history.mjs` and `scripts/history-append.mjs` with tests                                                                                                                  | [mechanical] | -                           |
| T2  | Add `scripts/lib/trend.mjs` and `scripts/trend.mjs` with tests and the nightly dry-run test                                                                                                | [judgement]  | T1                          |
| T3  | Add the `nightly-eval` and `history` jobs to `nightly.yml`                                                                                                                                 | [mechanical] | T2                          |
| T4  | Add `.github/workflows/experiment.yml`                                                                                                                                                     | [judgement]  | T3                          |
| T5a | Add `predicted`, `predictionAt` and `resultAt` to the ledger schema with tests                                                                                                             | [mechanical] | -                           |
| T5  | Add the `improve-weekly` skill and `.claude/routines/weekly-improvement.md`                                                                                                                | [judgement]  | T4                          |
| T6  | Update `AGENTS.md` (standing permissions, workflow), [quality-gates-and-test-tiers.md](quality-gates-and-test-tiers.md) and the `run-evolution-loop` skill; list the Setup steps in the PR | [mechanical] | T5, T5a                     |
| T7  | Conformance review of Phase 1                                                                                                                                                              | [judgement]  | T1, T2, T3, T4, T5, T5a, T6 |

### Phase 2 - Config sweeps

| #   | Task                                                                                    | Nature       | Depends on |
| --- | --------------------------------------------------------------------------------------- | ------------ | ---------- |
| T8  | Add `scripts/lib/sweep.mjs`, `scripts/sweep.mjs` and `npm run sweep` with tests         | [judgement]  | T7         |
| T9  | Add `.github/workflows/sweep.yml`, `evals/sweep-plan.json` and the routine's sweep step | [mechanical] | T8         |
| T10 | Conformance review of Phase 2                                                           | [judgement]  | T8, T9     |

### Phase 3 - Retros and dashboard

| #   | Task                                                                                                                           | Nature       | Depends on         |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------------------ |
| T11 | Write `TestResults/gates.json` from `scripts/check.sh --ci` and upload it from both workflows                                  | [mechanical] | T10                |
| T13 | Add `scripts/lib/retro.mjs`, `scripts/retro.mjs` and `npm run retro` with tests                                                | [judgement]  | T11                |
| T14 | Add `scripts/lib/dashboard.mjs`, `scripts/dashboard-data.mjs`, `evals/dashboard/index.html` and `npm run dashboard` with tests | [judgement]  | T10                |
| T15 | Add the routine's retro and dashboard steps                                                                                    | [mechanical] | T13, T14           |
| T16 | Conformance review of Phase 3                                                                                                  | [judgement]  | T11, T13, T14, T15 |

## Verification

1. `scripts/check.sh` is green.
2. After the Setup steps, `gh workflow run nightly.yml --ref main` appends one line to `evals/history.jsonl` on
   `eval-history`; a second dispatch on the same sha appends nothing.
3. `node scripts/trend.mjs --history <fixture> --dry-run` on a copy with one metric drifting over two shas prints that
   metric and nothing else.
4. Adding `run-experiment` to a draft PR runs `experiment.yml`, which posts an `eval:compare` table on the PR.
5. The weekly routine's first run opens only draft PRs on the allowed branch prefixes, or reports insufficient
   history, and comments on the weekly issue.
6. `npm run sweep -- --key foodSpawnRate --values 0.015,0.025 --primary eval.food_energy_per_1k` writes a sweep file
   with verdicts on both seed sets.
7. `npm run dashboard` serves a page charting every metric's nightly series.
