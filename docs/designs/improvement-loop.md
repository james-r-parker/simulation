# Improvement loop

**Status:** Proposed - Phase 1 adds the nightly eval history, trend detection and the weekly improvement routine.
**Validated:** 23eaea3 (2026-10-17)
**Priority:** 8 - automates measuring and proposing once the evolution rework and the renderer give it something worth tuning
**Depends on:** [evolution-evals.md](evolution-evals.md), [evolution-rework.md](evolution-rework.md), [quality-gates-and-test-tiers.md](quality-gates-and-test-tiers.md), [world-balance.md](world-balance.md), [deployment-and-community.md](deployment-and-community.md)

The improvement loop proposes measured changes between sessions:

- Every night CI evaluates `main` and appends the result to a history file on its own branch.
- A trend check opens an issue when a metric gets worse across code changes.
- A weekly Claude Code routine reads the history, the issues and the experiment ledger, and opens draft PRs that
  propose experiments, config changes and Build queue re-ranks.
- CI runs each proposed experiment and posts its `eval:compare` output on the PR.
- Every proposal waits for the user. Nothing in the loop merges, closes, force-pushes, deletes or writes to `main`.
- A proposal that changes `rulesHash` (a swept default) takes `season/next` as its base, so weekly proposals batch into
  one season at most every 4 weeks ([deployment-and-community.md](deployment-and-community.md) Seasons).

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
- Experiment PRs change only `js/evo/`, `js/sim/config-defaults.js` with `test/sim/golden.slow.test.js`, and `evals/`. A PR
  that changes `rulesHash` takes `season/next` as its base; `releaseCheck` refuses it against `main`.

The guard is the `main` ruleset (built, 2026-10-17): changes only through pull requests, required checks `check` and
`browser-smoke`, branches strictly up to date, no bypass actors, force-push and deletion blocked, auto-merge enabled. The
`season/next` branch gets the same ruleset. The workflows' `GITHUB_TOKEN` cannot be scoped to one branch, so the ruleset,
not the token, protects `main`.

## Nightly history (Phase 1)

`.github/workflows/nightly.yml` ([quality-gates-and-test-tiers.md](quality-gates-and-test-tiers.md) Phase 2) gains two jobs that run on the schedule
and on `workflow_dispatch`, only when the evaluated ref is `main`:

- **`nightly-eval`** (`contents: read`, `timeout-minutes: 150`): `npm run eval -- --seeds 16 --ticks 100000 --policy
live` and uploads the report and `.sim/logs/eval-*.jsonl` as the `nightly-eval` artifact. It skips the run
  when the newest history line already has this sha and policy. 16 is the floor `compareReports` accepts (`MIN_SEEDS` in
  [compare.js](../../js/evo/compare.js)).
- **`nightly-eval-wide`** (same shape, `--seeds 32`, artifact `nightly-eval-wide`): the metrics whose
  `minSeedsFor(metric)` ([world-balance.md](world-balance.md) Phase 1, `js/evo/compare-seeds.js`) is 32 get no verdict from a
  16-seed report, so this run gives them one. It is its own segment (`seeds` differs).
- Both jobs set up Node with `node-version-file: .node-version`, so the nightly evals run on the V8 that the goldens
  are pinned on. `timeout-minutes` of each is set from `npm run bench:parallel -- --counts 4` measured on the hosted
  runner (T1b); at 6.75 ms a tick (4.5 ms times 1.5 for a runner core) and 3 workers, 16 seeds of 100000 ticks take
  about 60 minutes and 32 seeds about 120.
- **`history`** (`needs: [nightly-eval, nightly-eval-wide]`, `if: always()`, `contents: write`, `issues: write`, concurrency group `eval-history`): downloads
  the reports that exist and runs `node scripts/history-append.mjs --report <file>` then `node scripts/trend.mjs`, and pushes
  `eval-history`. It installs no dependencies beyond `npm ci --ignore-scripts`.

Tier 3 keeps its own job and its 60-minute budget.

**History line.** `scripts/history-append.mjs` appends one JSON line to `evals/history.jsonl` on the orphan branch
`eval-history`: `date`, `sha`, `policy`, `configHash`, `seeds`, `ticks`, the report's per-seed values for every
metric, and each metric's mean with its 95% interval from `bootstrapInterval` (`js/evo/compare.js`). A **segment** is
a run of lines with the same `policy`, `configHash`, `seeds` and `ticks`.

**Trend.** `scripts/trend.mjs` compares, within the newest segment, the newest line with the segment's first line
through `compareReports` on the per-seed values, at the Bonferroni level `1 - 0.05 / m` over the `m` metrics that
have a direction and whose `minSeedsFor` is at most the segment's `seeds`. A metric is flagged when it is `worse` on the newest two distinct shas of the segment. A flag opens
an issue labelled `eval-trend` titled with the metric, or comments on the open one for that metric and segment only
when the sha range is new. The issue body embeds the before and after values and intervals, the sha range and the run
link. A segment with fewer than three distinct shas reports nothing. At 16 seeds the smallest drift the check can see is about
one coefficient of variation: about 10% on `eval.food_energy_per_1k` and about 16% on `eval.fed_median_lifespan`, because paired seeds
correlate by -0.14 to 0.24; a slower sustained drift is outside what the nightly detects, and an experiment or sweep
(16 seeds, then 16 confirming seeds) is how it is measured.

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
  golden `worldHash` together, with the sweep table in the body and a breaking subject (`feat(sim)!:`). Its base is
  `season/next`, created from `main` when absent, so the new `rulesHash` invalidates `public/champions/v1/` and
  `evals/league.json` only when the season opens; a second draft PR rebaselines
  `evals/baselines/` on `season/next` once the first merges. `sweep.yml` evaluates `season/next` when it exists, so each
  sweep builds on the batched defaults, and `main` otherwise.
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

1. Create the orphan `eval-history` branch with an empty `evals/history.jsonl`.
2. Create the labels `eval-trend` and `run-experiment`, and the pinned `Weekly improvement report` issue.
3. Create the weekly routine with the `schedule` skill from `.claude/routines/weekly-improvement.md`.

The `main` ruleset exists; the first `season/next` branch gets the same one when the line opens.

## Decisions

| Decision                                                                                                                | Reason                                                                                                                                         | By                |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| The `main` ruleset is built and is the guard for every actor in the loop                                                | `GITHUB_TOKEN` cannot be scoped to one branch, and nothing guarded `main` before 2026-10-17                                                    | User              |
| Proposals that change `rulesHash` (sweeps, rules experiments) take `season/next` as their base                          | Weekly default changes would otherwise open a season every week; a season opens at most every 4 weeks                                          | User              |
| `nightly-eval` runs 16 seeds, and `nightly-eval-wide` runs 32 for the metrics whose `minSeedsFor` is 32                 | `compareReports` refuses fewer than 16 seeds, so the 8-seed nightly could never produce a verdict; the noisy lineage and floor metrics need 32 | Specialist review |
| The trend check skips a metric whose `minSeedsFor` exceeds the segment's seeds                                          | A metric without a verdict at that seed count must not open an `eval-trend` issue                                                              | Specialist review |
| `timeout-minutes` of the nightly evals is set from a measured `bench:parallel -- --counts 4` on the hosted runner (T1b) | The 7950X3D rate is not the rate of a 4 vCPU runner                                                                                            | Specialist review |
| Nightly jobs read the Node version from `.node-version`                                                                 | Evals and goldens then run on one V8 locally and in CI                                                                                         | Specialist review |
| The sweep confirmation seeds are 17 to 32 everywhere in the doc                                                         | The Determinism row said 9 to 16 while the sweep text and `evals/seeds.json` use 17 to 32                                                      | Specialist review |

## Phases

### Phase 1 - Nightly history, trends and the weekly routine

**Targets:** none - process; the loop measures, it changes no metric itself

`scripts/lib/history.mjs`, `scripts/lib/trend.mjs`, their CLIs, the `nightly-eval`, `nightly-eval-wide` and `history` jobs,
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

| Concern                 | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | Node CLI scripts over pure functions: `scripts/history-append.mjs`, `scripts/trend.mjs`, `scripts/sweep.mjs`, `scripts/retro.mjs`, `scripts/dashboard-data.mjs` over `scripts/lib/history.mjs`, `trend.mjs`, `sweep.mjs`, `retro.mjs`, `dashboard.mjs`, which import `js/evo/compare.js` and `js/evo/report.js`. Workflows: jobs in `.github/workflows/nightly.yml` (the `nightly-eval`, `nightly-eval-wide` and `history` jobs), new `experiment.yml` and `sweep.yml`. Agent files: `.claude/routines/weekly-improvement.md`, `.claude/skills/improve-weekly/SKILL.md`. Data: `evals/sweep-plan.json`, `evals/sweeps/`, `evals/retros/`, `evals/dashboard/index.html`. No change to `js/sim` or `js/evo` behaviour                                                                                                                 |
| Unit tests              | `test/history.test.js` (line format; segment boundaries on policy, config, seeds or ticks), `test/trend.test.js` (a persistent drift over two shas flags; a metric whose `minSeedsFor` is 32 is skipped in a 16-seed segment and compared in a 32-seed one; a one-sha blip does not; a new segment resets; fewer than three shas reports nothing; dedupe by metric and segment), `test/sweep.test.js` (candidate and winner rules on recorded reports; layout keys and fewer than 16 seeds refused), `test/retro.test.js` (hit rate, failure rates excluding skips, adherence, missing artifacts), `test/dashboard-data.test.js` (output shape); `test/check-experiments.test.js` gains the `predicted` and `predictionAt` rules; `test/workflows.test.js` asserts that `nightly.yml` runs `nightly-eval` with `--seeds 16` or more |
| Headless e2e            | `test/nightly-dry-run.test.js` runs `history-append` and `trend --dry-run` over a fixture history of 12 lines across 4 shas with one injected persistent drift and asserts exactly one flagged metric; no network                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Performance budget      | `nightly-eval` (16 seeds x 100000 ticks) and `nightly-eval-wide` (32 seeds) each within their `timeout-minutes` (150 until T1b measures the runner) on `ubuntu-latest` (4 vCPU, 3 workers); each `experiment.yml` arm within 360 minutes. No `bench.*` or `browser.*` change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Evolution metrics       | N/A - the loop proposes changes; each proposal carries its own `eval:compare` verdicts against the Metrics table in [evolution-evals.md](evolution-evals.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Determinism             | Nightly evals use the fixed seeds, so a sha and policy give one report, and repeated nights on one sha are skipped; sweeps compare on the same seeds and confirm on seeds 17-32; the trend check is a pure function of the history file                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Config and persistence  | No `createConfig` keys. New files: `evals/history.jsonl` (on `eval-history` only), `evals/sweep-plan.json`, sweep and retro JSON, `evals/dashboard/data.json` (gitignored), `TestResults/gates.json`. The ledger schema gains `predicted`, `predictionAt` and `resultAt`. No IndexedDB change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Logging and diagnostics | No `simLog` events - tooling only. Each script prints what it read and wrote and exits non-zero naming the file and field on malformed input. `nightly-eval` adds the report and `.sim/logs/eval-*.jsonl` to its artifact. A trend issue carries the numbers, sha range and run link; reproduce locally with `npm run eval` at both shas and `npm run eval:compare`                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Browser compatibility   | The dashboard page is checked in Chromium, served locally by `npm run dashboard`; the published Artifact is the same page with `data.json` alongside                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Docs                    | `AGENTS.md` Hard rules (the standing-permissions exception), Workflow (nightly, weekly, where proposals appear) and Commands (`sweep`, `retro`, `dashboard`); [quality-gates-and-test-tiers.md](quality-gates-and-test-tiers.md)'s tier note points at the `nightly-eval` job; the `run-evolution-loop` skill's Rank step points at the weekly routine. This doc becomes `Implemented` when Phase 3 lands                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Verification            | `scripts/check.sh` green; the steps in Verification below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Task breakdown

### Phase 1 - Nightly history, trends and the weekly routine

| #   | Task                                                                                                                                                                                             | Nature       | Depends on                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | -------------------------------- |
| T1  | Add `scripts/lib/history.mjs` and `scripts/history-append.mjs` with tests                                                                                                                        | [mechanical] | -                                |
| T1b | Measure `npm run bench:parallel -- --counts 4` on a hosted runner and record it in [sim-notes.md](sim-notes.md); the figure sets the `timeout-minutes` of `nightly-eval` and `nightly-eval-wide` | [mechanical] | -                                |
| T2  | Add `scripts/lib/trend.mjs` and `scripts/trend.mjs` with tests and the nightly dry-run test                                                                                                      | [judgement]  | T1                               |
| T3  | Add the `nightly-eval` (16 seeds), `nightly-eval-wide` (32 seeds) and `history` jobs to `nightly.yml`, with `node-version-file`                                                                  | [mechanical] | T1b, T2                          |
| T4  | Add `.github/workflows/experiment.yml`                                                                                                                                                           | [judgement]  | T3                               |
| T5a | Add `predicted`, `predictionAt` and `resultAt` to the ledger schema with tests                                                                                                                   | [mechanical] | -                                |
| T5  | Add the `improve-weekly` skill and `.claude/routines/weekly-improvement.md`                                                                                                                      | [judgement]  | T4                               |
| T6  | Update `AGENTS.md` (standing permissions, workflow), [quality-gates-and-test-tiers.md](quality-gates-and-test-tiers.md) and the `run-evolution-loop` skill; list the Setup steps in the PR       | [mechanical] | T5, T5a                          |
| T7  | Conformance review of Phase 1                                                                                                                                                                    | [judgement]  | T1, T1b, T2, T3, T4, T5, T5a, T6 |

### Phase 2 - Config sweeps

| #   | Task                                                                                                                        | Nature       | Depends on |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T8  | Add `scripts/lib/sweep.mjs`, `scripts/sweep.mjs` (`--propose` against `season/next`) and `npm run sweep` with tests         | [judgement]  | T7         |
| T9  | Add `.github/workflows/sweep.yml` (base `season/next` when it exists), `evals/sweep-plan.json` and the routine's sweep step | [mechanical] | T8         |
| T10 | Conformance review of Phase 2                                                                                               | [judgement]  | T8, T9     |

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
2. After the Setup steps, `gh workflow run nightly.yml --ref main` appends two lines to `evals/history.jsonl` on
   `eval-history` (16 and 32 seeds); a second dispatch on the same sha appends nothing.
3. `node scripts/trend.mjs --history <fixture> --dry-run` on a copy with one metric drifting over two shas prints that
   metric and nothing else.
4. Adding `run-experiment` to a draft PR runs `experiment.yml`, which posts an `eval:compare` table on the PR.
5. The weekly routine's first run opens only draft PRs on the allowed branch prefixes, or reports insufficient
   history, and comments on the weekly issue.
6. `npm run sweep -- --key foodSpawnRate --values 0.015,0.025 --primary eval.food_energy_per_1k` writes a sweep file
   with verdicts on both seed sets.
7. `npm run dashboard` serves a page charting every metric's nightly series.
